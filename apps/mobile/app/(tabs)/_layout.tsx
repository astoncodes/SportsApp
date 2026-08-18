import { Tabs } from 'expo-router';

import { usePalette } from '../../src/theme/use-palette';

/**
 * The three destinations from the product brief: what is happening now, what
 * is scheduled, and you.
 *
 * No icons yet — they arrive with real visual design in Phase 2, and a
 * placeholder icon set would only have to be thrown away.
 */
export default function TabsLayout() {
  const colors = usePalette();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Live' }} />
      <Tabs.Screen name="scheduled" options={{ title: 'Scheduled' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
