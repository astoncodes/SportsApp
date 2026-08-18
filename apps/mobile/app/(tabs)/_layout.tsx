import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';

import { usePalette } from '../../src/theme/use-palette';

/**
 * The three destinations from the product brief: what is happening now, what
 * is scheduled, and you.
 *
 * Icons are supplied explicitly. React Navigation falls back to a placeholder
 * triangle when `tabBarIcon` is omitted, which renders as a broken-looking ▼ in
 * every tab — worse than having no icon at all.
 *
 * Outline when inactive, solid when focused: the platform convention, and it
 * gives the active tab a second signal beyond colour, which matters for anyone
 * who cannot easily distinguish the accent from the muted tone.
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
      <Tabs.Screen
        name="index"
        options={{
          title: 'Live',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'flash' : 'flash-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="scheduled"
        options={{
          title: 'Scheduled',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
