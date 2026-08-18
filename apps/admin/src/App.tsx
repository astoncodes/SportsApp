import { SignIn } from './features/auth/sign-in';
import { ReviewQueue } from './features/review/review-queue';
import { useSession } from './lib/auth-context';
import { supabase } from './lib/supabase';
import { useIsAdmin } from './lib/use-is-admin';

/**
 * The protected shell.
 *
 * Three gates in order: is the session loaded, is there a session, is that user
 * an admin. No router yet — there is exactly one screen. Phase 1 adds routing
 * when review and merges become separate destinations.
 */
export default function App() {
  const { session, isLoading: isSessionLoading } = useSession();
  const { data: isAdmin, isPending: isAdminPending, error: adminError } = useIsAdmin();

  if (isSessionLoading) {
    return <main className="shell" />;
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
        <button type="button" className="secondary" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </header>

      {isAdminPending && <div className="card">Checking access…</div>}

      {adminError && <div className="card error">{(adminError as Error).message}</div>}

      {isAdmin === false && (
        <div className="card">
          <h1>No admin access</h1>
          <p>
            This account is signed in but is not an admin, so there is nothing here for it. Admin
            access is granted by inserting a row into <code>admin_users</code> with a privileged
            connection — see the README.
          </p>
        </div>
      )}

      {isAdmin === true && <ReviewQueue />}
    </main>
  );
}
