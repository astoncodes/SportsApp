# Working in this repository

Instructions for contributors and AI agents. Read this before writing code.

## Where the rules live

**Migrations and database tests are the source of truth for business rules.** If a rule exists
in `supabase/migrations/` and also in a client, the client is a convenience and the database is
the authority. When they disagree, the database is right and the client is a bug.

`packages/shared` holds constants that _mirror_ database constraints so a form can set
`maxLength` before the server rejects the input. It does not own those rules.

## Build one phase at a time

The build sequence is in [docs/architecture.md](docs/architecture.md). Phase 0 is complete.

Do not scaffold fake implementations for future phases. A placeholder screen that names its
phase is good; a mocked venue list that looks real is not — someone will build on it, and the
first thing real data does is contradict it.

## Non-negotiables

1. **No service-role credential in a client.** Not in `VITE_*`, not in `EXPO_PUBLIC_*`, not in
   `extra`, not in a test snapshot. `npm run check:bundles` enforces it.
2. **No client-side writes to privileged state.** Review status, merges, verification state and
   admin roles change only through database functions that check `is_admin()`.
3. **No automatic venue merging.** Duplicate detection proposes candidates; a human decides.
   Two courts 6 m apart may be one venue or two, and only a person can tell.
4. **No cron deciding whether something is publicly active.** A check-in is active when
   `ended_at is null and expires_at > now()`. A cleanup job may set `ended_at`, but correctness
   must never depend on it having run.
5. **Never overwrite human-reviewed venue fields during re-import.** Someone named that court by
   hand; OSM does not get to undo that.
6. **Every exposed table gets RLS and explicit grants.** Both. A pgTAP test asserts no public
   table lacks RLS — if you add one without it, tests fail.
7. **Add or update a database test for every RLS or transactional rule you change.**
8. **Regenerate types after every migration** (`npm run db:types`) and commit the result. CI
   fails on drift.

## Conventions

- **IDs**: `bigint identity` for lookup tables (small, read constantly, easy to hold in your
  head); `uuid` for anything public-facing or referenced by check-ins.
- **Functions**: business-rule functions set `search_path = ''` and schema-qualify everything,
  including `extensions.geography` and `auth.uid()`. `SECURITY DEFINER` only where it is
  load-bearing — and say why in a comment, as `is_admin()` does.
- **Routes** (`apps/mobile/app/`) assemble feature components. No SQL-shaped data access, no
  business rules.
- **Node config files** (`app.config.ts`, `metro.config.js`) are typechecked by
  `tsconfig.node.json`, separately from app code, so Node globals stay out of the React Native
  type space.
- Python is formatted and linted by ruff; TypeScript by prettier. `npm run check` runs both.

## Before you say it works

Run `npm run check` and `npm run db:test`, and read the output. "Should work" is not a result.

If something is blocked or you had to guess, say so plainly rather than shipping a plausible
guess quietly — an unflagged guess in a schema costs far more later than a question now.

## Open decisions

Some product decisions are still the owners' to make (app name, auth method, initial public
sports, location threshold). They are listed at the end of
[docs/product-rules.md](docs/product-rules.md). Stop and ask rather than silently choosing one.
