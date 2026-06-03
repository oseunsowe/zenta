'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
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
  respondShareRequest,
} from '../lib/share-requests';

export default function HomeDashboard() {
  const router = useRouter();
  const me = useRequireAuth();

  const [partner, setPartner] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [outgoing, setOutgoing] = useState<ShareRequest[]>([]);
  const [incoming, setIncoming] = useState<ShareRequest[]>([]);
  const [respondingId, setRespondingId] = useState<number | null>(null);

  // Sessions already accepted when the dashboard first loads are "baseline" — we
  // do NOT auto-enter them. Otherwise, returning home after ending a session
  // bounces you straight back in (the share request stays 'accepted'). We only
  // auto-open a session that becomes accepted *after* the dashboard is open
  // (a real pending -> accepted transition while you're watching).
  const seenAccepted = useRef<Set<string>>(new Set());
  const baselined = useRef(false);

  async function refresh() {
    try {
      const [out, inc] = await Promise.all([listOutgoing(), listIncoming()]);
      setOutgoing(out);
      setIncoming(inc);

      const acceptedIds = out
        .filter((r) => r.status === 'accepted' && r.session_id)
        .map((r) => r.session_id as string);

      if (!baselined.current) {
        acceptedIds.forEach((id) => seenAccepted.current.add(id));
        baselined.current = true;
        return;
      }

      const fresh = acceptedIds.find((id) => !seenAccepted.current.has(id));
      if (fresh) {
        seenAccepted.current.add(fresh);
        router.push(`/view?session=${encodeURIComponent(fresh)}`);
      }
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

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = partner.trim().toLowerCase();
    if (!target) return;
    if (me && target === me.username) {
      setError("That's your own ID — enter the other person's.");
      return;
    }
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      await createShareRequest(target, note || undefined);
      setPartner('');
      setNote('');
      setSent(true);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the request.');
    } finally {
      setBusy(false);
    }
  }

  async function respond(req: ShareRequest, accept: boolean) {
    setRespondingId(req.id);
    try {
      const updated = await respondShareRequest(req.id, accept);
      if (accept && updated.session_id) {
        router.push(`/share?session=${encodeURIComponent(updated.session_id)}`);
        return;
      }
      await refresh();
    } catch {
      /* surfaced on next poll */
    } finally {
      setRespondingId(null);
    }
  }

  async function copyId() {
    if (!me) return;
    try {
      await navigator.clipboard.writeText(me.username);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  if (!me) return null;

  const pending = incoming.filter((r) => r.status === 'pending');
  const recent = outgoing.slice(0, 5);

  return (
    <div className="page">
      <AppNav user={me} incomingCount={pending.length} />

      <main className="dash">
        <div className="dash-hero">
          <h1>Start a support session</h1>
          <p>Share your ID so someone can connect to you, or enter their ID to request their screen.</p>
        </div>

        <div className="dash-grid">
          {/* YOUR ID — others connect to you (AnyDesk "This Desk") */}
          <section className="connect-card connect-card--accent">
            <span className="connect-card__eyebrow"><span className="dot" /> Your ID</span>
            <h2>This workspace</h2>
            <p className="sub">Give this ID to a teammate. When they request a session, it appears below for you to accept.</p>
            <div className="id-display">
              <span className="id-display__value">{me.username}</span>
              <button type="button" className="btn btn--ghost btn--sm copy-btn" onClick={copyId}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="copy-toast">{copied ? 'ID copied to clipboard' : ''}</div>
            <div className="connect-card__spacer" />
          </section>

          {/* CONNECT — you request a partner (AnyDesk "Remote Desk") */}
          <section className="connect-card">
            <span className="connect-card__eyebrow"><span className="dot dot--idle" /> Connect</span>
            <h2>Connect to a partner</h2>
            <p className="sub">Enter their ID to request a screen share. They confirm before anything streams.</p>
            <form className="auth-form" onSubmit={connect}>
              <div className="field">
                <label className="field__label" htmlFor="partner">Partner ID</label>
                <input
                  id="partner"
                  className="input"
                  value={partner}
                  onChange={(e) => { setPartner(e.target.value); setSent(false); }}
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
                  placeholder="e.g. help me with the printer setup"
                  maxLength={140}
                />
              </div>
              {error ? (
                <div className="alert alert--error" role="alert"><span className="alert__dot" /><span>{error}</span></div>
              ) : null}
              {sent ? (
                <div className="alert alert--success" role="status"><span className="alert__dot" /><span>Request sent — waiting for them to accept.</span></div>
              ) : null}
              <button type="submit" className="btn btn--primary" disabled={busy || !partner.trim()}>
                {busy ? <span className="spinner" /> : null}
                {busy ? 'Connecting…' : 'Request screen share'}
              </button>
            </form>
          </section>
        </div>

        {/* Incoming requests (someone wants to view your screen) */}
        {pending.length > 0 ? (
          <div className="dash-section">
            <h3>Incoming requests</h3>
            {pending.map((req) => (
              <div className="card card--pad mb-md" key={req.id}>
                <div className="mb-md">
                  <strong>{req.from_username}</strong> wants to view your screen
                  {req.note ? <div className="muted mt-sm">“{req.note}”</div> : null}
                </div>
                <div className="row__actions">
                  <button type="button" className="btn btn--success" disabled={respondingId === req.id} onClick={() => respond(req, true)}>
                    Accept &amp; share
                  </button>
                  <button type="button" className="btn btn--ghost" disabled={respondingId === req.id} onClick={() => respond(req, false)}>
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* Recent outgoing sessions */}
        <div className="dash-section">
          <h3>Recent sessions</h3>
          {recent.length === 0 ? (
            <div className="empty">No sessions yet. Request a partner above to get started.</div>
          ) : (
            recent.map((req) => (
              <div className="row" key={req.id}>
                <span>→ <strong>{req.to_username}</strong>{req.note ? <span className="faint"> · {req.note}</span> : null}</span>
                <span className="row__actions">
                  <span className={`tag tag--${req.status}`}>{req.status}</span>
                  {req.status === 'pending' ? (
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => cancelShareRequest(req.id).then(refresh).catch(() => {})}>
                      Cancel
                    </button>
                  ) : null}
                  {req.status === 'accepted' && req.session_id ? (
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => router.push(`/view?session=${encodeURIComponent(req.session_id as string)}`)}>
                      Open
                    </button>
                  ) : null}
                </span>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
