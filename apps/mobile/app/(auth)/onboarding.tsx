import { Body, ComingInPhase, Screen, Title } from '../../src/components/screen';

export default function OnboardingScreen() {
  return (
    <Screen>
      <Title>Pick your sports</Title>
      <Body>What you choose here becomes your default filter on the map.</Body>

      <ComingInPhase phase="Phase 2">
        Writes to profile_sports, which is owner-private: nobody else can read what sports you
        follow. The profile row itself already exists — it is created automatically on signup.
      </ComingInPhase>
    </Screen>
  );
}
