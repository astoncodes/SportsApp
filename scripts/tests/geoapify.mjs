import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file, env, fetch) {
  const context = {
    exports: {},
    require: (name) => (name.endsWith('/env') ? { env } : {}),
    fetch,
    URL,
    setTimeout,
    clearTimeout,
    Date,
    Error,
    Map,
    Number,
    String,
    Promise,
  };
  vm.runInNewContext(
    ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    context,
  );
  return context.exports;
}
const path = 'apps/mobile/src/features/geocoding/geoapify.ts';
const env = { geoapifyApiKey: 'test-key' };
let calls = 0;
const adapter = load(path, env, async (url) => {
  calls++;
  const parsed = new URL(url);
  assert.equal(parsed.hostname, 'api.geoapify.com');
  assert.equal(parsed.searchParams.get('filter'), 'countrycode:ca');
  return new Response(
    JSON.stringify({
      results: [
        { formatted: 'Charlottetown, PEI', lat: 46.24, lon: -63.13, place_id: 'pei' },
        { formatted: 'bad', lat: null, lon: 0 },
        { formatted: 'bad', lat: 91, lon: 0 },
        null,
      ],
    }),
  );
});
const result = await adapter.searchPlaces('Charlottetown');
assert.equal(result.length, 1);
assert.equal(result[0].latitude, 46.24);
assert.equal(result[0].longitude, -63.13);
await adapter.searchPlaces('charlottetown');
assert.equal(calls, 1, 'repeat queries use cache');
const abort = new AbortController();
abort.abort();
await assert.rejects(adapter.searchPlaces('Charlottetown', abort.signal), { name: 'AbortError' });
for (const [status, pattern] of [
  [401, /authenticate/],
  [403, /authenticate/],
  [429, /usage limit/],
  [500, /unavailable/],
]) {
  await assert.rejects(
    load(path, env, async () => new Response('{}', { status })).searchPlaces('Toronto'),
    pattern,
  );
}
await assert.rejects(
  load(path, env, async () => new Response('{}')).searchPlaces('Toronto'),
  /unexpected response/,
);
await assert.rejects(
  load(path, { geoapifyApiKey: '' }, () => {
    throw new Error('must not request');
  }).searchPlaces('Toronto'),
  /not configured/,
);
if (process.argv.includes('--live')) {
  process.loadEnvFile('.env');
  env.geoapifyApiKey = process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY;
  assert.ok(env.geoapifyApiKey);
  const live = await load(path, env, fetch).searchPlaces('Charlottetown');
  assert.ok(live.length);
  console.log('PASS: live Geoapify search returns valid places.');
}
console.log(
  'PASS: Geoapify response validation, cache, abort, auth/quota errors, and missing-key behavior.',
);
