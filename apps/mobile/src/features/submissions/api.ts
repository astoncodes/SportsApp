import type { FunctionReturns } from '@dropin/database-types';
import type { IndoorState } from '@dropin/shared';
import { useMutation } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';

export type VenueSubmissionInput = {
  name: string;
  latitude: number;
  longitude: number;
  sportIds: number[];
  indoorState: IndoorState;
  addressText?: string;
};

export type VenueSubmissionResult = FunctionReturns<'submit_venue'>[number];

export function useSubmitVenue() {
  return useMutation({
    mutationFn: async (input: VenueSubmissionInput): Promise<VenueSubmissionResult> => {
      const { data, error } = await supabase.rpc('submit_venue', {
        p_name: input.name,
        p_lat: input.latitude,
        p_lon: input.longitude,
        p_sport_ids: input.sportIds,
        p_indoor_state: input.indoorState,
        p_address_text: input.addressText,
      });
      if (error) throw new Error(error.message);
      if (!data?.[0]) throw new Error('The submission did not return a confirmation.');
      return data[0];
    },
  });
}
