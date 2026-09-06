import { SignIn } from './features/auth/sign-in';
import { AdminConsole } from './features/console/admin-console';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from './lib/auth-context';
import { supabase } from './lib/supabase';
import { useIsAdmin } from './lib/use-is-admin';

/**
 * The protected shell.
 *
 * Three gates in order: is the session loaded, is there a session, is that user
 * an admin. Database permissions enforce access to every operation.
 */
export default function App() {
  const client = useQueryClient();
  const [signOutError, setSignOutError] = useState('');
  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) setSignOutError(error.message);
    else client.clear();
  }
  const { session, isLoading: isSessionLoading } = useSession();
  const {
    data: isAdmin,
    isPending: isAdminPending,
    error: adminError,
    refetch: checkAccess,
    isFetching: checkingAccess,
  } = useIsAdmin();

  if (isSessionLoading) {
    return (
      <main className="shell" role="status">
        Loading your workspace…
      </main>
    );
  }

  if (!session) {
    return (
      <main className="shell">
        <SignIn />
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="bar">
        <span>
          Signed in as <strong>{session.user.email}</strong>
        </span>
        <button type="button" className="secondary" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>

      {signOutError && (
        <p className="error" role="alert">
          {signOutError}
        </p>
      )}
      {isAdminPending && <div className="card">Checking access…</div>}

      {adminError && (
        <div className="card error" role="alert">
          {adminError.message}
          <button
            className="secondary"
            onClick={() => void checkAccess()}
            disabled={checkingAccess}
          >
            Try again
          </button>
        </div>
      )}

      {isAdmin === false && (
        <div className="card">
          <h1>No admin access</h1>
          <p>
            This account does not have admin access yet. Once the project owner grants access, check
            again to open your workspace.
          </p>
          <button onClick={() => void checkAccess()} disabled={checkingAccess}>
            {checkingAccess ? 'Checking…' : 'Check access again'}
          </button>
        </div>
      )}

      {isAdmin === true && <AdminConsole key={session.user.id} />}
    </main>
  );
}
