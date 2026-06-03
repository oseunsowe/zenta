'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import AppNav from './AppNav';
import { useRequireAuth } from '../lib/useAuth';
import { changePassword, logout } from '../lib/users';

export default function AccountPanel() {
  const router = useRouter();
  const user = useRequireAuth();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!user) return null;

  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit =
    current.length > 0 && next.length >= 8 && next === confirm && next !== current && !busy;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await changePassword(current, next);
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password.');
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    logout();
    router.replace('/login');
  }

  return (
    <div className="page">
      <AppNav user={user} />

      <main className="page__inner">
        <div className="page-head">
          <h1>Account</h1>
          <p>Manage your sign-in details for this private workspace.</p>
        </div>

        <div className="stack">
          <section className="card card--pad">
            <div className="profile-row">
              <span className="avatar-chip avatar-chip--lg">
                {user.username.charAt(0).toUpperCase()}
              </span>
              <div>
                <div className="profile-name">{user.username}</div>
                <div className="faint profile-id">User #{user.id}</div>
              </div>
            </div>
          </section>

          <section className="card card--pad">
            <h2 className="card__title">Change password</h2>
            <p className="card__sub mb-lg">
              Use at least 8 characters. You&apos;ll stay signed in on this device.
            </p>

            <form className="auth-form" onSubmit={handleSubmit} noValidate>
              <div className="field">
                <label className="field__label" htmlFor="current">Current password</label>
                <input
                  id="current"
                  className="input"
                  type={show ? 'text' : 'password'}
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              <div className="field">
                <label className="field__label" htmlFor="new">New password</label>
                <div className="input-group">
                  <input
                    id="new"
                    className="input"
                    type={show ? 'text' : 'password'}
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    required
                  />
                  <button
                    type="button"
                    className="input-affix"
                    onClick={() => setShow((v) => !v)}
                    aria-label={show ? 'Hide passwords' : 'Show passwords'}
                  >
                    {show ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div className="field">
                <label className="field__label" htmlFor="confirm">Confirm new password</label>
                <input
                  id="confirm"
                  className="input"
                  type={show ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                {mismatch ? <span className="field__error">Passwords don&apos;t match.</span> : null}
              </div>

              {error ? (
                <div className="alert alert--error" role="alert">
                  <span className="alert__dot" />
                  <span>{error}</span>
                </div>
              ) : null}
              {done ? (
                <div className="alert alert--success" role="status">
                  <span className="alert__dot" />
                  <span>Password updated.</span>
                </div>
              ) : null}

              <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
                {busy ? <span className="spinner" /> : null}
                {busy ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </section>

          <section className="card card--pad">
            <h2 className="card__title">Session</h2>
            <p className="card__sub mb-md">
              Sign out of this device. You can sign back in anytime.
            </p>
            <button type="button" className="btn btn--danger" onClick={signOut}>
              Log out
            </button>
          </section>
        </div>
      </main>
    </div>
  );
}
