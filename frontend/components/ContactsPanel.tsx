'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import AppNav from './AppNav';
import { useRequireAuth } from '../lib/useAuth';
import { clearUserSession } from '../lib/users';
import {
  ShareRequest,
  cancelShareRequest,
  createShareRequest,
  listIncoming,
  listOutgoing,
} from '../lib/share-requests';

export default function ContactsPanel() {
  const router = useRouter();
  const me = useRequireAuth();

  const [targetUsername, setTargetUsername] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outgoing, setOutgoing] = useState<ShareRequest[]>([]);
  const [incomingCount, setIncomingCount] = useState(0);

  async function refresh() {
    try {
      const [out, inc] = await Promise.all([listOutgoing(), listIncoming()]);
      setOutgoing(out);
      setIncomingCount(inc.filter((r) => r.status === 'pending').length);
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

  // If an outgoing request was accepted, jump straight into viewing it.
  useEffect(() => {
    const accepted = outgoing.find((r) => r.status === 'accepted' && r.session_id);
    if (accepted?.session_id) {
      router.push(`/view?session=${encodeURIComponent(accepted.session_id)}`);
    }
  }, [outgoing, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!targetUsername.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createShareRequest(targetUsername.trim().toLowerCase(), note || undefined);
      setTargetUsername('');
      setNote('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  if (!me) return null;

  return (
    <div className="page">
      <AppNav user={me} incomingCount={incomingCount} />

      <main className="page__inner">
        <div className="page-head">
          <h1>Request a screen share</h1>
          <p>Ask another member to share their screen with you. They confirm before anything streams.</p>
        </div>

        <div className="stack">
          <section className="card card--pad">
            <h2 className="card__title">New request</h2>
            <p className="card__sub mb-lg">Enter their username. They&apos;ll see it on their Requests page.</p>

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="field">
                <label className="field__label" htmlFor="target">Username</label>
                <input
                  id="target"
                  className="input"
                  value={targetUsername}
                  onChange={(e) => setTargetUsername(e.target.value)}
                  placeholder="their username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="note">Note <span className="faint">(optional)</span></label>
                <input
                  id="note"
                  className="input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. debugging the checkout bug"
                  maxLength={140}
                />
              </div>

              {error ? (
                <div className="alert alert--error" role="alert">
                  <span className="alert__dot" />
                  <span>{error}</span>
                </div>
              ) : null}

              <button type="submit" className="btn btn--primary" disabled={busy || !targetUsername.trim()}>
                {busy ? <span className="spinner" /> : null}
                {busy ? 'Sending…' : 'Send request'}
              </button>
            </form>
          </section>

          <section>
            <h2 className="card__title mb-md">Your outgoing requests</h2>
            {outgoing.length === 0 ? (
              <div className="empty">No requests yet. Send one above to get started.</div>
            ) : (
              outgoing.map((req) => (
                <div className="row" key={req.id}>
                  <span>
                    → <strong>{req.to_username}</strong>
                    {req.note ? <span className="faint"> · {req.note}</span> : null}
                  </span>
                  <span className="row__actions">
                    <span className={`tag tag--${req.status}`}>{req.status}</span>
                    {req.status === 'pending' ? (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => cancelShareRequest(req.id).then(refresh).catch(() => {})}
                      >
                        Cancel
                      </button>
                    ) : null}
                  </span>
                </div>
              ))
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
