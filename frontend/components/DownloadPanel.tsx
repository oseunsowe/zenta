'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// Served by Caddy from a folder on the host, not by Next.js — see
// infra/Caddyfile.tunnel and infra/README.md. Keeping the name stable means the
// link never changes when you publish a new build.
const INSTALLER_URL = '/downloads/Zenta-Setup.exe';
const PORTABLE_URL = '/downloads/Zenta-Portable-Windows.zip';

type Availability = 'checking' | 'installer' | 'portable' | 'missing';

function formatSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

export default function DownloadPanel() {
  const [state, setState] = useState<Availability>('checking');
  const [size, setSize] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Read on the client only — this page is prerendered, so window is undefined
  // during SSR and the value would otherwise be baked in at build time.
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // HEAD tells us whether a build has actually been published without pulling
    // down a ~150 MB installer just to render a button.
    fetch(INSTALLER_URL, { method: 'HEAD' })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          return fetch(PORTABLE_URL, { method: 'HEAD' }).then((portableRes) => {
            if (cancelled) return;
            if (!portableRes.ok) {
              setState('missing');
              return;
            }
            const len = portableRes.headers.get('content-length');
            if (len) setSize(formatSize(Number(len)));
            setState('portable');
          });
        }
        const len = res.headers.get('content-length');
        if (len) setSize(formatSize(Number(len)));
        setState('installer');
      })
      .catch(() => {
        fetch(PORTABLE_URL, { method: 'HEAD' })
          .then((portableRes) => {
            if (cancelled) return;
            if (!portableRes.ok) {
              setState('missing');
              return;
            }
            const len = portableRes.headers.get('content-length');
            if (len) setSize(formatSize(Number(len)));
            setState('portable');
          })
          .catch(() => {
            if (!cancelled) setState('missing');
          });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page">
      <main className="page__inner">
        <div className="brand-mark">
          <div className="brand-logo">Z</div>
          <div>
            <div className="brand-name">Zenta</div>
            <div className="brand-tag">Desktop app · Windows</div>
          </div>
        </div>

        <div className="page-head">
          <h1>Zenta for Desktop</h1>
          <p className="muted">
            Optional. You only need this to let someone control your mouse and keyboard.
          </p>
        </div>

        <div className="stack">
          <section className="card card--pad">
            <h2 className="card__title">Do you actually need it?</h2>
            <p className="card__sub">Most testing does not require a download.</p>

            <div className="alert" style={{ marginTop: 16 }}>
              <span className="alert__dot" />
              <div>
                <strong>Screen sharing works in your browser.</strong>
                <div className="muted" style={{ marginTop: 4 }}>
                  Sharing your screen and watching someone else&apos;s both run in Chrome or
                  Edge. Just <Link href="/login">sign in</Link> — nothing to install.
                </div>
              </div>
            </div>

            <p className="muted" style={{ marginTop: 16, marginBottom: 0 }}>
              Install the desktop app only for <strong>remote control</strong> — letting the
              other person move your mouse and type on your machine. A browser cannot grant
              that, so the person <em>being</em> controlled has to run this app. The person
              doing the controlling can stay in their browser.
            </p>
          </section>

          <section className="card card--pad">
            <h2 className="card__title">Download</h2>
            <p className="card__sub">Windows 10 or later, 64-bit.</p>

            <div style={{ marginTop: 18 }}>
              {state === 'checking' && (
                <button className="btn btn--block" disabled>
                  Checking for a build…
                </button>
              )}

              {state === 'installer' && (
                <a className="btn btn--primary btn--block" href={INSTALLER_URL} download>
                  Download for Windows{size ? ` · ${size}` : ''}
                </a>
              )}

              {state === 'portable' && (
                <>
                  <a className="btn btn--primary btn--block" href={PORTABLE_URL} download>
                    Download portable Windows build{size ? ` · ${size}` : ''}
                  </a>
                  <p className="faint" style={{ marginTop: 12, marginBottom: 0, fontSize: 13 }}>
                    Portable build: unzip and run Zenta.exe from the extracted folder.
                  </p>
                </>
              )}

              {state === 'portable' && origin && (
                <div className="alert" style={{ marginTop: 16 }}>
                  <span className="alert__dot alert__dot--warn" />
                  <div style={{ minWidth: 0 }}>
                    <strong>If the app can&apos;t reach the server</strong>
                    <div className="muted" style={{ marginTop: 4 }}>
                      This address changes whenever the server restarts. Open{' '}
                      <code>server.txt</code> next to <code>Zenta.exe</code>, replace the
                      last line with the address below, and restart the app — no
                      re-download needed.
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                      }}
                    >
                      <code style={{ overflowWrap: 'anywhere', flex: '1 1 200px' }}>{origin}</code>
                      <button
                        type="button"
                        className="btn btn--sm"
                        onClick={() => {
                          void navigator.clipboard?.writeText(origin).then(
                            () => setCopied(true),
                            () => setCopied(false)
                          );
                        }}
                      >
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {state === 'missing' && (
                <>
                  <button className="btn btn--block" disabled>
                    No build published yet
                  </button>
                  <p className="faint" style={{ marginTop: 12, marginBottom: 0, fontSize: 13 }}>
                    The installer has to be built on a Windows machine and copied into the
                    server&apos;s downloads folder. Build and publish steps are in{' '}
                    <code>infra/README.md</code>.
                  </p>
                </>
              )}
            </div>
          </section>

          <section className="card card--pad">
            <h2 className="card__title">After installing</h2>
            <ol className="muted" style={{ margin: '14px 0 0', paddingLeft: 20, lineHeight: 1.9 }}>
              <li>
                Windows SmartScreen will warn you if the build is unsigned — choose{' '}
                <strong>More info → Run anyway</strong>.
              </li>
              <li>Open Zenta and sign in with the same account you use in the browser.</li>
              <li>
                Open <strong>Share</strong>. In the desktop app, remote control is armed
                automatically while the share screen is open.
              </li>
              <li>The other person watches from their browser and can then control your machine.</li>
            </ol>
          </section>

          <p className="faint" style={{ fontSize: 13, textAlign: 'center' }}>
            <Link href="/login">Back to sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
