import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { Screen } from '../../src/components/screen';
import { BrandMark } from '../../src/components/ui/brand';
import { CourtArt } from '../../src/components/ui/court-art';
import { AppText, Button } from '../../src/components/ui/primitives';
import { SignInForm } from '../../src/features/auth/sign-in-form';
import { useSession } from '../../src/providers/auth-context';
import { space } from '../../src/theme';

export default function SignInScreen() {
  const router = useRouter();
  const { accountDeleted } = useLocalSearchParams<{ accountDeleted?: string }>();
  const { session } = useSession();
  if (session) return <Redirect href="/profile" />;
  return (
    <Screen>
      {accountDeleted === 'true' && (
        <AppText tone="live">Your account and its data have been deleted.</AppText>
      )}
      <View style={{ paddingVertical: space.md }}>
        <BrandMark size={36} showTagline />
      </View>
      <CourtArt height={220} />
      <View style={{ gap: space.sm, paddingVertical: space.md }}>
        <AppText variant="display">Good games.{'\n'}Great company.</AppText>
        <AppText tone="muted">
          Find local sports, join a session, and meet your people. Everyone starts somewhere.
        </AppText>
      </View>
      <SignInForm />
      <Button
        label="Explore without an account"
        icon="arrow-right"
        tone="neutral"
        variant="outline"
        onPress={() => router.replace('/')}
      />
      <AppText
        variant="caption"
        tone="muted"
        style={{ textAlign: 'center', paddingVertical: space.md }}
      >
        Local sports. Real people. Right now.
      </AppText>
    </Screen>
  );
}
