import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { hostedProject } from '../supabase-project.mjs';

const { ref, token } = hostedProject();
assert.equal(
  process.argv.find((arg) => arg.startsWith('--project-ref='))?.split('=')[1],
  ref,
  'Explicit --project-ref must match the configured project. Only temporary test accounts are deleted.',
);
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const keysResponse = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
  headers: { Authorization: `Bearer ${token}` },
});
assert(keysResponse.ok);
const serviceKey = (await keysResponse.json()).find((key) => key.name === 'service_role')?.api_key;
assert(serviceKey);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, options);
const anonymous = createClient(url, anonKey, options);
const fixtures = [];
let browser;
function unwrap(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
async function fixture() {
  const { user, properties } = unwrap(
    await admin.auth.admin.generateLink({
      type: 'signup',
      email: `deletion-${crypto.randomUUID()}@example.test`,
      password: crypto.randomUUID(),
    }),
  );
  const client = createClient(url, anonKey, options);
  const entry = { id: user.id, client };
  fixtures.push(entry);
  entry.session = unwrap(
    await client.auth.verifyOtp({ token_hash: properties.hashed_token, type: 'signup' }),
  ).session;
  unwrap(
    await client.rpc('update_own_profile', {
      p_display_name: 'Deletion Test Player',
      p_sport_ids: [],
      p_complete_onboarding: true,
    }),
  );
  return entry;
}
async function cleanup(id) {
  const existing = await admin.auth.admin.getUserById(id);
  if (!existing.data.user) return;
  unwrap(await admin.rpc('prepare_account_deletion', { p_user_id: id }));
  for (;;) {
    const paths = unwrap(await admin.rpc('account_deletion_objects', { p_user_id: id })).map(
      (row) => row.storage_path,
    );
    if (!paths.length) break;
    unwrap(await admin.storage.from('session-media').remove(paths));
    unwrap(await admin.rpc('ack_account_deletion_objects', { p_user_id: id, p_paths: paths }));
  }
  unwrap(await admin.auth.admin.deleteUser(id));
}
try {
  const owner = await fixture(),
    peer = await fixture(),
    retry = await fixture();
  assert(
    (await anonymous.functions.invoke('delete-account', { body: { confirmation: 'DELETE' } }))
      .error,
    'Anonymous deletion denied',
  );
  assert(
    (
      await owner.client.functions.invoke('delete-account', {
        body: { confirmation: 'DELETE', userId: peer.id },
      })
    ).error,
    'Target substitution rejected',
  );
  assert(
    (await owner.client.functions.invoke('delete-account', { body: { confirmation: 'delete' } }))
      .error,
    'Explicit confirmation required',
  );
  assert.equal(
    unwrap(await admin.from('account_deletion_requests').select('user_id').eq('user_id', owner.id))
      .length,
    0,
  );
  assert(
    (await owner.client.rpc('prepare_account_deletion', { p_user_id: peer.id })).error,
    'Privileged staging denied to app clients',
  );
  unwrap(await admin.rpc('prepare_account_deletion', { p_user_id: retry.id }));
  assert(
    (
      await retry.client.rpc('update_own_profile', {
        p_display_name: 'Should fail',
        p_sport_ids: [],
      })
    ).error,
    'In-progress deletion prevents new writes',
  );
  assert(
    unwrap(
      await retry.client.functions.invoke('delete-account', { body: { confirmation: 'DELETE' } }),
    ).deleted,
    'Deletion resumes after staging',
  );
  assert(!(await admin.auth.admin.getUserById(retry.id)).data.user);

  const sport = unwrap(
    await anonymous.from('sports').select('id').eq('is_active', true).limit(1).single(),
  );
  const sessionId = unwrap(
    await owner.client.rpc('create_run_at_pin', {
      p_lat: 46.234,
      p_lon: -63.129,
      p_location_name: 'Temporary deletion test spot',
      p_sport_id: sport.id,
      p_starts_on: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      p_start_time: '19:00',
      p_end_time: '20:00',
      p_weeks: 1,
      p_title: 'Temporary deletion test session',
      p_timezone: 'America/Halifax',
    }),
  );
  unwrap(
    await admin
      .from('session_memberships')
      .insert({ session_id: sessionId, user_id: peer.id, role: 'player' }),
  );
  const paths = [];
  for (const player of [owner, peer]) {
    const postId = crypto.randomUUID();
    unwrap(
      await admin
        .from('session_posts')
        .insert({
          id: postId,
          session_id: sessionId,
          author_id: player.id,
          caption: 'Temporary deletion test',
          location_verified_at: new Date().toISOString(),
        }),
    );
    const path = `${player.id}/${postId}/photo.png`;
    unwrap(
      await player.client.storage
        .from('session-media')
        .upload(
          path,
          Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
            'base64',
          ),
          { contentType: 'image/png' },
        ),
    );
    unwrap(
      await admin
        .from('session_media')
        .insert({ post_id: postId, uploader_id: player.id, kind: 'image', storage_path: path }),
    );
    paths.push(path);
  }
  console.log(
    'PASS deletion API: identity/confirmation checks, server-only staging, write freeze and resumable deletion.',
  );

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(
    ({ key, value }) => {
      if (!sessionStorage.getItem('deletion-fixture')) {
        localStorage.setItem(key, JSON.stringify(value));
        sessionStorage.setItem('deletion-fixture', '1');
      }
    },
    { key: `sb-${ref}-auth-token`, value: owner.session },
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.setDefaultTimeout(30000);
  await page.goto('http://localhost:8081/profile');
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await page.getByRole('button', { name: 'Keep my account', exact: true }).click();
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  const submit = page.getByRole('button', { name: 'Permanently delete account', exact: true });
  assert.equal(await submit.getAttribute('aria-disabled'), 'true');
  await page.getByRole('textbox', { name: 'Type DELETE to confirm' }).fill('DELETE');
  await submit.click();
  await page
    .getByText('Your account and its data have been deleted.', { exact: true })
    .waitFor({ timeout: 60000 });
  assert.equal(
    await page.evaluate((key) => localStorage.getItem(key), `sb-${ref}-auth-token`),
    null,
  );
  assert(!(await admin.auth.admin.getUserById(owner.id)).data.user, 'Owner Auth account removed');
  assert((await admin.auth.admin.getUserById(peer.id)).data.user, 'Peer account remains');
  assert.equal(unwrap(await admin.from('run_sessions').select('id').eq('id', sessionId)).length, 0);
  for (const path of paths)
    assert(
      (await admin.storage.from('session-media').download(path)).error,
      'Owner and hosted-session peer blobs removed',
    );
  assert.equal(
    unwrap(await admin.rpc('account_deletion_objects', { p_user_id: owner.id })).length,
    0,
  );
  await page.reload();
  await page.getByRole('textbox', { name: 'Email address', exact: true }).waitFor();
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(
    'PASS deletion browser: cancel → explicit confirmation → account removal → owner/peer media cleanup → local logout survives reload.',
  );
} finally {
  await browser?.close();
  for (const item of fixtures) await cleanup(item.id);
  console.log('Temporary deletion fixtures removed.');
}
