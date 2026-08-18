import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Body, ComingInPhase, Screen, Title } from '../../src/components/screen';
import { supabase } from '../../src/lib/supabase';
import { radius, spacing } from '../../src/theme';
import { usePalette } from '../../src/theme/use-palette';

/**
 * Live tab — eventually the map of who is playing right now.
 *
 * For Phase 0 it queries the sports lookup instead of faking venues. That is a
 * real round trip: it proves the device reaches Supabase, that the anonymous
 * key works, that RLS lets an unauthenticated reader see active sports, and
 * that the generated types match the live schema. A mocked map would prove
 * none of those things.
 */
export default function LiveScreen() {
  const colors = usePalette();

  const sports = useQuery({
    queryKey: ['sports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sports')
        .select('id, slug, name')
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  return (
    <Screen>
      <Title>Live</Title>
      <Body>Nobody is checked in anywhere, because check-ins do not exist yet.</Body>

      <ComingInPhase phase="Phase 2 · 3">
        This becomes the venue map and list, filtered by the sports you play, with live check-in
        counts per venue.
      </ComingInPhase>

      <Title>Connection check</Title>

      {sports.isPending && <Body>Contacting Supabase…</Body>}

      {sports.isError && (
        <View
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={{ color: colors.text, fontWeight: '600' }}>Could not reach Supabase</Text>
          <Body>{(sports.error as Error).message}</Body>
          <Body>
            If you are on a simulator or a physical device, 127.0.0.1 points at the device itself.
            Set EXPO_PUBLIC_SUPABASE_URL to your machine LAN IP.
          </Body>
        </View>
      )}

      {sports.data && (
        <View
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Body>{sports.data.length} active sports loaded from the database:</Body>
          {sports.data.map((sport) => (
            <Text key={sport.id} style={{ color: colors.text }}>
              · {sport.name}
            </Text>
          ))}
        </View>
      )}

      <Link href="/sign-in" style={{ color: colors.accent, paddingVertical: spacing.sm }}>
        Sign in →
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
});
