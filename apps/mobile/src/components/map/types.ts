import { env } from '../../lib/env';

/**
 * The boundary between feature screens and whichever map renders them.
 *
 * Screens import only this shape. Native uses react-native-maps, web uses
 * Leaflet, and swapping either — or moving to a paid tile provider when public
 * OSM infrastructure is no longer appropriate — must not require touching a
 * single feature screen.
 */

export type MapMarker = {
  id: string;
  /** Locations and sessions retain distinct shapes regardless of activity. */
  kind?: 'venue' | 'session';
  latitude: number;
  longitude: number;
  /** Drives the pin glyph. */
  sportSlug: string | null;
  /** Players present now. Zero means a quiet venue, not a hidden one. */
  count: number;
  /** Highlights the activity badge only when someone is actually there. */
  isLive: boolean;
  /** Somebody is on their way but nobody has arrived. */
  isPending: boolean;
  label: string;
  selected?: boolean;
  /** Used by location pickers; venue markers are never draggable. */
  draggable?: boolean;
};

export type MapCoordinate = { latitude: number; longitude: number };

export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type VenueMapProps = {
  region: MapRegion;
  /** Increment to recenter even when the target coordinates have not changed. */
  recenterRequest?: number;
  markers: MapMarker[];
  onSelectMarker?: (id: string) => void;
  onMarkerDragEnd?: (id: string, coordinate: MapCoordinate) => void;
  /** Optional map-tap handler used to position a draft pin. */
  onPressCoordinate?: (coordinate: MapCoordinate) => void;
  onRegionChange?: (region: MapRegion) => void;
  /** Green dot for the user, when location permission has been granted. */
  userLocation?: { latitude: number; longitude: number } | null;
  colorScheme: 'light' | 'dark';
  style?: object;
};

/** CARTO requires a key. Keyless web testing uses OSM; native uses its base map.
 * Public OSM tiles are for interactive viewing only: retain attribution,
 * browser caching and Referer headers; never prefetch or offer offline downloads.
 */
export const CARTO_ENABLED = Boolean(env.cartoBasemapKey);
const key = encodeURIComponent(env.cartoBasemapKey);
const osm = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_SOURCES = {
  light: CARTO_ENABLED
    ? `https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${key}`
    : osm,
  dark: CARTO_ENABLED
    ? `https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${key}`
    : osm,
} as const;
export const TILE_ATTRIBUTION = CARTO_ENABLED
  ? '© OpenStreetMap contributors © CARTO'
  : '© OpenStreetMap contributors';
export const TILE_ATTRIBUTION_HTML =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' +
  (CARTO_ENABLED ? ' &copy; <a href="https://carto.com/attributions">CARTO</a>' : '');

// Web tiles use Geoapify; native maps keep Apple/Google (or optional CARTO).
const geoapifyKey = encodeURIComponent(env.geoapifyApiKey);
export const WEB_TILE_SOURCES = env.geoapifyApiKey
  ? {
      light: `https://maps.geoapify.com/v1/tile/osm-bright-grey/{z}/{x}/{y}.png?apiKey=${geoapifyKey}`,
      dark: `https://maps.geoapify.com/v1/tile/dark-matter/{z}/{x}/{y}.png?apiKey=${geoapifyKey}`,
    }
  : TILE_SOURCES;
export const WEB_TILE_ATTRIBUTION_HTML = env.geoapifyApiKey
  ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | <a href="https://openmaptiles.org/">&copy; OpenMapTiles</a> | <a href="https://www.geoapify.com/">Powered by Geoapify</a>'
  : TILE_ATTRIBUTION_HTML;
