-- Read-side RPCs powering discovery.
--
-- All of these are SECURITY DEFINER for one specific reason: an anonymous
-- browser must be able to see that six people are playing at a court without
-- being able to read the check_ins table. The functions expose aggregates, the
-- policies keep the rows private, and the two do not conflict.

-- Trigram similarity, used to rank duplicate candidates by name. Distance
-- alone cannot tell "Victoria Park courts" from an unrelated court nearby.
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- upcoming_runs
-- ---------------------------------------------------------------------------
-- Materializes weekly series into concrete occurrences inside a bounded window.
--
-- The DST-correct part is `(day + local_start_time) at time zone tz`: the local
-- wall-clock time is constructed first and only then resolved to an instant.
-- Storing one UTC timestamp instead would silently shift a 7pm run to 6pm the
-- week the clocks change.

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
         v.name,
         r.sport_id,
         sp.slug,
         sp.name,
         r.organizer_id,
         pr.display_name,
         r.title,
         r.description,
         r.expected_players,
         v.indoor_state,
         r.starts_at,
         r.ends_at,
         r.occurrence_date,
         r.exception_status = 'rescheduled',
         r.valid_until,
         extensions.ST_Y(v.location::extensions.geometry),
         extensions.ST_X(v.location::extensions.geometry)
    from resolved r
    join public.venues v on v.id = r.venue_id and v.status = 'active'
    join public.sports sp on sp.id = r.sport_id
    left join public.profiles pr on pr.id = r.organizer_id
    cross join window_bounds w
   where r.exception_status is distinct from 'cancelled'
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

-- ---------------------------------------------------------------------------
-- nearby_venues
-- ---------------------------------------------------------------------------

create or replace function public.nearby_venues(
  p_lat       double precision,
  p_lon       double precision,
  p_radius_m  double precision default 8000,
  p_sport_ids bigint[] default null,
  p_limit     integer default 60
)
returns table (
  venue_id           uuid,
  name               text,
  latitude           double precision,
  longitude          double precision,
  distance_m         double precision,
  indoor_state       public.indoor_state,
  verification_state public.verification_state,
  sport_slugs        text[],
  sport_names        text[],
  here_now           integer,
  heading_there      integer,
  party_count        integer,
  pulse              public.venue_pulse,
  last_activity_at   timestamptz,
  next_run_at        timestamptz,
  condition_kinds    public.venue_condition_kind[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with origin as (
    select extensions.ST_SetSRID(extensions.ST_MakePoint(p_lon, p_lat), 4326)::extensions.geography as g
  ),
  in_range as (
    select v.*, extensions.ST_Distance(v.location, o.g) as distance_m
      from public.venues v
      cross join origin o
     where v.status = 'active'
       and extensions.ST_DWithin(v.location, o.g, p_radius_m)
  ),
  filtered as (
    select r.*
      from in_range r
     where p_sport_ids is null
        or exists (
             select 1 from public.venue_sports vs
              where vs.venue_id = r.id and vs.sport_id = any (p_sport_ids)
           )
  )
  select f.id,
         f.name,
         extensions.ST_Y(f.location::extensions.geometry),
         extensions.ST_X(f.location::extensions.geometry),
         f.distance_m,
         f.indoor_state,
         f.verification_state,
         coalesce(sports.slugs, array[]::text[]),
         coalesce(sports.names, array[]::text[]),
         -- The headline number is a sum of party_size, not a row count:
         -- someone who brought four friends is five players present.
         coalesce(live.here_now, 0)::integer,
         coalesce(intent.heading_there, 0)::integer,
         coalesce(live.party_count, 0)::integer,
         live.pulse,
         live.last_activity_at,
         run.next_run_at,
         coalesce(cond.kinds, array[]::public.venue_condition_kind[])
    from filtered f
    left join lateral (
      select array_agg(sp.slug order by sp.sort_order) as slugs,
             array_agg(sp.name order by sp.sort_order) as names
        from public.venue_sports vs
        join public.sports sp on sp.id = vs.sport_id
       where vs.venue_id = f.id and sp.is_active
    ) sports on true
    left join lateral (
      select sum(c.party_size)::integer as here_now,
             count(*)::integer          as party_count,
             max(c.started_at)          as last_activity_at,
             -- One pulse per venue: the most recent check-in's, since that is
             -- the freshest read on what is actually happening.
             (array_agg(c.pulse order by c.started_at desc)
                filter (where c.pulse is not null))[1] as pulse
        from public.check_ins c
       where c.venue_id = f.id
         and c.ended_at is null
         and c.expires_at > now()
    ) live on true
    left join lateral (
      select count(*)::integer as heading_there
        from public.arrival_intents ai
       where ai.venue_id = f.id
         and ai.cancelled_at is null
         and ai.fulfilled_by_check_in_id is null
         and ai.expires_at > now()
    ) intent on true
    left join lateral (
      select min(u.starts_at) as next_run_at
        from public.upcoming_runs(null, p_sport_ids, f.id, now(), 14) u
    ) run on true
    left join lateral (
      select array_agg(distinct vc.kind) as kinds
        from public.venue_conditions vc
       where vc.venue_id = f.id and vc.expires_at > now()
    ) cond on true
   order by
     -- Active venues first: "where can I play now" is the question this screen
     -- exists to answer, and the nearest empty court does not answer it.
     (coalesce(live.here_now, 0) > 0) desc,
     (coalesce(intent.heading_there, 0) > 0) desc,
     f.distance_m asc
   limit greatest(p_limit, 1)
$$;

comment on function public.nearby_venues is
  'Active venues near a point with live aggregates. SECURITY DEFINER so anonymous browsers get counts without read access to check_ins.';

grant execute on function public.nearby_venues(double precision, double precision, double precision, bigint[], integer)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- venue_details
-- ---------------------------------------------------------------------------

create or replace function public.venue_details(p_venue_id uuid)
returns table (
  venue_id           uuid,
  canonical_id       uuid,
  was_merged         boolean,
  name               text,
  latitude           double precision,
  longitude          double precision,
  address_text       text,
  indoor_state       public.indoor_state,
  verification_state public.verification_state,
  region_slug        text,
  sport_ids          bigint[],
  sport_slugs        text[],
  sport_names        text[],
  here_now           integer,
  heading_there      integer,
  party_count        integer,
  pulse              public.venue_pulse,
  last_activity_at   timestamptz,
  aliases            text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  -- Follow one merge hop so an old link resolves to the surviving venue
  -- instead of 404ing. Merge chains are prevented by merge_venues(), so a
  -- single hop is sufficient.
  with requested as (
    select v.id, v.merged_into_venue_id from public.venues v where v.id = p_venue_id
  ),
  target as (
    select coalesce(r.merged_into_venue_id, r.id) as id,
           r.merged_into_venue_id is not null as was_merged
      from requested r
  )
  select p_venue_id,
         v.id,
         t.was_merged,
         v.name,
         extensions.ST_Y(v.location::extensions.geometry),
         extensions.ST_X(v.location::extensions.geometry),
         v.address_text,
         v.indoor_state,
         v.verification_state,
         rg.slug,
         coalesce(sports.ids, array[]::bigint[]),
         coalesce(sports.slugs, array[]::text[]),
         coalesce(sports.names, array[]::text[]),
         coalesce(live.here_now, 0)::integer,
         coalesce(intent.heading_there, 0)::integer,
         coalesce(live.party_count, 0)::integer,
         live.pulse,
         live.last_activity_at,
         coalesce(al.aliases, array[]::text[])
    from target t
    join public.venues v on v.id = t.id and v.status = 'active'
    join public.regions rg on rg.id = v.region_id
    left join lateral (
      select array_agg(sp.id order by sp.sort_order)   as ids,
             array_agg(sp.slug order by sp.sort_order) as slugs,
             array_agg(sp.name order by sp.sort_order) as names
        from public.venue_sports vs
        join public.sports sp on sp.id = vs.sport_id
       where vs.venue_id = v.id and sp.is_active
    ) sports on true
    left join lateral (
      select sum(c.party_size)::integer as here_now,
             count(*)::integer          as party_count,
             max(c.started_at)          as last_activity_at,
             (array_agg(c.pulse order by c.started_at desc)
                filter (where c.pulse is not null))[1] as pulse
        from public.check_ins c
       where c.venue_id = v.id and c.ended_at is null and c.expires_at > now()
    ) live on true
    left join lateral (
      select count(*)::integer as heading_there
        from public.arrival_intents ai
       where ai.venue_id = v.id
         and ai.cancelled_at is null
         and ai.fulfilled_by_check_in_id is null
         and ai.expires_at > now()
    ) intent on true
    left join lateral (
      select array_agg(a.alias) as aliases
        from public.venue_aliases a where a.venue_id = v.id
    ) al on true
$$;

comment on function public.venue_details is
  'One public venue payload. Resolves a merged id to its canonical venue so old links keep working.';

grant execute on function public.venue_details(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- venue_activity — who is here, without exposing history
-- ---------------------------------------------------------------------------

create or replace function public.venue_activity(p_venue_id uuid)
returns table (
  kind         text,
  display_name text,
  avatar_path  text,
  sport_slug   text,
  party_size   smallint,
  note         text,
  pulse        public.venue_pulse,
  started_at   timestamptz,
  expires_at   timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  -- Only currently-active rows are ever returned. Expired presence is not
  -- "old news" here, it is private: publishing it would turn the venue page
  -- into a log of who was where and when.
  select 'check_in'::text,
         coalesce(pr.display_name, 'Player'),
         pr.avatar_path,
         sp.slug,
         c.party_size,
         c.note,
         c.pulse,
         c.started_at,
         c.expires_at
    from public.check_ins c
    join public.sports sp on sp.id = c.sport_id
    left join public.profiles pr on pr.id = c.user_id
   where c.venue_id = p_venue_id and c.ended_at is null and c.expires_at > now()

  union all

  select 'heading_there'::text,
         coalesce(pr.display_name, 'Player'),
         pr.avatar_path,
         sp.slug,
         1::smallint,
         null,
         null,
         ai.created_at,
         ai.expires_at
    from public.arrival_intents ai
    join public.sports sp on sp.id = ai.sport_id
    left join public.profiles pr on pr.id = ai.user_id
   where ai.venue_id = p_venue_id
     and ai.cancelled_at is null
     and ai.fulfilled_by_check_in_id is null
     and ai.expires_at > now()

   order by 1, 8 desc
$$;

grant execute on function public.venue_activity(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- find_duplicate_candidates
-- ---------------------------------------------------------------------------
-- Lives in Postgres, not in the importer, because user submissions arrive
-- through the app and would never reach importer-side logic. One definition,
-- one threshold to tune, both entry points covered.
--
-- It PROPOSES. It never merges. Two courts 6 m apart may be one venue or two,
-- and only a person who knows the place can say which.

create or replace function public.find_duplicate_candidates(
  p_lat       double precision,
  p_lon       double precision,
  p_sport_ids bigint[] default null,
  p_radius_m  double precision default 100,
  p_exclude_venue_id uuid default null,
  p_name      text default null
)
returns table (
  venue_id           uuid,
  name               text,
  distance_m         double precision,
  shared_sport_count integer,
  name_similarity    real,
  score              double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  with origin as (
    select extensions.ST_SetSRID(extensions.ST_MakePoint(p_lon, p_lat), 4326)::extensions.geography as g
  )
  select v.id,
         v.name,
         extensions.ST_Distance(v.location, o.g) as distance_m,
         coalesce(shared.n, 0)::integer,
         case when p_name is null then 0::real
              else extensions.similarity(lower(v.name), lower(p_name)) end,
         -- Distance alone is never enough (§9). Proximity dominates, shared
         -- sports corroborate, and name similarity breaks ties — a "Victoria
         -- Park" 80 m away is a likelier duplicate than an unrelated court at 30 m.
         (1.0 - least(extensions.ST_Distance(v.location, o.g) / greatest(p_radius_m, 1), 1.0)) * 0.6
         + least(coalesce(shared.n, 0), 3) / 3.0 * 0.25
         + case when p_name is null then 0
                else extensions.similarity(lower(v.name), lower(p_name)) * 0.15 end
      as score
    from public.venues v
    cross join origin o
    left join lateral (
      select count(*) as n
        from public.venue_sports vs
       where vs.venue_id = v.id
         and p_sport_ids is not null
         and vs.sport_id = any (p_sport_ids)
    ) shared on true
   where v.status = 'active'
     and (p_exclude_venue_id is null or v.id <> p_exclude_venue_id)
     and extensions.ST_DWithin(v.location, o.g, p_radius_m)
   order by score desc, distance_m asc
$$;

comment on function public.find_duplicate_candidates is
  'Ranks nearby active venues as possible duplicates. Proposes only — merging is always a human decision.';

grant execute on function public.find_duplicate_candidates(double precision, double precision, bigint[], double precision, uuid, text)
  to authenticated;
