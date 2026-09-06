-- Occurrence controls preserve chat/media history and the weekly template.
alter table public.run_sessions
  add column title text check (title is null or char_length(btrim(title)) between 2 and 80),
  add column cancelled_at timestamptz;

create or replace function public.upcoming_runs(
  p_region_id bigint default null,
  p_sport_ids bigint[] default null,
  p_venue_id  uuid default null,
  p_from      timestamptz default now(),
  p_days      integer default 14
)
returns table (
  run_series_id    uuid,
  venue_id         uuid,
  venue_name       text,
  sport_id         bigint,
  sport_slug       text,
  sport_name       text,
  organizer_id     uuid,
  organizer_name   text,
  title            text,
  description      text,
  expected_players smallint,
  indoor_state     public.indoor_state,
  starts_at        timestamptz,
  ends_at          timestamptz,
  occurrence_date  date,
  is_rescheduled   boolean,
  valid_until      date,
  latitude         double precision,
  longitude        double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  with window_bounds as (
    select p_from as from_ts,
           p_from + make_interval(days => greatest(p_days, 1)) as to_ts
  ),
  candidate_days as (
    select s.id as series_id,
           d::date as occurrence_date
      from public.run_series s
      cross join window_bounds w
      cross join lateral generate_series(
             (w.from_ts at time zone s.timezone)::date - 1,
             (w.to_ts   at time zone s.timezone)::date + 1,
             interval '1 day'
           ) as d
     where s.status = 'active'
       and (p_region_id is null or s.region_id = p_region_id)
       and (p_venue_id is null or s.venue_id = p_venue_id)
       and (p_sport_ids is null or s.sport_id = any (p_sport_ids))
       and d::date between s.starts_on and s.valid_until
       and extract(dow from d)::smallint = s.weekday
    union
    select s.id, rs.occurrence_date
      from public.run_sessions rs
      join public.run_series s on s.id = rs.run_series_id
      cross join window_bounds w
     where s.status = 'active' and rs.cancelled_at is null
       and rs.ends_at >= w.from_ts and rs.starts_at <= w.to_ts
       and (p_region_id is null or rs.region_id = p_region_id)
       and (p_venue_id is null or rs.venue_id = p_venue_id)
       and (p_sport_ids is null or rs.sport_id = any(p_sport_ids))
  ),
  resolved as (
    select s.id,
           s.venue_id,
           coalesce(rs.location_name, s.location_name) as location_name,
           coalesce(rs.latitude, s.latitude) as latitude, coalesce(rs.longitude, s.longitude) as longitude,
           s.sport_id, case when rs.id is null then s.region_id else rs.region_id end as region_id,
           s.organizer_id,
           coalesce(rs.title, s.title) as title,
           s.description,
           s.expected_players,
           s.valid_until,
           c.occurrence_date,
           e.status as exception_status, rs.cancelled_at,
           coalesce(
             rs.starts_at, e.replacement_start_at,
             (c.occurrence_date + s.local_start_time) at time zone s.timezone
           ) as starts_at,
           coalesce(
             rs.ends_at, e.replacement_end_at,
             (c.occurrence_date + s.local_end_time) at time zone s.timezone
           ) as ends_at
      from candidate_days c
      join public.run_series s on s.id = c.series_id
      left join public.run_sessions rs on rs.run_series_id = s.id and rs.occurrence_date = c.occurrence_date
      left join public.run_exceptions e
             on e.run_series_id = s.id and e.occurrence_date = c.occurrence_date
  )
  select r.id,
         r.venue_id,
         coalesce(v.name, r.location_name),
         r.sport_id,
         sp.slug,
         sp.name,
         r.organizer_id,
         pr.display_name,
         r.title,
         r.description,
         r.expected_players,
         coalesce(v.indoor_state, 'unknown'::public.indoor_state),
         r.starts_at,
         r.ends_at,
         r.occurrence_date,
         r.exception_status = 'rescheduled',
         r.valid_until,
         coalesce(extensions.ST_Y(v.location::extensions.geometry), r.latitude),
         coalesce(extensions.ST_X(v.location::extensions.geometry), r.longitude)
    from resolved r
    left join public.venues v on v.id = r.venue_id and v.status = 'active'
    join public.sports sp on sp.id = r.sport_id
    left join public.profiles pr on pr.id = r.organizer_id
    cross join window_bounds w
   where (r.venue_id is null or v.id is not null)
     and (p_region_id is null or r.region_id = p_region_id)
     and r.cancelled_at is null
     and r.exception_status is distinct from 'cancelled'
     -- A session already under way is still worth showing, so compare against
     -- the end time rather than the start.
     and r.ends_at >= w.from_ts
     and r.starts_at <= w.to_ts
   order by r.starts_at asc
$$;

comment on function public.upcoming_runs is
  'Weekly series expanded into occurrences within a bounded window, DST-correct, with cancellations and reschedules applied.';

grant execute on function public.upcoming_runs(bigint, bigint[], uuid, timestamptz, integer)
  to anon, authenticated;


create or replace function public.join_run_session(
  p_run_series_id uuid,
  p_occurrence_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_run record;
  v_session_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Serialize joining with occurrence edits/cancellation before reading availability.
  perform 1 from public.run_series where id = p_run_series_id for update;
  select * into v_run from public.run_sessions
    where run_series_id = p_run_series_id and occurrence_date = p_occurrence_date;
  if found then
    if v_run.cancelled_at is not null or v_run.ends_at <= now()
      or not exists (select 1 from public.run_series where id = p_run_series_id and status = 'active')
      or (v_run.venue_id is not null and not exists (select 1 from public.venues where id = v_run.venue_id and status = 'active'))
      or exists (select 1 from public.run_exceptions where run_series_id = p_run_series_id
        and occurrence_date = p_occurrence_date and status = 'cancelled') then
      raise exception 'Session is no longer available' using errcode = '22023';
    end if;
    v_session_id := v_run.id;
    insert into public.session_memberships (session_id, user_id, role)
      select v_session_id, v_user_id,
        (case when organizer_id = v_user_id then 'organizer' else 'player' end)::public.session_member_role
      from public.run_series where id = p_run_series_id
      on conflict (session_id, user_id) do nothing;
    return v_session_id;
  end if;

  select u.* into v_run
    from public.upcoming_runs(
      null, null, null,
      (p_occurrence_date::timestamp at time zone 'UTC') - interval '1 day',
      3
    ) u
   where u.run_series_id = p_run_series_id
     and u.occurrence_date = p_occurrence_date
   limit 1;

  if not found or v_run.ends_at <= now() then
    raise exception 'run occurrence is unavailable' using errcode = '22023';
  end if;

  insert into public.run_sessions (
    run_series_id, occurrence_date, starts_at, ends_at,
    venue_id, sport_id, region_id, location_name, latitude, longitude
  )
  select v_run.run_series_id, v_run.occurrence_date, v_run.starts_at,
         v_run.ends_at, v_run.venue_id, v_run.sport_id, s.region_id, s.location_name, s.latitude, s.longitude
    from public.run_series s
   where s.id = v_run.run_series_id
  on conflict (run_series_id, occurrence_date) do update
    set starts_at = excluded.starts_at,
        ends_at = excluded.ends_at
  returning id into v_session_id;

  insert into public.session_memberships (session_id, user_id, role)
  values (v_session_id, v_run.organizer_id, 'organizer')
  on conflict (session_id, user_id) do update set role = 'organizer';

  insert into public.session_memberships (session_id, user_id, role)
  values (
    v_session_id,
    v_user_id,
    (case when v_user_id = v_run.organizer_id then 'organizer'
          else 'player' end)::public.session_member_role
  )
  on conflict (session_id, user_id) do nothing;

  return v_session_id;
end
$$;

revoke all on function public.join_run_session(uuid, date) from public;
grant execute on function public.join_run_session(uuid, date) to authenticated;



create function public.edit_run_session(
  p_session_id uuid, p_title text, p_date date, p_start_time time, p_end_time time,
  p_timezone text, p_location_name text default null,
  p_lat double precision default null, p_lon double precision default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.run_sessions;
  v_start timestamptz;
  v_end timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  perform 1 from public.run_series s join public.run_sessions r on r.run_series_id = s.id
    where r.id = p_session_id and s.organizer_id = auth.uid() for update of s;
  if not found then raise exception 'Only the organizer can edit this session' using errcode = '42501'; end if;
  select * into v_session from public.run_sessions where id = p_session_id for update;
  if v_session.cancelled_at is not null or v_session.starts_at <= now() then
    raise exception 'Only upcoming active sessions can be edited' using errcode = '22023';
  end if;
  if p_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'Choose a valid time zone' using errcode = '22023';
  end if;
  v_start := (p_date + p_start_time) at time zone p_timezone;
  v_end := (p_date + p_end_time) at time zone p_timezone;
  if v_start is null or v_end is null or v_start <= now() or v_start > now() + interval '84 days'
    or v_end <= v_start or p_title is null or char_length(btrim(p_title)) not between 2 and 80 then
    raise exception 'Choose a title of 2–80 characters and future times within 84 days, with end after start' using errcode = '22023';
  end if;
  if v_session.venue_id is null and (p_lat is null or p_lon is null or p_lat not between -90 and 90
    or p_lon not between -180 and 180 or p_location_name is null or char_length(btrim(p_location_name)) not between 2 and 120) then
    raise exception 'Choose a valid pin and meeting spot name' using errcode = '22023';
  end if;
  update public.run_sessions set title = btrim(p_title), starts_at = v_start, ends_at = v_end,
    location_name = case when venue_id is null then btrim(p_location_name) end,
    region_id = case when venue_id is not null then region_id else (
      select id from public.regions where is_published and p_lat between min_lat and max_lat
        and p_lon between min_lon and max_lon order by (max_lat-min_lat)*(max_lon-min_lon) limit 1
    ) end,
    latitude = case when venue_id is null then p_lat end,
    longitude = case when venue_id is null then p_lon end
    where id = p_session_id;
  insert into public.run_exceptions (run_series_id, occurrence_date, status, replacement_start_at, replacement_end_at)
    values (v_session.run_series_id, v_session.occurrence_date, 'rescheduled', v_start, v_end)
    on conflict (run_series_id, occurrence_date) do update set status = 'rescheduled',
      replacement_start_at = excluded.replacement_start_at, replacement_end_at = excluded.replacement_end_at;
end;
$$;

create function public.cancel_run_session(p_session_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_session public.run_sessions;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  perform 1 from public.run_series s join public.run_sessions r on r.run_series_id = s.id
    where r.id = p_session_id and s.organizer_id = auth.uid() for update of s;
  if not found then raise exception 'Only the organizer can cancel this session' using errcode = '42501'; end if;
  select * into v_session from public.run_sessions where id = p_session_id for update;
  if v_session.cancelled_at is not null then return; end if;
  if v_session.ends_at <= now() then raise exception 'This session has already ended' using errcode = '22023'; end if;
  update public.run_sessions set cancelled_at = now() where id = p_session_id;
  insert into public.run_exceptions (run_series_id, occurrence_date, status)
    values (v_session.run_series_id, v_session.occurrence_date, 'cancelled')
    on conflict (run_series_id, occurrence_date) do update set status = 'cancelled',
      replacement_start_at = null, replacement_end_at = null;
end;
$$;

create function public.leave_run_session(p_session_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  perform 1 from public.run_series s join public.run_sessions r on r.run_series_id = s.id
    where r.id = p_session_id for update of s;
  if exists (select 1 from public.run_series s join public.run_sessions r on r.run_series_id = s.id
    where r.id = p_session_id and s.organizer_id = auth.uid() and r.cancelled_at is null and r.ends_at > now()) then
    raise exception 'As organizer, cancel the session instead of leaving it without a host' using errcode = '22023';
  end if;
  delete from public.session_memberships where session_id = p_session_id and user_id = auth.uid();
end;
$$;

-- Cancelled sessions retain readable history for members, but accept no new content.
create function public.can_post_to_session(p_session_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_session_member(p_session_id) and exists (
    select 1 from public.run_sessions where id = p_session_id and cancelled_at is null
  )
$$;
revoke all on function public.can_post_to_session(uuid) from public, anon;
grant execute on function public.can_post_to_session(uuid) to authenticated;
alter policy session_messages_insert_member on public.session_messages
  with check (user_id = (select auth.uid()) and public.can_post_to_session(session_id));
alter policy session_posts_insert_member on public.session_posts
  with check (author_id = (select auth.uid()) and public.can_post_to_session(session_id));
alter policy session_media_insert_member on public.session_media
  with check (uploader_id = (select auth.uid()) and exists (
    select 1 from public.session_posts p where p.id = post_id
      and p.author_id = (select auth.uid()) and public.can_post_to_session(p.session_id)
  ));
revoke all on function public.edit_run_session(uuid, text, date, time, time, text, text, double precision, double precision),
  public.cancel_run_session(uuid), public.leave_run_session(uuid) from public, anon;
grant execute on function public.edit_run_session(uuid, text, date, time, time, text, text, double precision, double precision),
  public.cancel_run_session(uuid), public.leave_run_session(uuid) to authenticated;

alter policy session_media_objects_insert_own_folder on storage.objects
  with check (
    bucket_id = 'session-media' and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.session_posts p
      where p.id::text = (storage.foldername(name))[2] and p.author_id = (select auth.uid())
        and public.can_post_to_session(p.session_id))
  );
