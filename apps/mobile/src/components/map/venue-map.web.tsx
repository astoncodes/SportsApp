import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useRef } from 'react';

import { palettes } from '../../theme/tokens';
import { TILE_ATTRIBUTION, TILE_SOURCES } from './types';
import type { MapMarker, VenueMapProps } from './types';

/**
 * Web map adapter.
 *
 * Metro resolves this instead of `venue-map.tsx` when bundling for web, so the
 * Expo web preview shows a real interactive map rather than the blank space a
 * native-only map component leaves behind.
 *
 * Leaflet is driven imperatively through refs rather than wrapped in a React
 * binding: markers update dozens of times as activity changes, and tearing
 * down and rebuilding a React-managed layer on each change makes pins visibly
 * flicker.
 */

function markerHtml(marker: MapMarker, scheme: 'light' | 'dark'): string {
  const colors = palettes[scheme];
  const fill = marker.isLive ? colors.live : marker.isPending ? colors.soon : colors.surface;
  const ink = marker.isLive || marker.isPending ? '#FFFFFF' : colors.text;
  const ring = marker.selected ? colors.text : 'rgba(0,0,0,0.12)';
  // Quiet venues are deliberately much smaller. At a uniform size they read as
  // a field of white blobs competing with the live pins, which inverts the
  // whole point of the screen — the eye should land on activity first.
  const size = marker.isLive ? 40 : marker.isPending ? 32 : 22;

  // The pulse is drawn only for genuinely live venues. An animated ring on an
  // empty court would imply activity that is not there.
  const pulse = marker.isLive
    ? `<span style="position:absolute;inset:-8px;border-radius:999px;background:${colors.live};opacity:.28;animation:dropin-pulse 2.2s ease-out infinite"></span>`
    : '';

  const badge =
    marker.count > 0
      ? `<span style="font:700 14px/1 ui-sans-serif,system-ui;color:${ink}">${marker.count}</span>`
      : marker.isPending
        ? `<span style="font:700 12px/1 ui-sans-serif,system-ui;color:${ink}">→</span>`
        : `<span style="width:7px;height:7px;border-radius:999px;background:${colors.textMuted};opacity:.7"></span>`;

  return `<div style="position:relative;display:flex;align-items:center;justify-content:center;
      width:${size}px;height:${size}px;border-radius:999px;background:${fill};
      border:2px solid ${ring};box-shadow:0 4px 14px rgba(8,19,15,.25)">
      ${pulse}<span style="position:relative">${badge}</span>
    </div>`;
}

export default function VenueMap({
  region,
  markers,
  onSelectMarker,
  onRegionChange,
  userLocation,
  colorScheme,
  style,
}: VenueMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const userLayerRef = useRef<L.LayerGroup | null>(null);
  const onRegionChangeRef = useRef(onRegionChange);
  // Kept in an effect rather than assigned during render: the map's moveend
  // handler is registered once and needs the latest callback without the
  // subscription being torn down on every parent render.
  useEffect(() => {
    onRegionChangeRef.current = onRegionChange;
  }, [onRegionChange]);

  // Create once. Re-creating the map on prop changes would reset zoom and pan
  // every time a check-in landed.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [region.latitude, region.longitude],
      zoom: 13,
      zoomControl: false,
      attributionControl: true,
    });

    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    markerLayerRef.current = L.layerGroup().addTo(map);
    userLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on('moveend', () => {
      const centre = map.getCenter();
      const bounds = map.getBounds();
      onRegionChangeRef.current?.({
        latitude: centre.lat,
        longitude: centre.lng,
        latitudeDelta: Math.abs(bounds.getNorth() - bounds.getSouth()),
        longitudeDelta: Math.abs(bounds.getEast() - bounds.getWest()),
      });
    });

    const style = document.createElement('style');
    style.textContent = `@keyframes dropin-pulse{0%{transform:scale(.9);opacity:.35}70%{transform:scale(1.7);opacity:0}100%{opacity:0}}
      .leaflet-container{background:transparent;font-family:ui-sans-serif,system-ui}
      @media (prefers-reduced-motion: reduce){[style*="dropin-pulse"]{animation:none!important}}`;
    document.head.appendChild(style);

    return () => {
      map.remove();
      mapRef.current = null;
      style.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap the basemap when the theme changes, rather than rebuilding the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    tileRef.current?.remove();
    tileRef.current = L.tileLayer(TILE_SOURCES[colorScheme], {
      attribution: TILE_ATTRIBUTION,
      maxZoom: 19,
      // Explicitly bounded. This is an interactive map, not a prefetcher.
      minZoom: 9,
    }).addTo(map);
  }, [colorScheme]);

  useEffect(() => {
    const layer = markerLayerRef.current;
    if (!layer) return;

    layer.clearLayers();
    for (const marker of markers) {
      const size = marker.isLive ? 40 : 34;
      L.marker([marker.latitude, marker.longitude], {
        icon: L.divIcon({
          html: markerHtml(marker, colorScheme),
          className: '',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
        keyboard: true,
        title: marker.label,
        alt: marker.label,
      })
        .on('click', () => onSelectMarker?.(marker.id))
        .addTo(layer);
    }
  }, [markers, colorScheme, onSelectMarker]);

  useEffect(() => {
    const layer = userLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!userLocation) return;

    const colors = palettes[colorScheme];
    L.circleMarker([userLocation.latitude, userLocation.longitude], {
      radius: 7,
      color: '#FFFFFF',
      weight: 3,
      fillColor: colors.info,
      fillOpacity: 1,
    }).addTo(layer);
  }, [userLocation, colorScheme]);

  useEffect(() => {
    mapRef.current?.setView([region.latitude, region.longitude], mapRef.current.getZoom(), {
      animate: true,
    });
    // Only recentre on an explicit coordinate change (Locate me, region switch).
  }, [region.latitude, region.longitude]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Map of nearby venues. A list of the same venues is available below."
      style={{ width: '100%', height: '100%', ...(style as object) }}
    />
  );
}
