# Remaining release work

Hosted auth/onboarding, venue and pin sessions, organizer controls, chat, media
uploads, Geoapify search/web maps and native map configuration are implemented.
The app is still in testing. This file tracks unfinished work only.

## Accounts and deployment

- [ ] Configure custom SMTP and a verified sender for users outside the Supabase team.
- [ ] Configure production Auth site URL and exact web/native callbacks.
- [ ] Set up EAS development/preview/production profiles, signing and builds.
- [ ] Add public app configuration to build/deployment environments; local `.env`
      does not provision those environments.
- [ ] Add Android package/signing SHA-1 restrictions to the Google Maps key.
- [ ] Configure appropriate Geoapify key restrictions and monitor shared credits.
- [ ] Deploy web/admin over HTTPS and provision authorized admins.
- [ ] Complete Apple/Google developer accounts, listings and store disclosures.

## Product and safety

- [ ] Add reporting, user blocking and admin content removal.
- [ ] Implement account deletion and media retention/deletion behavior.
- [ ] Publish privacy policy, support contact, terms and community guidelines.
- [ ] Verify the venue submission and admin review workflow; see [admin-app.md](admin-app.md). Automated OSM importing is deferred.
- [ ] Finish or hide live check-in/arrival placeholders for the first release.

Spontaneous sessions publish immediately. Review canonical venues and handle
reported session content afterward; do not require session preapproval.

## Verification and operations

- [ ] Test real iPhone/Android builds: sign-in/deep links, map permissions, pin
      placement, directions, session controls, two-account chat and media uploads.
- [ ] Run the [session photo phone checklist](session-photos.md#phone-verification-before-release), including nearby/outside-area and permission-denial flows.
- [ ] Test offline, rejected permissions, API quota and failed-upload behavior.
- [ ] Review Supabase Security Advisor findings and database access settings.
- [ ] Establish backups, recovery/rollback, monitoring and service budget alerts.
- [ ] Provision a separate hosted test project, apply migrations and synthetic
      fixtures, and run `npm run db:test`. The hosted-only test runner's guards
      are unit-tested; a full pgTAP run on the separate project remains unverified.
- [ ] Configure the protected `database-tests` GitHub environment and run the
      manual hosted database/schema drift workflow. PR CI requires no backend.
- [ ] Before release, run `npm run check`, `npm run test:maps`,
      `npm run check:bundles`, hosted database checks and the explicit social smoke test.
