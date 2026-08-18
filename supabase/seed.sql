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

-- ===========================================================================
-- DEVELOPMENT DEMO DATA
-- ===========================================================================
-- Everything below exists so the app has something true to render locally. It
-- goes through the real tables, so the UI exercises real queries, real RLS and
-- real aggregates rather than a mock array in a component.
--
-- All demo identities use the reserved 'seed.dropin.test' domain and UUIDs
-- beginning 5EED. Timestamps are relative to now(), so a reset always produces
-- a scene that is live *right now* rather than one that expired last Tuesday.
--
-- Venue coordinates are real Charlottetown locations. Names marked (demo) are
-- placeholders for places a human reviewer would name properly in Phase 1.

-- ---------------------------------------------------------------------------
-- Demo players
-- ---------------------------------------------------------------------------
-- Inserting into auth.users fires handle_new_user(), which creates the profile.

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', '5eed0001-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'maya@seed.dropin.test',  '{"display_name":"Maya R."}'),
  ('00000000-0000-0000-0000-000000000000', '5eed0001-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'devon@seed.dropin.test', '{"display_name":"Devon K."}'),
  ('00000000-0000-0000-0000-000000000000', '5eed0001-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'sam@seed.dropin.test',   '{"display_name":"Sam O."}'),
  ('00000000-0000-0000-0000-000000000000', '5eed0001-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'priya@seed.dropin.test', '{"display_name":"Priya N."}'),
  ('00000000-0000-0000-0000-000000000000', '5eed0001-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'jules@seed.dropin.test', '{"display_name":"Jules B."}')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Venues
-- ---------------------------------------------------------------------------

insert into public.venues (id, region_id, name, location, address_text, indoor_state, verification_state, verified_at, verification_method)
select v.id,
       r.id,
       v.name,
       extensions.ST_SetSRID(extensions.ST_MakePoint(v.lon, v.lat), 4326)::extensions.geography,
       v.address,
       v.indoor::public.indoor_state,
       v.verification::public.verification_state,
       case when v.verification = 'admin_verified' then now() - interval '9 days' end,
       case when v.verification = 'admin_verified' then 'human review of OSM import' end
  from (values
    ('5eedbbbb-0000-4000-8000-000000000001'::uuid, 'Victoria Park Courts',        46.229400, -63.137200, 'Victoria Park, Charlottetown', 'outdoor', 'admin_verified'),
    ('5eedbbbb-0000-4000-8000-000000000002'::uuid, 'UPEI Turf Field',             46.256300, -63.139600, 'University Ave, Charlottetown', 'outdoor', 'admin_verified'),
    ('5eedbbbb-0000-4000-8000-000000000003'::uuid, 'Confederation Landing Oval',  46.231100, -63.124800, 'Water St, Charlottetown',       'outdoor', 'admin_verified'),
    ('5eedbbbb-0000-4000-8000-000000000004'::uuid, 'Orlebar Park',                46.244600, -63.114900, 'Kensington Rd, Charlottetown',  'outdoor', 'admin_verified'),
    ('5eedbbbb-0000-4000-8000-000000000005'::uuid, 'MacAdam Field',               46.248200, -63.150100, 'Belvedere Ave, Charlottetown',  'outdoor', 'unverified'),
    ('5eedbbbb-0000-4000-8000-000000000006'::uuid, 'Simmons Sports Centre',       46.246900, -63.132400, 'Exhibition Dr, Charlottetown',  'indoor',  'admin_verified'),
    ('5eedbbbb-0000-4000-8000-000000000007'::uuid, 'Sherwood Schoolyard Court',   46.259800, -63.129100, 'Sherwood, Charlottetown',       'outdoor', 'unverified'),
    ('5eedbbbb-0000-4000-8000-000000000008'::uuid, 'Stratford Community Pitch',   46.216400, -63.089700, 'Stratford, PE',                 'outdoor', 'unverified'),
    ('5eedbbbb-0000-4000-8000-000000000009'::uuid, 'West Royalty Ball Courts',    46.264700, -63.169800, 'West Royalty, Charlottetown',   'outdoor', 'unverified'),
    ('5eedbbbb-0000-4000-8000-00000000000a'::uuid, 'Parkdale Community Court',    46.243100, -63.117600, 'Parkdale, Charlottetown',       'outdoor', 'unverified'),
    ('5eedbbbb-0000-4000-8000-00000000000b'::uuid, 'Chi-Wan Young Sports Centre', 46.255100, -63.142300, 'UPEI, Charlottetown',           'indoor',  'admin_verified'),
    ('5eedbbbb-0000-4000-8000-00000000000c'::uuid, 'Hillsborough Park Courts',    46.238900, -63.104200, 'Hillsborough Park, Charlottetown','outdoor','unverified')
  ) as v(id, name, lat, lon, address, indoor, verification)
  cross join (select id from public.regions where slug = 'charlottetown') r
on conflict (id) do nothing;

insert into public.venue_sports (venue_id, sport_id)
select vs.venue_id::uuid, s.id
  from (values
    ('5eedbbbb-0000-4000-8000-000000000001', 'basketball'),
    ('5eedbbbb-0000-4000-8000-000000000001', 'tennis'),
    ('5eedbbbb-0000-4000-8000-000000000002', 'soccer'),
    ('5eedbbbb-0000-4000-8000-000000000003', 'volleyball'),
    ('5eedbbbb-0000-4000-8000-000000000003', 'pickleball'),
    ('5eedbbbb-0000-4000-8000-000000000004', 'soccer'),
    ('5eedbbbb-0000-4000-8000-000000000005', 'soccer'),
    ('5eedbbbb-0000-4000-8000-000000000006', 'basketball'),
    ('5eedbbbb-0000-4000-8000-000000000006', 'volleyball'),
    ('5eedbbbb-0000-4000-8000-000000000006', 'pickleball'),
    ('5eedbbbb-0000-4000-8000-000000000007', 'basketball'),
    ('5eedbbbb-0000-4000-8000-000000000008', 'soccer'),
    ('5eedbbbb-0000-4000-8000-000000000009', 'basketball'),
    ('5eedbbbb-0000-4000-8000-000000000009', 'soccer'),
    ('5eedbbbb-0000-4000-8000-00000000000a', 'basketball'),
    ('5eedbbbb-0000-4000-8000-00000000000b', 'basketball'),
    ('5eedbbbb-0000-4000-8000-00000000000b', 'volleyball'),
    ('5eedbbbb-0000-4000-8000-00000000000c', 'tennis'),
    ('5eedbbbb-0000-4000-8000-00000000000c', 'pickleball')
  ) as vs(venue_id, sport_slug)
  join public.sports s on s.slug = vs.sport_slug
on conflict do nothing;

insert into public.venue_aliases (venue_id, alias, source)
values
  ('5eedbbbb-0000-4000-8000-000000000001', 'Vic Park hoops', 'manual'),
  ('5eedbbbb-0000-4000-8000-000000000005', 'Belvedere pitch', 'manual')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Live check-ins  — state 1: a busy game in progress
-- ---------------------------------------------------------------------------

insert into public.check_ins (
  user_id, venue_id, region_id, sport_id, party_size, note, pulse,
  started_at, expires_at, location_verified, distance_to_venue_m, reported_accuracy_m
)
select c.user_id::uuid,
       c.venue_id::uuid,
       r.id,
       s.id,
       c.party_size::smallint,
       c.note,
       c.pulse::public.venue_pulse,
       now() - make_interval(mins => c.started_mins_ago),
       now() + make_interval(mins => c.expires_in_mins),
       true,
       c.distance_m,
       c.accuracy_m
  from (values
    -- Victoria Park: a full run, five-a-side plus spectators arriving
    ('5eed0001-0000-4000-8000-000000000001', '5eedbbbb-0000-4000-8000-000000000001', 'basketball', 4, 'Full court, winners stay on', 'game_on',      38, 52, 41.2, 12.0),
    ('5eed0001-0000-4000-8000-000000000002', '5eedbbbb-0000-4000-8000-000000000001', 'basketball', 2, null,                          'game_on',      22, 68, 63.8, 18.5),
    -- Simmons: short-handed, actively wants people
    ('5eed0001-0000-4000-8000-000000000003', '5eedbbbb-0000-4000-8000-000000000006', 'volleyball', 3, 'Need 2 more for 3s',          'need_players', 15, 75, 22.4,  9.0),
    -- Orlebar: winding down
    ('5eed0001-0000-4000-8000-000000000004', '5eedbbbb-0000-4000-8000-000000000004', 'soccer',     2, null,                          'wrapping_up',  95, 18, 88.1, 25.0)
  ) as c(user_id, venue_id, sport_slug, party_size, note, pulse, started_mins_ago, expires_in_mins, distance_m, accuracy_m)
  join public.sports s on s.slug = c.sport_slug
  cross join (select id from public.regions where slug = 'charlottetown') r
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Arrival intents — state 2: nobody there yet, but people are coming
-- ---------------------------------------------------------------------------
-- Deliberately at a venue with zero check-ins, so the UI has to prove it shows
-- "heading there" separately and never folds it into the here-now count.

insert into public.arrival_intents (user_id, venue_id, region_id, sport_id, eta_minutes, expires_at)
select a.user_id::uuid, a.venue_id::uuid, r.id, s.id, a.eta::smallint,
       now() + make_interval(mins => a.eta)
  from (values
    ('5eed0001-0000-4000-8000-000000000005', '5eedbbbb-0000-4000-8000-000000000003', 'pickleball', 30),
    ('5eed0001-0000-4000-8000-000000000002', '5eedbbbb-0000-4000-8000-000000000003', 'pickleball', 60)
  ) as a(user_id, venue_id, sport_slug, eta)
  join public.sports s on s.slug = a.sport_slug
  cross join (select id from public.regions where slug = 'charlottetown') r
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Venue conditions
-- ---------------------------------------------------------------------------

insert into public.venue_conditions (venue_id, kind, reported_by, note, expires_at)
values
  ('5eedbbbb-0000-4000-8000-000000000001', 'lights_on',       '5eed0001-0000-4000-8000-000000000002', null,               now() + interval '3 hours'),
  ('5eedbbbb-0000-4000-8000-000000000005', 'wet_surface',     '5eed0001-0000-4000-8000-000000000003', 'Soft near the far goal', now() + interval '4 hours'),
  ('5eedbbbb-0000-4000-8000-000000000009', 'equipment_issue', '5eed0001-0000-4000-8000-000000000001', 'One rim is bent',  now() + interval '12 hours')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Recurring runs — state 3: nothing live, but something reliable is coming
-- ---------------------------------------------------------------------------
-- Weekdays are relative to today so the Scheduled tab always has entries in
-- Today / Tomorrow / This week regardless of when the database is reset.

insert into public.run_series (
  id, organizer_id, venue_id, sport_id, region_id,
  weekday, local_start_time, local_end_time, timezone,
  starts_on, valid_until, title, description, expected_players, status
)
select rs.id::uuid,
       rs.organizer::uuid,
       rs.venue_id::uuid,
       s.id,
       r.id,
       (extract(dow from current_date)::integer + rs.day_offset) % 7,
       rs.start_time::time,
       rs.end_time::time,
       'America/Halifax',
       current_date - 21,
       current_date + 42,
       rs.title,
       rs.description,
       rs.expected::smallint,
       'active'
  from (values
    ('5eedaaaa-0000-4000-8000-000000000001', '5eed0001-0000-4000-8000-000000000001', '5eedbbbb-0000-4000-8000-000000000002', 'soccer',     0, '19:00', '21:00', 'Tuesday night 7s',      'Casual, all levels. We split teams on arrival.', 14),
    ('5eedaaaa-0000-4000-8000-000000000002', '5eed0001-0000-4000-8000-000000000002', '5eedbbbb-0000-4000-8000-000000000006', 'basketball', 0, '20:30', '22:00', 'Late night runs',       'Full court once we have 10.',                     10),
    ('5eedaaaa-0000-4000-8000-000000000003', '5eed0001-0000-4000-8000-000000000003', '5eedbbbb-0000-4000-8000-000000000003', 'volleyball', 1, '18:00', '20:00', 'Beach volley meetup',   'Nets up by 6. Bring water.',                       12),
    ('5eedaaaa-0000-4000-8000-000000000004', '5eed0001-0000-4000-8000-000000000004', '5eedbbbb-0000-4000-8000-000000000001', 'basketball', 2, '17:30', '19:30', 'After-work hoops',      'Half court, first to 15.',                          8),
    ('5eedaaaa-0000-4000-8000-000000000005', '5eed0001-0000-4000-8000-000000000005', '5eedbbbb-0000-4000-8000-00000000000c', 'pickleball', 3, '09:00', '11:00', 'Morning pickleball',    'Paddles to share. Beginners welcome.',              8),
    ('5eedaaaa-0000-4000-8000-000000000006', '5eed0001-0000-4000-8000-000000000001', '5eedbbbb-0000-4000-8000-000000000008', 'soccer',     5, '10:00', '12:00', 'Saturday kickabout',    'Kids welcome, we keep it light.',                  16)
  ) as rs(id, organizer, venue_id, sport_slug, day_offset, start_time, end_time, title, description, expected)
  join public.sports s on s.slug = rs.sport_slug
  cross join (select id from public.regions where slug = 'charlottetown') r
on conflict (id) do nothing;

-- One cancelled occurrence, so the exceptions path is exercised rather than
-- merely implemented.
insert into public.run_exceptions (run_series_id, occurrence_date, status, note)
select '5eedaaaa-0000-4000-8000-000000000004'::uuid,
       (select min(u.occurrence_date)
          from public.upcoming_runs(null, null, null, now(), 14) u
         where u.run_series_id = '5eedaaaa-0000-4000-8000-000000000004'::uuid),
       'cancelled',
       'Court resurfacing'
 where exists (
   select 1 from public.upcoming_runs(null, null, null, now(), 14) u
    where u.run_series_id = '5eedaaaa-0000-4000-8000-000000000004'::uuid
 )
on conflict do nothing;
