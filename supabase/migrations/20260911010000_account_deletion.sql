-- A resumable account-deletion workflow. Only the trusted Edge Function can
-- stage deletion, enumerate storage objects, or acknowledge removed files.
create table public.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null default now()
);
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon, authenticated;
grant select on public.account_deletion_requests to authenticated;
grant all on public.account_deletion_requests to service_role;
create policy account_deletion_read_own on public.account_deletion_requests
  for select to authenticated using (user_id = (select auth.uid()));

create table public.account_storage_deletions (
  storage_path text primary key,
  account_id uuid not null,
  requested_at timestamptz not null default now()
);
alter table public.account_storage_deletions enable row level security;
revoke all on public.account_storage_deletions from anon, authenticated;
grant all on public.account_storage_deletions to service_role;

-- SECURITY DEFINER lets an authenticated caller check only their own deletion
-- flag. A shared transaction lock serializes writes against deletion staging.
create function public.account_accepts_writes() returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('account-delete:' || v_user::text, 0));
  return not exists (select 1 from public.account_deletion_requests where user_id = v_user);
end;
$$;
revoke all on function public.account_accepts_writes() from public, anon;
grant execute on function public.account_accepts_writes() to authenticated;

create function public.guard_account_deletion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.account_accepts_writes() then
    raise exception 'Account deletion is in progress. Return to Profile to finish.' using errcode = '42501';
  end if;
  return null;
end;
$$;
revoke all on function public.guard_account_deletion() from public, anon, authenticated;

do $$
declare v_table text;
begin
  foreach v_table in array array['profiles','profile_sports','check_ins','arrival_intents',
    'venue_conditions','run_series','run_exceptions','run_sessions','session_memberships',
    'session_messages','session_posts','session_media','venue_candidates'] loop
    execute format('create trigger guard_account_deletion before insert or update on public.%I for each statement execute function public.guard_account_deletion()',v_table);
  end loop;
end;
$$;
-- Restrictive policy is combined with the existing upload ownership and
-- session/proximity policies, rather than replacing any of those checks.
create policy storage_account_not_deleting on storage.objects as restrictive
  for insert to authenticated with check (public.account_accepts_writes());

-- Deleting an organizer removes their sessions through the existing FK rules.
-- Save *all* affected media paths before cascades erase the metadata, including
-- other participants' uploads to those hosted sessions. Keep retry state until
-- the Storage API confirms deletion; deleting SQL metadata alone leaves blobs.
create function public.capture_account_storage_deletion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_account uuid := nullif(current_setting('dropin.deleting_account', true),'')::uuid;
begin
  if v_account is not null and old.storage_path is not null then
    insert into public.account_storage_deletions(storage_path,account_id)
      values (old.storage_path,v_account) on conflict (storage_path) do nothing;
  end if;
  return old;
end;
$$;
revoke all on function public.capture_account_storage_deletion() from public, anon, authenticated;
create trigger capture_account_storage_deletion before delete on public.session_media
  for each row execute function public.capture_account_storage_deletion();

-- SECURITY DEFINER is required for cross-table deletion and the storage catalog.
-- These RPCs are server-only; the Edge Function derives p_user_id from getUser().
create function public.prepare_account_deletion(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from auth.users where id=p_user_id) then
    raise exception 'Account not found.' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('account-delete:' || p_user_id::text,0));
  insert into public.account_deletion_requests(user_id) values (p_user_id) on conflict do nothing;
  perform set_config('dropin.deleting_account',p_user_id::text,true);
  delete from public.run_series where organizer_id=p_user_id;
  delete from public.session_posts where author_id=p_user_id;
  delete from public.session_messages where user_id=p_user_id;
  -- This FK intentionally restricts ordinary Auth deletions. Remove submissions
  -- explicitly; approved canonical venues remain independent public records.
  delete from public.venue_candidates where submitted_by=p_user_id;
  delete from public.check_ins where user_id=p_user_id;
  delete from public.arrival_intents where user_id=p_user_id;
end;
$$;

create function public.account_deletion_objects(p_user_id uuid)
returns table(storage_path text) language sql security definer set search_path = '' as $$
  select paths.storage_path from (
    select q.storage_path from public.account_storage_deletions q where q.account_id=p_user_id
    union
    select o.name from storage.objects o where o.bucket_id='session-media'
      and (o.owner_id=p_user_id::text or split_part(o.name,'/',1)=p_user_id::text)
  ) paths order by paths.storage_path limit 100
$$;

create function public.ack_account_deletion_objects(p_user_id uuid,p_paths text[])
returns void language sql security definer set search_path = '' as $$
  delete from public.account_storage_deletions where account_id=p_user_id and storage_path=any(p_paths)
$$;

revoke all on function public.prepare_account_deletion(uuid),
  public.account_deletion_objects(uuid),public.ack_account_deletion_objects(uuid,text[])
  from public,anon,authenticated;
grant execute on function public.prepare_account_deletion(uuid),
  public.account_deletion_objects(uuid),public.ack_account_deletion_objects(uuid,text[])
  to service_role;
