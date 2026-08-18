import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import { StyleSheet, View } from 'react-native';

import { palettes } from '../../theme/tokens';
import { AppText, sportIcon } from '../ui/primitives';
import { LivePulse } from '../ui/activity';
import { TILE_ATTRIBUTION, TILE_SOURCES } from './types';
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
  onRegionChange,
  userLocation,
  colorScheme,
  style,
}: VenueMapProps) {
  const colors = palettes[colorScheme];

  return (
    <View style={[StyleSheet.absoluteFill, style]}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        onRegionChangeComplete={onRegionChange}
        showsUserLocation={Boolean(userLocation)}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        accessibilityLabel="Map of nearby venues. The same venues are listed below."
      >
        {/* Same CARTO basemap as web, so the two platforms look like one
            product. Keeping it a UrlTile rather than the platform default is
            also what makes the provider swappable later. */}
        <UrlTile
          urlTemplate={TILE_SOURCES[colorScheme].replace('{r}', '')}
          maximumZ={19}
          minimumZ={9}
          shouldReplaceMapContent
        />

        {markers.map((marker) => (
          <Marker
            key={marker.id}
            coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
            onPress={() => onSelectMarker?.(marker.id)}
            title={marker.label}
            tracksViewChanges={false}
          >
            <View
              style={[
                styles.pin,
                {
                  backgroundColor: marker.isLive
                    ? colors.live
                    : marker.isPending
                      ? colors.soon
                      : colors.surface,
                  borderColor: marker.selected ? colors.text : 'rgba(0,0,0,0.12)',
                  width: marker.isLive ? 40 : 34,
                  height: marker.isLive ? 40 : 34,
                },
              ]}
            >
              {marker.isLive ? (
                <LivePulse color="#FFFFFF" size={6} />
              ) : marker.count > 0 ? (
                <AppText variant="bodyStrong" style={{ color: '#FFFFFF' }}>
                  {marker.count}
                </AppText>
              ) : (
                <MaterialCommunityIcons
                  name={sportIcon(marker.sportSlug)}
                  size={16}
                  color={colors.textMuted}
                />
              )}
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Attribution is a condition of using these tiles, not a nicety. */}
      <View style={[styles.attribution, { backgroundColor: colors.glassFill }]}>
        <AppText variant="micro" tone="muted">
          {TILE_ATTRIBUTION}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pin: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 2,
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
