import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { authRedirectUrl } from '../src/features/auth/redirect';
import { setScheme } from './stubs/expo-linking';
import { Platform } from './stubs/react-native';

/**
 * The auth callback has to match an entry in the hosted Supabase redirect
 * allowlist exactly. There are three shapes in play — the web preview's origin,
 * the native `dropin://` scheme, and Expo Go's development URL — and a mismatch
 * fails at sign-in with a message that points at Supabase rather than at here.
 */

const originalOS = Platform.OS;

// Deliberately imported once. authRedirectUrl reads Platform.OS and calls
// Linking.createURL at call time, so mutating the stubs is enough — and
// resetting modules would hand the module under test a *different* stub
// instance from the one these tests are mutating.

function setWindowOrigin(origin: string | undefined) {
  if (origin === undefined) {
    Reflect.deleteProperty(globalThis, 'window');
    return;
  }
  Object.defineProperty(globalThis, 'window', {
    value: { location: { origin } },
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  setScheme('dropin://');
});

afterEach(() => {
  Platform.OS = originalOS;
  setWindowOrigin(undefined);
});

describe('authRedirectUrl', () => {
  it('uses the running origin on web, so any port or host works', () => {
    Platform.OS = 'web';
    setWindowOrigin('http://localhost:8081');
    expect(authRedirectUrl()).toBe('http://localhost:8081/callback');
  });

  it('follows the origin rather than assuming localhost', () => {
    Platform.OS = 'web';
    setWindowOrigin('https://dropin.example.com');
    expect(authRedirectUrl()).toBe('https://dropin.example.com/callback');
  });

  it('uses the deep-link scheme on native', () => {
    Platform.OS = 'ios';
    expect(authRedirectUrl()).toBe('dropin://callback');
  });

  it('uses the same scheme on Android as on iOS', () => {
    Platform.OS = 'android';
    expect(authRedirectUrl()).toBe('dropin://callback');
  });

  it('follows Expo Go’s development URL instead of hardcoding the scheme', () => {
    // In Expo Go the link is an exp:// URL on the LAN, which is why the callback
    // has to come from Linking rather than from a constant.
    Platform.OS = 'ios';
    setScheme('exp://192.168.1.20:8081/--/');
    expect(authRedirectUrl()).toBe('exp://192.168.1.20:8081/--/callback');
  });

  it('does not use the web branch when web has no window (server render)', () => {
    Platform.OS = 'web';
    setWindowOrigin(undefined);
    expect(authRedirectUrl()).toBe('dropin://callback');
  });

  it('always ends at /callback, whichever branch produced it', () => {
    for (const os of ['web', 'ios', 'android'] as const) {
      Platform.OS = os;
      setWindowOrigin(os === 'web' ? 'http://127.0.0.1:8081' : undefined);
      expect(
        authRedirectUrl().endsWith('/callback') || authRedirectUrl().endsWith('callback'),
      ).toBe(true);
    }
  });
});
