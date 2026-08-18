import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Accessibility preferences, read live rather than once at startup.
 *
 * Both can be toggled while the app is open — somebody turning on Reduce
 * Motion because our pulse animation is making them ill should not have to
 * restart. These are external mutable sources, so they are read with
 * `useSyncExternalStore` rather than mirrored into state inside an effect,
 * which would tear during concurrent rendering.
 *
 * Every entry point is feature-detected. `isReduceTransparencyEnabled` is
 * iOS-only in React Native core and does not exist on react-native-web, so
 * calling it unguarded crashes the entire web app on first render. A missing
 * API means "this platform cannot express the preference" — different from
 * "the user has not set it", but both resolve to the same safe default.
 */

type Store = {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => boolean;
};

function createPreferenceStore(
  read: (() => Promise<boolean>) | undefined,
  nativeEvent: 'reduceMotionChanged' | 'reduceTransparencyChanged',
  mediaQuery: string,
): Store {
  let value = false;
  const listeners = new Set<() => void>();

  const publish = (next: boolean) => {
    if (next === value) return;
    value = next;
    for (const listener of listeners) listener();
  };

  // Seed the value once. Until it resolves the answer is `false`, which is the
  // correct default: assume no preference rather than degrade for everyone.
  if (typeof read === 'function') {
    read()
      .then(publish)
      .catch(() => undefined);
  }

  if (typeof AccessibilityInfo.addEventListener === 'function' && typeof read === 'function') {
    AccessibilityInfo.addEventListener(nativeEvent, publish);
  }

  // react-native-web forwards neither preference, so the media queries are
  // read directly rather than the setting being silently ignored on web.
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia) {
    const query = window.matchMedia(mediaQuery);
    publish(query.matches);
    query.addEventListener('change', (event) => publish(event.matches));
  }

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getSnapshot: () => value,
  };
}

const reduceMotionStore = createPreferenceStore(
  typeof AccessibilityInfo.isReduceMotionEnabled === 'function'
    ? () => AccessibilityInfo.isReduceMotionEnabled()
    : undefined,
  'reduceMotionChanged',
  '(prefers-reduced-motion: reduce)',
);

const reduceTransparencyStore = createPreferenceStore(
  typeof AccessibilityInfo.isReduceTransparencyEnabled === 'function'
    ? () => AccessibilityInfo.isReduceTransparencyEnabled()
    : undefined,
  'reduceTransparencyChanged',
  '(prefers-reduced-transparency: reduce)',
);

/** True when the user has asked for less movement. Fade, don't slide. */
export function useReduceMotion(): boolean {
  return useSyncExternalStore(
    reduceMotionStore.subscribe,
    reduceMotionStore.getSnapshot,
    () => false,
  );
}

/**
 * True when the user has asked for less transparency.
 *
 * The switch that turns every glass surface opaque. Ignoring it is how a
 * blurred navigation bar becomes unreadable for exactly the people who enabled
 * the setting because blurred chrome is hard for them to read.
 */
export function useReduceTransparency(): boolean {
  return useSyncExternalStore(
    reduceTransparencyStore.subscribe,
    reduceTransparencyStore.getSnapshot,
    () => false,
  );
}
