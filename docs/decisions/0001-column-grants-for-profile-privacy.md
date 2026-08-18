# 0001 — Column-level grants for profile privacy

**Status:** accepted · Phase 0

## Context

`profiles` has two kinds of field. `display_name` and `avatar_path` must be readable by other
players — you need to see who is checked in. `home_region_id` and `onboarding_completed_at` are
the owner's business.

Row Level Security is, as the name says, row-level. It can express "this row" but not "this
column, but only when the row is mine". A policy of `using (true)` exposes every column of every
row; a policy of `using (id = auth.uid())` hides other players' names, which breaks the product.

## Options considered

1. **Grant all columns, policy allows all rows.** Simple. Any authenticated user can read
   everyone's home region and onboarding timestamp. Neither is dangerous, but "not very sensitive"
   is a bad reason to publish something, and it sets the wrong default for fields added later.
2. **A `profiles_public` view over the display fields.** Works, but the view must bypass the base
   table's RLS, which makes it a security-definer view — an object whose safety depends on nobody
   later adding a column to it carelessly.
3. **Column-level GRANTs, plus an RPC for the owner's own row.** Chosen.

## Decision

`anon` and `authenticated` receive `GRANT SELECT (id, display_name, avatar_path)`. The RLS policy
allows selecting any row. The two mechanisms compose: any row, but only public columns.

Because grants are role-wide, this also hides the caller's _own_ private fields. `current_profile()`
(`SECURITY DEFINER`, empty `search_path`) returns the caller's complete row.

## Consequences

- `select *` from `profiles` fails for a normal client. That is intended, and the error names the
  column, so it is self-explaining rather than mysterious.
- Adding a private column is safe by default: it is unreadable until someone grants it explicitly.
  Adding a _public_ column requires remembering to extend the grant — the failure mode is a field
  not appearing, which is loud, rather than a field leaking, which is silent.
- Covered by `supabase/tests/003_rls_profiles.sql` from four perspectives: anonymous, owner,
  other authenticated user, and the RPC path.
