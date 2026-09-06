# Production setup TODO

Handoff checklist for taking Drop In from the local demo to hosted web, iOS,
and Android environments.

## Important security rules

- [ ] Keep `.env` uncommitted. Start from `.env.example`.
- [ ] Only put a Supabase **publishable** key in `EXPO_PUBLIC_*` and `VITE_*`
      variables.
- [ ] Never put a Supabase secret/service-role key, database password, SMTP
      password, or unrestricted map key in a client-prefixed variable.
- [ ] Store production secrets in the deployment provider or EAS environment,
      not in source control.
- [ ] Enable MFA for the Supabase, email, Expo, Apple, Google Cloud, and Google
      Play owner accounts.

## 1. Supabase project — required

Owner: ____________________

- [ ] Create a Supabase organization and production project.
- [ ] Record the project reference from the project dashboard URL.
- [ ] Save the database password in the team's password manager.
- [ ] Open the project's **Connect** screen and copy its project URL and
      publishable key.
- [ ] Add these production environment variables:

```env
EXPO_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_REPLACE_ME

VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_REPLACE_ME

# Server-side tools only. Never expose this in either client application.
SUPABASE_DB_URL=postgresql://REPLACE_WITH_PRODUCTION_CONNECTION_STRING
```

- [ ] Authenticate and link the repository to the production project:

```bash
cd /Users/tomiwaadewumi/GitHub/prommpts/SportsApp
npx supabase login
npx supabase link --project-ref PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

- [ ] Do **not** pass `--include-seed` in production. `supabase/seed.sql`
      contains demonstration identities, activity, chats, and posts.
- [ ] Confirm the `session-media` bucket exists after migrations are applied.
- [ ] Confirm the bucket allows the image and video MIME types defined in
      `20260904120000_session_social.sql`.
- [ ] Run Supabase Security Advisor and resolve any findings.
- [ ] Enable database SSL enforcement and appropriate network restrictions.
- [ ] Decide the backup and point-in-time recovery policy.
- [ ] Add at least one additional trusted organization owner.

Acceptance:

- [ ] The mobile app can browse venues using the production project URL.
- [ ] An anonymous user can read the public feed but cannot read session chat.
- [ ] A joined user can send a session message and upload session media.
- [ ] An unjoined user cannot read or write that session's messages.

## 2. Passwordless email — required

Provider selected: Resend / Postmark / SendGrid / Amazon SES / ______________

Owner: ____________________

- [ ] Create the transactional-email account.
- [ ] Verify a sending domain owned by the project.
- [ ] Create an address such as `login@your-domain.example`.
- [ ] Create SMTP credentials and store them in the team password manager.
- [ ] Configure them in **Supabase Dashboard → Authentication → Emails → SMTP
      Settings**.
- [ ] Disable link tracking for authentication emails if the provider rewrites
      links.
- [ ] Customize the sender name and magic-link email template.
- [ ] Set the production Auth site URL.
- [ ] Add the exact production redirect URLs to Supabase Auth:

```text
https://YOUR_WEB_DOMAIN/callback
dropin://callback
```

- [ ] Test sign-in from production web.
- [ ] Test sign-in from an iOS development/TestFlight build.
- [ ] Test sign-in from an Android development/internal-test build.
- [ ] Confirm an expired or reused magic link fails safely.

## 3. Maps and location search — required before public launch

### CARTO basemaps

Owner: ____________________

- [ ] Request a CARTO basemap API key for the production domain/application.
- [ ] Confirm commercial-use terms and expected tile volume with CARTO.
- [ ] Keep OpenStreetMap and CARTO attribution visible.
- [ ] Add a new public variable to `.env.example`, for example:

```env
EXPO_PUBLIC_CARTO_BASEMAP_KEY=REPLACE_ME
```

- [ ] Update `apps/mobile/app.config.ts` and
      `apps/mobile/src/components/map/types.ts` so both light and dark tile URLs
      include the CARTO key.
- [ ] Run `npm run check:bundles` and confirm no server-side credential entered
      either client bundle.

Note: the existing demo uses CARTO's legacy keyless raster URL. The key still
needs to be wired into the application before public release.

### Google Maps on Android

Owner: ____________________

- [ ] Create or choose a Google Cloud project.
- [ ] Attach a billing account.
- [ ] Enable **Maps SDK for Android**.
- [ ] Create separate development and production Android API keys.
- [ ] Restrict each key to Maps SDK for Android.
- [ ] Restrict the production key to package `com.dropin.app` and the production
      app-signing SHA-1 certificate.
- [ ] Add a server/build-time variable, for example:

```env
GOOGLE_MAPS_ANDROID_API_KEY=REPLACE_ME
```

- [ ] Add the `react-native-maps` Expo config plugin to
      `apps/mobile/app.config.ts` and pass `androidGoogleMapsApiKey` from that
      environment variable.
- [ ] Build a native Android development build; Expo web is not sufficient to
      verify this configuration.
- [ ] Confirm the map, custom CARTO tiles, markers, dragging, and location dot
      work on a physical Android device.

### Apple Maps on iOS

- [ ] Use the existing Apple Maps backend. No separate map API key is required.
- [ ] Confirm the foreground-location usage description is present in the
      generated iOS configuration and clearly explains why location is used.
- [ ] Test map interactions and location permission on a physical iPhone.

### Nominatim place search

- [ ] Leave `EXPO_PUBLIC_NOMINATIM_URL=https://nominatim.openstreetmap.org` only
      while usage remains occasional and explicitly user-triggered.
- [ ] Keep requests at or below one request per second and retain attribution.
- [ ] Before meaningful public traffic, select a hosted geocoding provider or
      deploy a cached proxy and change `EXPO_PUBLIC_NOMINATIM_URL`.
- [ ] Confirm the chosen provider permits mobile and commercial use.

### Overpass venue importer

- [ ] Set a monitored contact address in the importer user agent:

```env
OVERPASS_ENDPOINTS=https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter
OVERPASS_USER_AGENT=dropin-importer/0.1 (contact: hello@YOUR_DOMAIN)
```

- [ ] Run imports from a trusted developer/CI environment only; the importer
      uses `SUPABASE_DB_URL` and must never run in a client application.
- [ ] Review every import in the admin application before publishing venues.

## 4. Expo and native builds

Owner: ____________________

- [ ] Create an Expo account and organization.
- [ ] Install and authenticate EAS CLI:

```bash
npm install --global eas-cli
eas login
cd /Users/tomiwaadewumi/GitHub/prommpts/SportsApp/apps/mobile
eas build:configure
```

- [ ] Add development, preview, and production build profiles to `eas.json`.
- [ ] Add production public configuration to the EAS environment:
      `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
      `EXPO_PUBLIC_NOMINATIM_URL`, and `EXPO_PUBLIC_CARTO_BASEMAP_KEY`.
- [ ] Add `GOOGLE_MAPS_ANDROID_API_KEY` as a protected build secret.
- [ ] Confirm bundle identifiers remain:
  - iOS: `com.dropin.app`
  - Android: `com.dropin.app`
- [ ] Create an iOS development build.
- [ ] Create an Android development build.
- [ ] Exercise authentication, deep links, map permissions, feed playback,
      photo selection, video selection, upload, and chat on real devices.

## 5. Apple release account

Owner: ____________________

- [ ] Enroll in the Apple Developer Program as the intended legal owner.
- [ ] For organization enrollment, prepare the legal entity name, D-U-N-S
      number, organization-domain email, website, and binding-authority proof.
- [ ] Create the app record in App Store Connect for `com.dropin.app`.
- [ ] Let EAS manage signing credentials or document who manages them manually.
- [ ] Configure TestFlight internal testers.
- [ ] Provide the privacy-policy URL, support URL, screenshots, description,
      age rating, and App Privacy answers.
- [ ] Explain foreground location, account data, public posts, and user-uploaded
      media accurately in the privacy disclosures.

## 6. Google Play release account

Owner: ____________________

- [ ] Create and verify a Google Play Console developer account.
- [ ] Create the application record for package `com.dropin.app`.
- [ ] Upload an initial Android App Bundle so Play App Signing credentials and
      SHA-1 fingerprints are available.
- [ ] Apply the Play signing SHA-1 to the production Google Maps API key.
- [ ] Configure internal testing.
- [ ] Provide the privacy-policy URL, support contact, screenshots, store
      description, content rating, and Data Safety answers.
- [ ] Explain foreground location, account data, public posts, private session
      chat, and uploaded media accurately in the Data Safety form.

## 7. User-generated content launch requirements

The feed accepts public user photos and videos. Before an unrestricted public
launch:

- [ ] Publish community guidelines and terms of use.
- [ ] Publish a privacy policy covering location, profiles, chat, and media.
- [ ] Add a way to report a post, user, or inappropriate media.
- [ ] Add an admin moderation queue and removal action.
- [ ] Add a way to block abusive users or otherwise prevent continued contact.
- [ ] Define media retention and account-deletion behavior.
- [ ] Decide whether automated image/video safety screening is required.
- [ ] Verify deleted posts also remove their corresponding Storage objects.
- [ ] Test file-size, MIME-type, 30-second video, and authorization failures.

The current implementation has database ownership controls but does not yet
include the complete reporting and moderation workflow.

## 8. Admin application

- [ ] Deploy `apps/admin` behind HTTPS.
- [ ] Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the host.
- [ ] Add the deployed admin origin and callback to Supabase Auth's redirect
      allowlist.
- [ ] Grant the first admin through the privileged CLI command:

```bash
SUPABASE_DB_URL='PRODUCTION_CONNECTION_STRING' npm run db:admin -- admin@YOUR_DOMAIN
```

- [ ] Confirm an ordinary authenticated user cannot access admin records.
- [ ] Restrict production database credentials to the smallest trusted team.

## 9. Final verification before launch

Run locally before every release:

```bash
cd /Users/tomiwaadewumi/GitHub/prommpts/SportsApp
npm ci
npm run db:start
npm run db:reset
npm run db:types
npm run check
npm run db:test
npm run check:bundles
```

- [ ] `npm run check` passes.
- [ ] All database/RLS tests pass.
- [ ] Generated database types contain no drift.
- [ ] Client bundle credential scan passes.
- [ ] Production web uses HTTPS.
- [ ] Magic-link callbacks work on web, iOS, and Android.
- [ ] Anonymous browsing works.
- [ ] Only joined participants can open a session chat.
- [ ] Feed photos load and short video clips play.
- [ ] Image and video uploads work on physical iOS and Android devices.
- [ ] Map and foreground location work on physical iOS and Android devices.
- [ ] A production database backup and rollback procedure is documented.

## Accounts not currently needed

Do not create these unless the product gains a feature that requires them:

- OpenAI API
- Stripe
- Twilio
- Firebase or another push-notification provider
- Google or Apple social-login credentials
- A separate chat provider
- A separate media-storage provider

Supabase currently owns authentication, database access, chat data, feed data,
and uploaded media storage.
