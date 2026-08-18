-- Recurring runs: the half of the product that has content before anyone has
-- checked in anywhere. "Tuesday 7pm regulars" is useful with zero live users.

create type public.run_series_status as enum ('active', 'inactive', 'removed');
create type public.run_exception_status as enum ('cancelled', 'rescheduled');

create table public.run_series (
  id           uuid primary key default gen_random_uuid(),
  organizer_id uuid   not null references auth.users (id) on delete cascade,
  venue_id     uuid   not null references public.venues (id) on delete restrict,
  sport_id     bigint not null references public.sports (id) on delete restrict,
  region_id    bigint not null references public.regions (id) on delete restrict,

  -- Local recurrence values, NOT a single UTC instant. A 7pm run has to stay
  -- at 7pm across a daylight-saving change instead of silently becoming 6pm,
  -- and that is only expressible by storing the local time plus a zone.
  weekday          smallint not null,
  local_start_time time     not null,
  local_end_time   time     not null,
  timezone         text     not null,

  starts_on   date not null,
  -- A series expires unless renewed. An organiser who loses interest should
  -- stop misleading people within weeks, not months.
  valid_until date not null,

  title            text,
  description      text,
  expected_players smallint,
  status           public.run_series_status not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint run_series_weekday_range check (weekday between 0 and 6),
  constraint run_series_time_order check (local_end_time > local_start_time),
  constraint run_series_valid_until_after_start check (valid_until >= starts_on),
  constraint run_series_max_12_weeks check (valid_until <= starts_on + interval '12 weeks'),
  constraint run_series_title_length check (title is null or char_length(btrim(title)) <= 80),
  constraint run_series_description_length check (
    description is null or char_length(description) <= 300
  ),
  constraint run_series_expected_players_range check (
    expected_players is null or expected_players between 2 and 100
  )
);

comment on table public.run_series is
  'Weekly recurring sessions. Local time + IANA zone so DST transitions stay correct; valid_until forces renewal.';

create index run_series_venue_idx on public.run_series (venue_id) where status = 'active';
create index run_series_region_idx on public.run_series (region_id, weekday) where status = 'active';
create index run_series_organizer_idx on public.run_series (organizer_id);

create trigger run_series_set_updated_at
  before update on public.run_series
  for each row execute function public.set_updated_at();

create trigger run_series_assert_valid_timezone
  before insert or update of timezone on public.run_series
  for each row execute function public.assert_valid_timezone();

-- ---------------------------------------------------------------------------
-- run_exceptions
-- ---------------------------------------------------------------------------
-- One-off deviations. Cancelling a single week must not require destroying and
-- recreating the series, which would lose its history and its renewal date.

create table public.run_exceptions (
  id              uuid primary key default gen_random_uuid(),
  run_series_id   uuid not null references public.run_series (id) on delete cascade,
  occurrence_date date not null,
  status          public.run_exception_status not null,
  replacement_start_at timestamptz,
  replacement_end_at   timestamptz,
  note            text,
  created_at      timestamptz not null default now(),

  unique (run_series_id, occurrence_date),
  constraint run_exceptions_reschedule_has_times check (
    status <> 'rescheduled'
    or (replacement_start_at is not null and replacement_end_at is not null
        and replacement_end_at > replacement_start_at)
  ),
  constraint run_exceptions_cancel_has_no_times check (
    status <> 'cancelled'
    or (replacement_start_at is null and replacement_end_at is null)
  ),
  constraint run_exceptions_note_length check (note is null or char_length(note) <= 120)
);

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------

revoke all on public.run_series     from anon, authenticated;
revoke all on public.run_exceptions from anon, authenticated;

alter table public.run_series     enable row level security;
alter table public.run_exceptions enable row level security;

-- Active, unexpired series are public — discovering a run should not require
-- an account. The organiser always sees their own, including expired ones, so
-- they can renew.
create policy run_series_select_public
  on public.run_series for select to anon, authenticated
  using (
    (status = 'active' and valid_until >= current_date)
    or organizer_id = (select auth.uid())
    or public.is_admin()
  );

grant select on public.run_series to anon, authenticated;

create policy run_exceptions_select_public
  on public.run_exceptions for select to anon, authenticated
  using (
    exists (
      select 1 from public.run_series s
       where s.id = run_series_id
         and ((s.status = 'active' and s.valid_until >= current_date)
              or s.organizer_id = (select auth.uid())
              or public.is_admin())
    )
  );

grant select on public.run_exceptions to anon, authenticated;

-- Writes go through upsert_run_series() / cancel_run_occurrence() so the
-- 12-week limit, timezone validity and organiser ownership are checked in one
-- place rather than in each client.
