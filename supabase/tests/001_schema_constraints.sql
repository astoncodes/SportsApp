-- Schema shape and the constraints that encode product rules.
--
-- These are the rules we do not want a future migration to quietly relax.

begin;
select plan(21);

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------

select has_extension('extensions', 'postgis', 'PostGIS is enabled by migration');

select has_table('public', 'regions', 'regions exists');
select has_table('public', 'sports', 'sports exists');
select has_table('public', 'osm_sport_aliases', 'osm_sport_aliases exists');
select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'profile_sports', 'profile_sports exists');
select has_table('public', 'admin_users', 'admin_users exists');

select has_function('public', 'is_admin', 'is_admin() exists');
select has_function('public', 'current_profile', 'current_profile() exists');

-- Every table reachable through the API must have RLS on. A table added
-- without it is the single most likely way this project leaks data.
select is_empty(
  $$ select c.relname::text
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and not c.relrowsecurity $$,
  'every public table has row level security enabled'
);

-- ---------------------------------------------------------------------------
-- osm_sport_aliases: the three-state contract
-- ---------------------------------------------------------------------------

-- The three ways the importer's normalization can fail, each caught here.
-- 'tennis; basketball' is a verbatim value from live OSM data.
select throws_ok(
  $$ insert into public.osm_sport_aliases (alias, sport_id, is_ignored)
     values ('tennis; basketball', null, true) $$,
  '23514',
  null,
  'a whole semicolon-joined tag value is rejected — an alias is one token'
);

select throws_ok(
  $$ insert into public.osm_sport_aliases (alias, sport_id, is_ignored)
     values (' basketball', null, true) $$,
  '23514',
  null,
  'an untrimmed token is rejected (what you get from splitting "tennis; basketball")'
);

select throws_ok(
  $$ insert into public.osm_sport_aliases (alias, sport_id, is_ignored)
     values ('Basketball', null, true) $$,
  '23514',
  null,
  'an uppercase alias is rejected'
);

select throws_ok(
  $$ insert into public.osm_sport_aliases (alias, sport_id, is_ignored)
     select 'padel', s.id, true from public.sports s where s.slug = 'tennis' $$,
  '23514',
  null,
  'an alias cannot be both mapped and ignored'
);

select throws_ok(
  $$ insert into public.osm_sport_aliases (alias, sport_id, is_ignored)
     values ('padel', null, false) $$,
  '23514',
  null,
  'an alias must be either mapped or explicitly ignored, never neither'
);

-- The absence of a row is the "unknown" signal the importer relies on.
select is_empty(
  $$ select 1 from public.osm_sport_aliases where alias in ('football', 'hockey') $$,
  'ambiguous tokens are deliberately absent so review surfaces them as unknown'
);

-- ---------------------------------------------------------------------------
-- regions: bounding box and timezone
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.regions (slug, name, min_lat, min_lon, max_lat, max_lon, timezone)
     values ('bad-order', 'Bad', 47.0, -63.0, 46.0, -62.0, 'America/Halifax') $$,
  '23514',
  null,
  'a transposed latitude box is rejected'
);

select throws_ok(
  $$ insert into public.regions (slug, name, min_lat, min_lon, max_lat, max_lon, timezone)
     values ('bad-lat', 'Bad', 46.0, -63.0, 91.0, -62.0, 'America/Halifax') $$,
  '23514',
  null,
  'an out-of-range latitude is rejected'
);

select throws_ok(
  $$ insert into public.regions (slug, name, min_lat, min_lon, max_lat, max_lon, timezone)
     values ('bad-tz', 'Bad', 46.0, -63.0, 47.0, -62.0, 'Atlantic/Charlottetown') $$,
  '23514',
  null,
  'an invalid IANA timezone is rejected (DST correctness depends on this)'
);

select lives_ok(
  $$ insert into public.regions (slug, name, min_lat, min_lon, max_lat, max_lon, timezone)
     values ('summerside', 'Summerside, PE', 46.36, -63.83, 46.42, -63.75, 'America/Halifax') $$,
  'a well-formed region inserts cleanly'
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

-- A data-modifying CTE is only legal at the top level, so the update runs as
-- its own statement and the assertion inspects the result afterwards.
update public.sports set sort_order = sort_order + 1 where slug = 'basketball';

select cmp_ok(
  (select updated_at from public.sports where slug = 'basketball'),
  '>',
  (select created_at from public.sports where slug = 'basketball'),
  'updating a row advances updated_at past created_at'
);

select * from finish();
rollback;
