-- Privileged changes are transactional RPCs. Browser clients cannot bypass them.
revoke insert, update, delete on public.venues, public.venue_sports, public.venue_aliases from authenticated;

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_id uuid not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;
create policy admin_audit_read on public.admin_audit_log for select to authenticated using (public.is_admin());

-- SECURITY DEFINER: candidate/venue writes are unavailable through the Data API.
create function public.admin_review_candidate(
  p_candidate_id uuid, p_decision text, p_note text default null,
  p_target_venue_id uuid default null, p_name text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.venue_candidates; v_id uuid; v_name text;
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_decision is null or p_decision not in ('approve', 'reject', 'merge') then
    raise exception 'Invalid review decision' using errcode = '22023';
  end if;
  if char_length(p_note) > 1000 then raise exception 'Review note is too long' using errcode = '22023'; end if;
  if p_decision = 'reject' and coalesce(btrim(p_note), '') = '' then
    raise exception 'A rejection reason is required' using errcode = '22023';
  end if;
  select * into c from public.venue_candidates where id = p_candidate_id for update;
  if not found then raise exception 'Submission not found' using errcode = 'P0002'; end if;
  if c.status not in ('pending', 'possible_duplicate') then
    raise exception 'This submission has already been reviewed' using errcode = '22023';
  end if;
  if p_decision = 'approve' then
    v_name := coalesce(nullif(btrim(p_name), ''), c.proposed_name);
    if not exists (select 1 from public.venue_candidate_sports where candidate_id = c.id) then
      raise exception 'Submission needs at least one sport' using errcode = '22023';
    end if;
    insert into public.venues(region_id, name, location, address_text, indoor_state, created_by)
    values(c.region_id, v_name, c.location, c.address_text, c.indoor_state, auth.uid()) returning id into v_id;
    insert into public.venue_sports(venue_id, sport_id)
    select v_id, sport_id from public.venue_candidate_sports where candidate_id = c.id;
  elsif p_decision = 'merge' then
    select id into v_id from public.venues where id = p_target_venue_id and status = 'active'
      and region_id = c.region_id for update;
    if v_id is null then raise exception 'Choose an active venue in the same region' using errcode = '22023'; end if;
    insert into public.venue_aliases(venue_id, alias, source) values(v_id, c.proposed_name, 'review') on conflict do nothing;
    insert into public.venue_sports(venue_id, sport_id)
      select v_id, sport_id from public.venue_candidate_sports where candidate_id = c.id on conflict do nothing;
  end if;
  update public.venue_candidates set
    status = (case p_decision when 'approve' then 'approved' when 'merge' then 'merged' else 'rejected' end)::public.venue_candidate_status,
    published_venue_id = v_id, duplicate_of_venue_id = case when p_decision = 'merge' then v_id else duplicate_of_venue_id end,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(btrim(p_note), '') where id = c.id;
  insert into public.admin_audit_log(actor_id, action, entity_id, details)
    values(auth.uid(), 'candidate.' || p_decision, c.id, jsonb_build_object('venue_id', v_id, 'note', p_note));
  return v_id;
end $$;
revoke all on function public.admin_review_candidate(uuid,text,text,uuid,text) from public, anon;
grant execute on function public.admin_review_candidate(uuid,text,text,uuid,text) to authenticated;

create function public.admin_update_venue(
  p_venue_id uuid, p_name text, p_address text, p_indoor_state public.indoor_state,
  p_status public.venue_status, p_verified boolean, p_sport_ids bigint[]
) returns void language plpgsql security definer set search_path = '' as $$
declare v public.venues;
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  select * into v from public.venues where id = p_venue_id for update;
  if not found then raise exception 'Venue not found' using errcode = 'P0002'; end if;
  if v.status = 'merged' or p_status is null or p_status not in ('active','removed') then
    raise exception 'Merged venues cannot be edited' using errcode = '22023'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 2 and 120 or char_length(p_address) > 240 then
    raise exception 'Check venue name and address length' using errcode = '22023'; end if;
  if p_sport_ids is null or cardinality(p_sport_ids) = 0 or exists (
    select 1 from unnest(p_sport_ids) x where x is null or not exists(select 1 from public.sports s where s.id = x)
  ) then raise exception 'Choose valid sports' using errcode = '22023'; end if;
  update public.venues set name = btrim(p_name), address_text = nullif(btrim(p_address), ''),
    indoor_state = p_indoor_state, status = p_status,
    verification_state = case when p_verified then 'admin_verified'::public.verification_state else 'unverified'::public.verification_state end,
    verified_at = case when p_verified then coalesce(v.verified_at, now()) else null end,
    verified_by = case when p_verified then auth.uid() else null end,
    verification_method = case when p_verified then 'Admin review' else null end where id = v.id;
  delete from public.venue_sports where venue_id = v.id and not (sport_id = any(p_sport_ids));
  insert into public.venue_sports(venue_id, sport_id) select v.id, unnest(p_sport_ids) on conflict do nothing;
  insert into public.admin_audit_log(actor_id, action, entity_id, details)
    values(auth.uid(), 'venue.update', v.id, jsonb_build_object('before', to_jsonb(v), 'name', p_name, 'status', p_status));
end $$;
revoke all on function public.admin_update_venue(uuid,text,text,public.indoor_state,public.venue_status,boolean,bigint[]) from public, anon;
grant execute on function public.admin_update_venue(uuid,text,text,public.indoor_state,public.venue_status,boolean,bigint[]) to authenticated;
