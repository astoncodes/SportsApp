import { describe, expect, it } from 'vitest';
import { isAwayFromLocation } from '../src/components/map/location-distance';

describe('recenter distance', () => {
  const location = { latitude: 46.234, longitude: -63.129 };
  it('hides at the location and tolerates GPS jitter', () => {
    expect(isAwayFromLocation(location, location)).toBe(false);
    expect(
      isAwayFromLocation({ ...location, latitude: location.latitude + 0.0001 }, location),
    ).toBe(false);
  });
  it('shows after panning beyond 50 metres in either direction', () => {
    expect(isAwayFromLocation({ ...location, latitude: location.latitude + 0.001 }, location)).toBe(
      true,
    );
    expect(
      isAwayFromLocation({ ...location, longitude: location.longitude - 0.001 }, location),
    ).toBe(true);
  });
  it('uses the latest device position even when the map has stayed still', () => {
    expect(isAwayFromLocation(location, { ...location, latitude: location.latitude + 0.002 })).toBe(
      true,
    );
  });
  it('handles equivalent longitudes across the date line', () => {
    expect(
      isAwayFromLocation({ latitude: 0, longitude: 180 }, { latitude: 0, longitude: -180 }),
    ).toBe(false);
  });
});
