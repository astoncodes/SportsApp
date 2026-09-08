/** Stands in for react-native. Only Platform is reachable from the pure modules
 * under test; anything else importing from here should not be in these tests. */
export const Platform = {
  OS: 'ios' as 'ios' | 'android' | 'web',
  select: <T>(specifics: { ios?: T; android?: T; web?: T; default?: T }): T | undefined =>
    specifics[Platform.OS] ?? specifics.default,
};
