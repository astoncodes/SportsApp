import type { Session } from '@supabase/supabase-js';
import { createContext, useContext } from 'react';

export type AuthState = {
  session: Session | null;
  /** True until the initial session lookup settles. */
  isLoading: boolean;
};

/**
 * Separate from the provider component so that `auth.tsx` exports only a
 * component — otherwise React Fast Refresh cannot hot-reload this module.
 */
export const AuthContext = createContext<AuthState | null>(null);

export function useSession(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useSession must be used inside <AuthProvider>.');
  }
  return context;
}
