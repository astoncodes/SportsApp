import { useEffect, useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

import { secureStorage } from '../lib/secure-storage';
import { palettes } from './tokens';
import type { Palette, ThemeName } from './tokens';

export * from './tokens';

export type ThemePreference = 'system' | ThemeName;
let preference: ThemePreference = 'system';
let initialized = false;
let revision = 0;
let persistence = Promise.resolve();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function subscribeTheme(onChange: () => void) {
  listeners.add(onChange);
  const subscription = Appearance.addChangeListener(onChange);
  return () => {
    listeners.delete(onChange);
    subscription.remove();
  };
}

function useStoredPreference() {
  useEffect(() => {
    if (initialized) return;
    initialized = true;
    const initialRevision = revision;
    void secureStorage
      .getItem('dropin-appearance')
      .then((saved) => {
        if (revision !== initialRevision) return;
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          preference = saved;
          notify();
        }
      })
      .catch(() => {
        /* Appearance remains usable when storage is unavailable. */
      });
  }, []);
}

export function setThemePreference(next: ThemePreference) {
  revision += 1;
  preference = next;
  notify();
  persistence = persistence
    .then(() => secureStorage.setItem('dropin-appearance', next))
    .catch(() => {
      // Keep the current theme usable even when persistent storage is unavailable.
    });
}

export function useThemePreference(): ThemePreference {
  useStoredPreference();
  return useSyncExternalStore(
    subscribeTheme,
    () => preference,
    () => 'system',
  );
}

function currentTheme(): ThemeName {
  return preference === 'system'
    ? Appearance.getColorScheme() === 'dark'
      ? 'dark'
      : 'light'
    : preference;
}

export function useThemeName(): ThemeName {
  useStoredPreference();
  return useSyncExternalStore(subscribeTheme, currentTheme, () => 'light');
}

export function usePalette(): Palette {
  return palettes[useThemeName()];
}

export function useIsDark(): boolean {
  return useThemeName() === 'dark';
}
