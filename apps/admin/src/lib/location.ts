/** Decode the two-dimensional PostGIS EWKB point returned by the Data API. */
export function coordinates(value: unknown): { lat: number; lon: number } | null {
  if (typeof value !== 'string' || !/^[0-9a-f]+$/i.test(value) || value.length % 2) return null;
  const bytes = Uint8Array.from(value.match(/../g) ?? [], (part) => parseInt(part, 16));
  if (bytes.length < 21 || (bytes[0] ?? 2) > 1) return null;
  const view = new DataView(bytes.buffer);
  const little = bytes[0] === 1;
  const type = view.getUint32(1, little);
  if ((type & 0x0fffffff) !== 1 || (type & 0xc0000000) !== 0) return null;
  const offset = (type & 0x20000000) !== 0 ? 9 : 5;
  if (bytes.length !== offset + 16) return null;
  if (offset === 9 && view.getUint32(5, little) !== 4326) return null;
  const lon = view.getFloat64(offset, little),
    lat = view.getFloat64(offset + 8, little);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    return null;
  return { lat, lon };
}
