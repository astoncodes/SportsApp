import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppText, Button } from '../../components/ui/primitives';
import { supabase } from '../../lib/supabase';
import { radius, space, usePalette } from '../../theme';
import { authRedirectUrl } from './redirect';

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; email: string }
  | { kind: 'error'; message: string };

export function SignInForm() {
  const colors = usePalette();
  const [email, setEmail] = useState('');
  const sending = useRef(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function sendLink() {
    const normalized = email.trim().toLocaleLowerCase('en-CA');
    if (sending.current) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setStatus({
        kind: 'error',
        message: 'Enter a valid email address to get your sign-in link.',
      });
      return;
    }
    sending.current = true;
    setStatus({ kind: 'sending' });
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: { emailRedirectTo: authRedirectUrl(), shouldCreateUser: true },
      });
      setStatus(
        error ? { kind: 'error', message: error.message } : { kind: 'sent', email: normalized },
      );
    } catch {
      setStatus({
        kind: 'error',
        message: 'Could not connect. Check your connection and try again.',
      });
    } finally {
      sending.current = false;
    }
  }

  if (status.kind === 'sent') {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <AppText variant="heading">Check your email</AppText>
        <AppText variant="body" tone="muted">
          We sent a secure sign-in link to {status.email}. The link signs you in and returns you to
          Drop In.
        </AppText>
        <Button
          label="Use a different email"
          tone="neutral"
          variant="outline"
          onPress={() => setStatus({ kind: 'idle' })}
        />
      </View>
    );
  }

  return (
    <View style={{ gap: space.md }}>
      <AppText variant="bodyStrong">Your email address</AppText>
      <TextInput
        value={email}
        editable={status.kind !== 'sending'}
        onChangeText={setEmail}
        onSubmitEditing={sendLink}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        returnKeyType="send"
        placeholder="you@example.com"
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="Email address"
        style={[
          styles.input,
          { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      />
      {status.kind === 'error' && <AppText tone="alert">{status.message}</AppText>}
      <Button
        label="Continue with email"
        icon="email-fast-outline"
        onPress={sendLink}
        loading={status.kind === 'sending'}
        disabled={!email.trim()}
      />
      <AppText variant="caption" tone="faint">
        No password required. The link expires and can only be used to access your account.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 52,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    fontSize: 16,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    padding: space.lg,
    gap: space.lg,
  },
});
