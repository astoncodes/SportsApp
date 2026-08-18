import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, spacing } from '../theme';
import { usePalette } from '../theme/use-palette';

/** Standard page frame: safe-area aware, scrollable, themed. */
export function Screen({ children }: { children: ReactNode }) {
  const colors = usePalette();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg },
      ]}
    >
      {children}
    </ScrollView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const colors = usePalette();
  return <Text style={[styles.title, { color: colors.text }]}>{children}</Text>;
}

export function Body({ children }: { children: ReactNode }) {
  const colors = usePalette();
  return <Text style={[styles.body, { color: colors.muted }]}>{children}</Text>;
}

/**
 * Marks a screen that exists as a route but has no behaviour yet.
 *
 * It names the phase that fills it in, so nobody has to guess whether they are
 * looking at something unfinished or something broken.
 */
export function ComingInPhase({ phase, children }: { phase: string; children: ReactNode }) {
  const colors = usePalette();

  return (
    <View style={[styles.note, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.phase, { color: colors.accent }]}>{phase}</Text>
      <Text style={[styles.body, { color: colors.muted }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  note: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  phase: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
