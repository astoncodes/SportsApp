import * as SecureStore from 'expo-secure-store';

/**
 * A Supabase auth storage adapter backed by the device keychain/keystore.
 *
 * Why this is not a three-line wrapper: SecureStore is documented as unreliable
 * for values larger than 2048 bytes on Android, and a Supabase session — access
 * token, refresh token, user object — routinely exceeds that. Storing it
 * directly works in development and then fails on a real Android device, which
 * is the worst possible place to discover it.
 *
 * So values are split across numbered chunk keys, with a small manifest at the
 * original key recording how many there are. AsyncStorage would avoid the
 * problem entirely, but it writes tokens to disk in plain text.
 */

/** Comfortably below the 2048-byte limit, leaving room for key overhead. */
const CHUNK_SIZE = 1536;

const manifestKey = (key: string) => `${key}.manifest`;
const chunkKey = (key: string, index: number) => `${key}.${index}`;

async function readChunkCount(key: string): Promise<number> {
  const manifest = await SecureStore.getItemAsync(manifestKey(key));
  if (!manifest) return 0;

  const count = Number.parseInt(manifest, 10);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

async function clearChunks(key: string, count: number): Promise<void> {
  const deletions: Promise<void>[] = [SecureStore.deleteItemAsync(manifestKey(key))];
  for (let index = 0; index < count; index += 1) {
    deletions.push(SecureStore.deleteItemAsync(chunkKey(key, index)));
  }
  await Promise.all(deletions);
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await readChunkCount(key);
    if (count === 0) return null;

    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(chunkKey(key, index))),
    );

    // A missing chunk means a partial write — an interrupted save, or a value
    // written by an older build. Treat it as absent rather than returning
    // corrupt JSON that would fail to parse somewhere less obvious.
    if (chunks.some((chunk) => chunk === null)) {
      await clearChunks(key, count);
      return null;
    }

    return chunks.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    // Remove any longer previous value first, or its trailing chunks would be
    // orphaned and could be resurrected by a later, shorter read.
    await clearChunks(key, await readChunkCount(key));

    const chunks: string[] = [];
    for (let offset = 0; offset < value.length; offset += CHUNK_SIZE) {
      chunks.push(value.slice(offset, offset + CHUNK_SIZE));
    }

    await Promise.all(
      chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(key, index), chunk)),
    );

    // Written last, so an interrupted save leaves no manifest and therefore
    // reads as absent rather than as a truncated session.
    await SecureStore.setItemAsync(manifestKey(key), String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    await clearChunks(key, await readChunkCount(key));
  },
};
