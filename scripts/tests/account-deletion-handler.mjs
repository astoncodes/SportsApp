import assert from 'node:assert/strict';
import { createDeleteAccountHandler } from '../../supabase/functions/delete-account/handler.mts';

function fixture({ invalidToken = false, storageFails = false, manyBatches = false } = {}) {
  const calls = [];
  let files = true;
  const admin = {
    auth: {
      getUser: async (token) => {
        calls.push(['verify', token]);
        return { data: { user: invalidToken ? null : { id: 'verified-user' } }, error: null };
      },
      admin: {
        deleteUser: async (id) => {
          calls.push(['delete', id]);
          return { error: null };
        },
      },
    },
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === 'account_deletion_objects')
        return {
          data: files ? [{ storage_path: 'verified-user/post/photo.jpg' }] : [],
          error: null,
        };
      if (name === 'ack_account_deletion_objects') files = manyBatches;
      return { error: null };
    },
    storage: {
      from: (bucket) => ({
        remove: async (paths) => {
          calls.push(['remove', bucket, paths]);
          return { error: storageFails ? new Error('Unavailable') : null };
        },
      }),
    },
  };
  return { handler: createDeleteAccountHandler(admin), calls };
}
const request = (body, token = 'valid-session') =>
  new Request('https://example.test/delete-account', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {},
    body: JSON.stringify(body),
  });
const missing = fixture();
assert.equal((await missing.handler(request({ confirmation: 'DELETE' }, null))).status, 401);
assert.equal(missing.calls.length, 0);
const invalid = fixture({ invalidToken: true });
assert.equal(
  (await invalid.handler(request({ confirmation: 'DELETE' }, 'forged-token'))).status,
  401,
);
assert.equal(invalid.calls.length, 1);
const wrongTarget = fixture();
assert.equal(
  (await wrongTarget.handler(request({ confirmation: 'DELETE', userId: 'someone-else' }))).status,
  400,
);
assert(!wrongTarget.calls.some(([kind]) => kind === 'prepare_account_deletion'));
const success = fixture();
assert.deepEqual(await (await success.handler(request({ confirmation: 'DELETE' }))).json(), {
  deleted: true,
});
assert(
  success.calls.findIndex(([kind]) => kind === 'remove') <
    success.calls.findIndex(([kind]) => kind === 'delete'),
);
assert.deepEqual(
  success.calls.find(([kind]) => kind === 'delete'),
  ['delete', 'verified-user'],
);
const failed = fixture({ storageFails: true });
assert.equal((await failed.handler(request({ confirmation: 'DELETE' }))).status, 503);
assert(
  !failed.calls.some(([kind]) => kind === 'delete' || kind === 'ack_account_deletion_objects'),
);
const large = fixture({ manyBatches: true });
assert.equal((await large.handler(request({ confirmation: 'DELETE' }))).status, 202);
assert.equal(large.calls.filter(([kind]) => kind === 'remove').length, 10);
assert(!large.calls.some(([kind]) => kind === 'delete'));
console.log(
  'PASS: deletion handler verifies identity, rejects target substitution, removes media before Auth, preserves failed cleanup for retry, and bounds large batches.',
);
