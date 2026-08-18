import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';

/**
 * Placeholder for the venue review queue (Phase 1).
 *
 * It reads regions rather than faking venue rows, so what it displays is
 * genuinely true: it proves the admin is authenticated, that RLS is letting an
 * admin see the unpublished smoke-test region a player cannot, and that the
 * generated types line up with the live schema. The real queue arrives with the
 * venue_candidates table.
 */
export function ReviewQueue() {
  const regions = useQuery({
    queryKey: ['regions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('regions')
        .select('id, slug, name, is_published, timezone')
        .order('slug');
      if (error) throw error;
      return data;
    },
  });

  return (
    <section className="card wide">
      <h1>Venue review</h1>
      <p className="hint">
        The review queue lands in Phase 1, alongside the venue_candidates table. Until then this
        screen confirms the admin path works end to end.
      </p>

      <h2>Regions</h2>

      {regions.isPending && <p>Loading…</p>}
      {regions.isError && <p className="error">{(regions.error as Error).message}</p>}

      {regions.data && (
        <table>
          <thead>
            <tr>
              <th>Slug</th>
              <th>Name</th>
              <th>Timezone</th>
              <th>Published</th>
            </tr>
          </thead>
          <tbody>
            {regions.data.map((region) => (
              <tr key={region.id}>
                <td>
                  <code>{region.slug}</code>
                </td>
                <td>{region.name}</td>
                <td>{region.timezone}</td>
                <td>{region.is_published ? 'yes' : 'no — smoke test only'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {regions.data?.length === 1 && (
        <p className="error">
          Only one region is visible. An admin should see two — if you are seeing one, the
          is_admin() check is not passing.
        </p>
      )}
    </section>
  );
}
