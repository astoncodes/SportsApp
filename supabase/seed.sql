-- Seed data for local development. Applied by `supabase db reset` after
-- migrations. Safe to re-run: every statement is idempotent.
--
-- The alias list below is not invented — it is the set of sport tokens actually
-- observed in a live Overpass query over Prince Edward Island and inner London
-- (443 and 627 elements respectively). Tokens seen in real data are classified;
-- genuinely ambiguous ones are deliberately left out so they surface as UNKNOWN
-- during review rather than being silently guessed at.

-- ---------------------------------------------------------------------------
-- Sports
-- ---------------------------------------------------------------------------
-- The recommended launch set (docs/product-rules.md §Open decisions).
-- ice_hockey is seeded inactive: it is well represented in PEI data but the
-- app is about pickup play, and rink access works differently. Flip is_active
-- when the owners decide — that decision is still open.

insert into public.sports (slug, name, is_active, sort_order) values
  ('basketball', 'Basketball', true,  10),
  ('soccer',     'Soccer',     true,  20),
  ('volleyball', 'Volleyball', true,  30),
  ('pickleball', 'Pickleball', true,  40),
  ('tennis',     'Tennis',     true,  50),
  ('ice-hockey', 'Ice Hockey', false, 60)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- OSM sport token aliases
-- ---------------------------------------------------------------------------
-- Mapped tokens: this OSM value means this sport.

insert into public.osm_sport_aliases (alias, sport_id, is_ignored, note)
select v.alias, s.id, false, v.note
from (values
  ('basketball',      'basketball', null),
  ('soccer',          'soccer',     'OSM''s preferred token for association football.'),
  ('five-a-side',     'soccer',     'Observed in London as soccer;five-a-side.'),
  ('seven-a-side',    'soccer',     'Observed in London as seven-a-side;five-a-side;soccer.'),
  ('futsal',          'soccer',     'No dedicated sport yet; futsal cages are usually tagged soccer + covered.'),
  ('volleyball',      'volleyball', null),
  ('beachvolleyball', 'volleyball', 'Observed in PEI. OSM writes it unspaced.'),
  ('beach_volleyball','volleyball', 'Less common spelling of the same thing.'),
  ('tennis',          'tennis',     null),
  ('pickleball',      'pickleball', 'Observed in PEI, often as tennis;pickleball on shared courts.'),
  ('ice_hockey',      'ice-hockey', 'Maps even though the sport is currently inactive.')
) as v(alias, sport_slug, note)
join public.sports s on s.slug = v.sport_slug
on conflict (alias) do nothing;

-- Ignored tokens: we know what these are and deliberately do not serve them.
-- Recording them explicitly is what keeps the UNKNOWN bucket meaningful — an
-- absent alias then genuinely means "OSM tagged something we have never seen".

insert into public.osm_sport_aliases (alias, sport_id, is_ignored, note)
select v.alias, null, true, v.note
from (values
  -- Field sports that are not pickup-friendly or need booked facilities
  ('baseball',           'Very common in PEI (81 elements) but not a pickup sport for us.'),
  ('softball',           null),
  ('cricket',            null),
  ('american_football',  null),
  ('rugby_union',        null),
  ('rugby_league',       null),
  ('field_hockey',       null),
  ('netball',            null),
  ('handball',           null),
  ('badminton',          null),
  ('table_tennis',       null),
  -- Individual / facility activities
  ('running',            null),
  ('athletics',          null),
  ('swimming',           null),
  ('cycling',            null),
  ('skateboard',         null),
  ('roller_skating',     null),
  ('skating',            null),
  ('ice_skating',        null),
  ('curling',            null),
  ('skiing',             null),
  ('climbing',           null),
  ('climbing_adventure', null),
  ('yoga',               null),
  ('fitness',            null),
  ('aerobics',           null),
  ('pilates',            null),
  ('golf',               null),
  ('archery',            null),
  ('shooting_range',     null),
  ('bowls',              null),
  ('boules',             null),
  ('petanque',           null),
  ('horseshoes',         null),
  ('croquet',            null),
  ('gaga',               'Observed in PEI. Playground game, not a venue sport.'),
  ('5pin',               'Five-pin bowling, observed inside PEI community centres.'),
  ('cycle_polo',         null),
  ('beach_tennis',       null),
  -- Motorsport / equestrian
  ('horse_racing',       null),
  ('equestrian',         null),
  ('motor',              null),
  ('karting',            null),
  -- Not a sport at all: says the pitch is multi-use, tells us nothing about
  -- which sport. Must be ignored rather than mapped.
  ('multi',              'Marks a multi-use pitch. Carries no sport information.')
) as v(alias, note)
on conflict (alias) do nothing;

-- Deliberately NOT seeded, so they surface as UNKNOWN for a human to decide:
--   'football' — ambiguous. In London data it appears as soccer;football
--                (association football), but a standalone sport=football in
--                North America usually means American football.
--   'hockey'   — ambiguous between ice and field hockey.
-- This is the alias table's third state doing its job. If review shows these
-- are always one thing in practice, add them then.

-- ---------------------------------------------------------------------------
-- Regions
-- ---------------------------------------------------------------------------
-- Charlottetown's box covers the city plus Stratford and Cornwall. A live
-- Overpass query over it returned 158 sport elements: 52 pickup-relevant with
-- a sport tag, 38 leisure=pitch with no sport tag at all, and 19 named in
-- total — no named basketball courts whatsoever. That is the review workload
-- Phase 1 is built to handle.

insert into public.regions (slug, name, min_lat, min_lon, max_lat, max_lon, timezone, is_published) values
  ('charlottetown', 'Charlottetown, PE', 46.190000, -63.240000, 46.300000, -63.030000, 'America/Halifax', true),
  -- Second region, imported but never published: proves the importer carries no
  -- region-specific constants without creating a review burden. Denser and
  -- differently shaped (spans a harbour), which is the point of the test.
  ('halifax',       'Halifax, NS',       44.580000, -63.700000, 44.740000, -63.480000, 'America/Halifax', false)
on conflict (slug) do nothing;
