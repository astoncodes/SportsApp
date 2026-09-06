import { useState } from 'react';
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
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function sendLink() {
    const normalized = email.trim().toLocaleLowerCase('en-CA');
    if (!normalized) return;

    setStatus({ kind: 'sending' });
    const { error } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: {
        emailRedirectTo: authRedirectUrl(),
        shouldCreateUser: true,
      },
    });

    setStatus(
      error ? { kind: 'error', message: error.message } : { kind: 'sent', email: normalized },
    );
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
      <TextInput
        value={email}
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
        label="Email me a sign-in link"
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
