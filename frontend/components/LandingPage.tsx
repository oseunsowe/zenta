import Link from 'next/link';

// Small hand-rolled icon set (24x24, stroke, currentColor) — no icon library
// dependency, keeps the marketing bundle tiny and the Oracle ARM build simple.
function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function IconRotate() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
  );
}
function IconCursor() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 3l7 17 2.2-6.8L20 11 4 3z" />
    </svg>
  );
}
function IconShieldLock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-4z" />
      <rect x="9" y="11" width="6" height="5" rx="1" />
      <path d="M10.5 11V9.5a1.5 1.5 0 0 1 3 0V11" />
    </svg>
  );
}
function IconShieldAlert() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-4z" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <circle cx="12" cy="16" r="0.6" fill="currentColor" />
    </svg>
  );
}
function IconServer() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
      <line x1="7" y1="7" x2="7" y2="7" />
      <line x1="7" y1="17" x2="7" y2="17" />
    </svg>
  );
}
function IconTag() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.6 12.4L13 20a2 2 0 0 1-2.8 0l-7-7a2 2 0 0 1 0-2.8L11 2h7a2 2 0 0 1 2 2v7z" />
      <circle cx="15" cy="8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconKey() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="15" r="4" />
      <path d="M10.8 12.2L20 3M20 3v4M20 3h-4" />
    </svg>
  );
}

const FEATURES = [
  {
    icon: <IconRotate />,
    title: 'Permanent ID, rotating password',
    body: 'A 9-digit ID stays the same forever. The one-time password refreshes automatically every 60 seconds, so a stale credential is never enough to get in.',
  },
  {
    icon: <IconCursor />,
    title: 'Real mouse & keyboard control',
    body: "Not a read-only screen share. The desktop app injects native OS input, so the person helping you can actually drive the machine — not just watch it.",
  },
  {
    icon: <IconShieldLock />,
    title: 'Unattended access',
    body: 'Set a second, fixed password once and reconnect any time — nobody needs to be sitting at the keyboard to read out a fresh code.',
  },
  {
    icon: <IconShieldAlert />,
    title: 'Brute-force lockout',
    body: 'Repeated wrong guesses lock the device out with escalating backoff. Every password is stored as a PBKDF2 hash, never in the clear.',
  },
  {
    icon: <IconServer />,
    title: 'Deploy it yourself, for free',
    body: "One script stands up the full stack behind a Cloudflare Tunnel on Oracle Cloud's Always Free tier — no open ports, no certificate to manage, no bill.",
  },
  {
    icon: <IconTag />,
    title: 'No accounts, no per-seat pricing',
    body: "Ad-hoc support needs nothing but an ID and a password. There's no license to buy and no seat count to manage.",
  },
];

const STEPS = [
  {
    title: 'Share your ID and password',
    body: 'Read out the 9-digit ID and the current password — or set a fixed one first for unattended access.',
  },
  {
    title: 'They connect from a browser or the app',
    body: 'Your partner enters both on the connect screen. Viewing works from any modern browser — no install required to watch.',
  },
  {
    title: 'Control starts automatically',
    body: 'Once the desktop app is sharing, mouse and keyboard control arms itself the moment they connect. No extra prompts.',
  },
];

const SECURITY_POINTS = [
  {
    icon: <IconShieldLock />,
    title: 'Hashed, never stored in plaintext',
    body: 'Both the rotating and unattended passwords go through PBKDF2-HMAC-SHA256 with 200,000 iterations before they ever touch disk.',
  },
  {
    icon: <IconKey />,
    title: 'Unambiguous by design',
    body: 'Passwords are drawn from a 32-symbol alphabet with no 0/O or 1/l/I confusion, so reading one aloud over a call never gets mistyped.',
  },
  {
    icon: <IconShieldAlert />,
    title: 'Escalating lockout, not a soft rate limit',
    body: 'Five wrong guesses locks a device out for 30 seconds, then 2 minutes, then 10 — and rotating the password never resets an attacker’s lockout.',
  },
  {
    icon: <IconCheck />,
    title: 'Ownership proven by secret, not guesswork',
    body: "A device's permanent ID can only be reclaimed by whoever holds its private ownership secret — nobody can hijack an ID they don't already control.",
  },
];

const COMPARE_ROWS: Array<{ label: string; zenta: boolean | string; others: boolean | string }> = [
  { label: 'Self-hosted option', zenta: true, others: false },
  { label: 'Password auto-rotates while idle', zenta: true, others: false },
  { label: 'Fixed password for unattended access', zenta: true, others: true },
  { label: 'Native mouse & keyboard control', zenta: true, others: true },
  { label: 'Per-seat / subscription licensing', zenta: false, others: true },
  { label: 'Own the infrastructure your sessions run on', zenta: true, others: false },
];

const FAQS = [
  {
    q: 'Is Zenta really free?',
    a: "Yes. There's no billing system in the product at all — you self-host it on a free-tier VPS (the docs walk through Oracle Cloud's Always Free ARM tier) and there's no per-seat or subscription cost.",
  },
  {
    q: 'Do I need to create an account?',
    a: 'Not for ad-hoc support. The ID + password flow works with no sign-up at all. A separate account system exists if you want saved contacts and share requests, but it’s optional.',
  },
  {
    q: 'Can the person helping me actually control my mouse and keyboard, or just watch?',
    a: 'Full control, not just viewing. Once the desktop app is sharing your screen, mouse and keyboard control is armed automatically the moment your partner connects.',
  },
  {
    q: 'What is unattended access and how do I turn it on?',
    a: 'It’s a second, fixed password you set once (separate from the one that rotates every 60 seconds) so you or a trusted partner can reconnect later without anyone at the keyboard to read out a fresh code. Turn it on from the connect screen.',
  },
  {
    q: 'Does Zenta host this for me?',
    a: 'No — you run it yourself. That’s the point: one script deploys the whole stack behind a Cloudflare Tunnel, so nothing is billed and nobody but you operates the server.',
  },
  {
    q: 'What platforms are supported?',
    a: 'The computer being controlled needs the Windows desktop app for full input control. Whoever is helping can connect from any modern desktop browser — no install required to view.',
  },
];

export default function LandingPage() {
  const year = new Date().getFullYear();
  return (
    <div className="page lp">
      <header className="topbar">
        <Link href="/" className="topbar__brand" aria-label="Zenta home">
          <span className="brand-logo">Z</span>
          <span>Zenta</span>
        </Link>
        <nav className="topbar__nav" aria-label="Primary">
          <a href="#features" className="navlink">Features</a>
          <a href="#security" className="navlink">Security</a>
          <a href="#compare" className="navlink">Compare</a>
          <a href="#faq" className="navlink">FAQ</a>
        </nav>
        <div className="lp-nav__cta">
          <Link href="/login" className="btn btn--ghost btn--sm">Sign in</Link>
          <Link href="/connect" className="btn btn--primary btn--sm">Get your ID</Link>
        </div>
      </header>

      {/* ---------------------------------------------------------- hero -- */}
      <section className="lp-hero">
        <div className="lp-container lp-hero__grid">
          <div>
            <span className="lp-eyebrow"><span className="dot" />Free forever &middot; self-hosted</span>
            <h1>
              Remote support and screen sharing, <em>without the subscription.</em>
            </h1>
            <p className="lp-hero__sub">
              Zenta gives every computer a permanent ID and a password that rotates every 60
              seconds — the connect flow you already know, built on open infrastructure you run
              yourself for free.
            </p>
            <div className="lp-hero__ctas">
              <Link href="/connect" className="btn btn--primary">Get your ID — free</Link>
              <Link href="/download" className="btn btn--ghost">Download for Windows</Link>
            </div>
            <div className="lp-badges">
              <span className="lp-badge"><IconCheck />PBKDF2-SHA256 password hashing</span>
              <span className="lp-badge"><IconCheck />Escalating brute-force lockout</span>
              <span className="lp-badge"><IconCheck />No account required</span>
              <span className="lp-badge"><IconCheck />Self-host on your own free VPS</span>
            </div>
          </div>

          <div className="lp-mock" aria-hidden="true">
            <div className="lp-mock__dot-row">
              <span className="lp-mock__dot" />
              <span className="lp-mock__dot" />
              <span className="lp-mock__dot" />
            </div>
            <div className="lp-mock__field">
              <div className="lp-mock__label">Your ID</div>
              <div className="lp-mock__value"><span>129 354 196</span></div>
            </div>
            <div className="lp-mock__field">
              <div className="lp-mock__label">Password</div>
              <div className="lp-mock__value">
                <span>kx7 m2p 9q</span>
                <span className="lp-mock__timer">rotates in 47s</span>
              </div>
            </div>
            <div className="lp-mock__foot"><IconCheck />New password issued automatically — the old one stops working instantly</div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- features -- */}
      <section className="lp-section" id="features">
        <div className="lp-container">
          <div className="lp-section__head">
            <span className="lp-section__eyebrow">Why Zenta</span>
            <h2 className="lp-section__title">Everything a paid remote-support tool has — none of the seat count</h2>
            <p className="lp-section__sub">
              Built for the moment someone needs help on their computer right now, and for the
              machines you want to be able to reach again without anyone present.
            </p>
          </div>
          <div className="lp-bento">
            {FEATURES.map((f) => (
              <div className="lp-feature" key={f.title}>
                <div className="lp-feature__icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- how it works -- */}
      <section className="lp-section lp-section--tight" id="how-it-works">
        <div className="lp-container">
          <div className="lp-section__head">
            <span className="lp-section__eyebrow">How it works</span>
            <h2 className="lp-section__title">Three steps, no installer required to watch</h2>
          </div>
          <div className="lp-steps">
            {STEPS.map((s, i) => (
              <div className="lp-step" key={s.title}>
                <div className="lp-step__num">{i + 1}</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- security -- */}
      <section className="lp-section" id="security">
        <div className="lp-container">
          <div className="lp-section__head">
            <span className="lp-section__eyebrow">Security</span>
            <h2 className="lp-section__title">The password is the only thing standing between a stranger and full control</h2>
            <p className="lp-section__sub">So it&apos;s treated like one.</p>
          </div>
          <div className="lp-security">
            <div className="lp-security__list">
              {SECURITY_POINTS.map((p) => (
                <div className="lp-security__item" key={p.title}>
                  {p.icon}
                  <div>
                    <h4>{p.title}</h4>
                    <p>{p.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <pre className="lp-code">
{'POST /api/v1/device/connect\n{\n  "device_id": "129354196",\n  "password": "kx7m2p9q"\n}\n\n'}
<span className="c1">{'→ pbkdf2_sha256$200000$<salt>$<hash>'}</span>{'\n'}
<span className="c3">{'→ 5 wrong guesses  '}</span><span className="c2">{'locked 30s'}</span>{'\n'}
<span className="c3">{'→ 5 more           '}</span><span className="c2">{'locked 120s'}</span>{'\n'}
<span className="c3">{'→ 5 more           '}</span><span className="c2">{'locked 600s'}</span>
            </pre>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- compare -- */}
      <section className="lp-section lp-section--tight" id="compare">
        <div className="lp-container">
          <div className="lp-section__head">
            <span className="lp-section__eyebrow">Compare</span>
            <h2 className="lp-section__title">Zenta vs. hosted remote-support tools</h2>
          </div>
          <div className="lp-table-wrap">
            <table className="lp-table">
              <thead>
                <tr>
                  <th scope="col">&nbsp;</th>
                  <th scope="col">Zenta</th>
                  <th scope="col">Typical hosted tool</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    <td className={row.zenta === true ? 'yes' : row.zenta === false ? 'no' : ''}>
                      {row.zenta === true ? 'Yes' : row.zenta === false ? '—' : row.zenta}
                    </td>
                    <td className={row.others === true ? 'yes' : row.others === false ? 'no' : ''}>
                      {row.others === true ? 'Yes' : row.others === false ? '—' : row.others}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="faint" style={{ fontSize: 12.5, marginTop: 14, textAlign: 'center' }}>
            &ldquo;Typical hosted tool&rdquo; describes the common shape of proprietary,
            cloud-hosted remote-support products in general — check any specific vendor&apos;s
            current plans before you decide.
          </p>
        </div>
      </section>

      {/* -------------------------------------------------------------- faq -- */}
      <section className="lp-section" id="faq">
        <div className="lp-container">
          <div className="lp-section__head">
            <span className="lp-section__eyebrow">FAQ</span>
            <h2 className="lp-section__title">Questions people ask before their first session</h2>
          </div>
          <div className="lp-faq">
            {FAQS.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- final cta -- */}
      <section className="lp-section lp-section--tight">
        <div className="lp-container">
          <div className="lp-cta">
            <h2>Ready to help someone in under a minute?</h2>
            <p>Get your ID, share the current password, and you&apos;re connected.</p>
            <div className="lp-cta__ctas">
              <Link href="/connect" className="btn btn--primary">Get your ID — free</Link>
              <Link href="/download" className="btn btn--ghost">Download for Windows</Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer__top">
            <div className="brand-mark" style={{ marginBottom: 0 }}>
              <div className="brand-logo">Z</div>
              <div>
                <div className="brand-name">Zenta</div>
                <div className="brand-tag">Remote support &middot; self-hosted</div>
              </div>
            </div>
            <div className="lp-footer__cols">
              <div className="lp-footer__col">
                <h4>Product</h4>
                <Link href="/connect">Get your ID</Link>
                <Link href="/download">Download</Link>
                <Link href="/login">Sign in</Link>
              </div>
              <div className="lp-footer__col">
                <h4>Learn more</h4>
                <a href="#how-it-works">How it works</a>
                <a href="#security">Security</a>
                <a href="#compare">Compare</a>
                <a href="#faq">FAQ</a>
              </div>
            </div>
          </div>
          <div className="lp-footer__bottom">
            <span>&copy; {year} Zenta. Remote support, self-hosted.</span>
            <span>Built on FastAPI, Next.js &amp; Electron.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
