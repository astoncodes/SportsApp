import { useState, useRef, useEffect } from 'react';
import { coordinates } from '../../lib/location';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Database } from '@dropin/database-types';
import { supabase } from '../../lib/supabase';

type Candidate = Database['public']['Tables']['venue_candidates']['Row'];
type Venue = Database['public']['Tables']['venues']['Row'];
type Page = 'Overview' | 'Review queue' | 'Venues' | 'Regions & sports' | 'Audit history';
const pages: Page[] = ['Overview', 'Review queue', 'Venues', 'Regions & sports', 'Audit history'];
const label = (value: string) => value.replaceAll('_', ' ');
const date = (value: string) => new Date(value).toLocaleString();

export function AdminConsole() {
  const [page, setPage] = useState<Page>('Overview');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('pending');
  const [venueFilter, setVenueFilter] = useState<'all' | 'active' | 'unverified'>('all');
  const [region, setRegion] = useState('');
  const [offset, setOffset] = useState(0);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [venue, setVenue] = useState<Venue | null>(null);
  const client = useQueryClient();
  const lookups = useQuery({
    queryKey: ['admin', 'lookups'],
    queryFn: async () => {
      const [regions, sports] = await Promise.all([
        supabase.from('regions').select('*').order('name'),
        supabase.from('sports').select('*').order('name'),
      ]);
      if (regions.error) throw regions.error;
      if (sports.error) throw sports.error;
      return { regions: regions.data, sports: sports.data };
    },
  });
  const stats = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => {
      const results = await Promise.all([
        supabase
          .from('venue_candidates')
          .select('id', { count: 'exact', head: true })
          .in('status', ['pending', 'possible_duplicate']),
        supabase.from('venues').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase
          .from('venue_candidates')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'possible_duplicate'),
        supabase
          .from('venues')
          .select('id', { count: 'exact', head: true })
          .eq('verification_state', 'unverified')
          .eq('status', 'active'),
      ]);
      results.forEach((result) => {
        if (result.error) throw result.error;
      });
      return results.map((result) => result.count ?? 0);
    },
  });
  const candidates = useQuery({
    queryKey: ['admin', 'candidates', search, status, region, offset],
    enabled: page === 'Review queue',
    queryFn: async () => {
      let q = supabase
        .from('venue_candidates')
        .select('*', { count: 'exact' })
        .order('created_at')
        .order('id')
        .range(offset, offset + 24);
      if (status === 'pending') q = q.in('status', ['pending', 'possible_duplicate']);
      else if (status) q = q.eq('status', status as Candidate['status']);
      if (region) q = q.eq('region_id', Number(region));
      if (search.trim()) q = q.ilike('proposed_name', `%${search.trim()}%`);
      const result = await q;
      if (result.error) throw result.error;
      return result;
    },
  });
  const venues = useQuery({
    queryKey: ['admin', 'venues', search, region, offset, venueFilter],
    enabled: page === 'Venues',
    queryFn: async () => {
      let q = supabase
        .from('venues')
        .select('*', { count: 'exact' })
        .order('name')
        .order('id')
        .range(offset, offset + 24);
      if (region) q = q.eq('region_id', Number(region));
      if (search.trim()) q = q.ilike('name', `%${search.trim()}%`);
      if (venueFilter !== 'all') q = q.eq('status', 'active');
      if (venueFilter === 'unverified') q = q.eq('verification_state', 'unverified');
      const result = await q;
      if (result.error) throw result.error;
      return result;
    },
  });
  const audit = useQuery({
    queryKey: ['admin', 'audit', offset],
    enabled: page === 'Audit history',
    queryFn: async () => {
      const result = await supabase
        .from('admin_audit_log')
        .select('*', { count: 'exact' })
        .order('id', { ascending: false })
        .range(offset, offset + 24);
      if (result.error) throw result.error;
      return result;
    },
  });
  function navigate(next: Page) {
    setPage(next);
    setOffset(0);
    setSearch('');
    setVenueFilter('all');
    setCandidate(null);
    setVenue(null);
  }
  const active =
    page === 'Review queue'
      ? candidates
      : page === 'Venues'
        ? venues
        : page === 'Audit history'
          ? audit
          : null;
  const regionName = (id: number) => lookups.data?.regions.find((r) => r.id === id)?.name ?? '—';
  return (
    <div className="console">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate('Overview');
          }}
        >
          <span className="brand-icon">D</span> Drop In <small>ADMIN</small>
        </a>
        <p className="eyebrow">WORKSPACE</p>
        <nav aria-label="Admin navigation">
          {pages.map((p) => (
            <button
              key={p}
              className={page === p ? 'nav-link selected' : 'nav-link'}
              onClick={() => navigate(p)}
              aria-current={page === p ? 'page' : undefined}
            >
              {p}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="live-dot" /> Connected to Supabase
          <p>Every venue starts with a human review.</p>
        </div>
      </aside>
      <div className="workspace">
        <header className="page-heading">
          <div>
            <p className="eyebrow">DROP IN / OPERATIONS</p>
            <h1>{page}</h1>
            <p className="hint">
              {page === 'Overview'
                ? 'A clear view of your sports community.'
                : page === 'Review queue'
                  ? 'Review submissions and resolve possible duplicates.'
                  : page === 'Venues'
                    ? 'Keep published places accurate and useful.'
                    : page === 'Audit history'
                      ? 'A record of admin decisions and venue changes.'
                      : 'Configured coverage and the sports your community plays.'}
            </p>
          </div>
          <button
            className="secondary"
            onClick={() => void client.invalidateQueries({ queryKey: ['admin'] })}
          >
            Refresh data
          </button>
        </header>
        {lookups.error && (
          <p role="alert" className="error">
            {lookups.error.message}
          </p>
        )}
        {page === 'Overview' && (
          <>
            {stats.error && (
              <p className="error" role="alert">
                {stats.error.message}
              </p>
            )}
            <div className="stats">
              {['Awaiting review', 'Active venues', 'Possible duplicates', 'Unverified venues'].map(
                (title, i) => (
                  <button
                    className="stat"
                    key={title}
                    onClick={() => {
                      navigate(i % 2 === 0 ? 'Review queue' : 'Venues');
                      setStatus(i === 2 ? 'possible_duplicate' : 'pending');
                      if (i === 1 || i === 3) setVenueFilter(i === 3 ? 'unverified' : 'active');
                    }}
                  >
                    <span>{title}</span>
                    <strong>{stats.data?.[i] ?? '—'}</strong>
                    <small>View records ↗</small>
                  </button>
                ),
              )}
            </div>
            <section className="card wide welcome">
              <p className="eyebrow">MAKE ROOM FOR THE NEXT GAME</p>
              <h2>Good games need good places.</h2>
              <p>
                Check new submissions, compare nearby venues, and help players find a reliable place
                to play.
              </p>
              <button onClick={() => navigate('Review queue')}>Open review queue →</button>
            </section>
            <section className="card wide">
              <h2>Your workflow</h2>
              <div className="workflow">
                <p>
                  <b>01 · Review</b>
                  <br />
                  Check the submitted name, location, and sports.
                </p>
                <p>
                  <b>02 · Compare</b>
                  <br />
                  Inspect suggested duplicates before publishing.
                </p>
                <p>
                  <b>03 · Maintain</b>
                  <br />
                  Update venues and verify the places you know.
                </p>
              </div>
            </section>
          </>
        )}
        {(page === 'Review queue' || page === 'Venues') && (
          <div className="filters">
            <input
              aria-label="Search by name"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
            />
            <select
              aria-label="Region"
              value={region}
              onChange={(e) => {
                setRegion(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">All regions</option>
              {lookups.data?.regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            {page === 'Venues' && (
              <select
                aria-label="Venue filter"
                value={venueFilter}
                onChange={(event) => {
                  setVenueFilter(event.target.value as 'all' | 'active' | 'unverified');
                  setOffset(0);
                }}
              >
                <option value="all">All venues</option>
                <option value="active">Active venues</option>
                <option value="unverified">Unverified active venues</option>
              </select>
            )}
            {page === 'Review queue' && (
              <select
                aria-label="Review status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setOffset(0);
                }}
              >
                {[
                  ['pending', 'Awaiting review'],
                  ['possible_duplicate', 'Possible duplicates'],
                  ['approved', 'Approved'],
                  ['merged', 'Merged'],
                  ['rejected', 'Rejected'],
                  ['', 'All submissions'],
                ].map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        {active?.isPending && (
          <div className="card wide" role="status">
            Loading records…
          </div>
        )}
        {active?.error && (
          <div className="card wide error" role="alert">
            {active.error.message}
            <button className="secondary" onClick={() => void active.refetch()}>
              Try again
            </button>
          </div>
        )}
        {page === 'Review queue' && candidates.data && (
          <section className="card wide table-card">
            <table>
              <thead>
                <tr>
                  <th>Submission</th>
                  <th>Region</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {candidates.data.data.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.proposed_name}</strong>
                      <small>{c.address_text || 'No address provided'}</small>
                    </td>
                    <td>{regionName(c.region_id)}</td>
                    <td>
                      <span className={`badge ${c.status}`}>{label(c.status)}</span>
                    </td>
                    <td>{date(c.created_at)}</td>
                    <td>
                      <button className="secondary" onClick={() => setCandidate(c)}>
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!candidates.data.data.length && (
              <div className="empty">
                <h2>No submissions here</h2>
                <p>New venue submissions will appear here. Try another filter.</p>
              </div>
            )}
          </section>
        )}
        {page === 'Venues' && venues.data && (
          <section className="card wide table-card">
            <table>
              <thead>
                <tr>
                  <th>Venue</th>
                  <th>Region</th>
                  <th>Status</th>
                  <th>Verification</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {venues.data.data.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <strong>{v.name}</strong>
                      <small>{v.address_text || label(v.indoor_state)}</small>
                    </td>
                    <td>{regionName(v.region_id)}</td>
                    <td>
                      <span className="badge">{v.status}</span>
                    </td>
                    <td>{label(v.verification_state)}</td>
                    <td>
                      <button className="secondary" onClick={() => setVenue(v)}>
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!venues.data.data.length && (
              <div className="empty">
                <h2>No venues found</h2>
                <p>Approve a submission to publish your first venue, or adjust your search.</p>
              </div>
            )}
          </section>
        )}
        {page === 'Regions & sports' && (
          <div className="reference-grid">
            <section className="card wide">
              <h2>Regions</h2>
              {lookups.isPending && <p>Loading…</p>}
              {lookups.data?.regions.map((r) => (
                <div className="reference-row" key={r.id}>
                  <div>
                    <strong>{r.name}</strong>
                    <small>{r.timezone}</small>
                  </div>
                  <span className="badge">{r.is_published ? 'Published' : 'Unpublished'}</span>
                </div>
              ))}
            </section>
            <section className="card wide">
              <h2>Sports</h2>
              {lookups.data?.sports.map((s) => (
                <div className="reference-row" key={s.id}>
                  <strong>{s.name}</strong>
                  <span className="badge">{s.is_active ? 'Active' : 'Inactive'}</span>
                </div>
              ))}
            </section>
          </div>
        )}
        {page === 'Audit history' && audit.data && (
          <section className="card wide">
            {!audit.data.data.length && (
              <div className="empty">
                <h2>No decisions yet</h2>
                <p>Review decisions and venue edits will be recorded here.</p>
              </div>
            )}
            {audit.data.data.map((a) => (
              <article className="audit-row" key={a.id}>
                <strong>{label(a.action)}</strong>
                <small>
                  {date(a.created_at)} · Actor {a.actor_id ?? 'Deleted account'}
                </small>
                <small>Record {a.entity_id}</small>
                <details>
                  <summary>Change details</summary>
                  <pre>{JSON.stringify(a.details, null, 2)}</pre>
                </details>
              </article>
            ))}
          </section>
        )}
        {active?.data && (
          <div className="pagination">
            <span>
              {active.data.count ?? 0} records · Page {offset / 25 + 1}
            </span>
            <button
              className="secondary"
              disabled={offset === 0}
              onClick={() => setOffset((n) => Math.max(0, n - 25))}
            >
              Previous
            </button>
            <button
              className="secondary"
              disabled={offset + 25 >= (active.data.count ?? 0)}
              onClick={() => setOffset((n) => n + 25)}
            >
              Next
            </button>
          </div>
        )}
      </div>
      {candidate && (
        <CandidatePanel key={candidate.id} candidate={candidate} close={() => setCandidate(null)} />
      )}
      {venue && lookups.data && (
        <VenuePanel
          key={venue.id}
          venue={venue}
          sports={lookups.data.sports}
          close={() => setVenue(null)}
        />
      )}
    </div>
  );
}

function Panel({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    const elements = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary',
        ) ?? [],
      );
    elements()[0]?.focus();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function keydown(event: KeyboardEvent) {
      if (event.key !== 'Tab') return;
      const items = elements(),
        first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    panel?.addEventListener('keydown', keydown);
    return () => {
      panel?.removeEventListener('keydown', keydown);
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <div className="panel-backdrop">
      <section
        ref={ref}
        className="detail-panel"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            close();
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button className="secondary" onClick={close} aria-label="Close details">
            Close
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function CandidatePanel({ candidate: c, close }: { candidate: Candidate; close: () => void }) {
  const client = useQueryClient();
  const [name, setName] = useState(c.proposed_name);
  const [note, setNote] = useState('');
  const [target, setTarget] = useState('');
  const [decision, setDecision] = useState<'approve' | 'reject' | 'merge' | null>(null);
  const details = useQuery({
    queryKey: ['admin', 'candidate', c.id],
    queryFn: async () => {
      const [sports, matches, targets] = await Promise.all([
        supabase
          .from('venue_candidate_sports')
          .select('sport_id, sports(name)')
          .eq('candidate_id', c.id),
        supabase
          .from('venue_candidate_matches')
          .select('*, venues(name,address_text,status)')
          .eq('candidate_id', c.id)
          .order('score', { ascending: false }),
        supabase
          .from('venues')
          .select('id,name')
          .eq('region_id', c.region_id)
          .eq('status', 'active')
          .order('name')
          .limit(1000),
      ]);
      if (sports.error) throw sports.error;
      if (matches.error) throw matches.error;
      if (targets.error) throw targets.error;
      return { sports: sports.data, matches: matches.data, targets: targets.data };
    },
  });
  const mutation = useMutation({
    mutationFn: async () => {
      if (!decision) throw new Error('Choose a decision');
      const { error } = await supabase.rpc('admin_review_candidate', {
        p_candidate_id: c.id,
        p_decision: decision,
        p_name: name.trim(),
        p_note: note.trim(),
        ...(decision === 'merge' ? { p_target_venue_id: target } : {}),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['admin'] });
      close();
    },
  });
  const point = coordinates(c.location);
  const pending = c.status === 'pending' || c.status === 'possible_duplicate';
  return (
    <Panel title="Review submission" close={close}>
      <span className="badge">{label(c.status)}</span>
      <h3>{c.proposed_name}</h3>
      <p>
        {c.address_text || 'No street address supplied'} · {label(c.indoor_state)}
      </p>
      <small>Submitted {date(c.created_at)}</small>
      {point ? (
        <div className="card wide">
          <strong>Submitted location</strong>
          <p>
            {point.lat.toFixed(6)}, {point.lon.toFixed(6)}
          </p>
          <a
            href={`https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lon}#map=18/${point.lat}/${point.lon}`}
            target="_blank"
            rel="noreferrer"
          >
            Inspect location on OpenStreetMap ↗
          </a>
        </div>
      ) : (
        <p className="error">
          Location could not be displayed. Check the submitted location before approving.
        </p>
      )}
      {details.isPending && <p role="status">Loading sports and duplicate evidence…</p>}
      {details.error && (
        <p className="error" role="alert">
          {details.error.message}
        </p>
      )}
      <p>{details.data?.sports.map((s) => s.sports?.name).join(' · ')}</p>
      <h3>Possible duplicates</h3>
      {details.data?.matches.length === 0 && (
        <p className="hint">
          No nearby matches were found when submitted. Compare existing venues before publishing.
        </p>
      )}
      {details.data?.matches.map((m) => (
        <div className="card wide" key={m.venue_id}>
          <strong>{m.venues?.name ?? m.venue_id}</strong>
          <p>
            {Math.round(m.distance_m)} m away · {m.shared_sport_count} shared sports ·{' '}
            {Math.round(m.name_similarity * 100)}% name similarity
          </p>
          <small>{m.venues?.address_text}</small>
          {pending && m.venues?.status === 'active' && (
            <button
              className="secondary"
              onClick={() => {
                setTarget(m.venue_id);
                setDecision('merge');
              }}
            >
              Use this venue
            </button>
          )}
        </div>
      ))}
      {!pending ? (
        <div className="card wide">
          <h3>Review outcome</h3>
          <p>{c.review_note || 'No review note'}</p>
          <small>{c.reviewed_at && date(c.reviewed_at)}</small>
          {c.published_venue_id && <small>Venue: {c.published_venue_id}</small>}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <label>
            Published name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={120}
              required
            />
          </label>
          <label>
            Decision
            <select
              value={decision ?? ''}
              onChange={(e) => setDecision(e.target.value as typeof decision)}
              required
            >
              <option value="" disabled>
                Choose an action
              </option>
              <option value="approve">Approve as a new venue</option>
              <option value="merge">Link to an existing venue</option>
              <option value="reject">Reject submission</option>
            </select>
          </label>
          {decision === 'merge' && (
            <label>
              Existing venue
              <select required value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Choose a venue</option>
                {details.data?.targets.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Review note {decision === 'reject' ? '(required)' : '(optional)'}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required={decision === 'reject'}
              maxLength={1000}
              rows={3}
            />
          </label>
          <p className="hint">
            Approval publishes a new venue. Linking adds the submission’s sports and name as an
            alias to the selected venue. Decisions are final and recorded in history.
          </p>
          {mutation.error && (
            <p className="error" role="alert">
              {mutation.error.message}
            </p>
          )}
          <button
            disabled={
              mutation.isPending || !decision || !details.data || (decision === 'approve' && !point)
            }
          >
            {mutation.isPending ? 'Saving decision…' : 'Confirm review decision'}
          </button>
        </form>
      )}
    </Panel>
  );
}

function VenuePanel({
  venue: v,
  sports,
  close,
}: {
  venue: Venue;
  sports: Database['public']['Tables']['sports']['Row'][];
  close: () => void;
}) {
  const client = useQueryClient();
  const [name, setName] = useState(v.name);
  const [address, setAddress] = useState(v.address_text ?? '');
  const [indoor, setIndoor] = useState(v.indoor_state);
  const [status, setStatus] = useState(v.status);
  const [verified, setVerified] = useState(v.verification_state === 'admin_verified');
  const [selected, setSelected] = useState<number[] | null>(null);
  const existing = useQuery({
    queryKey: ['admin', 'venue-sports', v.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venue_sports')
        .select('sport_id')
        .eq('venue_id', v.id);
      if (error) throw error;
      return data.map((s) => s.sport_id);
    },
  });
  const ids = selected ?? existing.data ?? [];
  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('admin_update_venue', {
        p_venue_id: v.id,
        p_name: name,
        p_address: address,
        p_indoor_state: indoor,
        p_status: status,
        p_verified: verified,
        p_sport_ids: ids,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['admin'] });
      close();
    },
  });
  return (
    <Panel title="Manage venue" close={close}>
      {v.status === 'merged' ? (
        <p>This venue was merged into {v.merged_into_venue_id} and cannot be edited.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <label>
            Name
            <input
              required
              minLength={2}
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Address
            <input maxLength={240} value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <label>
            Setting
            <select value={indoor} onChange={(e) => setIndoor(e.target.value as typeof indoor)}>
              {['indoor', 'outdoor', 'unknown'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Publication
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="active">Active</option>
              <option value="removed">Removed from discovery</option>
            </select>
          </label>
          <fieldset>
            <legend>Sports</legend>
            {existing.isPending && <p>Loading…</p>}
            {existing.error && <p className="error">{existing.error.message}</p>}
            {sports.map((s) => (
              <label className="checkbox" key={s.id}>
                <input
                  type="checkbox"
                  checked={ids.includes(s.id)}
                  onChange={(e) =>
                    setSelected(e.target.checked ? [...ids, s.id] : ids.filter((id) => id !== s.id))
                  }
                />
                {s.name}
              </label>
            ))}
          </fieldset>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
            />
            I have verified this venue
          </label>
          <p className="hint">
            Removing a venue hides it from venue discovery and preserves its history.
          </p>
          {mutation.error && (
            <p className="error" role="alert">
              {mutation.error.message}
            </p>
          )}
          <button disabled={mutation.isPending || !existing.data || !ids.length}>
            {mutation.isPending ? 'Saving…' : 'Save venue changes'}
          </button>
        </form>
      )}
    </Panel>
  );
}
