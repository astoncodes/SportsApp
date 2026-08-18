-- Player identity and sport preferences.

create table public.profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  display_name            text        not null,
  avatar_path             text,
  home_region_id          bigint      references public.regions (id) on delete set null,
  onboarding_completed_at timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint profiles_display_name_length check (
    char_length(btrim(display_name)) between 2 and 40
  )
);

comment on table public.profiles is
  'One row per auth user, created automatically on signup. Only display_name and avatar_path are readable by other users — enforced by column-level GRANT, not by policy.';
comment on column public.profiles.avatar_path is
  'Storage object path, not a URL. Signing/serving is the client''s job so the bucket can move.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.profile_sports (
  profile_id uuid        not null references public.profiles (id) on delete cascade,
  sport_id   bigint      not null references public.sports (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, sport_id)
);

comment on table public.profile_sports is
  'Which sports a player follows. Drives their default map filters.';

create index profile_sports_sport_id_idx on public.profile_sports (sport_id);

-- ---------------------------------------------------------------------------
-- Profile creation on signup
-- ---------------------------------------------------------------------------
-- A profile row must exist before the app can render anything for a new user,
-- and the client cannot be trusted to create it (a user who skips the call
-- would have an account with no profile). A trigger on auth.users makes it
-- unconditional and transactional with the signup itself.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    -- Prefer a name supplied at signup; otherwise derive a placeholder from the
    -- email local part. Never leaves display_name null — it is NOT NULL, and a
    -- failure here would roll back the signup.
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'player'
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user is
  'AFTER INSERT on auth.users: creates the matching profile row so no account can exist without one.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- current_profile()
-- ---------------------------------------------------------------------------
-- Column-level grants (below) expose only display_name and avatar_path to
-- authenticated users, which correctly hides other people's home region and
-- onboarding state — but grants are role-wide, so they hide the caller's own
-- private fields too. This RPC is how a user reads their complete row.

create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.profiles p where p.id = auth.uid();
$$;

comment on function public.current_profile is
  'The caller''s own complete profile row, including fields hidden from other users by column grants.';

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------

revoke all on public.profiles       from anon, authenticated;
revoke all on public.profile_sports from anon, authenticated;

alter table public.profiles       enable row level security;
alter table public.profile_sports enable row level security;

-- Every profile row is selectable, but the GRANT below narrows *which columns*
-- anon and authenticated may actually read. Row visibility and column
-- visibility are separate mechanisms; this table needs both.
create policy profiles_select_public
  on public.profiles for select to anon, authenticated
  using (true);

create policy profiles_update_own
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No INSERT policy: profiles are created only by the signup trigger.
-- No DELETE policy: deleting an auth user cascades here.

grant select (id, display_name, avatar_path) on public.profiles to anon, authenticated;
grant update (display_name, avatar_path, home_region_id, onboarding_completed_at)
  on public.profiles to authenticated;

grant execute on function public.current_profile() to authenticated;

-- Sport preferences are private to their owner.
create policy profile_sports_select_own
  on public.profile_sports for select to authenticated
  using (profile_id = (select auth.uid()));

create policy profile_sports_insert_own
  on public.profile_sports for insert to authenticated
  with check (profile_id = (select auth.uid()));

create policy profile_sports_delete_own
  on public.profile_sports for delete to authenticated
  using (profile_id = (select auth.uid()));

grant select, insert, delete on public.profile_sports to authenticated;
