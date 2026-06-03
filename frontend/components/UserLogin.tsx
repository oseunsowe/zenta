'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { getStoredUser, login, register } from '../lib/users';

type Mode = 'login' | 'register';

function scorePassword(pw: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (!pw) return { score: 0, label: '' };
  let s = 0;
  if (pw.length >= 8) s += 1;
  if (pw.length >= 12) s += 1;
  if (/[0-9]/.test(pw) && /[a-zA-Z]/.test(pw)) s += 1;
  if (/[^a-zA-Z0-9]/.test(pw)) s += 1;
  const score = Math.min(3, s) as 0 | 1 | 2 | 3;
  return { score, label: ['', 'Weak', 'Okay', 'Strong'][score] };
}

export default function UserLogin() {
  const router = useRouter();
  const search = useSearchParams();
  const nextPath = search.get('next') || '/';

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);

  // Already signed in -> skip the form.
  useEffect(() => {
    if (getStoredUser()) router.replace(nextPath);
  }, [router, nextPath]);

  const strength = useMemo(() => scorePassword(password), [password]);
  const usernameValid = /^[a-z0-9_]{3,32}$/.test(username.trim().toLowerCase());
  const canSubmit =
    username.trim().length > 0 &&
    password.length > 0 &&
    (mode === 'login' || (usernameValid && password.length >= 8 && inviteCode.trim().length > 0));

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setShowRecovery(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') {
        await login(username.trim().toLowerCase(), password);
      } else {
        await register(username.trim().toLowerCase(), password, inviteCode.trim());
      }
      router.replace(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-viewport">
      <div className="auth-card">
        <div className="brand-mark">
          <div className="brand-logo">Z</div>
          <div>
            <div className="brand-name">Zenta</div>
            <div className="brand-tag">Private companion · invite only</div>
          </div>
        </div>

        <div className="auth-head">
          <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
          <p>
            {mode === 'login'
              ? 'Sign in to reach your companion and shared sessions.'
              : 'Registration is invite-gated. Ask your deployment admin for a code.'}
          </p>
        </div>

        <div className="segmented" role="tablist" aria-label="Authentication mode">
          <button type="button" role="tab" aria-selected={mode === 'login' ? 'true' : 'false'} onClick={() => switchMode('login')}>
            Sign in
          </button>
          <button type="button" role="tab" aria-selected={mode === 'register' ? 'true' : 'false'} onClick={() => switchMode('register')}>
            Register
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label className="field__label" htmlFor="username">Username</label>
            <input
              id="username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. alex_morgan"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
            {mode === 'register' && username && !usernameValid ? (
              <span className="field__error">3–32 characters, lowercase letters, numbers, or underscore.</span>
            ) : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="password">Password</label>
            <div className="input-group">
              <input
                id="password"
                className="input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
              <button
                type="button"
                className="input-affix"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {mode === 'register' && password ? (
              <>
                <div className="strength" aria-hidden="true">
                  {[1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={
                        'strength__bar' +
                        (strength.score >= i
                          ? strength.score === 1
                            ? ' is-on-weak'
                            : strength.score === 2
                            ? ' is-on-ok'
                            : ' is-on-strong'
                          : '')
                      }
                    />
                  ))}
                </div>
                <span className="field__hint">{strength.label ? `Strength: ${strength.label}` : ''}</span>
              </>
            ) : null}
          </div>

          {mode === 'register' ? (
            <div className="field">
              <label className="field__label" htmlFor="invite">Invite code</label>
              <input
                id="invite"
                className="input"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="e.g. DEMO-1"
                autoComplete="off"
                required
              />
            </div>
          ) : null}

          {error ? (
            <div className="alert alert--error" role="alert">
              <span className="alert__dot" />
              <span>{error}</span>
            </div>
          ) : null}

          <button type="submit" className="btn btn--primary btn--block" disabled={!canSubmit || busy}>
            {busy ? <span className="spinner" /> : null}
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {mode === 'login' ? (
          <div className="auth-aside">
            <button type="button" className="linkbtn" onClick={() => setShowRecovery((v) => !v)}>
              Forgot password?
            </button>
            {showRecovery ? (
              <div className="alert auth-recovery">
                <span className="alert__dot alert__dot--warn" />
                <span>
                  This is a private, invite-only build with no public email recovery. Ask your deployment admin
                  to reset your password. Once signed in, you can change it anytime under <strong>Account</strong>.
                </span>
              </div>
            ) : null}
            <div className="auth-aside__row">
              New here?{' '}
              <button type="button" className="linkbtn" onClick={() => switchMode('register')}>
                Create an account
              </button>
            </div>
          </div>
        ) : (
          <div className="auth-aside">
            Already have an account?{' '}
            <button type="button" className="linkbtn" onClick={() => switchMode('login')}>
              Sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
