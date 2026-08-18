import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProviders } from '../src/providers';

/**
 * Root layout.
 *
 * Route files assemble screens; they hold no data access or business rules
 * (docs/architecture.md §Repository scaffold). Browsing is allowed without an
 * account, so there is no redirect to sign-in here — the gate goes on the
 * actions that require identity (checking in, posting a run, submitting a
 * venue), which arrive in Phase 3.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProviders>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" options={{ presentation: 'modal' }} />
          <Stack.Screen name="venue/[venueId]" options={{ headerShown: true, title: 'Venue' }} />
          <Stack.Screen
            name="check-in/[venueId]"
            options={{ headerShown: true, title: 'Check in', presentation: 'modal' }}
          />
          <Stack.Screen
            name="run/new"
            options={{ headerShown: true, title: 'New run', presentation: 'modal' }}
          />
          <Stack.Screen
            name="venue-submission/new"
            options={{ headerShown: true, title: 'Add a venue', presentation: 'modal' }}
          />
        </Stack>
      </AppProviders>
    </SafeAreaProvider>
  );
}
