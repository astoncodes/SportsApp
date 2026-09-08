import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CONDITION_ICON,
  CONDITION_IS_BLOCKING,
  CONDITION_LABEL,
  PULSE_LABEL,
  PULSE_TONE,
} from '../../src/lib/format';

/**
 * These are the drift checks. The database owns these enums; the maps below are
 * the app's rendering of them. Adding a value in a migration without adding it
 * here ships a venue chip with `undefined` as its label, so failing here is the
 * point — regenerate types, then handle the new value.
 */
describe('database enum coverage', () => {
  // Read the members straight out of the generated types rather than restating
  // them here: a hardcoded list would only ever assert against itself.
  const typesPath = fileURLToPath(
    new URL('../../../../packages/database-types/src/database.types.ts', import.meta.url),
  );
  const generated = readFileSync(typesPath, 'utf8');

  function databaseEnum(name: string): string[] {
    const match = new RegExp(`\\n\\s+${name}:((?:[^\\n]*)(?:\\n\\s+\\|[^\\n]*)*)`).exec(generated);
    if (!match) throw new Error(`enum ${name} is absent from the generated types`);
    return [...match[1].matchAll(/"([^"]+)"/g)].map(([, value]) => value).sort();
  }

  it('labels and tones every venue_pulse the database can return', () => {
    const pulses = databaseEnum('venue_pulse');
    expect(pulses.length).toBeGreaterThan(0);
    expect(Object.keys(PULSE_LABEL).sort()).toEqual(pulses);
    expect(Object.keys(PULSE_TONE).sort()).toEqual(pulses);
  });

  it('labels, ices and classifies every venue_condition_kind', () => {
    const kinds = databaseEnum('venue_condition_kind');
    expect(kinds.length).toBeGreaterThan(0);
    for (const map of [CONDITION_LABEL, CONDITION_ICON, CONDITION_IS_BLOCKING]) {
      expect(Object.keys(map).sort()).toEqual(kinds);
    }
  });

  it('treats a condition as blocking only when it means "do not travel"', () => {
    // Lights being on and a busy court are information; the rest are reasons
    // not to set out at all.
    expect(CONDITION_IS_BLOCKING.lights_on).toBe(false);
    expect(CONDITION_IS_BLOCKING.crowded).toBe(false);
    expect(CONDITION_IS_BLOCKING.locked).toBe(true);
    expect(CONDITION_IS_BLOCKING.wet_surface).toBe(true);
  });

  it('gives every label non-empty text', () => {
    for (const value of [...Object.values(PULSE_LABEL), ...Object.values(CONDITION_LABEL)]) {
      expect(value.trim()).not.toBe('');
    }
  });
});
