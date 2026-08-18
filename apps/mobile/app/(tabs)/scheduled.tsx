import { Body, ComingInPhase, Screen, Title } from '../../src/components/screen';

/**
 * Scheduled tab — recurring runs.
 *
 * This is the half of the product that has content before anyone checks in:
 * a "Tuesday 7pm regulars" listing works with zero live users.
 */
export default function ScheduledScreen() {
  return (
    <Screen>
      <Title>Scheduled</Title>
      <Body>Weekly runs near you.</Body>

      <ComingInPhase phase="Phase 4">
        Weekly recurring series with a finite renewal date, DST-correct local times, and the next 14
        days of occurrences. A series expires rather than misleading people for months after its
        organiser loses interest.
      </ComingInPhase>
    </Screen>
  );
}
