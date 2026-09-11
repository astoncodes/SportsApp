import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Mapbox, {
  Camera,
  LineLayer,
  MapView,
  PointAnnotation,
  UserLocation,
  VectorSource,
} from '@rnmapbox/maps';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFonts } from 'expo-font';

import { env } from '../../lib/env';
import { palettes } from '../../theme/tokens';
import { AppText, sportIcon } from '../ui/primitives';
import type { MapRegion, VenueMapProps } from './types';

if (env.mapboxAccessToken) Mapbox.setAccessToken(env.mapboxAccessToken);

export default function VenueMap({
  region,
  recenterRequest,
  markers,
  onSelectMarker,
  onMarkerDragEnd,
  onPressCoordinate,
  onRegionChange,
  userLocation,
  colorScheme,
  style,
}: VenueMapProps) {
  const colors = palettes[colorScheme];
  const [fontsLoaded] = useFonts(MaterialCommunityIcons.font);
  const camera = useRef<Camera>(null);
  const lastReported = useRef<MapRegion | null>(null);
  const lastRequest = useRef(recenterRequest);
  const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
  useEffect(() => {
    const reported = lastReported.current;
    const requested = lastRequest.current !== recenterRequest;
    lastRequest.current = recenterRequest;
    // Picker screens echo viewport changes back as props. Do not animate that echo.
    if (
      !requested &&
      reported &&
      reported.latitude === latitude &&
      reported.longitude === longitude &&
      reported.latitudeDelta === latitudeDelta &&
      reported.longitudeDelta === longitudeDelta
    )
      return;
    camera.current?.setCamera({
      centerCoordinate: [longitude, latitude],
      zoomLevel: Math.log2(360 / Math.max(longitudeDelta, 0.0001)),
      animationDuration: 250,
    });
  }, [latitude, longitude, latitudeDelta, longitudeDelta, recenterRequest]);

  if (!env.mapboxAccessToken)
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
          style,
        ]}
      >
        <AppText>Map unavailable. You can still browse the venue list.</AppText>
      </View>
    );

  return (
    <View style={[StyleSheet.absoluteFill, style]}>
      <MapView
        style={StyleSheet.absoluteFill}
        styleURL={`mapbox://styles/mapbox/${colorScheme === 'dark' ? 'dark' : 'light'}-v11`}
        compassEnabled={false}
        scaleBarEnabled={false}
        onPress={(event) => {
          if (event.geometry.type === 'Point')
            onPressCoordinate?.({
              latitude: event.geometry.coordinates[1],
              longitude: event.geometry.coordinates[0],
            });
        }}
        onMapIdle={(state) => {
          const next = {
            latitude: state.properties.center[1],
            longitude: state.properties.center[0],
            latitudeDelta: Math.abs(state.properties.bounds.ne[1] - state.properties.bounds.sw[1]),
            longitudeDelta: Math.abs(state.properties.bounds.ne[0] - state.properties.bounds.sw[0]),
          };
          lastReported.current = next;
          onRegionChange?.(next);
        }}
        accessibilityLabel="Map of nearby venues. The same venues are listed below."
      >
        <Camera
          ref={camera}
          defaultSettings={{
            centerCoordinate: [longitude, latitude],
            zoomLevel: Math.log2(360 / Math.max(longitudeDelta, 0.0001)),
          }}
        />
        <VectorSource id="green-streets" url="mapbox://mapbox.mapbox-streets-v8">
          <LineLayer
            id="green-street-lines"
            sourceLayerID="road"
            belowLayerID="road-label-simple"
            minZoomLevel={10}
            style={{
              lineColor: '#16A34A',
              lineOpacity: 0.7,
              lineCap: 'round',
              lineJoin: 'round',
              lineWidth: ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 2, 18, 5],
            }}
          />
        </VectorSource>
        {markers.map((marker) => (
          <PointAnnotation
            key={`${marker.id}/${marker.selected}/${marker.count}/${colorScheme}/${fontsLoaded}`}
            id={marker.id}
            coordinate={[marker.longitude, marker.latitude]}
            anchor={marker.kind === 'session' ? { x: 0.5, y: 49 / 56 } : { x: 0.5, y: 24 / 44 }}
            onSelected={() => onSelectMarker?.(marker.id)}
            draggable={marker.draggable}
            onDragEnd={(event) =>
              onMarkerDragEnd?.(marker.id, {
                latitude: event.geometry.coordinates[1],
                longitude: event.geometry.coordinates[0],
              })
            }
          >
            <View
              style={{ width: 48, height: marker.kind === 'session' ? 56 : 44 }}
              collapsable={false}
              accessibilityLabel={marker.label}
            >
              <View
                style={[
                  styles.pin,
                  {
                    backgroundColor: marker.kind === 'session' ? '#E63746' : '#536477',
                    borderColor: marker.selected ? colors.text : '#FFFFFF',
                  },
                  marker.kind === 'session' && styles.sessionPin,
                ]}
              />
              <View
                style={[styles.glyph, marker.kind === 'session' && { backgroundColor: '#FFFFFF' }]}
              >
                <MaterialCommunityIcons
                  name={
                    marker.kind === 'session' ? sportIcon(marker.sportSlug) : 'map-marker-outline'
                  }
                  size={20}
                  color={marker.kind === 'session' ? '#E63746' : '#FFFFFF'}
                />
              </View>
              {marker.count > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.live }]}>
                  <AppText style={{ color: '#FFFFFF', fontSize: 10, lineHeight: 14 }}>
                    {Math.min(marker.count, 99)}
                  </AppText>
                </View>
              )}
            </View>
          </PointAnnotation>
        ))}
        {userLocation && <UserLocation visible minDisplacement={5} />}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  pin: {
    position: 'absolute',
    left: 6,
    top: 6,
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 2,
  },
  sessionPin: {
    borderRadius: 18,
    borderBottomRightRadius: 3,
    transform: [{ rotate: '45deg' }],
  },
  glyph: {
    position: 'absolute',
    left: 11,
    top: 11,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: 0,
    top: 0,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
