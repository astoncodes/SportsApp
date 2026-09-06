# Docker removal TODO

Checklist for making Docker optional or removing it from Drop In's development
workflow. Docker is currently used indirectly by the Supabase CLI; this repository
does not contain a custom Dockerfile or Compose configuration.

## Decision

- [ ] Confirm whether the goal is to make Docker optional for frontend developers
      or remove it from local development and CI entirely.
- [ ] Choose a dedicated hosted Supabase test project. Do not run destructive tests
      or resets against hosted development or production data.
- [ ] Record the owner, cost limits, backup expectations, and teardown policy for
      the hosted test project.

## Hosted test database

- [ ] Create an isolated Supabase project for automated tests.
- [ ] Store its project reference, access token, database URL, publishable key, and
      project URL in the team's secret manager.
- [ ] Apply every committed migration to a clean database and verify that
      `supabase/seed.sql` loads successfully.
- [ ] Confirm all pgTAP tests pass against the hosted test database with
      `supabase test db --db-url "$SUPABASE_TEST_DB_URL"`.
- [ ] Decide how CI will restore a known database state before every run. Ensure
      parallel or cancelled jobs cannot reset a database another job is using.
- [ ] Add automatic cleanup for test users, storage objects, and other state that
      migrations or `seed.sql` do not replace.

## Scripts and configuration

- [ ] Replace `db:start` and `db:stop`, or clearly mark them as optional local-only
      commands.
- [ ] Change `db:test` to require the isolated test database URL and fail safely if
      it is missing.
- [ ] Update `scripts/generate-database-types.mjs` to use `--project-id`, `--linked`,
      or `--db-url` instead of `--local`.
- [ ] Decide whether `db:reset` should target only the isolated test project or be
      removed. Add an explicit production-host guard before allowing remote reset.
- [ ] Keep `SUPABASE_DB_URL` server-side only; never place a database password or
      service-role key in an `EXPO_PUBLIC_*` or `VITE_*` variable.
- [ ] Update `.env.example` with separate hosted-development and automated-test
      variables without adding real credentials.
- [ ] Verify `db:admin` and the venue importer still connect to their intended
      environment rather than the automated-test database.

## CI migration

- [ ] Add the hosted test project's credentials as GitHub Actions secrets.
- [ ] Replace the `npx supabase start`, `supabase status`, and `supabase stop` steps
      in `.github/workflows/ci.yml`.
- [ ] Build the CI `.env` from hosted project secrets while keeping server-side
      values out of client-prefixed variables.
- [ ] Serialize database jobs or provision an isolated database/project per job.
- [ ] Run migrations, seed data, pgTAP tests, generated-type drift checks, app
      builds, and client-bundle credential checks in the new workflow.
- [ ] Confirm pull requests from forks do not receive secrets and define which
      safe checks should still run for them.
- [ ] Set spending limits and alerts for the hosted test project.

## Documentation cleanup

- [ ] Update the prerequisites and first-run instructions in `README.md`.
- [ ] Update the local/hosted environment descriptions in `docs/architecture.md`
      and `docs/reference.md`.
- [ ] Document how contributors obtain hosted development access without sharing
      credentials in source control or chat.
- [ ] Document the replacement for local Mailpit when testing passwordless email.
- [ ] Remove Docker-specific instructions only after the replacement workflow is
      verified.

## Acceptance criteria

- [ ] A new contributor can install dependencies, configure the apps, and run all
      supported checks without Docker.
- [ ] CI passes from a clean checkout without starting containers.
- [ ] Database migrations and all pgTAP tests run against an isolated disposable
      environment.
- [ ] Database types can be regenerated deterministically and CI detects drift.
- [ ] Passwordless authentication can be tested without relying on local Mailpit.
- [ ] No production database, user data, or credential can be reached by the test
      reset workflow.
- [ ] `npm run check`, `npm run db:test`, `npm run db:types`, app builds, and the
      venue importer have documented, verified behavior.

Do not uninstall Docker or remove the current Supabase workflow until every
acceptance criterion above passes. Keeping Docker only as an optional local path
is also a valid outcome if it remains the safest way to perform schema resets.
