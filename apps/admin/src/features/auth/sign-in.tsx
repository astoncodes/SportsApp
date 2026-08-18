import { useState } from 'react';
import type { FormEvent } from 'react';

import { supabase } from '../../lib/supabase';

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; email: string }
  | { kind: 'error'; message: string };

/**
 * Email one-time-code sign-in.
 *
 * No password to leak and nothing to store. Locally, the message is caught by
 * Mailpit rather than actually sent — open http://127.0.0.1:54324 to read it.
 */
export function SignIn() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = email.trim();
    if (!trimmed) return;

    setStatus({ kind: 'sending' });

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: window.location.origin },
    });

    setStatus(error ? { kind: 'error', message: error.message } : { kind: 'sent', email: trimmed });
  }

  if (status.kind === 'sent') {
    return (
      <div className="card">
        <h1>Check your email</h1>
        <p>
          A sign-in link is on its way to <strong>{status.email}</strong>.
        </p>
        <p className="hint">
          Running locally? Nothing actually leaves your machine — open{' '}
          <a href="http://127.0.0.1:54324" target="_blank" rel="noreferrer">
            Mailpit
          </a>{' '}
          to read it.
        </p>
        <button type="button" className="secondary" onClick={() => setStatus({ kind: 'idle' })}>
          Use a different address
        </button>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h1>Venue review</h1>
      <p>Sign in to review imported venues. Admin access is required.</p>

      <label htmlFor="email">Email address</label>
      <input
        id="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        placeholder="you@example.com"
        onChange={(event) => setEmail(event.target.value)}
      />

      {status.kind === 'error' && <p className="error">{status.message}</p>}

      <button type="submit" disabled={status.kind === 'sending'}>
        {status.kind === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
      </button>
    </form>
  );
}
