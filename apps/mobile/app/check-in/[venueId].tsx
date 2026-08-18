import { useLocalSearchParams } from 'expo-router';

import { Body, ComingInPhase, Screen, Title } from '../../src/components/screen';

export default function CheckInScreen() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>();

  return (
    <Screen>
      <Title>Check in</Title>
      <Body>venue: {venueId}</Body>

      <ComingInPhase phase="Phase 3">
        Duration, party size, and an optional short note, gated on a recent location reading within
        250 m. The submitted coordinate is used inside the transaction and then discarded — only the
        distance, the reported accuracy, and the verdict are stored.
      </ComingInPhase>
    </Screen>
  );
}
