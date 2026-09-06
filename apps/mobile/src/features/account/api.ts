import type { FunctionReturns } from '@dropin/database-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';

export type AccountProfile = FunctionReturns<'current_profile'>;

export function useAccountProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['account-profile', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<AccountProfile> => {
      const { data, error } = await supabase.rpc('current_profile');
      if (error) throw error;
      if (!data) throw new Error('Your profile could not be found.');
      return data;
    },
  });
}

export function useAccountSports(userId: string | undefined) {
  return useQuery({
    queryKey: ['account-sports', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<number[]> => {
      const { data, error } = await supabase
        .from('profile_sports')
        .select('sport_id')
        .eq('profile_id', userId!);
      if (error) throw error;
      return data.map((row) => row.sport_id);
    },
  });
}

export function useUpdateAccount(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { displayName: string; sportIds: number[] }) => {
      const { data, error } = await supabase.rpc('update_own_profile', {
        p_display_name: input.displayName,
        p_sport_ids: input.sportIds,
        p_complete_onboarding: true,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['account-profile', userId] }),
        queryClient.invalidateQueries({ queryKey: ['account-sports', userId] }),
      ]);
    },
  });
}
