import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, View } from 'react-native';

import { SportBadge } from '../../components/ui/brand';
import { AppText, Button, Chip, PressableSurface } from '../../components/ui/primitives';
import { timeOfDay, weekdayName } from '../../lib/format';
import { elevation, radius, space, usePalette } from '../../theme';
import type { UpcomingRun } from '../venues/api';
import type { useRunAttendance } from './api';

type Attendance = NonNullable<ReturnType<typeof useRunAttendance>['data']>[number];

/** The same real occurrence and attendance summary in Discover and Scheduled. */
export function SessionCard({
  item,
  response,
  hosting = false,
  pending = false,
  attendanceUnavailable = false,
  onRespond,
  onOpen,
  compact = false,
}: {
  item: UpcomingRun;
  response?: Attendance;
  hosting?: boolean;
  pending?: boolean;
  attendanceUnavailable?: boolean;
  onRespond: (response: 'going' | 'maybe') => void;
  onOpen?: () => void;
  compact?: boolean;
}) {
  const colors = usePalette();
  const title = item.title ?? `${item.sport_name} session`;
  const copy = (
    <View style={styles.summary}>
      <SportBadge slug={item.sport_slug} size={compact ? 42 : 50} />
      <View style={styles.copy}>
        <AppText variant={compact ? 'bodyStrong' : 'heading'} numberOfLines={2}>
          {title}
        </AppText>
        <View style={styles.detail}>
          <MaterialCommunityIcons name="map-marker-outline" size={14} color={colors.textMuted} />
          <AppText variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
            {item.venue_name}
          </AppText>
        </View>
        <View style={styles.detail}>
          <MaterialCommunityIcons name="clock-outline" size={14} color={colors.textMuted} />
          <AppText variant="caption" tone="muted" style={{ flex: 1 }}>
            {weekdayName(item.starts_at)} · {timeOfDay(item.starts_at)} – {timeOfDay(item.ends_at)}
          </AppText>
        </View>
      </View>
      {onOpen && <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textFaint} />}
    </View>
  );
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        elevation.card,
      ]}
    >
      {onOpen ? (
        <PressableSurface onPress={onOpen} accessibilityLabel={`Open ${title}`}>
          {copy}
        </PressableSurface>
      ) : (
        copy
      )}
      {!compact && item.description && (
        <AppText variant="body" tone="muted" numberOfLines={2}>
          {item.description}
        </AppText>
      )}
      <View style={styles.tags}>
        {hosting && <Chip label="Hosting" icon="account-star-outline" tone="live" compact />}
        {response?.my_response && (
          <Chip
            label={response.my_response === 'going' ? "You're going" : 'Maybe'}
            icon={response.my_response === 'going' ? 'check-circle' : 'clock-outline'}
            tone={response.my_response === 'going' ? 'live' : 'soon'}
            compact
          />
        )}
        {item.is_rescheduled && (
          <Chip label="Rescheduled" tone="soon" icon="calendar-edit" compact />
        )}
        {(item.indoor_state === 'indoor' || item.indoor_state === 'outdoor') && (
          <Chip
            label={item.indoor_state === 'indoor' ? 'Indoor' : 'Outdoor'}
            icon={item.indoor_state === 'indoor' ? 'home-outline' : 'tree-outline'}
            tone="live"
            compact
          />
        )}
        <AppText variant="caption" tone="muted">
          {attendanceUnavailable ? 'Attendance unavailable' : `${response?.going_count ?? 0} going`}
        </AppText>
      </View>
      {!compact && (
        <View style={[styles.actions, { borderTopColor: colors.border }]}>
          <Button
            label={response?.my_response === 'going' ? 'Going' : 'Join session'}
            icon={response?.my_response === 'going' ? 'check' : 'plus'}
            size="sm"
            onPress={() => (response?.my_response && onOpen ? onOpen() : onRespond('going'))}
            loading={pending}
            style={{ flex: 1 }}
          />
          <Button
            label={response?.my_response === 'maybe' ? 'Maybe ✓' : 'Maybe'}
            size="sm"
            variant="outline"
            tone="neutral"
            onPress={() => onRespond('maybe')}
            disabled={pending}
            style={{ flex: 1 }}
          />
        </View>
      )}
      {compact && !onOpen && (
        <Button
          label="Open session"
          variant="soft"
          size="sm"
          onPress={() => onRespond(response?.my_response === 'maybe' ? 'maybe' : 'going')}
          loading={pending}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.md,
  },
  summary: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  copy: { flex: 1, gap: 5 },
  detail: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tags: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
