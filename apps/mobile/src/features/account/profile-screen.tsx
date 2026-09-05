import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Body, Screen, Title } from '../../components/screen';
import { AppText, Button } from '../../components/ui/primitives';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../providers/auth-context';
import { ProfileForm } from './profile-form';

export function ProfileAccountScreen() {
  const router = useRouter();
  const { session, isLoading } = useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function signOut() {
    setIsSigningOut(true);
    setSignOutError(null);
    const { error } = await supabase.auth.signOut();
    if (error) setSignOutError(error.message);
    setIsSigningOut(false);
  }

  return (
    <Screen>
      <Title>Profile</Title>
      {isLoading && <Body>Reading your saved session…</Body>}
      {!isLoading && !session && (
        <>
          <Body>
            Browse freely without an account. Sign in when you want to check in, post a run, or add
            a venue.
          </Body>
          <Button
            label="Sign in or create account"
            icon="login"
            onPress={() => router.push('/sign-in')}
          />
        </>
      )}
      {session && (
        <>
          <AppText variant="caption" tone="muted">
            Signed in as {session.user.email}
          </AppText>
          <ProfileForm userId={session.user.id} />
          {signOutError && <AppText tone="alert">{signOutError}</AppText>}
          <Button
            label="Sign out"
            icon="logout"
            tone="neutral"
            variant="outline"
            onPress={signOut}
            loading={isSigningOut}
          />
        </>
      )}
    </Screen>
  );
}
