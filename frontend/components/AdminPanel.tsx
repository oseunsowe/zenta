'use client';

import { FormEvent, useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
const TOKEN_KEY = 'echoface_admin_token';

interface InviteModeState {
  invite_only: boolean;
}

async function callAdmin<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': token,
      ...(init.headers || {}),
    },
  });
  if (response.status === 403) throw new Error('forbidden');
  if (response.status === 404) throw new Error('disabled');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export default function AdminPanel() {
  const [token, setToken] = useState('');
  const [authed, setAuthed] = useState(false);
  const [state, setState] = useState<InviteModeState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) : null;
    if (saved) {
      setToken(saved);
      void load(saved);
    }
  }, []);

  async function load(t: string) {
    setBusy(true);
    setError(null);
    try {
      const data = await callAdmin<InviteModeState>('/admin/invite-mode', t);
      setState(data);
      setAuthed(true);
      sessionStorage.setItem(TOKEN_KEY, t);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      if (message === 'disabled') {
        setError('Admin surface is disabled on this backend (no ADMIN_TOKEN configured).');
      } else if (message === 'forbidden') {
        setError('Admin token rejected.');
        sessionStorage.removeItem(TOKEN_KEY);
        setAuthed(false);
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggle(enabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      const data = await callAdmin<InviteModeState>('/admin/invite-mode', token, {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      });
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown');
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token.trim()) return;
    void load(token.trim());
  }

  function signOut() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken('');
    setAuthed(false);
    setState(null);
  }

  if (!authed) {
    return (
      <section className="chat-container">
        <div className="chat-header">
          <h2>Admin</h2>
          <p>Enter the admin token to view runtime controls.</p>
        </div>
        <form className="chat-form" onSubmit={handleSubmit}>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Admin token"
            aria-label="Admin token"
            disabled={busy}
            autoComplete="off"
          />
          <button type="submit" disabled={busy || !token.trim()}>
            {busy ? 'Verifying…' : 'Sign in'}
          </button>
        </form>
        {error ? <p style={{ color: '#ff9b9b', marginTop: '12px' }}>{error}</p> : null}
      </section>
    );
  }

  return (
    <section className="chat-container">
      <div className="chat-header">
        <h2>Admin</h2>
        <p>Runtime controls. Changes persist across restarts.</p>
      </div>
      <div className="message-list">
        <div className="message system">
          <span>
            invite_only: <strong>{state?.invite_only ? 'enabled' : 'disabled'}</strong>
          </span>
        </div>
      </div>
      <div className="chat-form" style={{ gap: '8px' }}>
        <button
          type="button"
          onClick={() => toggle(true)}
          disabled={busy || state?.invite_only === true}
        >
          Enable invite gate
        </button>
        <button
          type="button"
          onClick={() => toggle(false)}
          disabled={busy || state?.invite_only === false}
        >
          Disable invite gate
        </button>
        <button type="button" onClick={signOut} disabled={busy}>
          Sign out
        </button>
      </div>
      {error ? <p style={{ color: '#ff9b9b', marginTop: '12px' }}>{error}</p> : null}
    </section>
  );
}
