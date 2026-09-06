import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

/** The callback must match supabase/config.toml and hosted Auth settings. */
export function authRedirectUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/callback`;
  }
  return Linking.createURL('/callback');
}
