# Pickup Sports

Find where pickup games are happening right now, check in while you're there, and see the
recurring runs near you. Launch region: **Charlottetown, Prince Edward Island**.

This repo is at **Phase 0** — repository and database foundation. See [Build status](#build-status)
for exactly what works today and what doesn't.

---

## Prerequisites

| Tool       | Version                     | Why                               | Install                                                           |
| ---------- | --------------------------- | --------------------------------- | ----------------------------------------------------------------- |
| **Node**   | 24.8.0 (pinned in `.nvmrc`) | Both apps and the tooling         | `nvm install`                                                     |
| **npm**    | 11+                         | Workspaces                        | ships with Node                                                   |
| **Docker** | running                     | Local Supabase runs in containers | [Docker Desktop](https://www.docker.com/products/docker-desktop/) |
| **uv**     | 0.5+                        | Python importer                   | `brew install uv`                                                 |

Docker must actually be _running_, not just installed — `docker info` should succeed.
Allow it ~4 GB of memory; the Supabase stack is several containers.

The Supabase CLI is **not** a global install. It's a dev dependency of this repo, so everyone
gets the same version.

---

## First run

```bash
nvm use                 # or: nvm install
npm install             # installs all workspaces
npm run db:start        # starts local Supabase (first run pulls images — several minutes)
```

`db:start` prints your local credentials. Copy `.env.example` to `.env` and fill it in:

```bash
cp .env.example .env
```

| Variable                                                  | Value from `db:start`                                        |
| --------------------------------------------------------- | ------------------------------------------------------------ |
| `EXPO_PUBLIC_SUPABASE_URL`, `VITE_SUPABASE_URL`           | `API_URL`                                                    |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `VITE_SUPABASE_ANON_KEY` | `ANON_KEY`                                                   |
| `SUPABASE_DB_URL`                                         | `DB_URL`                                                     |
| `OVERPASS_USER_AGENT`                                     | your own — real contact details, required by Overpass policy |

Then install the Python side and confirm everything works:

```bash
cd tools/venue-importer && uv sync && cd ../..
npm run check           # format, lint, typecheck, all tests
npm run db:test         # 55 database tests
```

> **Testing on a phone or simulator?** `127.0.0.1` means _the device itself_, not your Mac.
> Use your machine's LAN IP in `EXPO_PUBLIC_SUPABASE_URL`, e.g. `http://192.168.1.20:54321`.

### Seeing the app

**From the repository root:**

```bash
npm run mobile -- --web    # opens in a browser, no Xcode needed
npm run mobile             # then press i / a for a simulator, or scan the QR code
npm run admin              # http://localhost:5173
```

**From inside an app directory**, `npm run dev` works in either one
(`apps/mobile` also has `dev:web`). The `mobile` and `admin` scripts above only
exist at the root — running them from a workspace gives
`Missing script: "mobile"`, because npm is reading that workspace's own
`package.json`.

The web target works because `src/lib/secure-storage.web.ts` swaps the keychain for
`localStorage` — `expo-secure-store` has no web implementation and would otherwise throw the
moment Supabase reads a session. Tokens are plain text in a browser, so treat web as a
development convenience, not an equivalent to the native app.

An iOS simulator needs full **Xcode**, not just Command Line Tools
(`xcode-select -p` should print a path inside `Xcode.app`).

---

## Everyday commands

| Command                               | Does                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------- |
| `npm run check`                       | **Format, lint, typecheck and test everything.** The one command CI runs.   |
| `npm run mobile`                      | Start the Expo app                                                          |
| `npm run admin`                       | Start the admin review app (http://localhost:5173)                          |
| `npm run db:start` / `db:stop`        | Start / stop local Supabase                                                 |
| `npm run db:reset`                    | Rebuild the database from migrations + seed. Destroys local data.           |
| `npm run db:test`                     | pgTAP database tests                                                        |
| `npm run db:types`                    | Regenerate TypeScript types from the schema — **run after every migration** |
| `npm run db:admin -- you@example.com` | Grant admin access                                                          |
| `npm run check:bundles`               | Build both clients and verify no server credential leaked in                |
| `npm run importer -- --help`          | Venue importer CLI                                                          |

Local Supabase Studio: <http://127.0.0.1:54323> · Emails (Mailpit): <http://127.0.0.1:54324>

---

## Getting into the admin app

The admin app is gated on a row in `admin_users`, and **there is no API path that creates one** —
not for players, not even for other admins. That's deliberate: promotion requires a privileged
database connection and a person doing it on purpose.

1. `npm run admin`, enter your email, submit
2. Open <http://127.0.0.1:54324> (Mailpit) and click the sign-in link — nothing leaves your machine
3. `npm run db:admin -- you@example.com`
4. Sign in again. You should now see **two** regions; a non-admin sees only Charlottetown.

If a sign-in link lands on a dead port, check `additional_redirect_urls` in
`supabase/config.toml`. Supabase only honours redirect targets on that exact-match allowlist and
silently falls back to `site_url` otherwise — and `localhost` and `127.0.0.1` count as different
entries even though they reach the same machine.

That second region (Halifax, `is_published = false`) is the importer's smoke test: it proves the
importer carries no Charlottetown-specific constants, without creating a review burden.

---

## Layout

```
apps/mobile/          Expo + expo-router + TypeScript
  app/                Routes only — no data access, no business rules
  src/                features/, lib/, providers/, theme/, components/
apps/admin/           Vite + React review tool
packages/
  database-types/     GENERATED from the schema. Never hand-edit.
  shared/             Small cross-app constants that mirror database rules
tools/venue-importer/ Python CLI: Overpass -> normalize -> staging
supabase/
  migrations/         Schema. The source of truth for business rules.
  tests/              pgTAP, including RLS from every caller perspective
  seed.sql            Sports, OSM aliases, regions
docs/                 architecture.md, product-rules.md, decisions/
```

`packages/ui` deliberately does not exist yet — it gets created when there's real reuse, not
in anticipation of it.

---

## How this thing is put together

Three ideas worth knowing before you change anything:

**Postgres owns the rules.** Merge logic, duplicate detection, and check-in validation live in
database functions, not in the clients. Two clients reimplementing the same rule is two clients
that will disagree eventually.

**RLS and GRANTs are both load-bearing.** Grants decide which _operations_ a role may attempt;
RLS decides which _rows_. `profiles` needs both — every row is selectable, but a column-level
grant is what stops one player reading another's home region. Every public table has RLS on, and
a database test asserts that so a future table can't quietly ship without it.

**Nothing reaches published venues without a human.** Imports land in staging with raw OSM tags
preserved. Deduplication _proposes_; people decide. There is no automatic merge anywhere.

Details in [docs/architecture.md](docs/architecture.md) and
[docs/product-rules.md](docs/product-rules.md).

---

## Build status

**Phase 0 — done.**

- Monorepo, workspaces, pinned Node, committed lockfile
- Local Supabase from committed migrations and seed; PostGIS enabled by migration
- Schema: `regions`, `sports`, `osm_sport_aliases`, `profiles`, `profile_sports`, `admin_users`
- RLS + explicit grants on every table; 55 pgTAP tests covering anonymous, owner, other-user
  and admin perspectives
- Generated TypeScript types, with CI failing on drift
- Expo app: auth and tab route placeholders, bundles clean
- Admin app: email sign-in, admin-gated screen
- Python importer: working `--help`, tested sport-tag normalizer (34 tests)
- CI running everything; a credential scanner that self-tests

**Not built yet** — venue tables, the importer's actual import, the review queue, check-ins,
runs, submissions. Every placeholder screen names the phase that fills it in. See the build
sequence in [docs/architecture.md](docs/architecture.md).

---

## Contributing notes

- Migrations are the source of truth. Changed a rule? Change the migration and add a test.
- Run `npm run db:types` after every migration and commit the result.
- Never put the service-role key or a database URL in a `VITE_*` or `EXPO_PUBLIC_*` variable.
  `npm run check:bundles` will catch you, but don't rely on it.
- Working with an AI agent on this repo? Read [CLAUDE.md](CLAUDE.md) first.
