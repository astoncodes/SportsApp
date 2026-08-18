import Constants from 'expo-constants';

/**
 * Runtime configuration, supplied by app.config.ts from the repo-root `.env`.
 *
 * Everything here ships inside the app binary and can be read by anyone who
 * unpacks it. Only the publishable (anon) key belongs here — Row Level
 * Security is what makes that safe. The service-role key and the database URL
 * must never reach this file. See .env.example.
 */

type Extra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

function required(value: string | undefined, name: string): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing ${name}.\n\n` +
        'Copy .env.example to .env at the repository root and fill it in.\n' +
        '`npm run db:start` prints the values you need.\n\n' +
        'On a simulator or physical device, 127.0.0.1 is the device itself — use\n' +
        'your machine LAN IP (e.g. http://192.168.1.20:54321) instead.',
    );
  }
  return value;
}

export const env = {
  supabaseUrl: required(extra.supabaseUrl, 'EXPO_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: required(extra.supabaseAnonKey, 'EXPO_PUBLIC_SUPABASE_ANON_KEY'),
} as const;
