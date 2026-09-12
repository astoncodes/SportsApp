import type { Tables } from '@dropin/database-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { supabase } from '../../lib/supabase';

// Removes expired rows even when no server event arrives. Polling separately
// reconciles other players' checkouts and arrivals.
export function usePresenceClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 1000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
  return now;
}

export function useOwnPresence(userId: string | undefined) {
  return useQuery({
    queryKey: ['own-presence', userId],
    enabled: Boolean(userId),
    staleTime: 0,
    refetchInterval: 15_000,
    queryFn: async (): Promise<{
      checkIn: Tables<'check_ins'> | null;
      arrival: Tables<'arrival_intents'> | null;
    }> => {
      const now = new Date().toISOString();
      const [checkIns, arrivals] = await Promise.all([
        supabase
          .from('check_ins')
          .select('*')
          .eq('user_id', userId!)
          .is('ended_at', null)
          .gt('expires_at', now)
          .maybeSingle(),
        supabase
          .from('arrival_intents')
          .select('*')
          .eq('user_id', userId!)
          .is('cancelled_at', null)
          .is('fulfilled_by_check_in_id', null)
          .gt('expires_at', now)
          .maybeSingle(),
      ]);
      if (checkIns.error) throw checkIns.error;
      if (arrivals.error) throw arrivals.error;
      return { checkIn: checkIns.data, arrival: arrivals.data };
    },
  });
}

type PresenceAction =
  | {
      kind: 'check-in';
      venueId: string;
      sportId: number;
      latitude: number;
      longitude: number;
      accuracy: number;
      observedAt: string;
      minutes: number;
      partySize: number;
      note: string;
    }
  | { kind: 'arrive'; venueId: string; sportId: number; minutes: number }
  | { kind: 'checkout'; id: string }
  | { kind: 'extend'; id: string }
  | { kind: 'cancel-arrival'; id: string };

export function usePresenceAction() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: async (action: PresenceAction) => {
      const result = await (() => {
        switch (action.kind) {
          case 'check-in':
            return supabase.rpc('create_check_in', {
              p_venue_id: action.venueId,
              p_sport_id: action.sportId,
              p_lat: action.latitude,
              p_lon: action.longitude,
              p_accuracy: action.accuracy,
              p_observed_at: action.observedAt,
              p_duration_minutes: action.minutes,
              p_party_size: action.partySize,
              p_note: action.note,
            });
          case 'arrive':
            return supabase.rpc('set_arrival_intent', {
              p_venue_id: action.venueId,
              p_sport_id: action.sportId,
              p_eta_minutes: action.minutes,
            });
          case 'checkout':
            return supabase.rpc('end_check_in', { p_check_in_id: action.id });
          case 'extend':
            return supabase.rpc('extend_check_in', { p_check_in_id: action.id, p_minutes: 30 });
          case 'cancel-arrival':
            return supabase.rpc('cancel_arrival_intent', { p_intent_id: action.id });
        }
      })();
      if (result.error) throw result.error;
    },
    onSuccess: async () => {
      await Promise.all(
        ['own-presence', 'nearby-venues', 'venue', 'venue-activity'].map((key) =>
          cache.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
}
