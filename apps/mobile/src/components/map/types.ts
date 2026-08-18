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
  latitude: number;
  longitude: number;
  /** Drives the pin glyph. */
  sportSlug: string | null;
  /** Players present now. Zero means a quiet venue, not a hidden one. */
  count: number;
  /** Renders the pulse ring. Only ever true when someone is actually there. */
  isLive: boolean;
  /** Somebody is on their way but nobody has arrived. */
  isPending: boolean;
  label: string;
  selected?: boolean;
};

export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type VenueMapProps = {
  region: MapRegion;
  markers: MapMarker[];
  onSelectMarker?: (id: string) => void;
  onRegionChange?: (region: MapRegion) => void;
  /** Blue dot for the user, when location permission has been granted. */
  userLocation?: { latitude: number; longitude: number } | null;
  colorScheme: 'light' | 'dark';
  style?: object;
};

/**
 * Tile sources. CARTO basemaps are used rather than the standard OSM style
 * because they are designed to sit *under* an interface — muted, low-contrast,
 * and available in a dark variant, which the standard style is not.
 *
 * Attribution is mandatory and rendered by every adapter. Do not bulk-prefetch
 * these tiles or build offline maps against them.
 */
export const TILE_SOURCES = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
} as const;

export const TILE_ATTRIBUTION = '© OpenStreetMap contributors © CARTO';
