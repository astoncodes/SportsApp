import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFonts } from 'expo-font';
import { sportIcon } from '../ui/primitives';
import { useEffect, useRef } from 'react';

import { palettes } from '../../theme/tokens';
import { WEB_TILE_ATTRIBUTION_HTML, WEB_TILE_SOURCES } from './types';
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
  const session = marker.kind === 'session';
  const fill = session ? '#E63746' : '#536477';
  const ring = marker.selected ? colors.text : '#FFFFFF';
  const glyph =
    MaterialCommunityIcons.glyphMap[session ? sportIcon(marker.sportSlug) : 'map-marker-outline'];
  const badge =
    marker.count > 0
      ? `<span style="position:absolute;right:-3px;top:-4px;min-width:16px;height:16px;padding:0 3px;box-sizing:border-box;border-radius:8px;background:${colors.live};color:white;font:700 10px/16px system-ui;text-align:center;border:1px solid white">${Math.min(marker.count, 99)}</span>`
      : '';
  return `<div style="position:relative;width:48px;height:${session ? 56 : 44}px">
    <div style="position:absolute;left:6px;top:6px;width:36px;height:36px;box-sizing:border-box;background:${fill};border:2px solid ${ring};border-radius:${session ? '50% 50% 3px 50%' : '10px'};transform:${session ? 'rotate(45deg)' : 'none'};box-shadow:0 3px 7px #18253340"></div>
    <span style="position:absolute;left:11px;top:11px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:${session ? '#FFFFFF' : 'transparent'};color:${session ? fill : '#FFFFFF'};font:20px '${MaterialCommunityIcons.getFontFamily()}';">&#${glyph};</span>
    ${badge}
  </div>`;
}

export default function VenueMap({
  region,
  markers,
  onSelectMarker,
  onMarkerDragEnd,
  onPressCoordinate,
  onRegionChange,
  userLocation,
  colorScheme,
  style,
}: VenueMapProps) {
  useFonts(MaterialCommunityIcons.font);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const userLayerRef = useRef<L.LayerGroup | null>(null);
  const onRegionChangeRef = useRef(onRegionChange);
  const onPressCoordinateRef = useRef(onPressCoordinate);
  // Kept in an effect rather than assigned during render: the map's moveend
  // handler is registered once and needs the latest callback without the
  // subscription being torn down on every parent render.
  useEffect(() => {
    onRegionChangeRef.current = onRegionChange;
  }, [onRegionChange]);
  useEffect(() => {
    onPressCoordinateRef.current = onPressCoordinate;
  }, [onPressCoordinate]);

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
    map.on('click', (event) => {
      onPressCoordinateRef.current?.({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
    });

    const style = document.createElement('style');
    style.textContent = `.leaflet-container{background:#F2F3F7;font-family:ui-sans-serif,system-ui}
      .leaflet-marker-icon:focus-visible{outline:3px solid #2563EB;outline-offset:3px;border-radius:8px}`;
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
    tileRef.current = L.tileLayer(WEB_TILE_SOURCES[colorScheme], {
      attribution: WEB_TILE_ATTRIBUTION_HTML,
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
      const session = marker.kind === 'session';
      L.marker([marker.latitude, marker.longitude], {
        icon: L.divIcon({
          html: markerHtml(marker, colorScheme),
          className: '',
          iconSize: [48, session ? 56 : 44],
          iconAnchor: session ? [24, 49] : [24, 24],
        }),
        zIndexOffset: marker.selected ? 1000 : session ? 500 : 0,
        keyboard: true,
        title: marker.label,
        alt: marker.label,
        draggable: marker.draggable,
      })
        .on('click', () => onSelectMarker?.(marker.id))
        .on('dragend', (event) => {
          const coordinate = (event.target as L.Marker).getLatLng();
          onMarkerDragEnd?.(marker.id, {
            latitude: coordinate.lat,
            longitude: coordinate.lng,
          });
        })
        .addTo(layer);
    }
  }, [markers, colorScheme, onMarkerDragEnd, onSelectMarker]);

  useEffect(() => {
    const layer = userLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!userLocation) return;

    L.marker([userLocation.latitude, userLocation.longitude], {
      icon: L.divIcon({
        className: '',
        html: '<div style="width:40px;height:40px;box-sizing:border-box;border-radius:50%;background:#16A34A26;border:1px solid #16A34A50;display:flex;align-items:center;justify-content:center"><div style="width:18px;height:18px;border-radius:50%;background:#16A34A;border:3px solid white;box-shadow:0 2px 5px #0003"></div></div>',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      }),
      title: 'Your location',
      alt: 'Your location',
      zIndexOffset: 2000,
      interactive: false,
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
