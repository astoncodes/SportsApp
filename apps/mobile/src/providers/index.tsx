import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import type { Session } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import type { AuthState } from './auth-context';
import { AuthContext } from './auth-context';

/**
 * Every provider the app needs, composed once.
 *
 * Session state lives here and nowhere else (docs/architecture.md §Client
 * state). There is deliberately no global state store — add one only if state
 * ever genuinely spans unrelated features.
 */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Live presence is refreshed by Realtime invalidation and by explicit
      // refetch on foreground, not by polling.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (isActive) setSession(data.session);
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      isActive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const auth = useMemo<AuthState>(() => ({ session, isLoading }), [session, isLoading]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext value={auth}>{children}</AuthContext>
    </QueryClientProvider>
  );
}
