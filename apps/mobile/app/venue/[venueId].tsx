import { useLocalSearchParams } from 'expo-router';

import { Body, ComingInPhase, Screen, Title } from '../../src/components/screen';

export default function VenueScreen() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>();

  return (
    <Screen>
      <Title>Venue</Title>
      <Body>id: {venueId}</Body>

      <ComingInPhase phase="Phase 2 · 3">
        Venue detail: supported sports, who is currently checked in, and the check-in button. A
        merged venue id will resolve to its canonical venue rather than 404ing, so old links and old
        check-ins keep working after a merge.
      </ComingInPhase>
    </Screen>
  );
}
