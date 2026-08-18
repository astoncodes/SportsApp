import type { Session } from '@supabase/supabase-js';
import { createContext, useContext } from 'react';

export type AuthState = {
  session: Session | null;
  /** True until the stored session has been read back from the keychain. */
  isLoading: boolean;
};

export const AuthContext = createContext<AuthState | null>(null);

/** The single answer to "is somebody signed in". */
export function useSession(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useSession must be used inside <AppProviders>.');
  }
  return context;
}
