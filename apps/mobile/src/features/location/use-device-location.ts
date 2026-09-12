import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { readDevicePosition } from './read-device-position';

export type LocationState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | {
      status: 'granted';
      coords: { latitude: number; longitude: number; accuracyM: number | null; observedAt: string };
    }
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
export function useDeviceLocation({ live = false }: { live?: boolean } = {}) {
  const [state, setState] = useState<LocationState>({ status: 'idle' });

  const granted = state.status === 'granted';
  useEffect(() => {
    if (!live || !granted) return;
    let disposed = false;
    let generation = 0;
    let subscription: Location.LocationSubscription | undefined;
    const stop = () => {
      generation += 1;
      subscription?.remove();
      subscription = undefined;
    };
    const start = async () => {
      stop();
      const current = generation;
      try {
        const watcher = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 5, timeInterval: 3000 },
          ({ coords, timestamp }) => {
            if (!disposed && current === generation)
              setState({
                status: 'granted',
                coords: {
                  latitude: coords.latitude,
                  longitude: coords.longitude,
                  accuracyM: coords.accuracy ?? null,
                  observedAt: new Date(timestamp).toISOString(),
                },
              });
          },
        );
        if (disposed || current !== generation) watcher.remove();
        else subscription = watcher;
      } catch {
        // Retain the last fix if live updates are temporarily unavailable.
      }
    };
    if (AppState.currentState === 'active' || AppState.currentState == null) void start();
    const listener = AppState.addEventListener('change', (next) => {
      if (next === 'active') void start();
      else stop();
    });
    return () => {
      disposed = true;
      stop();
      listener.remove();
    };
  }, [live, granted]);

  const request = useCallback(async () => {
    setState({ status: 'requesting' });

    try {
      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        setState({ status: 'denied', canAskAgain });
        return null;
      }

      const position = await readDevicePosition();

      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyM: position.coords.accuracy ?? null,
        observedAt: new Date(position.timestamp).toISOString(),
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
