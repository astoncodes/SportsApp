import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, Skeleton } from '../../components/ui/activity';
import { AppText, Button, Chip, IconButton } from '../../components/ui/primitives';
import { relativeTime, timeOfDay, weekdayName } from '../../lib/format';
import { useSession } from '../../providers/auth-context';
import { radius, space, usePalette } from '../../theme';
import {
  useJoinSession,
  usePublishSessionPost,
  useSendMessage,
  useSessionMessages,
  useSessionOverview,
} from './api';

export function SessionScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const colors = usePalette();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useSession();
  const overview = useSessionOverview(sessionId, session?.user.id);
  const messages = useSessionMessages(overview.data?.isMember ? sessionId : undefined);
  const join = useJoinSession();
  const send = useSendMessage(sessionId, session?.user.id ?? '');
  const publish = usePublishSessionPost(sessionId, session?.user.id ?? '');
  const [body, setBody] = useState('');

  async function handleJoin() {
    if (!session) return router.push('/sign-in');
    const item = overview.data;
    if (!item) return;
    await join.mutateAsync({
      runSeriesId: item.run_series_id,
      occurrenceDate: item.occurrence_date,
    });
    await overview.refetch();
  }

  async function handleSend() {
    if (!body.trim()) return;
    await send.mutateAsync(body);
    setBody('');
  }

  async function handleShare() {
    const selection = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: true,
      videoMaxDuration: 30,
      quality: 0.85,
    });
    if (selection.canceled) return;
    const asset = selection.assets[0];
    const kind = asset.type === 'video' ? 'video' : 'image';
    await publish.mutateAsync({
      caption: kind === 'video' ? 'A quick clip from our session' : 'A moment from our session',
      asset: {
        uri: asset.uri,
        kind,
        mimeType: asset.mimeType ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
        width: asset.width,
        height: asset.height,
        durationSeconds: kind === 'video' ? (asset.duration ?? 0) / 1000 : undefined,
      },
    });
    router.push('/feed');
  }

  if (overview.isPending) {
    return (
      <View
        style={[
          styles.loading,
          { backgroundColor: colors.background, paddingTop: insets.top + space.lg },
        ]}
      >
        <Skeleton height={150} />
        <Skeleton height={300} />
      </View>
    );
  }

  if (!overview.data) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="calendar-remove"
          title="Session unavailable"
          body="This session may have been cancelled or removed."
        />
      </View>
    );
  }

  const item = overview.data;
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + space.lg,
          paddingBottom: item.isMember ? 110 : insets.bottom + space.xl,
        }}
      >
        <View style={styles.header}>
          <IconButton icon="arrow-left" label="Go back" onPress={() => router.back()} />
          <Chip label={item.sportName} compact />
          <AppText variant="display">{item.title}</AppText>
          <AppText variant="body" tone="muted">
            {item.venueName} · {weekdayName(item.starts_at)} at {timeOfDay(item.starts_at)}
          </AppText>
        </View>

        {!item.isMember ? (
          <View style={styles.joinBlock}>
            <EmptyState
              icon="message-lock-outline"
              title="Join to open the chat"
              body="Only people joining this dated session can read or send messages."
            />
            <Button
              label={session ? 'Join session' : 'Sign in to join'}
              icon="account-plus"
              onPress={handleJoin}
              loading={join.isPending}
            />
          </View>
        ) : (
          <>
            <View style={styles.tools}>
              <Button
                label="Share photo or clip"
                icon="image-plus"
                tone="neutral"
                variant="soft"
                onPress={handleShare}
                loading={publish.isPending}
              />
            </View>
            <View style={styles.messages}>
              <AppText variant="heading">Session chat</AppText>
              {messages.isPending ? (
                <Skeleton height={180} />
              ) : messages.data?.length ? (
                messages.data.map((message) => {
                  const mine = message.user_id === session?.user.id;
                  return (
                    <View
                      key={message.id}
                      style={[styles.messageRow, mine && { alignItems: 'flex-end' }]}
                    >
                      <AppText variant="micro" tone="muted">
                        {mine ? 'You' : message.authorName} · {relativeTime(message.created_at)}
                      </AppText>
                      <View
                        style={[
                          styles.bubble,
                          { backgroundColor: mine ? colors.live : colors.surfaceMuted },
                        ]}
                      >
                        <AppText variant="body" tone={mine ? 'inverse' : 'default'}>
                          {message.body}
                        </AppText>
                      </View>
                    </View>
                  );
                })
              ) : (
                <EmptyState
                  icon="message-outline"
                  title="Start the conversation"
                  body="Ask what to bring or where everyone is meeting."
                />
              )}
            </View>
          </>
        )}
      </ScrollView>

      {item.isMember && (
        <View
          style={[
            styles.composer,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              paddingBottom: Math.max(insets.bottom, space.sm),
            },
          ]}
        >
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Message the session…"
            placeholderTextColor={colors.textFaint}
            maxLength={1000}
            multiline
            style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceMuted }]}
          />
          <Button
            label="Send"
            icon="send"
            size="sm"
            onPress={handleSend}
            disabled={!body.trim()}
            loading={send.isPending}
          />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, padding: space.lg, gap: space.md },
  header: { paddingHorizontal: space.lg, gap: space.sm },
  joinBlock: { padding: space.lg, gap: space.lg },
  tools: { paddingHorizontal: space.lg, paddingVertical: space.xl, alignItems: 'flex-start' },
  messages: { paddingHorizontal: space.lg, gap: space.lg },
  messageRow: { gap: 4, alignItems: 'flex-start' },
  bubble: {
    maxWidth: '84%',
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: radius.lg,
  },
  composer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    padding: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 100,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 15,
  },
});
