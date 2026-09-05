import 'react-native-url-polyfill/auto';

import { Platform } from 'react-native';

import { env } from '../../lib/env';

export type GeocodingResult = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
};

type NominatimItem = {
  place_id?: number | string;
  display_name?: string;
  lat?: string;
  lon?: string;
};

const cache = new Map<string, GeocodingResult[]>();
let nextRequestAt = 0;

function abortError(): Error {
  const error = new Error('The search was cancelled.');
  error.name = 'AbortError';
  return error;
}

/**
 * One-off, user-triggered place search.
 *
 * Public Nominatim forbids autocomplete, so this is intentionally called only
 * from an explicit Search button. The process-wide gap keeps one app instance
 * below one request/second, while the small cache avoids repeating a query.
 */
export async function searchPlaces(
  rawQuery: string,
  signal?: AbortSignal,
): Promise<GeocodingResult[]> {
  const query = rawQuery.trim();
  if (query.length < 3) throw new Error('Enter at least 3 characters.');
  if (query.length > 160) throw new Error('Keep the search under 160 characters.');

  const cacheKey = query.toLocaleLowerCase('en-CA');
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const waitMs = Math.max(0, nextRequestAt - Date.now());
  if (waitMs > 0) {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(resolve, waitMs);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout);
          reject(abortError());
        },
        { once: true },
      );
    });
  }

  if (signal?.aborted) throw abortError();
  nextRequestAt = Date.now() + 1_100;

  const url = new URL('/search', env.nominatimUrl);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');
  url.searchParams.set('countrycodes', 'ca');
  url.searchParams.set('addressdetails', '0');

  const response = await fetch(url.toString(), {
    signal,
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en-CA,en;q=0.8',
      // Browsers supply an identifying Referer and prohibit setting this
      // header. Native fetch permits it, so identify the application there.
      ...(Platform.OS === 'web' ? {} : { 'User-Agent': 'DropIn/0.1 (Expo mobile app)' }),
    },
  });

  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? 'Place search is busy. Wait a moment and try again.'
        : 'Place search is unavailable right now.',
    );
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error('Place search returned an unexpected response.');

  const results = payload.flatMap<GeocodingResult>((item) => {
    const candidate = item as NominatimItem;
    const latitude = Number(candidate.lat);
    const longitude = Number(candidate.lon);
    if (
      !candidate.display_name ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return [];
    }
    return [
      {
        id: String(candidate.place_id ?? `${latitude},${longitude}`),
        label: candidate.display_name,
        latitude,
        longitude,
      },
    ];
  });

  cache.set(cacheKey, results);
  return results;
}
