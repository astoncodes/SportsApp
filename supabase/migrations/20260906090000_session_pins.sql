-- Session pins are public event locations, not reviewed canonical venues.
alter table public.run_series alter column venue_id drop not null;
alter table public.run_series alter column region_id drop not null;
alter table public.run_sessions alter column venue_id drop not null;
alter table public.run_sessions alter column region_id drop not null;
alter table public.run_series
  add column location_name text,
  add column latitude double precision,
  add column longitude double precision,
  add constraint run_series_pin_location check (
    (venue_id is not null and location_name is null and latitude is null and longitude is null)
    or (venue_id is null and location_name is not null and char_length(btrim(location_name)) between 2 and 120
      and latitude is not null and latitude between -90 and 90
      and longitude is not null and longitude between -180 and 180)
  );
alter table public.run_sessions
  add column location_name text,
  add column latitude double precision,
  add column longitude double precision,
  add constraint run_sessions_pin_location check (
    (venue_id is not null and location_name is null and latitude is null and longitude is null)
    or (venue_id is null and location_name is not null and char_length(btrim(location_name)) between 2 and 120
      and latitude is not null and latitude between -90 and 90
      and longitude is not null and longitude between -180 and 180)
  );

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
       and s.valid_until >= current_date
       and (p_region_id is null or s.region_id = p_region_id)
       and (p_venue_id is null or s.venue_id = p_venue_id)
       and (p_sport_ids is null or s.sport_id = any (p_sport_ids))
       and d::date between s.starts_on and s.valid_until
       and extract(dow from d)::smallint = s.weekday
  ),
  resolved as (
    select s.id,
           s.venue_id,
           s.location_name, s.latitude, s.longitude,
           s.sport_id,
           s.organizer_id,
           s.title,
           s.description,
           s.expected_players,
           s.valid_until,
           c.occurrence_date,
           e.status as exception_status,
           coalesce(
             e.replacement_start_at,
             (c.occurrence_date + s.local_start_time) at time zone s.timezone
           ) as starts_at,
           coalesce(
             e.replacement_end_at,
             (c.occurrence_date + s.local_end_time) at time zone s.timezone
           ) as ends_at
      from candidate_days c
      join public.run_series s on s.id = c.series_id
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

  select u.* into v_run
    from public.upcoming_runs(
      null, null, null,
      (p_occurrence_date::timestamp at time zone 'UTC') - interval '1 day',
      3
    ) u
   where u.run_series_id = p_run_series_id
     and u.occurrence_date = p_occurrence_date
   limit 1;

  if not found then
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


create function public.create_run_at_pin(
  p_lat double precision, p_lon double precision, p_location_name text,
  p_sport_id bigint, p_starts_on date, p_start_time time, p_end_time time,
  p_weeks integer, p_title text, p_timezone text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_region bigint;
  v_series uuid;
begin
  if v_user is null then raise exception 'Sign in to create a session' using errcode = '42501'; end if;
  if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180
    or p_location_name is null or char_length(btrim(p_location_name)) not between 2 and 120 then
    raise exception 'Drop a valid pin and name the meeting spot' using errcode = '22023';
  end if;
  if p_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'Choose a valid time zone' using errcode = '22023';
  end if;
  if not exists (select 1 from public.sports where id = p_sport_id and is_active) then
    raise exception 'Choose an active sport' using errcode = '22023';
  end if;
  if p_starts_on is null or p_start_time is null or p_end_time is null
    or p_weeks is null or p_weeks not between 1 and 12 or p_start_time >= p_end_time
    or p_starts_on > (now() at time zone p_timezone)::date + 84
    or (p_starts_on + p_start_time) at time zone p_timezone <= now()
    or p_title is null or char_length(btrim(p_title)) not between 2 and 80 then
    raise exception 'Choose a future start, a later end time, 1–12 weeks, and a title of 2–80 characters' using errcode = '22023';
  end if;
  select id into v_region from public.regions
    where is_published and p_lat between min_lat and max_lat and p_lon between min_lon and max_lon
    order by (max_lat-min_lat)*(max_lon-min_lon) limit 1;
  insert into public.run_series (
    organizer_id, venue_id, region_id, sport_id, location_name, latitude, longitude,
    weekday, local_start_time, local_end_time, timezone, starts_on, valid_until, title
  ) values (
    v_user, null, v_region, p_sport_id, btrim(p_location_name), p_lat, p_lon,
    extract(dow from p_starts_on)::smallint, p_start_time, p_end_time, p_timezone,
    p_starts_on, p_starts_on + (p_weeks - 1)*7, btrim(p_title)
  ) returning id into v_series;
  return public.join_run_session(v_series, p_starts_on);
end;
$$;
revoke all on function public.create_run_at_pin(double precision, double precision, text, bigint, date, time, time, integer, text, text) from public, anon;
grant execute on function public.create_run_at_pin(double precision, double precision, text, bigint, date, time, time, integer, text, text) to authenticated;
