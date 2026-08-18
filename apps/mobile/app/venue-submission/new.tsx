import { Body, ComingInPhase, Screen, Title } from '../../src/components/screen';

export default function NewVenueSubmissionScreen() {
  return (
    <Screen>
      <Title>Add a venue</Title>
      <Body>For a place that is not on the map yet.</Body>

      <ComingInPhase phase="Phase 5">
        Before this form opens it will show every active venue within 150 m and ask “is it one of
        these?” — most duplicates come from someone not finding an entry that is unnamed, and 606 of
        627 pitches in the London sample had no name at all. Preventing the duplicate beats cleaning
        it up afterwards.
      </ComingInPhase>
    </Screen>
  );
}
