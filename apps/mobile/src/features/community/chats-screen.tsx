import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SportBadge } from '../../components/ui/brand';
import { EmptyState, Skeleton } from '../../components/ui/activity';
import { AppText, Button, PressableSurface } from '../../components/ui/primitives';
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
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + space.lg,
        paddingBottom: space.xxl,
        width: '100%',
        maxWidth: 760,
        alignSelf: 'center',
      }}
      refreshControl={
        session ? (
          <RefreshControl
            refreshing={chats.isRefetching}
            onRefresh={() => void chats.refetch()}
            tintColor={colors.live}
          />
        ) : undefined
      }
    >
      <View style={styles.heading}>
        <AppText variant="display">Chats</AppText>
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
      ) : chats.isError ? (
        <EmptyState
          icon="wifi-off"
          title="Could not load chats"
          body="Check your connection and try again."
          action={<Button label="Try again" onPress={() => void chats.refetch()} />}
        />
      ) : chats.data?.length ? (
        <View style={styles.list}>
          {chats.data.map((chat) => (
            <PressableSurface
              key={chat.id}
              onPress={() =>
                router.push({
                  pathname: '/session/[sessionId]',
                  params: { sessionId: chat.id, tab: 'chat' },
                })
              }
              accessibilityLabel={`Open ${chat.title} chat`}
            >
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  elevation.card,
                ]}
              >
                <SportBadge slug={chat.sportSlug} size={48} />
                <View style={{ flex: 1, gap: 3 }}>
                  <AppText variant="heading" numberOfLines={1}>
                    {chat.cancelled_at ? `Cancelled · ${chat.title}` : chat.title}
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
            body="Join a session in Discover and its private chat will appear here."
          />
          <Button label="Browse sessions" onPress={() => router.push('/feed')} />
        </View>
      )}
    </ScrollView>
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
