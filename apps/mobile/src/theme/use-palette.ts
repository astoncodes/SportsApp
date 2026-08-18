import { useColorScheme } from 'react-native';

import { palette } from './index';
import type { Palette } from './index';

/** The active colour set, following the device's light/dark setting. */
export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? palette.dark : palette.light;
}
