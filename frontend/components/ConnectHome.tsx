'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';

import {
  claimDevice,
  clearUnattendedPassword,
  connectToPartner,
  formatDeviceId,
  rotatePassword,
  setUnattendedPassword,
  setViewerToken,
} from '../lib/device';

// Matches the pairing flow's rotation cadence elsewhere in the app — tight
// enough to be TOTP-like, loose enough that reading the password aloud over a
// call doesn't race the clock.
const ROTATE_INTERVAL_MS = 60_000;

function formatCountdown(ms: number): string {
  return `${Math.max(0, Math.ceil(ms / 1000))}s`;
}

export default function ConnectHome() {
  const router = useRouter();

  // This machine's identity ("Allow Remote Control").
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState<'id' | 'password' | null>(null);
  const [rotateCountdownMs, setRotateCountdownMs] = useState(ROTATE_INTERVAL_MS);
  const nextRotateAtRef = useRef(Date.now() + ROTATE_INTERVAL_MS);

  // Unattended access: a second, fixed password that does not rotate.
  const [unattendedEnabled, setUnattendedEnabled] = useState(false);
  const [unattendedInput, setUnattendedInput] = useState('');
  const [unattendedBusy, setUnattendedBusy] = useState(false);
  const [unattendedError, setUnattendedError] = useState<string | null>(null);
  const [unattendedEditing, setUnattendedEditing] = useState(false);

  // Connecting outward ("Control a Remote Computer").
  const [partnerId, setPartnerId] = useState('');
  const [partnerPassword, setPartnerPassword] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Claim on load: same ID every launch, fresh password each time.
  useEffect(() => {
    let cancelled = false;
    claimDevice()
      .then((identity) => {
        if (cancelled) return;
        setDeviceId(identity.deviceId);
        setPassword(identity.password);
        setUnattendedEnabled(identity.unattendedEnabled);
      })
      .catch((err: Error) => {
        if (!cancelled) setClaimError(err.message || 'Could not reach the server.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRotate(auto = false) {
    if (!auto) setRotating(true);
    if (!auto) setClaimError(null);
    try {
      setPassword(await rotatePassword(auto));
      if (!auto) setCopied(null);
    } catch (err) {
      if (!auto) setClaimError(err instanceof Error ? err.message : 'Could not generate a new password.');
    } finally {
      if (!auto) setRotating(false);
      nextRotateAtRef.current = Date.now() + ROTATE_INTERVAL_MS;
      setRotateCountdownMs(ROTATE_INTERVAL_MS);
    }
  }

  // Background auto-rotation of the one-time password.
  useEffect(() => {
    if (!deviceId) return;
    nextRotateAtRef.current = Date.now() + ROTATE_INTERVAL_MS;
    const timer = window.setInterval(() => void handleRotate(true), ROTATE_INTERVAL_MS);
    const ticker = window.setInterval(() => {
      setRotateCountdownMs(Math.max(0, nextRotateAtRef.current - Date.now()));
    }, 250);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(ticker);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  async function handleSetUnattended(event: FormEvent) {
    event.preventDefault();
    if (unattendedInput.length < 8) {
      setUnattendedError('Use at least 8 characters.');
      return;
    }
    setUnattendedBusy(true);
    setUnattendedError(null);
    try {
      await setUnattendedPassword(unattendedInput);
      setUnattendedEnabled(true);
      setUnattendedEditing(false);
      setUnattendedInput('');
    } catch (err) {
      setUnattendedError(err instanceof Error ? err.message : 'Could not set unattended password.');
    } finally {
      setUnattendedBusy(false);
    }
  }

  async function handleClearUnattended() {
    setUnattendedBusy(true);
    setUnattendedError(null);
    try {
      await clearUnattendedPassword();
      setUnattendedEnabled(false);
    } catch (err) {
      setUnattendedError(err instanceof Error ? err.message : 'Could not turn off unattended access.');
    } finally {
      setUnattendedBusy(false);
    }
  }

  function copy(kind: 'id' | 'password', value: string) {
    void navigator.clipboard?.writeText(value).then(
      () => setCopied(kind),
      () => setCopied(null)
    );
  }

  async function handleConnect(event: FormEvent) {
    event.preventDefault();
    if (connecting) return;
    setConnecting(true);
    setConnectError(null);
    try {
      const { token, sessionId } = await connectToPartner(partnerId, partnerPassword);
      setViewerToken(token);
      router.push(`/view?session=${encodeURIComponent(sessionId)}`);
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Could not connect.');
      setConnecting(false);
    }
  }

  const canConnect = partnerId.replace(/\D/g, '').length === 9 && partnerPassword.length > 0;

  return (
    <div className="page">
      <main className="connect-shell">
        <div className="brand-mark">
          <div className="brand-logo">Z</div>
          <div>
            <div className="brand-name">Zenta</div>
            <div className="brand-tag">Remote support · no account needed</div>
          </div>
        </div>

        <div className="connect-grid">
          {/* ---------------------------------------------- allow control -- */}
          <section className="card card--pad">
            <h2 className="card__title">Allow Remote Control</h2>
            <p className="card__sub">
              Give these to the person helping you. They can then see and control this
              computer.
            </p>

            {claimError && (
              <div className="alert alert--error" style={{ marginTop: 16 }}>
                <span className="alert__dot" />
                <div>{claimError}</div>
              </div>
            )}

            <div className="field" style={{ marginTop: 18 }}>
              <label htmlFor="your-id">Your ID</label>
              <div className="input-group">
                <input
                  id="your-id"
                  className="input id-display"
                  readOnly
                  value={deviceId ? formatDeviceId(deviceId) : 'Generating…'}
                />
                <button
                  type="button"
                  className="btn btn--sm"
                  disabled={!deviceId}
                  onClick={() => deviceId && copy('id', formatDeviceId(deviceId))}
                >
                  {copied === 'id' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="faint" style={{ fontSize: 12, marginTop: 6 }}>
                This ID stays the same every time you open Zenta.
              </p>
            </div>

            <div className="field">
              <label htmlFor="your-password">Password</label>
              <div className="input-group">
                <input
                  id="your-password"
                  className="input id-display"
                  readOnly
                  value={password ?? '…'}
                />
                <button
                  type="button"
                  className="btn btn--sm"
                  disabled={!password}
                  onClick={() => password && copy('password', password)}
                >
                  {copied === 'password' ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => void handleRotate(false)}
                  disabled={rotating || !deviceId}
                  title="Generate a new password and invalidate the old one"
                >
                  {rotating ? '…' : 'New'}
                </button>
              </div>
              <p className="faint" style={{ fontSize: 12, marginTop: 6 }}>
                Rotates automatically every minute (next in {formatCountdown(rotateCountdownMs)}),
                on every launch, and whenever you press New. The previous password stops working
                immediately — an active session already in progress is not interrupted.
              </p>
            </div>

            <div className="field">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <label>Unattended access</label>
                <span
                  className="faint"
                  style={{ fontSize: 12, color: unattendedEnabled ? '#7ee0a0' : undefined }}
                >
                  {unattendedEnabled ? 'On' : 'Off'}
                </span>
              </div>
              <p className="faint" style={{ fontSize: 12, marginTop: 2 }}>
                Set a fixed password so this computer can be reached later without anyone
                present to read out the rotating one. It never expires on its own.
              </p>

              {unattendedError && (
                <div className="alert alert--error" style={{ marginTop: 10 }}>
                  <span className="alert__dot" />
                  <div>{unattendedError}</div>
                </div>
              )}

              {unattendedEditing ? (
                <form onSubmit={handleSetUnattended} style={{ marginTop: 10 }}>
                  <div className="input-group">
                    <input
                      className="input id-display"
                      type="password"
                      autoComplete="off"
                      placeholder="At least 8 characters"
                      value={unattendedInput}
                      onChange={(e) => setUnattendedInput(e.target.value)}
                    />
                    <button type="submit" className="btn btn--sm" disabled={unattendedBusy}>
                      {unattendedBusy ? '…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      onClick={() => {
                        setUnattendedEditing(false);
                        setUnattendedInput('');
                        setUnattendedError(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button
                    type="button"
                    className="btn btn--sm"
                    disabled={!deviceId || unattendedBusy}
                    onClick={() => setUnattendedEditing(true)}
                  >
                    {unattendedEnabled ? 'Change password' : 'Set up unattended access'}
                  </button>
                  {unattendedEnabled && (
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      disabled={unattendedBusy}
                      onClick={() => void handleClearUnattended()}
                    >
                      {unattendedBusy ? '…' : 'Turn off'}
                    </button>
                  )}
                </div>
              )}
            </div>

            <Link
              className="btn btn--primary btn--block"
              href={deviceId ? `/share?session=${encodeURIComponent(`d:${deviceId}`)}` : '#'}
              aria-disabled={!deviceId}
              style={{ marginTop: 8, pointerEvents: deviceId ? undefined : 'none' }}
            >
              Start sharing this screen
            </Link>
            <p className="faint" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
              Your screen is only shared while that page is open. Close it to end the
              session instantly.
            </p>
          </section>

          {/* -------------------------------------------- control a remote -- */}
          <section className="card card--pad">
            <h2 className="card__title">Control a Remote Computer</h2>
            <p className="card__sub">
              Enter the ID and password the other person read out to you.
            </p>

            <form onSubmit={handleConnect}>
              <div className="field" style={{ marginTop: 18 }}>
                <label htmlFor="partner-id">Partner ID</label>
                <input
                  id="partner-id"
                  className="input id-display"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="129 354 196"
                  value={partnerId}
                  onChange={(e) => setPartnerId(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="partner-password">Password</label>
                <input
                  id="partner-password"
                  className="input id-display"
                  type="password"
                  autoComplete="off"
                  placeholder="••••••••"
                  value={partnerPassword}
                  onChange={(e) => setPartnerPassword(e.target.value)}
                />
              </div>

              {connectError && (
                <div className="alert alert--error" style={{ marginBottom: 14 }}>
                  <span className="alert__dot" />
                  <div>{connectError}</div>
                </div>
              )}

              <button
                type="submit"
                className="btn btn--primary btn--block"
                disabled={!canConnect || connecting}
              >
                {connecting ? 'Connecting…' : 'Connect to partner'}
              </button>
            </form>

            <p className="faint" style={{ fontSize: 12, marginTop: 14, marginBottom: 0 }}>
              Full mouse and keyboard control needs the desktop app on the other machine.
              A browser can share its screen, but cannot hand over control —{' '}
              <Link href="/download">get the app</Link>.
            </p>
          </section>
        </div>

        <p className="faint" style={{ fontSize: 13, textAlign: 'center', marginTop: 26 }}>
          Have an account? <Link href="/login">Sign in</Link> for saved contacts and
          share requests.
        </p>
      </main>
    </div>
  );
}
