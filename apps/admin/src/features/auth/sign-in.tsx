import { useState } from 'react';
import type { FormEvent } from 'react';

import { supabase } from '../../lib/supabase';

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; email: string }
  | { kind: 'error'; message: string };

/** Passwordless email sign-in through the hosted project. */
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
        <button type="button" className="secondary" onClick={() => setStatus({ kind: 'idle' })}>
          Use a different address
        </button>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <p className="eyebrow">DROP IN / ADMIN</p>
      <h1>A better place to play.</h1>
      <p>
        Sign in to review submissions and manage your community’s venues. Admin access is required.
      </p>

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
