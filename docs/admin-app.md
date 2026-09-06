# Admin app

Run `npm run admin` from the repository root, then open http://localhost:5173.
The app reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the root `.env`.
Only a publishable/anon key belongs in the browser.

## Features

- Overview with live counts for the review queue, active venues, possible duplicates,
  and unverified venues.
- Searchable, region-filtered, paginated submission review, including past decisions.
- Submitted coordinates with an OpenStreetMap link, sports, and duplicate evidence.
- Approve with a reviewed name, reject with a reason, or explicitly link a submission
  to an existing active venue in the same region. Linking preserves the submitted
  name as an alias and adds its sports; it does not overwrite the existing venue.
- Venue name/address/sports/indoor-setting edits, verification, removal from discovery,
  and restoration. Existing merged venues are read-only.
- Region and sport reference lists, including unpublished/inactive entries.
- Paginated audit history with actor, time, affected record, and change details.

Approval publishes an unverified venue. Mark it verified separately after checking
it. Review decisions cannot be repeated; the database locks the submission and
commits publication, sports, and review history together. All privileged writes
use admin-checked database functions. Direct venue writes are denied even to admins.
The audit log is readable only by admins and cannot be changed through their API role.

The queue handles user-submitted canonical venues. Spontaneous sessions do not
need review. Import tooling and social-content moderation are separate work.

## Choose an admin account later

No permanent admin account is provisioned as part of app setup. When ready:

1. Sign in through the admin app with the chosen email address.
2. Grant access using a privileged hosted database connection:
   `npm run db:admin -- you@example.com`.
3. Reload the app to check access again.

Keep the privileged connection in `SUPABASE_DB_URL`, never a `VITE_*` variable.
The database dashboard can also grant an existing account through `admin_users`.
There is deliberately no browser action for granting admin roles.

Auth redirect allowlists must include `http://localhost:5173` and
`http://127.0.0.1:5173` for development. Add the exact HTTPS admin origin when
hosting the app. Existing mobile callback URLs must remain allowed.

## Build and validation

```bash
npm run check
npm run build --workspace apps/admin
node scripts/check-client-bundles.mjs
npm run db:test
```

Database tests require the separate hosted test project documented in the README.
`010_admin_review.sql` covers authorization, atomic approval, repeat review rejection,
rejection reasons, duplicate linking, edits, and audit writes. The configured app
project has migration `20260906110000_admin_review.sql` applied.

Deploy `apps/admin/dist` to a static HTTPS host with the public Vite configuration
available at build time. Choosing that host and granting the permanent admin account
can happen later.

Validation completed during setup: repository formatting/lint/types/tests, production
builds and the client credential scan passed. A Chromium test against hosted Supabase
exercised a temporary authenticated admin, submission approval, venue editing and
verification, audit history, sign-out, and desktop/mobile layouts without browser
errors. Temporary test identities and records were removed. This did not test email
delivery to a real inbox. All 116 pgTAP assertions passed against the previously
running local test database; the separate hosted pgTAP project remains unconfigured.
