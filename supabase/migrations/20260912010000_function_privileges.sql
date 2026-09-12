-- Supabase's default function privileges include explicit grants to anon.
-- Revoking PUBLIC alone does not remove those role-specific grants.
-- These helpers are for signed-in callers; public map readers do not use them.
revoke all on function public.current_profile() from public, anon;
revoke all on function public.is_session_member(uuid) from public, anon;
revoke all on function public.join_run_session(uuid, date) from public, anon;
grant execute on function public.current_profile(),
  public.is_session_member(uuid), public.join_run_session(uuid, date) to authenticated;

-- Auth invokes this through its existing trigger, never through the Data API.
-- Trigger execution does not require these client-role EXECUTE grants.
revoke all on function public.handle_new_user() from public, anon, authenticated;
