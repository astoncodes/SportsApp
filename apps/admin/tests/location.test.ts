import { describe, expect, it } from 'vitest';
import { coordinates } from '../src/lib/location';
function point(little: boolean, srid = 4326) {
  const buffer = new ArrayBuffer(25);
  const view = new DataView(buffer);
  view.setUint8(0, little ? 1 : 0);
  view.setUint32(1, 0x20000001, little);
  view.setUint32(5, srid, little);
  view.setFloat64(9, -63.12, little);
  view.setFloat64(17, 46.24, little);
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}
describe('review location', () => {
  it('reads longitude and latitude in either byte order', () => {
    expect(coordinates(point(true))).toEqual({ lat: 46.24, lon: -63.12 });
    expect(coordinates(point(false))).toEqual({ lat: 46.24, lon: -63.12 });
  });
  it('rejects unsupported projections and malformed values', () => {
    for (const value of [null, {}, '', 'xyz', '01', point(true).slice(0, -2), point(true, 3857)])
      expect(coordinates(value)).toBeNull();
  });
});
