-- Extensions and shared helper routines.
--
-- PostGIS is enabled here rather than through the dashboard so that a fresh
-- `supabase db reset` reproduces the database exactly from committed files.
-- It lives in the `extensions` schema (Supabase convention), which means every
-- spatial type and function is referenced schema-qualified as `extensions.*`.
-- That matters because our SECURITY DEFINER functions run with an empty
-- search_path, where nothing resolves implicitly.

create schema if not exists extensions;

create extension if not exists postgis with schema extensions;

-- pgTAP powers `npm run db:test`. It is enabled by migration so that CI and a
-- fresh clone both get it without manual setup. It only adds assertion
-- functions used by supabase/tests/ — it grants no data access and is safe to
-- leave enabled, but it is separable if you would rather not ship it.
create extension if not exists pgtap with schema extensions;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
-- Applied by trigger to every mutable table. Written as a trigger function
-- rather than a column default because defaults do not fire on UPDATE.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at is
  'BEFORE UPDATE trigger: stamps updated_at. Attach to every mutable table.';

-- ---------------------------------------------------------------------------
-- IANA timezone validation
-- ---------------------------------------------------------------------------
-- A CHECK constraint cannot query pg_timezone_names (not immutable), but an
-- invalid timezone silently breaks daylight-saving correctness for recurring
-- runs, which is a real product rule (docs/product-rules.md §Recurring runs).
-- A trigger is the correct enforcement point.

create or replace function public.assert_valid_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_timezone text := row_to_json(new) ->> 'timezone';
begin
  if v_timezone is null then
    return new;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_timezone_names tz where tz.name = v_timezone
  ) then
    raise exception 'invalid IANA timezone: %', v_timezone
      using errcode = 'check_violation',
            hint = 'Expected a name from pg_timezone_names, e.g. America/Halifax.';
  end if;

  return new;
end;
$$;

comment on function public.assert_valid_timezone is
  'BEFORE INSERT/UPDATE trigger: rejects a timezone column that is not a known IANA name.';
