import { useQuery } from '@tanstack/react-query';

import { useSession } from './auth-context';
import { supabase } from './supabase';

/**
 * Whether the signed-in user is an admin.
 *
 * The answer comes from the database via is_admin(), never from anything this
 * bundle decides for itself. Hiding the review UI is a courtesy to the user;
 * the actual enforcement is RLS on every table the UI would touch, so a user
 * who forced this to return true would still be refused by Postgres.
 */
export function useIsAdmin() {
  const { session, isLoading: isSessionLoading } = useSession();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['is-admin', userId],
    enabled: !isSessionLoading && Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_admin');
      if (error) throw error;
      return data === true;
    },
  });
}
