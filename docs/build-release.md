# Building Drop In

The mobile app includes EAS profiles in `apps/mobile/eas.json`: development
(with the Expo development client), iOS simulator, internal preview, and
production. Preview Android builds produce an installable APK; production uses
the store default. Build numbers are managed remotely and increment for
production builds.

The project still needs an Expo account/project association and platform signing.
From `apps/mobile`, using the Node version in the repository's `.nvmrc`:

```sh
npx eas-cli login
npx eas-cli init
npx eas-cli build --profile preview --platform ios
npx eas-cli build --profile preview --platform android
```

Because `app.config.ts` is dynamic, add the project ID returned by `eas init` to
`extra.eas.projectId` if the CLI cannot update it automatically. Use the owner's
actual project; do not invent a project ID or create a replacement account.

Configure the variables from `.env.example` in each selected EAS environment
before building. The root `.env` is local and ignored by uploads. Supabase URL
and anonymous key, Mapbox public token, and Geoapify public key are client
configuration. Supabase management/service-role credentials and database passwords
must never be added to client variables or app configuration. See Expo's
[build configuration](https://docs.expo.dev/build/eas-json/) and
[environment configuration](https://docs.expo.dev/eas/environment-variables/).

Run native previews on real devices and complete `docs/release-checklist.md`
before a production build or store submission. No build profile submits an app
or publishes an update automatically.
