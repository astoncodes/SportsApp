-- A Storage upload must hold its post until the object metadata commits.
-- SECURITY DEFINER grants only a boolean for the caller's own, eligible post;
-- it does not expose another player's data or bypass the existing upload rules.
create function public.lock_session_media_upload(p_path text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_post public.session_posts;
begin
  if auth.uid() is null or split_part(p_path,'/',1) <> auth.uid()::text then return false; end if;
  select * into v_post from public.session_posts
    where id::text=split_part(p_path,'/',2) and author_id=auth.uid() for share;
  if not found then return false; end if;
  return public.can_post_to_session(v_post.session_id)
    and v_post.location_verified_at > now() - interval '15 minutes';
end;
$$;
revoke all on function public.lock_session_media_upload(text) from public,anon;
grant execute on function public.lock_session_media_upload(text) to authenticated;
create policy storage_upload_post_survives_deletion on storage.objects as restrictive
  for insert to authenticated with check (
    bucket_id <> 'session-media' or public.lock_session_media_upload(name)
  );

create or replace function public.prepare_account_deletion(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from auth.users where id=p_user_id) then
    raise exception 'Account not found.' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('account-delete:' || p_user_id::text,0));
  insert into public.account_deletion_requests(user_id) values (p_user_id) on conflict do nothing;
  perform set_config('dropin.deleting_account',p_user_id::text,true);
  -- Serialize hosted-session creation and uploads before collecting objects.
  -- Foreign-key checks wait behind these row locks, so a new child cannot
  -- appear after the manifest query but before the parent is deleted.
  perform 1 from public.run_series where organizer_id=p_user_id for update;
  perform 1 from public.run_sessions s join public.run_series r on r.id=s.run_series_id
    where r.organizer_id=p_user_id for update of s;
  perform 1 from public.session_posts p
    left join public.run_sessions s on s.id=p.session_id
    left join public.run_series r on r.id=s.run_series_id
    where p.author_id=p_user_id or r.organizer_id=p_user_id for update of p;
  -- Upload may succeed before the client attaches its session_media metadata.
  -- Include those objects too, especially uploads by other participants.
  insert into public.account_storage_deletions(storage_path,account_id)
    select o.name,p_user_id from storage.objects o
    join public.session_posts p on p.id::text=split_part(o.name,'/',2)
    left join public.run_sessions s on s.id=p.session_id
    left join public.run_series r on r.id=s.run_series_id
    where o.bucket_id='session-media' and (p.author_id=p_user_id or r.organizer_id=p_user_id)
    on conflict (storage_path) do nothing;
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
