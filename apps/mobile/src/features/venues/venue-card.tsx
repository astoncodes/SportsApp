import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, View } from 'react-native';

import { ActivityBadge, ConditionChip } from '../../components/ui/activity';
import { AppText, Chip, PressableSurface, sportIcon } from '../../components/ui/primitives';
import {
  CONDITION_ICON,
  CONDITION_IS_BLOCKING,
  CONDITION_LABEL,
  PULSE_LABEL,
  PULSE_TONE,
  activitySummary,
  distanceLabel,
  relativeFuture,
  relativeTime,
} from '../../lib/format';
import { elevation, radius, space, usePalette } from '../../theme';
import type { IconName } from '../../components/ui/primitives';
import type { NearbyVenue } from './api';

/**
 * One venue in the results list.
 *
 * Reading order matches the question being asked: is anything happening, where
 * is it, what sport, and how fresh is that claim. The freshness line is not
 * decoration — a count with no timestamp is an assertion the user cannot check.
 */
export function VenueCard({ venue, onPress }: { venue: NearbyVenue; onPress: () => void }) {
  const colors = usePalette();

  const summary = activitySummary({
    hereNow: venue.here_now,
    headingThere: venue.heading_there,
    nextRunAt: venue.next_run_at,
  });

  const blockingConditions = (venue.condition_kinds ?? []).filter(
    (kind) => CONDITION_IS_BLOCKING[kind],
  );

  return (
    <PressableSurface
      onPress={onPress}
      accessibilityLabel={`${venue.name}. ${summary.label}. ${distanceLabel(venue.distance_m)} away.`}
      accessibilityHint="Opens venue details"
    >
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
          elevation.card,
        ]}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="heading" numberOfLines={1}>
              {venue.name}
            </AppText>

            <View style={styles.metaRow}>
              <AppText variant="caption" tone="muted">
                {distanceLabel(venue.distance_m)}
              </AppText>
              <View style={[styles.dot, { backgroundColor: colors.textFaint }]} />
              <MaterialCommunityIcons
                name={venue.indoor_state === 'indoor' ? 'home-variant' : 'weather-sunny'}
                size={13}
                color={colors.textMuted}
              />
              <AppText variant="caption" tone="muted">
                {venue.indoor_state === 'indoor'
                  ? 'Indoor'
                  : venue.indoor_state === 'outdoor'
                    ? 'Outdoor'
                    : 'Unknown'}
              </AppText>
              {venue.verification_state === 'admin_verified' && (
                <>
                  <View style={[styles.dot, { backgroundColor: colors.textFaint }]} />
                  <MaterialCommunityIcons name="check-decagram" size={13} color={colors.live} />
                </>
              )}
            </View>
          </View>

          {/* The count is the headline. Scoreboard weight, not body copy. */}
          {venue.here_now > 0 && (
            <View style={{ alignItems: 'flex-end' }}>
              <AppText variant="score" style={{ color: colors.live }}>
                {venue.here_now}
              </AppText>
              <AppText variant="micro" tone="muted">
                HERE NOW
              </AppText>
            </View>
          )}
        </View>

        <View style={styles.badgeRow}>
          <ActivityBadge
            label={summary.label}
            tone={summary.tone}
            count={venue.here_now || venue.heading_there || undefined}
          />

          {venue.pulse && (
            <Chip
              label={PULSE_LABEL[venue.pulse]}
              tone={PULSE_TONE[venue.pulse]}
              compact
              icon="bullhorn-outline"
            />
          )}

          {/* Only ever shown when nothing is live — otherwise it competes with
              the signal people actually came for. */}
          {venue.here_now === 0 && venue.heading_there > 0 && venue.next_run_at && (
            <Chip
              label={`Run ${relativeFuture(venue.next_run_at)}`}
              tone="info"
              compact
              icon="calendar-clock"
            />
          )}
        </View>

        <View style={styles.sportRow}>
          {(venue.sport_slugs ?? []).slice(0, 4).map((slug, index) => (
            <Chip
              key={slug}
              label={(venue.sport_names ?? [])[index] ?? slug}
              icon={sportIcon(slug) as IconName}
              compact
            />
          ))}
        </View>

        {blockingConditions.length > 0 && (
          <View style={styles.sportRow}>
            {blockingConditions.map((kind) => (
              <ConditionChip
                key={kind}
                icon={CONDITION_ICON[kind] as IconName}
                label={CONDITION_LABEL[kind]}
                blocking
              />
            ))}
          </View>
        )}

        <AppText variant="micro" tone="faint">
          {venue.here_now > 0
            ? `Updated ${relativeTime(venue.last_activity_at).toLowerCase()}`
            : venue.next_run_at
              ? `Next run ${relativeFuture(venue.next_run_at)}`
              : 'No recent activity'}
        </AppText>
      </View>
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  sportRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  dot: { width: 3, height: 3, borderRadius: 3 },
});
