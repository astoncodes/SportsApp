import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ExpoConfig } from 'expo/config';

/**
 * Reads the repository-root `.env`.
 *
 * Expo loads .env from the app directory, but this monorepo keeps a single
 * .env at the root so there is one file to gitignore and one .env.example to
 * keep honest. Values are passed through `extra` rather than injected into
 * process.env, so what the app receives is explicit and inspectable rather
 * than depending on bundler substitution order.
 */
function loadRootEnv(): Record<string, string> {
  const envPath = resolve(__dirname, '../../.env');

  let contents: string;
  try {
    contents = readFileSync(envPath, 'utf8');
  } catch {
    return {};
  }

  const values: Record<string, string> = {};
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator === -1) continue;

    const key = line
      .slice(0, separator)
      .trim()
      .replace(/^export\s+/, '');
    let value = line.slice(separator + 1).trim();
    if (value.length >= 2 && value[0] === value.at(-1) && (value[0] === '"' || value[0] === "'")) {
      value = value.slice(1, -1);
    }
    if (key) values[key] = value;
  }
  return values;
}

const rootEnv = loadRootEnv();

/** Real environment wins over the .env file, so CI can override without a file. */
function read(name: string): string {
  return process.env[name] ?? rootEnv[name] ?? '';
}

const config: ExpoConfig = {
  name: 'Drop In',
  slug: 'drop-in',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'dropin',
  // The New Architecture is the default in SDK 57 and no longer configurable.
  userInterfaceStyle: 'automatic',

  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.dropin.app',
  },

  android: {
    package: 'com.dropin.app',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },

  web: {
    // 'single' (SPA), not 'static'. Static prerendering runs this bundle in
    // Node, and a map library that touches `window` at import time cannot
    // survive that. Nothing here benefits from prerendered HTML — every screen
    // is behind a live query.
    output: 'single',
    favicon: './assets/images/favicon.png',
  },

  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#208AEF',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },

  // Only the publishable (anon) key belongs here — `extra` ships inside the
  // app binary and is readable by anyone who unpacks it. RLS is what makes
  // that safe. Never put the service-role key or a database URL in `extra`.
  extra: {
    supabaseUrl: read('EXPO_PUBLIC_SUPABASE_URL'),
    supabaseAnonKey: read('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
  },
};

export default config;
