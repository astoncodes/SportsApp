import type { MapCoordinate } from './types';

/** A 50 m dead zone prevents GPS jitter from exposing the recenter control. */
export function isAwayFromLocation(center: MapCoordinate, location: MapCoordinate): boolean {
  const radians = Math.PI / 180;
  const latitude = (center.latitude - location.latitude) * radians;
  const longitude = (center.longitude - location.longitude) * radians;
  const a =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(center.latitude * radians) *
      Math.cos(location.latitude * radians) *
      Math.sin(longitude / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, a))) > 50;
}
