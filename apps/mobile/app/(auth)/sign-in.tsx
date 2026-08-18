import { Body, ComingInPhase, Screen, Title } from '../../src/components/screen';

/**
 * Sign-in placeholder.
 *
 * The auth method is still an open owner decision (docs/product-rules.md
 * §Open decisions), with email one-time code as the recommended default and
 * social sign-in later. Building the form now would mean guessing, so this
 * route exists and says so.
 */
export default function SignInScreen() {
  return (
    <Screen>
      <Title>Sign in</Title>
      <Body>
        You only need an account to check in, post a run, or add a venue. Browsing works without
        one.
      </Body>

      <ComingInPhase phase="Phase 2">
        Email one-time code, then session persistence through the device keychain. The storage
        adapter is already built — see src/lib/secure-storage.ts.
      </ComingInPhase>
    </Screen>
  );
}
