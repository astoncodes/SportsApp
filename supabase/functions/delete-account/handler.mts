import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export function createDeleteAccountHandler(admin: SupabaseClient) {
  return async (request: Request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    const jwt = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (!jwt) return json({ error: 'Sign in to delete your account.' }, 401);
    // Never accept a user ID from the body or trust decoded JWT claims alone.
    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(jwt);
    if (authError || !user) return json({ error: 'Your session expired. Sign in again.' }, 401);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Confirm account deletion.' }, 400);
    }
    if (
      body?.confirmation !== 'DELETE' ||
      Object.keys(body).some((key) => key !== 'confirmation')
    ) {
      return json({ error: 'Confirm account deletion by typing DELETE.' }, 400);
    }
    try {
      const staged = await admin.rpc('prepare_account_deletion', { p_user_id: user.id });
      if (staged.error) throw staged.error;
      // Bound each invocation; large accounts resume safely from the saved queue.
      for (let batch = 0; batch < 10; batch++) {
        const pending = await admin.rpc('account_deletion_objects', { p_user_id: user.id });
        if (pending.error) throw pending.error;
        const paths = (pending.data ?? []).map((row: { storage_path: string }) => row.storage_path);
        if (!paths.length) {
          const result = await admin.auth.admin.deleteUser(user.id);
          if (result.error && result.error.code !== 'user_not_found') throw result.error;
          return json({ deleted: true });
        }
        const removed = await admin.storage.from('session-media').remove(paths);
        if (removed.error) throw removed.error;
        const acknowledged = await admin.rpc('ack_account_deletion_objects', {
          p_user_id: user.id,
          p_paths: paths,
        });
        if (acknowledged.error) throw acknowledged.error;
      }
      return json({ pending: true }, 202);
    } catch {
      // Do not log JWTs, personal data, or provider error details. The persisted
      // marker and file queue make an explicit retry safe after partial progress.
      return json({ error: 'Deletion could not finish. Please retry to complete it.' }, 503);
    }
  };
}
