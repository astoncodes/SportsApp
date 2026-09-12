import { useLocalSearchParams } from 'expo-router';

import { CheckInScreen } from '../../src/features/presence/check-in-screen';

export default function CheckInRoute() {
  const { venueId, arrival } = useLocalSearchParams<{ venueId: string; arrival?: string }>();
  return <CheckInScreen venueId={venueId} initialArrival={arrival === 'true'} />;
}
