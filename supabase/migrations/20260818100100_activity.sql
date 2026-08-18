-- Live activity: check-ins, arrival intents, and venue condition reports.
--
-- Everything here expires. The product's credibility rests on activity
-- disappearing on its own — "the app says five people are here, nobody is"
-- destroys trust within a week — so expiry is expressed as a query predicate
-- and never depends on a cleanup job having run.

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------

create type public.check_in_end_reason as enum ('checkout', 'expired', 'replaced', 'admin');

-- Venue Pulse: one structured, expiring state per live check-in. Deliberately
-- a closed set rather than free text — this is a status broadcast, not a chat
-- thread, and a fixed vocabulary is what makes it aggregatable.
create type public.venue_pulse as enum (
  'need_players',
  'game_on',
  'full_next_game',
  'wrapping_up'
);

create type public.venue_condition_kind as enum (
  'lights_on',
  'lights_off',
  'wet_surface',
  'locked',
  'crowded',
  'equipment_issue'
);

-- ---------------------------------------------------------------------------
-- check_ins
-- ---------------------------------------------------------------------------

create table public.check_ins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid   not null references auth.users (id) on delete cascade,
  venue_id   uuid   not null references public.venues (id) on delete restrict,
  -- Denormalized from the venue and validated by the RPC. Realtime filters on
  -- a single column, so a subscriber can watch one region without a join.
  region_id  bigint not null references public.regions (id) on delete restrict,
  sport_id   bigint not null references public.sports (id) on delete restrict,
  party_size smallint not null default 1,
  note       text,
  pulse      public.venue_pulse,

  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at   timestamptz,
  end_reason public.check_in_end_reason,

  -- Location evidence, NOT location history. The device coordinate is used
  -- inside the RPC transaction to compute these and is then discarded (§5.3).
  -- Storing the point would build exactly the tracking database this product
  -- promises not to keep.
  location_verified   boolean not null default false,
  distance_to_venue_m numeric(8, 1),
  reported_accuracy_m numeric(8, 1),

  created_at timestamptz not null default now(),

  constraint check_ins_party_size_range check (party_size between 1 and 20),
  constraint check_ins_note_length check (note is null or char_length(note) <= 120),
  constraint check_ins_expires_after_start check (expires_at > started_at),
  -- Four hours is the hard ceiling, including extensions (§5.2).
  constraint check_ins_max_window check (expires_at <= started_at + interval '4 hours'),
  constraint check_ins_ended_has_reason check (
    (ended_at is null and end_reason is null) or (ended_at is not null and end_reason is not null)
  )
);

comment on table public.check_ins is
  'Live presence. Active means: ended_at is null AND expires_at > now(). Never trust a cleanup job for that.';
comment on column public.check_ins.party_size is
  'Includes the checked-in user. Venue counts SUM this rather than counting rows — someone who brought four friends is five players.';

-- One open check-in per user, enforced by the database rather than by client
-- logic. now() cannot appear in an index predicate, so this covers "not yet
-- ended"; the create RPC closes an already-expired open row first.
create unique index check_ins_one_open_per_user
  on public.check_ins (user_id)
  where ended_at is null;

create index check_ins_venue_active_idx on public.check_ins (venue_id, expires_at)
  where ended_at is null;
create index check_ins_region_active_idx on public.check_ins (region_id, expires_at)
  where ended_at is null;
create index check_ins_user_idx on public.check_ins (user_id, started_at desc);

-- ---------------------------------------------------------------------------
-- arrival_intents  ("Heading There")
-- ---------------------------------------------------------------------------
-- Solves cold start: an empty court stays empty because nobody wants to commit
-- first. An intent is a much cheaper signal than a check-in, and it is kept
-- structurally separate so it can NEVER inflate the verified "here now" count.

create table public.arrival_intents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid   not null references auth.users (id) on delete cascade,
  venue_id     uuid   not null references public.venues (id) on delete restrict,
  region_id    bigint not null references public.regions (id) on delete restrict,
  sport_id     bigint not null references public.sports (id) on delete restrict,
  eta_minutes  smallint not null,
  expires_at   timestamptz not null,
  cancelled_at timestamptz,
  -- Set when the intent turned into a real check-in, so it stops counting
  -- without looking like the user simply gave up.
  fulfilled_by_check_in_id uuid references public.check_ins (id) on delete set null,
  created_at   timestamptz not null default now(),

  constraint arrival_intents_eta_allowed check (eta_minutes in (15, 30, 60)),
  constraint arrival_intents_expiry_future check (expires_at > created_at)
);

comment on table public.arrival_intents is
  'Lightweight "on my way" signal. Counted and displayed separately from check-ins; never added to the here-now total.';

create unique index arrival_intents_one_open_per_user
  on public.arrival_intents (user_id)
  where cancelled_at is null and fulfilled_by_check_in_id is null;

create index arrival_intents_venue_active_idx
  on public.arrival_intents (venue_id, expires_at)
  where cancelled_at is null and fulfilled_by_check_in_id is null;

-- ---------------------------------------------------------------------------
-- venue_conditions
-- ---------------------------------------------------------------------------
-- Short-lived, structured facts about a place right now. These never become
-- permanent venue attributes automatically — "locked" on a Sunday is not the
-- same claim as "this venue is locked".

create table public.venue_conditions (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues (id) on delete cascade,
  kind        public.venue_condition_kind not null,
  -- Retained for abuse handling. Never exposed through a public read path.
  reported_by uuid not null references auth.users (id) on delete cascade,
  note        text,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),

  constraint venue_conditions_note_length check (note is null or char_length(note) <= 120),
  constraint venue_conditions_expiry_future check (expires_at > created_at)
);

create index venue_conditions_venue_active_idx
  on public.venue_conditions (venue_id, expires_at);

-- One live report of a given kind per venue per reporter, so a single user
-- cannot make "wet surface" look like a consensus.
create unique index venue_conditions_one_per_kind_per_reporter
  on public.venue_conditions (venue_id, kind, reported_by)
  where expires_at > '-infinity';

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------

revoke all on public.check_ins        from anon, authenticated;
revoke all on public.arrival_intents  from anon, authenticated;
revoke all on public.venue_conditions from anon, authenticated;

alter table public.check_ins        enable row level security;
alter table public.arrival_intents  enable row level security;
alter table public.venue_conditions enable row level security;

-- Signed-in users see currently-active check-ins. Expired ones collapse to
-- owner-only, so the table never becomes a public history of where people
-- have been. Anonymous browsers get aggregate counts through the discovery
-- RPCs instead of row access.
create policy check_ins_select_active_or_own
  on public.check_ins for select to authenticated
  using (
    user_id = (select auth.uid())
    or (ended_at is null and expires_at > now())
    or public.is_admin()
  );

-- No direct INSERT/UPDATE policy: writes go through create_check_in(),
-- end_check_in() and extend_check_in(), which validate location, duration and
-- the one-open-check-in rule transactionally.
grant select on public.check_ins to authenticated;

create policy arrival_intents_select_active_or_own
  on public.arrival_intents for select to authenticated
  using (
    user_id = (select auth.uid())
    or (cancelled_at is null and fulfilled_by_check_in_id is null and expires_at > now())
    or public.is_admin()
  );

grant select on public.arrival_intents to authenticated;

-- Conditions are readable while live, by anyone — a locked gate is worth
-- knowing before you travel, signed in or not. reported_by is withheld by
-- column grant rather than by policy.
create policy venue_conditions_select_live
  on public.venue_conditions for select to anon, authenticated
  using (expires_at > now() or reported_by = (select auth.uid()) or public.is_admin());

grant select (id, venue_id, kind, note, expires_at, created_at)
  on public.venue_conditions to anon, authenticated;
