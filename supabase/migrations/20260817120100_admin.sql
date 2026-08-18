-- Admin identity.
--
-- Admin status is a row in a table that clients cannot write to, never a claim
-- in a JWT and never a column on profiles. A user who can edit their own
-- profile must not be one UPDATE away from becoming an admin.

create table public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  note       text,
  created_at timestamptz not null default now()
);

comment on table public.admin_users is
  'Grants admin capability. Bootstrapped out-of-band (see docs/architecture.md); no client path writes here.';

-- ---------------------------------------------------------------------------
-- is_admin()
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER is load-bearing, not incidental. admin_users denies SELECT
-- to anon and authenticated, so a policy calling this as the invoker would see
-- zero rows and every admin check would silently return false. Running as the
-- owner lets the check read the table while the table itself stays unreadable.
--
-- STABLE (not VOLATILE) so the planner can cache it within a statement rather
-- than re-running it per row.

create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users a where a.user_id = p_user_id
  );
$$;

comment on function public.is_admin is
  'True when the given user (default: caller) is an admin. SECURITY DEFINER so RLS policies can consult admin_users, which is otherwise unreadable.';

-- Locked down explicitly. Supabase grants default privileges on new public
-- tables to anon/authenticated, so silence here would mean an open table.
revoke all on public.admin_users from anon, authenticated;

alter table public.admin_users enable row level security;
alter table public.admin_users force row level security;

-- Admins may read the roster (to see who else has access). Nobody writes
-- through the API at all — not even admins. Granting a new admin is a
-- deliberate out-of-band act, which is what makes escalation auditable.
create policy admin_users_select_admin
  on public.admin_users
  for select
  to authenticated
  using (public.is_admin());

grant select on public.admin_users to authenticated;

-- anon is never an admin, but policies on other tables call is_admin() while
-- anon is the active role. Without EXECUTE that call errors instead of
-- returning false, which would break anonymous reads of published data.
grant execute on function public.is_admin(uuid) to anon, authenticated;
