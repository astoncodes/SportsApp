/** Stands in for expo-linking. The real createURL builds a scheme-based deep
 * link (dropin://callback); tests only need it to be observable. */
const state = { scheme: 'dropin://' };

export function setScheme(scheme: string): void {
  state.scheme = scheme;
}

export function createURL(path: string): string {
  return `${state.scheme}${path.replace(/^\//, '')}`;
}
