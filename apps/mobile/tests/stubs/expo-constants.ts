/** Stands in for expo-constants. `expoConfig.extra` is what app.config.ts fills
 * from the repo-root .env; tests set it through `setExtra` before importing the
 * module under test. */
type Extra = Record<string, string | undefined>;

const state: { extra: Extra } = { extra: {} };

export function setExtra(extra: Extra): void {
  state.extra = extra;
}

export default {
  get expoConfig() {
    return { extra: state.extra };
  },
};
