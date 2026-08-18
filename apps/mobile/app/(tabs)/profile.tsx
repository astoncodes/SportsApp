import { Link } from 'expo-router';

import { Body, ComingInPhase, Screen, Title } from '../../src/components/screen';
import { useSession } from '../../src/providers/auth-context';
import { usePalette } from '../../src/theme';

export default function ProfileScreen() {
  const colors = usePalette();
  const { session, isLoading } = useSession();

  return (
    <Screen>
      <Title>Profile</Title>

      {isLoading && <Body>Reading your saved session…</Body>}

      {!isLoading && session && <Body>Signed in as {session.user.email}.</Body>}

      {!isLoading && !session && (
        <>
          <Body>
            You are browsing without an account. That is allowed — you only need to sign in to check
            in, post a run, or add a venue.
          </Body>
          <Link href="/sign-in" style={{ color: colors.accent }}>
            Sign in →
          </Link>
        </>
      )}

      <ComingInPhase phase="Phase 2">
        Display name, avatar, and the sports you play — which become your default map filters.
      </ComingInPhase>
    </Screen>
  );
}
