import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, Skeleton } from '../../src/components/ui/activity';
import { AppText, Button, Chip, sportIcon } from '../../src/components/ui/primitives';
import { useJoinSession, useRunAttendance } from '../../src/features/community/api';
import { useSports, useUpcomingRuns } from '../../src/features/venues/api';
import type { UpcomingRun } from '../../src/features/venues/api';
import { distanceLabel, timeOfDay, weekdayGroup, weekdayName } from '../../src/lib/format';
import { elevation, radius, space, usePalette } from '../../src/theme';
import { useSession } from '../../src/providers/auth-context';
import type { IconName } from '../../src/components/ui/primitives';

/**
 * Scheduled collects the caller's hosted, Going, and Maybe occurrences.
 * Browse keeps discovery available without mixing it into their own plans.
 */
export default function ScheduledScreen() {
  const colors = usePalette();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useSession();
  const join = useJoinSession();
  const [scope, setScope] = useState<'mine' | 'browse'>('mine');
  const [selectedSportIds, setSelectedSportIds] = useState<number[]>([]);

  const sports = useSports();
  const runs = useUpcomingRuns({ sportIds: selectedSportIds, days: scope === 'mine' ? 84 : 14 });

  const attendance = useRunAttendance(
    (runs.data ?? []).map((run) => run.run_series_id),
    session?.user.id,
  );
  const responses = useMemo(
    () =>
      new Map(
        (attendance.data ?? []).map((item) => [
          `${item.run_series_id}-${item.occurrence_date}`,
          item,
        ]),
      ),
    [attendance.data],
  );

  const sections = useMemo(() => {
    const buckets: Record<'today' | 'tomorrow' | 'week', UpcomingRun[]> = {
      today: [],
      tomorrow: [],
      week: [],
    };
    for (const run of runs.data ?? []) {
      const response = responses.get(`${run.run_series_id}-${run.occurrence_date}`);
      if (
        scope === 'mine' &&
        (!session || (run.organizer_id !== session.user.id && !response?.my_response))
      )
        continue;
      buckets[weekdayGroup(run.starts_at)].push(run);
    }

    return [
      { key: 'today', title: 'Today', data: buckets.today },
      { key: 'tomorrow', title: 'Tomorrow', data: buckets.tomorrow },
      { key: 'week', title: 'Coming up', data: buckets.week },
    ].filter((section) => section.data.length > 0);
  }, [runs.data, responses, scope, session]);

  const activeSports = (sports.data ?? []).filter((sport) => sport.is_active);

  async function handleJoin(item: UpcomingRun, response: 'going' | 'maybe') {
    if (!session) {
      router.push('/sign-in');
      return;
    }
    try {
      await join.mutateAsync({
        runSeriesId: item.run_series_id,
        occurrenceDate: item.occurrence_date,
        attendance: response,
      });
    } catch (error) {
      Alert.alert(
        'Could not save response',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  }

  return (
    <View
      style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + space.md }}
    >
      <View style={{ paddingHorizontal: space.lg, gap: 2 }}>
        <AppText variant="display">Scheduled</AppText>
        <AppText variant="body" tone="muted">
          {scope === 'mine'
            ? 'Sessions you host, are going to, or might join.'
            : 'Sports sessions near you over the next two weeks.'}
        </AppText>
        <View style={{ marginTop: space.md }}>
          <Button
            label="Create session"
            icon="calendar-plus"
            onPress={() => router.push('/run/new')}
          />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: space.sm, padding: space.lg }}>
        <Chip label="My schedule" selected={scope === 'mine'} onPress={() => setScope('mine')} />
        <Chip
          label="Browse runs"
          selected={scope === 'browse'}
          onPress={() => setScope('browse')}
        />
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

      {scope === 'mine' && !session ? (
        <View style={{ padding: space.lg, gap: space.md }}>
          <EmptyState
            icon="calendar"
            title="Your schedule"
            body="Sign in to see sessions you host, are going to, or marked Maybe."
          />
          <Button label="Sign in" onPress={() => router.push('/sign-in')} />
        </View>
      ) : runs.isError || attendance.isError ? (
        <EmptyState
          icon="wifi-off"
          title="Could not load sessions"
          body="Check your connection and try again."
        />
      ) : runs.isPending || ((runs.data?.length ?? 0) > 0 && attendance.isPending) ? (
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

              <View
                style={{
                  width: '100%',
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: space.xs,
                }}
              >
                {item.organizer_id === session?.user.id && <Chip label="Hosting" compact />}
                <Button
                  label={
                    responses.get(`${item.run_series_id}-${item.occurrence_date}`)?.my_response ===
                    'going'
                      ? 'Going ✓'
                      : 'Going +1'
                  }
                  size="sm"
                  onPress={() => handleJoin(item, 'going')}
                  disabled={join.isPending}
                />
                <Button
                  label={
                    responses.get(`${item.run_series_id}-${item.occurrence_date}`)?.my_response ===
                    'maybe'
                      ? 'Maybe ✓'
                      : 'Maybe'
                  }
                  size="sm"
                  tone="neutral"
                  onPress={() => handleJoin(item, 'maybe')}
                  disabled={join.isPending}
                />
                <AppText variant="micro" tone="muted">
                  {responses.get(`${item.run_series_id}-${item.occurrence_date}`)?.going_count ?? 0}{' '}
                  going ·{' '}
                  {responses.get(`${item.run_series_id}-${item.occurrence_date}`)?.maybe_count ?? 0}{' '}
                  maybe
                </AppText>
                {responses.get(`${item.run_series_id}-${item.occurrence_date}`)?.session_id && (
                  <Button
                    label="Open"
                    size="sm"
                    variant="soft"
                    onPress={() =>
                      router.push(
                        `/session/${responses.get(`${item.run_series_id}-${item.occurrence_date}`)!.session_id}`,
                      )
                    }
                  />
                )}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="calendar-plus"
              title="Nothing scheduled yet"
              body={
                selectedSportIds.length > 0
                  ? 'No sessions match these sports. Try clearing the filter.'
                  : scope === 'mine'
                    ? 'Choose Going or Maybe on a session to add it here. Runs you host also appear here.'
                    : 'No runs have been posted for the next two weeks.'
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
    flexWrap: 'wrap',
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
