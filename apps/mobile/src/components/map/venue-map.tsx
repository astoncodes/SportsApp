import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { palettes } from '../../theme/tokens';
import { AppText, sportIcon } from '../ui/primitives';
import { useFonts } from 'expo-font';
import { CARTO_ENABLED, TILE_ATTRIBUTION, TILE_SOURCES } from './types';
import type { VenueMapProps } from './types';

/**
 * Native map adapter (iOS / Android).
 *
 * Metro picks `venue-map.web.tsx` for web instead. Both satisfy VenueMapProps,
 * so feature screens never learn which one they got.
 *
 * NOTE: this path has not been exercised on a device in this environment —
 * only Command Line Tools are installed, so there is no iOS simulator. The web
 * adapter is the verified one; treat this as reviewed but unrun.
 */
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
  const colors = palettes[colorScheme];
  const [fontsLoaded] = useFonts(MaterialCommunityIcons.font);
  const mapRef = useRef<MapView | null>(null);
  const { latitude, longitude, latitudeDelta, longitudeDelta } = region;

  useEffect(() => {
    mapRef.current?.animateToRegion({ latitude, longitude, latitudeDelta, longitudeDelta }, 200);
  }, [latitude, longitude, latitudeDelta, longitudeDelta]);

  return (
    <View style={[StyleSheet.absoluteFill, style]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        onPress={(event) => onPressCoordinate?.(event.nativeEvent.coordinate)}
        onRegionChangeComplete={onRegionChange}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        userInterfaceStyle={colorScheme}
        customMapStyle={colorScheme === 'light' ? illustratedMapStyle : undefined}
        showsUserLocation={false}
        showsPointsOfInterests={false}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        accessibilityLabel="Map of nearby venues. The same venues are listed below."
      >
        {/* Use the platform map until a CARTO key is configured. */}
        {CARTO_ENABLED && (
          <UrlTile
            urlTemplate={TILE_SOURCES[colorScheme].replace('{r}', '')}
            maximumZ={19}
            minimumZ={9}
            shouldReplaceMapContent
          />
        )}

        {markers.map((marker) => (
          <Marker
            key={`${marker.id}/${marker.kind}/${marker.sportSlug}/${marker.count}/${marker.isLive}/${marker.isPending}/${marker.selected}/${colorScheme}/${fontsLoaded}`}
            anchor={marker.kind === 'session' ? { x: 0.5, y: 49 / 56 } : { x: 0.5, y: 24 / 44 }}
            zIndex={marker.selected ? 1000 : marker.kind === 'session' ? 500 : 0}
            coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
            onPress={() => onSelectMarker?.(marker.id)}
            draggable={marker.draggable}
            onDragEnd={(event) => onMarkerDragEnd?.(marker.id, event.nativeEvent.coordinate)}
            title={marker.label}
            tracksViewChanges={false}
          >
            <View
              style={{ width: 48, height: marker.kind === 'session' ? 56 : 44 }}
              collapsable={false}
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
          </Marker>
        ))}
        {userLocation && (
          <Marker
            coordinate={userLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={2000}
            title="Your location"
            tracksViewChanges={false}
            tappable={false}
          >
            <View style={styles.userHalo} collapsable={false}>
              <View style={styles.userDot} />
            </View>
          </Marker>
        )}
      </MapView>

      {/* Attribution is a condition of using these tiles, not a nicety. */}
      {CARTO_ENABLED && (
        <View style={[styles.attribution, { backgroundColor: colors.glassFill }]}>
          <AppText variant="micro" tone="muted">
            {TILE_ATTRIBUTION}
          </AppText>
        </View>
      )}
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
  userHalo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#16A34A26',
    borderWidth: 1,
    borderColor: '#16A34A50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#16A34A',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  attribution: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});

// Local Google styling keeps map loads on the existing native SDK configuration.
const illustratedMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#F2F3F7' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#777785' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ visibility: 'on' }, { color: '#D4E8A5' }],
  },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#D3D5E3' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#ACDDF5' }] },
];
