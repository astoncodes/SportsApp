import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import VenueMap from '../../components/map/venue-map';
import { EmptyState, Skeleton } from '../../components/ui/activity';
import { AppText, Button, Chip, IconButton } from '../../components/ui/primitives';
import { relativeTime, timeOfDay, weekdayName } from '../../lib/format';
import { useSession } from '../../providers/auth-context';
import { radius, space, usePalette, useThemeName } from '../../theme';
import {
  useJoinSession,
  useSessionControls,
  useSendMessage,
  useSessionMessages,
  useSessionOverview,
} from './api';

import { SessionPhotoComposer } from './session-photo-composer';
import { SessionEditForm } from './session-edit-form';

export function SessionScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const colors = usePalette();
  const scheme = useThemeName();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useSession();
  const overview = useSessionOverview(sessionId, session?.user.id);
  const messages = useSessionMessages(overview.data?.isMember ? sessionId : undefined);
  const join = useJoinSession();
  const send = useSendMessage(sessionId, session?.user.id ?? '');
  const [body, setBody] = useState('');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const controls = useSessionControls(sessionId);
  const [editing, setEditing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'cancel' | 'leave' | null>(null);
  const [actionError, setActionError] = useState('');
  async function confirmControl() {
    setActionError('');
    try {
      if (confirmAction === 'cancel') await controls.cancel.mutateAsync();
      else if (confirmAction === 'leave') {
        await controls.leave.mutateAsync();
        setBody('');
      }
      setConfirmAction(null);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : ((error as { message?: string })?.message ?? 'Please try again.'),
      );
    }
  }

  function reportError(error: unknown) {
    Alert.alert(
      'Couldn’t complete that action',
      error instanceof Error ? error.message : 'Please try again.',
    );
  }

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
  const cancelled = Boolean(item.cancelled_at);
  const ended = new Date(item.ends_at).getTime() <= now;
  const busy = controls.cancel.isPending || controls.leave.isPending || controls.edit.isPending;
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

        {cancelled && (
          <View style={styles.joinBlock}>
            <AppText variant="heading">Session cancelled</AppText>
            <AppText variant="body" tone="muted">
              This session is no longer happening. Existing chat and posts are kept for reference.
            </AppText>
          </View>
        )}
        <View style={{ padding: space.lg, gap: space.sm }}>
          {item.isOrganizer && !cancelled && !ended && (
            <>
              {new Date(item.starts_at).getTime() > now && (
                <Button
                  label="Edit session"
                  icon="pencil"
                  tone="neutral"
                  variant="soft"
                  disabled={busy}
                  onPress={() => {
                    setEditing(!editing);
                    setConfirmAction(null);
                  }}
                />
              )}
              <Button
                label="Cancel session"
                icon="calendar-remove"
                tone="neutral"
                variant="soft"
                disabled={busy}
                onPress={() => {
                  setConfirmAction('cancel');
                  setEditing(false);
                  setActionError('');
                }}
              />
            </>
          )}
          {item.isMember && !cancelled && (!item.isOrganizer || cancelled || ended) && (
            <Button
              label="Leave session"
              icon="exit-to-app"
              tone="neutral"
              variant="soft"
              disabled={busy}
              onPress={() => {
                setConfirmAction('leave');
                setActionError('');
              }}
            />
          )}
          {confirmAction && (
            <>
              <AppText variant="body">
                {confirmAction === 'cancel'
                  ? 'Cancel this occurrence for everyone? Other weeks stay scheduled. This cannot be undone.'
                  : 'Leave this session? You will lose chat access. Your existing messages and posts will remain.'}
              </AppText>
              {actionError ? (
                <View accessibilityRole="alert">
                  <AppText variant="body">{actionError}</AppText>
                </View>
              ) : null}
              <Button
                label={confirmAction === 'cancel' ? 'Yes, cancel session' : 'Yes, leave session'}
                loading={busy}
                onPress={() => void confirmControl()}
              />
              <Button
                label="Keep session"
                tone="neutral"
                variant="soft"
                disabled={busy}
                onPress={() => setConfirmAction(null)}
              />
            </>
          )}
        </View>
        {editing && item.isOrganizer && !cancelled && (
          <SessionEditForm
            item={item}
            pending={controls.edit.isPending}
            onSave={controls.edit.mutateAsync}
            onClose={() => setEditing(false)}
          />
        )}

        {item.latitude !== null && item.longitude !== null && (
          <View style={{ padding: space.lg, gap: space.sm }}>
            <View
              style={{
                height: 180,
                position: 'relative',
                borderRadius: radius.md,
                overflow: 'hidden',
              }}
            >
              <VenueMap
                colorScheme={scheme}
                region={{
                  latitude: item.latitude,
                  longitude: item.longitude,
                  latitudeDelta: 0.012,
                  longitudeDelta: 0.012,
                }}
                markers={[
                  {
                    id: item.id,
                    latitude: item.latitude,
                    longitude: item.longitude,
                    label: item.venueName,
                    sportSlug: item.sportSlug,
                    count: 0,
                    isLive: false,
                    isPending: true,
                    kind: 'session' as const,
                  },
                ]}
              />
            </View>
            <Button
              label="Directions to meeting spot"
              icon="directions"
              tone="neutral"
              variant="soft"
              onPress={() => {
                void Linking.openURL(
                  `https://www.google.com/maps/dir/?api=1&destination=${item.latitude},${item.longitude}&dir_action=navigate`,
                ).catch(reportError);
              }}
            />
          </View>
        )}

        {!item.isMember ? (
          !cancelled && !ended ? (
            <View style={styles.joinBlock}>
              <EmptyState
                icon="message-lock-outline"
                title="Join to open the chat"
                body="Only people joining this dated session can read or send messages."
              />
              <Button
                label={session ? 'Join session' : 'Sign in to join'}
                icon="account-plus"
                onPress={() => void handleJoin().catch(reportError)}
                loading={join.isPending}
              />
            </View>
          ) : null
        ) : (
          <>
            {!cancelled && (
              <View style={styles.tools}>
                <SessionPhotoComposer
                  sessionId={sessionId}
                  userId={session?.user.id ?? ''}
                  onPublished={() => router.push('/feed')}
                />
              </View>
            )}
            <View style={styles.messages}>
              <AppText variant="heading">Session chat</AppText>
              {messages.isError ? (
                <EmptyState
                  icon="alert-circle-outline"
                  title="Couldn’t load chat"
                  body={messages.error.message}
                />
              ) : messages.isPending ? (
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

      {item.isMember && !cancelled && (
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
            onPress={() => void handleSend().catch(reportError)}
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
