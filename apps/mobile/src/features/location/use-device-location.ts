import * as Location from 'expo-location';
import { useCallback, useState } from 'react';

export type LocationState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'granted'; coords: { latitude: number; longitude: number; accuracyM: number | null } }
  | { status: 'denied'; canAskAgain: boolean }
  | { status: 'unavailable'; message: string };

/**
 * Foreground location, requested only at the moment it is needed.
 *
 * Denial is a first-class outcome, not an error. Browsing venues and reading
 * scheduled runs work perfectly without location — the only thing it gates is
 * "I'm here", which genuinely cannot be verified any other way. An app that
 * blocks its own map behind a permission prompt teaches people to deny it.
 */
export function useDeviceLocation() {
  const [state, setState] = useState<LocationState>({ status: 'idle' });

  const request = useCallback(async () => {
    setState({ status: 'requesting' });

    try {
      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        setState({ status: 'denied', canAskAgain });
        return null;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyM: position.coords.accuracy ?? null,
      };
      setState({ status: 'granted', coords });
      return coords;
    } catch (error) {
      // Browsers without geolocation, simulators with no fix set, airplane
      // mode. None of these should look like a bug to the user.
      setState({
        status: 'unavailable',
        message: error instanceof Error ? error.message : 'Location is unavailable right now.',
      });
      return null;
    }
  }, []);

  return { state, request };
}
