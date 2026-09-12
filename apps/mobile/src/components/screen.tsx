import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space as spacing, usePalette } from '../theme';

/** Standard page frame: safe-area aware, scrollable, themed. */
export function Screen({ children }: { children: ReactNode }) {
  const colors = usePalette();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
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
  return <Text style={[styles.body, { color: colors.textMuted }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    flexGrow: 1,
    gap: spacing.md,
  },
  title: {
    fontSize: 32,
    letterSpacing: -1,
    fontWeight: '700',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
});
