import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import VenueMap from '../../src/components/map/venue-map';
import { isAwayFromLocation } from '../../src/components/map/location-distance';
import type { MapRegion } from '../../src/components/map/types';
import { EmptyState, Skeleton } from '../../src/components/ui/activity';
import { AdaptiveGlassSurface } from '../../src/components/ui/glass-surface';
import {
  AppText,
  Button,
  Chip,
  IconButton,
  PressableSurface,
  sportIcon,
} from '../../src/components/ui/primitives';
import { ResultsSheet } from '../../src/components/ui/results-sheet';
import { usePublicSessionPins } from '../../src/features/community/api';
import { useAccountSports } from '../../src/features/account/api';
import { useDeviceLocation } from '../../src/features/location/use-device-location';
import { DEFAULT_CENTER, useNearbyVenues, useSports } from '../../src/features/venues/api';
import { VenueCard } from '../../src/features/venues/venue-card';
import { useSession } from '../../src/providers/auth-context';
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

  const { session } = useSession();
  const userId = session?.user.id;
  const preferredSports = useAccountSports(userId);
  const [filterOverride, setFilterOverride] = useState<{
    userId: string | null;
    sportIds: number[];
  } | null>(null);
  const selectedSportIds =
    filterOverride?.userId === (userId ?? null)
      ? filterOverride.sportIds
      : (preferredSports.data ?? []);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [center, setCenter] = useState<{ latitude: number; longitude: number }>(DEFAULT_CENTER);

  const [visibleCenter, setVisibleCenter] = useState<{ latitude: number; longitude: number }>(
    DEFAULT_CENTER,
  );
  const [recenterRequest, setRecenterRequest] = useState(0);

  const { state: locationState, request: requestLocation } = useDeviceLocation({ live: true });
  const didRequestLocation = useRef(false);
  const handleLocate = useCallback(async () => {
    const coords = await requestLocation();
    if (coords) {
      setCenter({ latitude: coords.latitude, longitude: coords.longitude });
      setVisibleCenter({ latitude: coords.latitude, longitude: coords.longitude });
      setRecenterRequest((current) => current + 1);
    }
  }, [requestLocation]);

  useEffect(() => {
    if (didRequestLocation.current) return;
    didRequestLocation.current = true;
    void handleLocate();
  }, [handleLocate]);

  const locating = locationState.status === 'idle' || locationState.status === 'requesting';
  const showRecenter =
    view === 'map' &&
    locationState.status === 'granted' &&
    isAwayFromLocation(visibleCenter, locationState.coords);
  const sports = useSports();
  const sessionPins = usePublicSessionPins(selectedSportIds);
  const venues = useNearbyVenues({
    latitude: visibleCenter.latitude,
    longitude: visibleCenter.longitude,
    sportIds: selectedSportIds,
    enabled: !locating,
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
      })),
    [venues.data],
  );

  const region: MapRegion = {
    latitude: center.latitude,
    longitude: center.longitude,
    latitudeDelta: 0.06,
    longitudeDelta: 0.06,
  };

  const liveCount = (venues.data ?? []).filter((v) => v.here_now > 0).length;

  function toggleSport(id: number) {
    setFilterOverride({
      userId: userId ?? null,
      sportIds: selectedSportIds.includes(id)
        ? selectedSportIds.filter((value) => value !== id)
        : [...selectedSportIds, id],
    });
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
            recenterRequest={recenterRequest}
            onRegionChange={setVisibleCenter}
            markers={[
              ...markers,
              ...(sessionPins.data ?? []).flatMap((pin) =>
                pin.latitude === null || pin.longitude === null
                  ? []
                  : [
                      {
                        id: `session/${pin.id}`,
                        latitude: pin.latitude,
                        longitude: pin.longitude,
                        sportSlug:
                          sports.data?.find((sport) => sport.id === pin.sport_id)?.slug ?? null,
                        count: 0,
                        isLive: false,
                        isPending: true,
                        kind: 'session' as const,
                        label:
                          pin.title ??
                          pin.run_series?.title ??
                          pin.location_name ??
                          'Sports session',
                      },
                    ],
              ),
            ]}
            colorScheme={scheme}
            onSelectMarker={(id) => {
              if (id.startsWith('session/')) {
                router.push(`/session/${id.slice('session/'.length)}`);
                return;
              }
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
                  {locating
                    ? 'Finding your location…'
                    : locationState.status === 'granted'
                      ? 'Near you'
                      : 'Charlottetown · default area'}
                </AppText>
              </View>
            </View>

            <IconButton
              icon="map-marker-plus-outline"
              label="Add a venue"
              onPress={() => router.push('/venue-submission/new')}
            />
          </View>

          <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
            <Button
              label="Create session/run"
              icon="plus"
              size="sm"
              onPress={() => router.push('/run/new')}
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
              onPress={() => setFilterOverride({ userId: userId ?? null, sportIds: [] })}
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
      <View style={[styles.sideControls, { top: insets.top + 178 }]} pointerEvents="box-none">
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

          {showRecenter && (
            <>
              <View style={[styles.controlDivider, { backgroundColor: colors.glassBorder }]} />
              <PressableSurface
                onPress={() => {
                  if (locationState.status !== 'granted') return;
                  setCenter(locationState.coords);
                  setVisibleCenter(locationState.coords);
                  setRecenterRequest((current) => current + 1);
                }}
                accessibilityLabel="Centre the map on my location"
              >
                <View style={styles.controlButton}>
                  <MaterialCommunityIcons name="crosshairs-gps" size={20} color={colors.info} />
                </View>
              </PressableSurface>
            </>
          )}
        </AdaptiveGlassSurface>
      </View>

      {/* Permission denial is explained where it happened, and never blocks
          browsing — the map keeps working, it just cannot centre on you. */}
      {(locationState.status === 'denied' || locationState.status === 'unavailable') && (
        <View style={[styles.notice, { top: insets.top + 178 }]} pointerEvents="box-none">
          <AdaptiveGlassSurface style={{ padding: space.md }} borderRadius={radius.lg}>
            <AppText variant="caption">
              {locationState.status === 'denied'
                ? 'Location is off. Showing Charlottetown as a default area; distances are from its centre.'
                : 'Could not find your location. Showing Charlottetown as a default area. Try enabling location below.'}
            </AppText>
            <Button
              label="Enable location"
              size="sm"
              onPress={() => {
                void handleLocate();
              }}
            />
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
        <View style={{ flex: 1, paddingTop: insets.top + 176 }}>{listContent}</View>
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
