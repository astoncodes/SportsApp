-- The first published Charlottetown venues, named by hand.
--
-- These are not an import. docs/architecture.md is explicit that human
-- reviewers provide the initial Charlottetown display names — for a handful of
-- venues in a city you know, that beats any geocoder — so this file *is* the
-- review decision, recorded where it can be read and reverted. Coordinates were
-- geocoded from the street addresses and rounded to five decimals (~1 m), which
-- is well inside the 40 m high-confidence duplicate band.
--
-- Fixed UUIDs, so re-running changes nothing and a later migration can refer to
-- a specific venue. Left `unverified` on purpose: publication and verification
-- are different claims, and nobody has stood in these buildings for us yet
-- (docs/admin-app.md).
--
-- Two of the four are deliberately sport-less for now:
--   * Charlottetown Curling Complex — curling is not in public.sports at all.
--   * Bell Aliant Centre gets ice-hockey, which is seeded INACTIVE, so it stays
--     invisible to sport filters until the owners activate it. The link is
--     recorded now so activating the sport is a one-line change, not a backfill.
-- Adding curling, badminton or ultimate is an owners-only call — see the open
-- decisions table in docs/product-rules.md. Badminton is currently an
-- explicitly *ignored* OSM token, which is a decision someone already made.

insert into public.venues (id, region_id, name, location, address_text, indoor_state)
select
  v.id,
  -- A scalar subquery on purpose: if the region is missing, this yields NULL
  -- and the NOT NULL constraint fails the migration. A join would insert
  -- nothing and report success.
  (select id from public.regions where slug = 'charlottetown'),
  v.name,
  extensions.ST_SetSRID(extensions.ST_MakePoint(v.lon, v.lat), 4326)::extensions.geography,
  v.address_text,
  v.indoor_state::public.indoor_state
from (values
  (
    'b1000000-0000-4000-8000-000000000001'::uuid,
    'Chi-Wan Young Sports Centre',
    -63.14066, 46.25948,
    '550 University Avenue, Charlottetown, PE C1A 4P3',
    'indoor'
  ),
  (
    'b1000000-0000-4000-8000-000000000002'::uuid,
    'Bell Aliant Centre',
    -63.14195, 46.25738,
    '560 University Avenue, Charlottetown, PE C1A 0G9',
    'indoor'
  ),
  (
    'b1000000-0000-4000-8000-000000000003'::uuid,
    'Eastlink Centre',
    -63.11716, 46.24577,
    '46 Kensington Road, Charlottetown, PE C1A 5H7',
    'indoor'
  ),
  (
    'b1000000-0000-4000-8000-000000000004'::uuid,
    'Charlottetown Curling Complex',
    -63.12578, 46.24047,
    '241 Euston Street, Charlottetown, PE C1A 1X3',
    'indoor'
  )
) as v(id, name, lon, lat, address_text, indoor_state)
on conflict (id) do nothing;

-- MacLauchlan Arena is the rink inside the Bell Aliant Centre. Recording it as
-- an alias rather than a second venue is the whole point of the alias table: a
-- player searching either name finds one destination, and a later OSM import
-- that arrives carrying "MacLauchlan Arena" has something to match against.
insert into public.venue_aliases (venue_id, alias)
values ('b1000000-0000-4000-8000-000000000002'::uuid, 'MacLauchlan Arena')
on conflict (venue_id, alias) do nothing;

-- Sports, restricted to what public.sports actually knows. Chi-Wan Young's main
-- floor also hosts badminton and ultimate, and the building has squash courts
-- and a running track; none of those are sports this app serves yet, so they
-- are recorded here in prose rather than invented in the taxonomy.
insert into public.venue_sports (venue_id, sport_id)
select v.venue_id, s.id
from (values
  ('b1000000-0000-4000-8000-000000000001'::uuid, 'basketball'),
  ('b1000000-0000-4000-8000-000000000001'::uuid, 'volleyball'),
  ('b1000000-0000-4000-8000-000000000002'::uuid, 'ice-hockey'),
  ('b1000000-0000-4000-8000-000000000003'::uuid, 'basketball'),
  ('b1000000-0000-4000-8000-000000000003'::uuid, 'ice-hockey')
) as v(venue_id, sport_slug)
join public.sports s on s.slug = v.sport_slug
on conflict (venue_id, sport_id) do nothing;
