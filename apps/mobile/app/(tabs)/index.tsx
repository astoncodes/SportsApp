import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import VenueMap from '../../src/components/map/venue-map';
import type { MapRegion } from '../../src/components/map/types';
import { EmptyState, Skeleton } from '../../src/components/ui/activity';
import { AdaptiveGlassSurface } from '../../src/components/ui/glass-surface';
import {
  AppText,
  Chip,
  IconButton,
  PressableSurface,
  sportIcon,
} from '../../src/components/ui/primitives';
import { ResultsSheet } from '../../src/components/ui/results-sheet';
import { useDeviceLocation } from '../../src/features/location/use-device-location';
import { DEFAULT_CENTER, useNearbyVenues, useSports } from '../../src/features/venues/api';
import { VenueCard } from '../../src/features/venues/venue-card';
import { radius, space, useThemeName, usePalette } from '../../src/theme';
import type { IconName } from '../../src/components/ui/primitives';

/**
 * Live — "where can I play right now?"
 *
 * The map answers the question spatially and the list answers it in ranked
 * order; both read the same query, so they can never disagree. Venues with
 * people present sort first, because the nearest empty court does not answer
 * the question this screen exists for.
 */
export default function LiveScreen() {
  const colors = usePalette();
  const scheme = useThemeName();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [selectedSportIds, setSelectedSportIds] = useState<number[]>([]);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [center, setCenter] = useState<{ latitude: number; longitude: number }>(DEFAULT_CENTER);

  const { state: locationState, request: requestLocation } = useDeviceLocation();
  const sports = useSports();
  const venues = useNearbyVenues({
    latitude: center.latitude,
    longitude: center.longitude,
    sportIds: selectedSportIds,
  });

  const activeSports = useMemo(
    () => (sports.data ?? []).filter((sport) => sport.is_active),
    [sports.data],
  );

  const markers = useMemo(
    () =>
      (venues.data ?? []).map((venue) => ({
        id: venue.venue_id,
        latitude: venue.latitude,
        longitude: venue.longitude,
        sportSlug: venue.sport_slugs?.[0] ?? null,
        count: venue.here_now,
        isLive: venue.here_now > 0,
        isPending: venue.here_now === 0 && venue.heading_there > 0,
        label: `${venue.name}, ${venue.here_now} here now`,
        selected: venue.venue_id === selectedVenueId,
      })),
    [venues.data, selectedVenueId],
  );

  const region: MapRegion = {
    latitude: center.latitude,
    longitude: center.longitude,
    latitudeDelta: 0.06,
    longitudeDelta: 0.06,
  };

  const liveCount = (venues.data ?? []).filter((v) => v.here_now > 0).length;

  function toggleSport(id: number) {
    setSelectedSportIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function handleLocate() {
    const coords = await requestLocation();
    if (coords) setCenter({ latitude: coords.latitude, longitude: coords.longitude });
  }

  const listContent = (
    <FlatList
      data={venues.data ?? []}
      keyExtractor={(venue) => venue.venue_id}
      contentContainerStyle={{
        padding: space.lg,
        paddingBottom: insets.bottom + 120,
        gap: space.md,
      }}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => (
        <VenueCard venue={item} onPress={() => router.push(`/venue/${item.venue_id}`)} />
      )}
      ListEmptyComponent={
        venues.isPending ? (
          <View style={{ gap: space.md }}>
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} height={148} />
            ))}
          </View>
        ) : venues.isError ? (
          <EmptyState
            icon="wifi-off"
            title="Can't reach Drop In"
            body="Check your connection and pull to try again. Anything already loaded stays on the map."
          />
        ) : (
          <EmptyState
            icon="map-search-outline"
            title="Nothing nearby yet"
            body={
              selectedSportIds.length > 0
                ? 'No venues match these sports in this area. Try clearing a filter or moving the map.'
                : 'No venues in range. Move the map, or add a spot you know about.'
            }
          />
        )
      }
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {view === 'map' && (
        <View style={StyleSheet.absoluteFill}>
          <VenueMap
            region={region}
            markers={markers}
            colorScheme={scheme}
            onSelectMarker={(id) => {
              setSelectedVenueId(id);
              router.push(`/venue/${id}`);
            }}
            userLocation={
              locationState.status === 'granted'
                ? {
                    latitude: locationState.coords.latitude,
                    longitude: locationState.coords.longitude,
                  }
                : null
            }
          />
        </View>
      )}

      {/* --- Floating chrome. Glass here, never on the content cards. --- */}
      <View style={[styles.chrome, { paddingTop: insets.top + space.sm }]} pointerEvents="box-none">
        <AdaptiveGlassSurface style={styles.header} borderRadius={radius.xl}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <AppText variant="heading">Drop In</AppText>
              <View style={styles.regionRow}>
                <MaterialCommunityIcons name="map-marker" size={12} color={colors.textMuted} />
                <AppText variant="caption" tone="muted">
                  Charlottetown
                </AppText>
              </View>
            </View>

            <IconButton icon="magnify" label="Search venues" onPress={() => setView('list')} />
            <IconButton
              icon="account-circle-outline"
              label="Your profile"
              onPress={() => router.push('/profile')}
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            accessibilityLabel="Filter by sport"
          >
            <Chip
              label="All sports"
              icon="filter-variant"
              selected={selectedSportIds.length === 0}
              onPress={() => setSelectedSportIds([])}
            />
            {activeSports.map((sport) => (
              <Chip
                key={sport.id}
                label={sport.name}
                icon={sportIcon(sport.slug) as IconName}
                selected={selectedSportIds.includes(sport.id)}
                onPress={() => toggleSport(sport.id)}
              />
            ))}
          </ScrollView>
        </AdaptiveGlassSurface>
      </View>

      {/* --- Right-hand floating controls --- */}
      <View style={[styles.sideControls, { top: insets.top + 132 }]} pointerEvents="box-none">
        <AdaptiveGlassSurface borderRadius={radius.pill} style={styles.controlStack}>
          <PressableSurface
            onPress={() => setView(view === 'map' ? 'list' : 'map')}
            accessibilityLabel={view === 'map' ? 'Show list view' : 'Show map view'}
          >
            <View style={styles.controlButton}>
              <MaterialCommunityIcons
                name={view === 'map' ? 'format-list-bulleted' : 'map-outline'}
                size={20}
                color={colors.text}
              />
            </View>
          </PressableSurface>

          <View style={[styles.controlDivider, { backgroundColor: colors.glassBorder }]} />

          <PressableSurface
            onPress={handleLocate}
            accessibilityLabel="Centre the map on my location"
            accessibilityHint="Asks for location permission the first time"
          >
            <View style={styles.controlButton}>
              <MaterialCommunityIcons
                name={
                  locationState.status === 'granted'
                    ? 'crosshairs-gps'
                    : locationState.status === 'requesting'
                      ? 'crosshairs'
                      : 'crosshairs-question'
                }
                size={20}
                color={locationState.status === 'granted' ? colors.info : colors.text}
              />
            </View>
          </PressableSurface>
        </AdaptiveGlassSurface>
      </View>

      {/* Permission denial is explained where it happened, and never blocks
          browsing — the map keeps working, it just cannot centre on you. */}
      {(locationState.status === 'denied' || locationState.status === 'unavailable') && (
        <View style={[styles.notice, { top: insets.top + 132 }]} pointerEvents="box-none">
          <AdaptiveGlassSurface style={{ padding: space.md }} borderRadius={radius.lg}>
            <AppText variant="caption">
              {locationState.status === 'denied'
                ? 'Location is off, so distances are measured from the city centre. Everything else still works.'
                : 'Location is unavailable on this device right now.'}
            </AppText>
          </AdaptiveGlassSurface>
        </View>
      )}

      {view === 'map' ? (
        <ResultsSheet
          title={
            venues.isPending
              ? 'Finding venues…'
              : liveCount > 0
                ? `${liveCount} active now`
                : `${venues.data?.length ?? 0} nearby`
          }
          subtitle={
            liveCount > 0
              ? 'Sorted by activity, then distance'
              : 'Nothing live — here is what is closest'
          }
        >
          {listContent}
        </ResultsSheet>
      ) : (
        <View style={{ flex: 1, paddingTop: insets.top + 130 }}>{listContent}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: space.md,
    zIndex: 20,
  },
  header: { paddingBottom: space.sm },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.xs,
  },
  regionRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  chipRow: { paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm },
  sideControls: { position: 'absolute', right: space.md, zIndex: 20 },
  controlStack: { alignItems: 'center' },
  controlButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  controlDivider: { height: StyleSheet.hairlineWidth, width: 28 },
  notice: { position: 'absolute', left: space.md, right: 76, zIndex: 19, marginTop: 108 },
});
