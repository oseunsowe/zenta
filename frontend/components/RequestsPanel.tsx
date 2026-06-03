'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import AppNav from './AppNav';
import { useRequireAuth } from '../lib/useAuth';
import { clearUserSession } from '../lib/users';
import { ShareRequest, listIncoming, respondShareRequest } from '../lib/share-requests';

export default function RequestsPanel() {
  const router = useRouter();
  const me = useRequireAuth();

  const [incoming, setIncoming] = useState<ShareRequest[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setIncoming(await listIncoming());
    } catch (err) {
      if (err instanceof Error && err.message === 'Login required') {
        clearUserSession();
        router.replace('/login');
      }
    }
  }

  useEffect(() => {
    if (!me) return;
    void refresh();
    const id = window.setInterval(refresh, 3000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  async function respond(req: ShareRequest, accept: boolean) {
    setBusyId(req.id);
    setError(null);
    try {
      const updated = await respondShareRequest(req.id, accept);
      if (accept && updated.session_id) {
        router.push(`/share?session=${encodeURIComponent(updated.session_id)}`);
        return;
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    } finally {
      setBusyId(null);
    }
  }

  if (!me) return null;

  const pending = incoming.filter((r) => r.status === 'pending');

  return (
    <div className="page">
      <AppNav user={me} incomingCount={pending.length} />

      <main className="page__inner">
        <div className="page-head">
          <h1>Incoming requests</h1>
          <p>People asking to view your screen. Accept to start sharing, decline to dismiss.</p>
        </div>

        {error ? (
          <div className="alert alert--error mb-md" role="alert">
            <span className="alert__dot" />
            <span>{error}</span>
          </div>
        ) : null}

        {pending.length === 0 ? (
          <div className="empty">No pending requests. They&apos;ll appear here when someone asks to view your screen.</div>
        ) : (
          pending.map((req) => (
            <div className="card card--pad mb-md" key={req.id}>
              <div className="mb-md">
                <strong>{req.from_username}</strong> wants to view your screen
                {req.note ? <div className="muted mt-sm">“{req.note}”</div> : null}
              </div>
              <div className="row__actions">
                <button
                  type="button"
                  className="btn btn--success"
                  onClick={() => respond(req, true)}
                  disabled={busyId === req.id}
                >
                  Accept &amp; share
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => respond(req, false)}
                  disabled={busyId === req.id}
                >
                  Decline
                </button>
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}
