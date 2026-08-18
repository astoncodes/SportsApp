import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, Skeleton } from '../../src/components/ui/activity';
import { AppText, Chip, PressableSurface, sportIcon } from '../../src/components/ui/primitives';
import { useSports, useUpcomingRuns } from '../../src/features/venues/api';
import type { UpcomingRun } from '../../src/features/venues/api';
import { distanceLabel, timeOfDay, weekdayGroup, weekdayName } from '../../src/lib/format';
import { elevation, radius, space, usePalette } from '../../src/theme';
import type { IconName } from '../../src/components/ui/primitives';

/**
 * Scheduled — "what reliable run can I join later?"
 *
 * The half of the product that has content before anyone has checked in
 * anywhere. A weekly listing is useful with zero live users, which is what
 * makes the cold-start problem survivable.
 */
export default function ScheduledScreen() {
  const colors = usePalette();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [selectedSportIds, setSelectedSportIds] = useState<number[]>([]);

  const sports = useSports();
  const runs = useUpcomingRuns({ sportIds: selectedSportIds, days: 14 });

  const sections = useMemo(() => {
    const buckets: Record<'today' | 'tomorrow' | 'week', UpcomingRun[]> = {
      today: [],
      tomorrow: [],
      week: [],
    };
    for (const run of runs.data ?? []) buckets[weekdayGroup(run.starts_at)].push(run);

    return [
      { key: 'today', title: 'Today', data: buckets.today },
      { key: 'tomorrow', title: 'Tomorrow', data: buckets.tomorrow },
      { key: 'week', title: 'This week', data: buckets.week },
    ].filter((section) => section.data.length > 0);
  }, [runs.data]);

  const activeSports = (sports.data ?? []).filter((sport) => sport.is_active);

  return (
    <View
      style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + space.md }}
    >
      <View style={{ paddingHorizontal: space.lg, gap: 2 }}>
        <AppText variant="display">Scheduled</AppText>
        <AppText variant="body" tone="muted">
          Weekly runs near you over the next two weeks.
        </AppText>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        accessibilityLabel="Filter runs by sport"
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
            onPress={() =>
              setSelectedSportIds((current) =>
                current.includes(sport.id)
                  ? current.filter((id) => id !== sport.id)
                  : [...current, sport.id],
              )
            }
          />
        ))}
      </ScrollView>

      {runs.isPending ? (
        <View style={{ padding: space.lg, gap: space.md }}>
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} height={92} />
          ))}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(run) => `${run.run_series_id}-${run.occurrence_date}`}
          contentContainerStyle={{
            padding: space.lg,
            paddingBottom: insets.bottom + 96,
            gap: space.sm,
          }}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          renderSectionHeader={({ section }) => (
            <AppText
              variant="micro"
              tone="muted"
              style={{ textTransform: 'uppercase', marginTop: space.md }}
            >
              {section.title}
            </AppText>
          )}
          renderItem={({ item }) => (
            <PressableSurface
              onPress={() => router.push(`/venue/${item.venue_id}`)}
              accessibilityLabel={`${item.title ?? item.sport_name} at ${item.venue_name}, ${weekdayName(item.starts_at)} ${timeOfDay(item.starts_at)}`}
            >
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  elevation.card,
                ]}
              >
                <View style={styles.timeBlock}>
                  <AppText variant="bodyStrong">{timeOfDay(item.starts_at)}</AppText>
                  <AppText variant="micro" tone="muted">
                    {weekdayName(item.starts_at).slice(0, 3).toUpperCase()}
                  </AppText>
                </View>

                <View style={{ flex: 1, gap: 3 }}>
                  <AppText variant="heading" numberOfLines={1}>
                    {item.title ?? `${item.sport_name} run`}
                  </AppText>
                  <AppText variant="caption" tone="muted" numberOfLines={1}>
                    {item.venue_name}
                    {item.organizer_name ? ` · ${item.organizer_name}` : ''}
                  </AppText>

                  <View style={styles.chipInline}>
                    <Chip
                      label={item.sport_name}
                      icon={sportIcon(item.sport_slug) as IconName}
                      compact
                    />
                    {item.expected_players != null && (
                      <Chip
                        label={`~${item.expected_players} players`}
                        icon="account-group"
                        compact
                      />
                    )}
                    {item.is_rescheduled && (
                      <Chip label="Moved" tone="soon" compact icon="calendar-edit" />
                    )}
                    <Chip
                      label={item.indoor_state === 'indoor' ? 'Indoor' : 'Outdoor'}
                      icon={item.indoor_state === 'indoor' ? 'home-variant' : 'weather-sunny'}
                      compact
                    />
                  </View>
                </View>

                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textFaint} />
              </View>
            </PressableSurface>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="calendar-plus"
              title="No runs scheduled yet"
              body={
                selectedSportIds.length > 0
                  ? 'Nothing in these sports over the next two weeks. Try clearing the filter.'
                  : 'Nobody has posted a weekly run near you yet. A run gives people something to turn up to before check-ins take off.'
              }
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
  },
  timeBlock: { alignItems: 'center', width: 54 },
  chipInline: { flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginTop: 3 },
});

export { distanceLabel };
