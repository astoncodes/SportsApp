import {
  CHECK_IN_DURATION,
  CHECK_IN_NOTE_MAX_LENGTH,
  DUPLICATE_DISTANCE_METRES,
  LOCATION_GATE,
  PARTY_SIZE,
  RUN_SERIES,
} from '@pickup-sports/shared';
import { describe, expect, it } from 'vitest';

/**
 * These assert the *shape* of the shared product rules, not the database — the
 * database enforces itself and is covered by supabase/tests. What this catches
 * is the shared package drifting into an internally incoherent state, and it
 * doubles as proof that a workspace package resolves from an app.
 */
describe('shared product rules', () => {
  it('keeps check-in duration bounds ordered', () => {
    expect(CHECK_IN_DURATION.minMinutes).toBeLessThan(CHECK_IN_DURATION.defaultMinutes);
    expect(CHECK_IN_DURATION.defaultMinutes).toBeLessThan(CHECK_IN_DURATION.maxMinutes);
  });

  it('caps a check-in at four hours', () => {
    expect(CHECK_IN_DURATION.maxMinutes).toBe(4 * 60);
  });

  it('keeps party size bounds ordered and includes the checked-in user', () => {
    expect(PARTY_SIZE.min).toBe(1);
    expect(PARTY_SIZE.default).toBeGreaterThanOrEqual(PARTY_SIZE.min);
    expect(PARTY_SIZE.max).toBeGreaterThan(PARTY_SIZE.default);
  });

  it('orders the three duplicate distance bands widest to narrowest', () => {
    const { submissionPrevention, candidateSearch, highConfidenceReview } =
      DUPLICATE_DISTANCE_METRES;

    // Prevention shows the user the widest net; the review band is the
    // tightest. If these ever invert, a submission could be accepted that the
    // reviewer is then told is a likely duplicate.
    expect(submissionPrevention).toBeGreaterThan(candidateSearch);
    expect(candidateSearch).toBeGreaterThan(highConfidenceReview);
  });

  it('keeps the location gate a friction control rather than a precision claim', () => {
    // Accuracy tolerance must stay well below the distance threshold, or a
    // reading could satisfy the gate while being uncertain enough to be
    // anywhere inside it.
    expect(LOCATION_GATE.maxAccuracyMetres).toBeLessThan(LOCATION_GATE.maxDistanceMetres);
  });

  it('bounds a run series and its public window', () => {
    expect(RUN_SERIES.maxWeeksValid).toBe(12);
    expect(RUN_SERIES.upcomingWindowDays).toBeLessThan(RUN_SERIES.maxWeeksValid * 7);
  });

  it('keeps notes short enough to be a status, not a message', () => {
    expect(CHECK_IN_NOTE_MAX_LENGTH).toBe(120);
  });
});
