import { Body, Screen, Title } from '../../src/components/screen';
import { SignInForm } from '../../src/features/auth/sign-in-form';

/**
 * Passwordless Supabase email sign-in. Browsing remains available without an
 * account; this route is used only when somebody chooses an account action.
 */
export default function SignInScreen() {
  return (
    <Screen>
      <Title>Sign in</Title>
      <Body>
        You only need an account to check in, post a run, or add a venue. Browsing works without
        one.
      </Body>

      <SignInForm />
    </Screen>
  );
}
