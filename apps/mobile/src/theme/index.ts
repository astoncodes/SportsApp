import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

import { palettes } from './tokens';
import type { Palette, ThemeName } from './tokens';

export * from './tokens';

function subscribeTheme(onChange: () => void) {
  const subscription = Appearance.addChangeListener(onChange);
  return () => subscription.remove();
}

function currentTheme(): ThemeName {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

export function useThemeName(): ThemeName {
  // Keep all theme consumers in sync, including multiple hooks in one screen.
  return useSyncExternalStore(subscribeTheme, currentTheme, () => 'light');
}

/** The active colour set. Follows the device setting. */
export function usePalette(): Palette {
  return palettes[useThemeName()];
}

export function useIsDark(): boolean {
  return useThemeName() === 'dark';
}
