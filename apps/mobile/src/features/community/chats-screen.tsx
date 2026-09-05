import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, Skeleton } from '../../components/ui/activity';
import { AppText, Button, PressableSurface, sportIcon } from '../../components/ui/primitives';
import { relativeTime, timeOfDay, weekdayName } from '../../lib/format';
import { useSession } from '../../providers/auth-context';
import { elevation, radius, space, usePalette } from '../../theme';
import { useJoinedSessions } from './api';

export function ChatsScreen() {
  const colors = usePalette();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, isLoading } = useSession();
  const chats = useJoinedSessions(session?.user.id);

  return (
    <View
      style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + space.lg }}
    >
      <View style={styles.heading}>
        <AppText variant="display">Session chats</AppText>
        <AppText variant="body" tone="muted">
          Private conversations for sessions you joined.
        </AppText>
      </View>

      {isLoading || (Boolean(session) && chats.isPending) ? (
        <View style={styles.list}>
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} height={88} />
          ))}
        </View>
      ) : !session ? (
        <View style={styles.empty}>
          <EmptyState
            icon="message-lock-outline"
            title="Sign in to see chats"
            body="Your session conversations stay private to people who joined."
          />
          <Button label="Sign in" onPress={() => router.push('/sign-in')} />
        </View>
      ) : chats.data?.length ? (
        <View style={styles.list}>
          {chats.data.map((chat) => (
            <PressableSurface
              key={chat.id}
              onPress={() => router.push(`/session/${chat.id}`)}
              accessibilityLabel={`Open ${chat.title} chat`}
            >
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  elevation.card,
                ]}
              >
                <View style={[styles.icon, { backgroundColor: colors.liveSoft }]}>
                  <MaterialCommunityIcons
                    name={sportIcon(chat.sportSlug)}
                    size={24}
                    color={colors.live}
                  />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <AppText variant="heading" numberOfLines={1}>
                    {chat.title}
                  </AppText>
                  <AppText variant="caption" tone="muted" numberOfLines={1}>
                    {chat.lastMessage?.body ??
                      `${chat.venueName} · ${weekdayName(chat.starts_at)} ${timeOfDay(chat.starts_at)}`}
                  </AppText>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 8 }}>
                  {chat.lastMessage && (
                    <AppText variant="micro" tone="faint">
                      {relativeTime(chat.lastMessage.created_at)}
                    </AppText>
                  )}
                  <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textFaint} />
                </View>
              </View>
            </PressableSurface>
          ))}
        </View>
      ) : (
        <View style={styles.empty}>
          <EmptyState
            icon="calendar-heart"
            title="No session chats yet"
            body="Join a run from Scheduled and its private chat will appear here."
          />
          <Button label="Browse sessions" onPress={() => router.push('/scheduled')} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { paddingHorizontal: space.lg, gap: 3, marginBottom: space.xl },
  list: { paddingHorizontal: space.lg, gap: space.md },
  empty: { padding: space.lg, gap: space.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
  },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
