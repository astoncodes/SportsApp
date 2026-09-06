-- User-submitted venues enter a private moderation queue. They never write
-- directly to public.venues, and proximity only proposes possible duplicates.

create type public.venue_candidate_status as enum (
  'pending',
  'possible_duplicate',
  'approved',
  'merged',
  'rejected'
);

create type public.venue_candidate_sport_origin as enum ('submitted', 'reviewer');

create table public.venue_candidates (
  id                    uuid primary key default gen_random_uuid(),
  region_id             bigint not null references public.regions (id) on delete restrict,
  submitted_by          uuid not null references auth.users (id) on delete restrict,
  proposed_name         text not null,
  address_text          text,
  location              extensions.geography(Point, 4326) not null,
  indoor_state          public.indoor_state not null,
  status                public.venue_candidate_status not null default 'pending',
  duplicate_of_venue_id uuid references public.venues (id) on delete set null,
  published_venue_id    uuid references public.venues (id) on delete set null,
  reviewed_by           uuid references auth.users (id) on delete set null,
  reviewed_at           timestamptz,
  review_note           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint venue_candidates_name_length
    check (char_length(btrim(proposed_name)) between 2 and 120),
  constraint venue_candidates_address_length
    check (address_text is null or char_length(address_text) <= 240),
  constraint venue_candidates_review_note_length
    check (review_note is null or char_length(review_note) <= 1000)
);

create index venue_candidates_location_idx on public.venue_candidates using gist (location);
create index venue_candidates_submitter_idx on public.venue_candidates (submitted_by, created_at desc);
create index venue_candidates_review_queue_idx
  on public.venue_candidates (status, created_at)
  where status in ('pending', 'possible_duplicate');

create trigger venue_candidates_set_updated_at
  before update on public.venue_candidates
  for each row execute function public.set_updated_at();

create table public.venue_candidate_sports (
  candidate_id uuid not null references public.venue_candidates (id) on delete cascade,
  sport_id     bigint not null references public.sports (id) on delete restrict,
  origin       public.venue_candidate_sport_origin not null default 'submitted',
  created_at   timestamptz not null default now(),
  primary key (candidate_id, sport_id)
);

create table public.venue_candidate_matches (
  candidate_id       uuid not null references public.venue_candidates (id) on delete cascade,
  venue_id           uuid not null references public.venues (id) on delete cascade,
  distance_m         double precision not null check (distance_m >= 0),
  shared_sport_count integer not null check (shared_sport_count >= 0),
  name_similarity    real not null check (name_similarity between 0 and 1),
  score              double precision not null,
  created_at         timestamptz not null default now(),
  primary key (candidate_id, venue_id)
);

revoke all on public.venue_candidates        from anon, authenticated;
revoke all on public.venue_candidate_sports  from anon, authenticated;
revoke all on public.venue_candidate_matches from anon, authenticated;

alter table public.venue_candidates        enable row level security;
alter table public.venue_candidate_sports  enable row level security;
alter table public.venue_candidate_matches enable row level security;

create policy venue_candidates_select_owner_or_admin
  on public.venue_candidates for select to authenticated
  using (submitted_by = (select auth.uid()) or public.is_admin());

create policy venue_candidate_sports_select_owner_or_admin
  on public.venue_candidate_sports for select to authenticated
  using (
    exists (
      select 1
        from public.venue_candidates c
       where c.id = candidate_id
         and (c.submitted_by = (select auth.uid()) or public.is_admin())
    )
  );

create policy venue_candidate_matches_select_owner_or_admin
  on public.venue_candidate_matches for select to authenticated
  using (
    exists (
      select 1
        from public.venue_candidates c
       where c.id = candidate_id
         and (c.submitted_by = (select auth.uid()) or public.is_admin())
    )
  );

grant select on public.venue_candidates,
                public.venue_candidate_sports,
                public.venue_candidate_matches
  to authenticated;

-- The only player write path. SECURITY DEFINER is required because candidates
-- and their cached duplicate evidence cannot be inserted or status-edited
-- directly through the Data API.
create or replace function public.submit_venue(
  p_name         text,
  p_lat          double precision,
  p_lon          double precision,
  p_sport_ids    bigint[],
  p_indoor_state public.indoor_state,
  p_address_text text default null
)
returns table (
  candidate_id uuid,
  status public.venue_candidate_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id      uuid := auth.uid();
  v_candidate_id uuid;
  v_region_id    bigint;
  v_name         text := btrim(p_name);
  v_address      text := nullif(btrim(p_address_text), '');
  v_sport_count  integer;
  v_status       public.venue_candidate_status := 'pending';
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if char_length(v_name) not between 2 and 120 then
    raise exception 'Venue name must be between 2 and 120 characters'
      using errcode = '22023';
  end if;

  if v_address is not null and char_length(v_address) > 240 then
    raise exception 'Address must be 240 characters or fewer' using errcode = '22023';
  end if;

  if p_lat is null or p_lon is null
     or p_lat = 'NaN'::double precision or p_lon = 'NaN'::double precision
     or p_lat not between -90 and 90 or p_lon not between -180 and 180 then
    raise exception 'Latitude or longitude is invalid' using errcode = '22023';
  end if;

  if p_sport_ids is null or cardinality(p_sport_ids) = 0 then
    raise exception 'Choose at least one sport' using errcode = '22023';
  end if;

  select count(distinct s.id)::integer
    into v_sport_count
    from public.sports s
   where s.id = any (p_sport_ids)
     and s.is_active;

  if v_sport_count <> (select count(distinct x) from unnest(p_sport_ids) x) then
    raise exception 'Every selected sport must exist and be active' using errcode = '22023';
  end if;

  -- A candidate belongs to the smallest published region containing its pin.
  -- This prevents a client from assigning a coordinate to an arbitrary region.
  select r.id
    into v_region_id
    from public.regions r
   where r.is_published
     and p_lat between r.min_lat and r.max_lat
     and p_lon between r.min_lon and r.max_lon
   order by (r.max_lat - r.min_lat) * (r.max_lon - r.min_lon), r.id
   limit 1;

  if v_region_id is null then
    raise exception 'This location is outside a supported region' using errcode = '22023';
  end if;

  insert into public.venue_candidates (
    region_id, submitted_by, proposed_name, address_text, location, indoor_state
  ) values (
    v_region_id,
    v_user_id,
    v_name,
    v_address,
    extensions.ST_SetSRID(extensions.ST_MakePoint(p_lon, p_lat), 4326)::extensions.geography,
    p_indoor_state
  )
  returning id into v_candidate_id;

  insert into public.venue_candidate_sports (candidate_id, sport_id, origin)
  select v_candidate_id, s.id, 'submitted'::public.venue_candidate_sport_origin
    from public.sports s
   where s.id = any (p_sport_ids);

  insert into public.venue_candidate_matches (
    candidate_id, venue_id, distance_m, shared_sport_count, name_similarity, score
  )
  select v_candidate_id, d.venue_id, d.distance_m, d.shared_sport_count,
         d.name_similarity, d.score
    from public.find_duplicate_candidates(
      p_lat, p_lon, p_sport_ids, 100, null, v_name
    ) d;

  if exists (
    select 1 from public.venue_candidate_matches m where m.candidate_id = v_candidate_id
  ) then
    v_status := 'possible_duplicate';
    update public.venue_candidates
       set status = v_status,
           duplicate_of_venue_id = (
             select m.venue_id
               from public.venue_candidate_matches m
              where m.candidate_id = v_candidate_id
              order by m.score desc, m.distance_m
              limit 1
           )
     where id = v_candidate_id;
  end if;

  return query select v_candidate_id, v_status;
end
$$;

comment on function public.submit_venue(text, double precision, double precision, bigint[], public.indoor_state, text) is
  'Creates a private user venue candidate at the final confirmed coordinate and caches possible duplicate matches.';

revoke all on function public.submit_venue(text, double precision, double precision, bigint[], public.indoor_state, text)
  from public, anon;
grant execute on function public.submit_venue(text, double precision, double precision, bigint[], public.indoor_state, text)
  to authenticated;
