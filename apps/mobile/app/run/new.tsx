import { Body, ComingInPhase, Screen, Title } from '../../src/components/screen';

export default function NewRunScreen() {
  return (
    <Screen>
      <Title>New run</Title>
      <Body>A weekly slot that people can count on.</Body>

      <ComingInPhase phase="Phase 4">
        Weekday, local start and end time, and a renewal date at most 12 weeks out. Local time is
        stored rather than a single UTC instant, so a run stays at 7pm across a daylight-saving
        change instead of quietly moving to 6pm.
      </ComingInPhase>
    </Screen>
  );
}
