/**
 * Minimal design tokens.
 *
 * Deliberately small — this exists so placeholder screens are not littered with
 * magic hex values, not as a design system. Grow it when real screens arrive in
 * Phase 2, and only from what they actually need.
 */

export const palette = {
  light: {
    background: '#f6f7f9',
    surface: '#ffffff',
    border: '#d9dde3',
    text: '#16191d',
    muted: '#5b6572',
    accent: '#1f6feb',
  },
  dark: {
    background: '#14171a',
    surface: '#1c2126',
    border: '#2f363d',
    text: '#e7ebf0',
    muted: '#9aa5b1',
    accent: '#4f9bff',
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
} as const;

export type ColorScheme = keyof typeof palette;
export type Palette = (typeof palette)[ColorScheme];
