-- Lookup tables: regions, sports, and the OSM sport-token alias map.
--
-- These use bigint identity keys rather than UUIDs. They are small, stable,
-- and read constantly during development — a reviewer scanning a candidate row
-- can hold `sport_id = 3` in their head in a way they cannot hold a UUID.
-- Public-facing entities (venues, check-ins) use UUIDs.

-- ---------------------------------------------------------------------------
-- regions
-- ---------------------------------------------------------------------------
-- Adding a city is an INSERT here, not a code change. The bounding box is four
-- plain numbers because that is exactly the shape Overpass wants
-- (south,west,north,east) and because a human can eyeball them on a map.

create table public.regions (
  id           bigint generated always as identity primary key,
  slug         text        not null unique,
  name         text        not null,
  min_lat      numeric(9, 6) not null,
  min_lon      numeric(9, 6) not null,
  max_lat      numeric(9, 6) not null,
  max_lon      numeric(9, 6) not null,
  timezone     text        not null,
  is_published boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint regions_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint regions_lat_range check (
    min_lat between -90 and 90 and max_lat between -90 and 90
  ),
  constraint regions_lon_range check (
    min_lon between -180 and 180 and max_lon between -180 and 180
  ),
  -- Ordering is checked separately from range so a transposed box produces a
  -- distinguishable error rather than looking like bad coordinates.
  constraint regions_lat_order check (min_lat < max_lat),
  constraint regions_lon_order check (min_lon < max_lon)
);

comment on table public.regions is
  'A launch market. is_published=false means imported but not publicly visible — used for the importer smoke-test region.';
comment on column public.regions.timezone is
  'IANA name. Stored per-region so recurring runs stay DST-correct; validated by trigger against pg_timezone_names.';

create trigger regions_set_updated_at
  before update on public.regions
  for each row execute function public.set_updated_at();

create trigger regions_assert_valid_timezone
  before insert or update of timezone on public.regions
  for each row execute function public.assert_valid_timezone();

-- ---------------------------------------------------------------------------
-- sports
-- ---------------------------------------------------------------------------
-- Deliberately curated. OSM carries hundreds of sport tokens; this table holds
-- only the ones we present to players. Widening it is a product decision.

create table public.sports (
  id         bigint generated always as identity primary key,
  slug       text        not null unique,
  name       text        not null,
  is_active  boolean     not null default true,
  sort_order smallint    not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sports_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

comment on table public.sports is
  'Player-facing sports. Not a mirror of OSM tokens — see osm_sport_aliases for the mapping.';

create trigger sports_set_updated_at
  before update on public.sports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- osm_sport_aliases
-- ---------------------------------------------------------------------------
-- Maps a single normalized OSM sport token to one of our sports, or records
-- that we deliberately ignore it. Three states must stay distinguishable:
--
--   row with sport_id      -> mapped        ('five-a-side' -> soccer)
--   row with is_ignored    -> known, skipped ('horse_racing')
--   NO ROW AT ALL          -> UNKNOWN, must surface to a human reviewer
--
-- The third state is the point of the table. Without it a new OSM tag vanishes
-- silently and nobody ever learns the data changed.

create table public.osm_sport_aliases (
  alias      text primary key,
  sport_id   bigint references public.sports (id) on delete restrict,
  is_ignored boolean     not null default false,
  note       text,
  created_at timestamptz not null default now(),

  constraint osm_sport_aliases_exactly_one_resolution check (
    (sport_id is not null and is_ignored = false)
    or (sport_id is null and is_ignored = true)
  ),
  -- Enforces the importer's normalization at the storage layer. An alias is a
  -- SINGLE token, already lowercased and trimmed.
  --
  -- Real OSM data contains 'tennis; basketball' — note the space after the
  -- semicolon. The importer splits on ';' and trims, yielding 'basketball'. If
  -- either step is ever skipped, ' basketball' or the whole joined value lands
  -- here, the lookup misses, and the sport is silently lost. Each clause below
  -- catches one of those failures:
  --   lower/btrim  -> ' basketball', 'Basketball'
  --   no separator -> 'tennis; basketball' stored whole
  constraint osm_sport_aliases_normalized check (
    alias = lower(btrim(alias))
    and alias <> ''
    and alias !~ '[;[:space:]]'
  )
);

comment on table public.osm_sport_aliases is
  'OSM sport token -> our sport, or an explicit ignore. An ABSENT alias means unknown and must be surfaced during review, never dropped.';

create index osm_sport_aliases_sport_id_idx
  on public.osm_sport_aliases (sport_id)
  where sport_id is not null;

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------
-- Two independent controls, both required (docs/architecture.md §Access
-- control): GRANTs decide which operations a role may attempt, RLS decides
-- which rows it may touch. Supabase grants default privileges on new public
-- tables to anon/authenticated, so every table must explicitly revoke first.

revoke all on public.regions           from anon, authenticated;
revoke all on public.sports            from anon, authenticated;
revoke all on public.osm_sport_aliases from anon, authenticated;

alter table public.regions           enable row level security;
alter table public.sports            enable row level security;
alter table public.osm_sport_aliases enable row level security;

-- regions: published ones are public; admins see everything including the
-- unpublished smoke-test region.
create policy regions_select_published
  on public.regions for select to anon, authenticated
  using (is_published or public.is_admin());

create policy regions_write_admin
  on public.regions for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.regions to anon, authenticated;
grant insert, update, delete on public.regions to authenticated;

-- sports: active ones are public; admins see retired sports too.
create policy sports_select_active
  on public.sports for select to anon, authenticated
  using (is_active or public.is_admin());

create policy sports_write_admin
  on public.sports for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.sports to anon, authenticated;
grant insert, update, delete on public.sports to authenticated;

-- osm_sport_aliases: import machinery, not player-facing. Admins only.
-- The importer connects as a privileged database role and bypasses RLS.
create policy osm_sport_aliases_all_admin
  on public.osm_sport_aliases for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.osm_sport_aliases to authenticated;
