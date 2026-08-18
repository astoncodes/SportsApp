-- Published venues: the canonical, player-facing destinations.
--
-- A venue is "a place a player would recognise and check into" — not one OSM
-- object (docs/reference.md §3.1). A park with two hoops is one venue; a
-- complex with four sports is one venue. That is why source records and
-- candidates are separate concepts and never write here directly.

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
-- Enums rather than CHECK constraints so `supabase gen types` emits real union
-- types. The client then cannot compare against a status that does not exist.

create type public.indoor_state as enum ('indoor', 'outdoor', 'unknown');

-- Publication state. Deliberately separate from verification: whether a venue
-- is listed and how much we trust it are different questions (§5.6).
create type public.venue_status as enum ('active', 'merged', 'removed');

create type public.verification_state as enum (
  'unverified',
  'admin_verified',
  -- Reserved. No automatic path into this state until thresholds can be
  -- calibrated against real location-gated check-in data.
  'community_verified'
);

-- ---------------------------------------------------------------------------
-- venues
-- ---------------------------------------------------------------------------

create table public.venues (
  id                 uuid primary key default gen_random_uuid(),
  region_id          bigint      not null references public.regions (id) on delete restrict,
  name               text        not null,
  location           extensions.geography(Point, 4326) not null,
  address_text       text,
  indoor_state       public.indoor_state       not null default 'unknown',
  status             public.venue_status       not null default 'active',
  verification_state public.verification_state not null default 'unverified',
  verified_at        timestamptz,
  verified_by        uuid references auth.users (id) on delete set null,
  verification_method text,
  -- A merged venue survives as a pointer rather than being deleted: check-ins
  -- and run series already reference it, and destroying that row would destroy
  -- history. Retrofitting this after launch means a migration plus a backfill
  -- plus touching every read query.
  merged_into_venue_id uuid references public.venues (id) on delete restrict,
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint venues_name_length check (char_length(btrim(name)) between 2 and 120),
  -- The two halves of the merge invariant, stated separately so a violation
  -- names which half failed.
  constraint venues_merged_requires_target check (
    status <> 'merged' or merged_into_venue_id is not null
  ),
  constraint venues_unmerged_has_no_target check (
    status = 'merged' or merged_into_venue_id is null
  ),
  constraint venues_no_self_merge check (merged_into_venue_id is distinct from id)
);

comment on table public.venues is
  'Canonical player-facing venues. Written only by review/merge RPCs, never directly by an import.';
comment on column public.venues.merged_into_venue_id is
  'Set when this venue was merged away. The row is kept so existing check-ins and links still resolve.';

create index venues_location_idx on public.venues using gist (location);
create index venues_region_status_idx on public.venues (region_id, status);

create trigger venues_set_updated_at
  before update on public.venues
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- venue_sports
-- ---------------------------------------------------------------------------

create table public.venue_sports (
  venue_id   uuid   not null references public.venues (id) on delete cascade,
  sport_id   bigint not null references public.sports (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (venue_id, sport_id)
);

create index venue_sports_sport_idx on public.venue_sports (sport_id);

-- ---------------------------------------------------------------------------
-- venue_aliases
-- ---------------------------------------------------------------------------
-- Improves search and preserves a merged venue's old name, so somebody
-- searching for the name they know still finds the surviving venue.

create table public.venue_aliases (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references public.venues (id) on delete cascade,
  alias      text not null,
  source     text not null default 'manual',
  created_at timestamptz not null default now(),

  constraint venue_aliases_alias_length check (char_length(btrim(alias)) between 2 and 120),
  unique (venue_id, alias)
);

create index venue_aliases_venue_idx on public.venue_aliases (venue_id);

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------

revoke all on public.venues        from anon, authenticated;
revoke all on public.venue_sports  from anon, authenticated;
revoke all on public.venue_aliases from anon, authenticated;

alter table public.venues        enable row level security;
alter table public.venue_sports  enable row level security;
alter table public.venue_aliases enable row level security;

-- Only active venues are publicly discoverable (§5.1). A merged venue stays
-- readable so an old deep link can resolve and redirect to its canonical
-- venue rather than 404ing; a removed venue does not.
create policy venues_select_public
  on public.venues for select to anon, authenticated
  using (status in ('active', 'merged') or public.is_admin());

create policy venues_write_admin
  on public.venues for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.venues to anon, authenticated;
grant insert, update, delete on public.venues to authenticated;

create policy venue_sports_select_public
  on public.venue_sports for select to anon, authenticated
  using (
    exists (
      select 1 from public.venues v
       where v.id = venue_id and (v.status in ('active', 'merged') or public.is_admin())
    )
  );

create policy venue_sports_write_admin
  on public.venue_sports for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.venue_sports to anon, authenticated;
grant insert, update, delete on public.venue_sports to authenticated;

create policy venue_aliases_select_public
  on public.venue_aliases for select to anon, authenticated
  using (true);

create policy venue_aliases_write_admin
  on public.venue_aliases for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.venue_aliases to anon, authenticated;
grant insert, update, delete on public.venue_aliases to authenticated;
