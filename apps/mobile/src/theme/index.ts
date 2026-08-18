import { useColorScheme } from 'react-native';

import { palettes } from './tokens';
import type { Palette, ThemeName } from './tokens';

export * from './tokens';

export function useThemeName(): ThemeName {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

/** The active colour set. Follows the device setting. */
export function usePalette(): Palette {
  return palettes[useThemeName()];
}

export function useIsDark(): boolean {
  return useThemeName() === 'dark';
}
