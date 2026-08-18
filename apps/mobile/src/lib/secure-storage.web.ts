/**
 * Web implementation of the auth storage adapter.
 *
 * Metro resolves this file instead of `secure-storage.ts` when bundling for
 * web, because `expo-secure-store` has no web implementation at all — it throws
 * on first use. Without this, `expo start --web` crashes the moment Supabase
 * reads the stored session, even though app.config.ts declares web output.
 *
 * There is no keychain in a browser, so this is `localStorage`. That is a real
 * downgrade in protection: tokens sit in plain text, readable by any script
 * that gets injected into the page. Acceptable for local development and the
 * admin-style browsing this target is used for; do not treat a web build as
 * equivalent to the native app for anything sensitive.
 *
 * No chunking here — localStorage has a multi-megabyte quota, so the 2 KB
 * SecureStore limit that shapes the native implementation does not apply.
 */

function unavailable(): Storage | null {
  // Server-side rendering (`web.output: "static"` prerenders) has no window.
  return typeof window === 'undefined' ? null : window.localStorage;
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    return unavailable()?.getItem(key) ?? null;
  },

  async setItem(key: string, value: string): Promise<void> {
    unavailable()?.setItem(key, value);
  },

  async removeItem(key: string): Promise<void> {
    unavailable()?.removeItem(key);
  },
};
