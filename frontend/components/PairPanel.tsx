'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

import { getStoredSessionToken } from '../lib/invite';
import { PairStartResponse, startPair } from '../lib/pair';

export default function PairPanel() {
  const [data, setData] = useState<PairStartResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  async function start() {
    setError(null);
    const token = getStoredSessionToken();
    if (!token) {
      setError('Not signed in. Authenticate with an invite code first.');
      return;
    }
    try {
      const res = await startPair(token);
      setData(res);
      setSecondsLeft(res.expires_in);
      if (res.lan_url) {
        const png = await QRCode.toDataURL(res.lan_url, { width: 256, margin: 1 });
        setQrDataUrl(png);
      } else {
        setQrDataUrl(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'pair-start failed');
    }
  }

  useEffect(() => {
    void start();
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = window.setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [secondsLeft]);

  return (
    <section className="chat-container">
      <div className="chat-header">
        <h2>Pair another device</h2>
        <p>
          Scan from your phone or enter the code at <code>/control</code> on another machine.
          Both devices then share the same companion session.
        </p>
      </div>

      {error ? <p style={{ color: '#ff9b9b' }}>{error}</p> : null}

      {data ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '20px' }}>
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Pair QR code" style={{ borderRadius: '8px' }} />
          ) : (
            <p style={{ color: '#8f98ba' }}>
              No LAN IP detected. Pair manually with the 6-digit code below.
            </p>
          )}

          <div style={{ fontSize: '28px', letterSpacing: '8px', fontFamily: 'monospace' }}>
            {data.code}
          </div>

          {data.lan_url ? (
            <code style={{ fontSize: '12px', color: '#8f98ba' }}>{data.lan_url}</code>
          ) : null}

          <p style={{ color: '#8f98ba' }}>
            Expires in {secondsLeft}s.{' '}
            {secondsLeft === 0 ? (
              <button type="button" onClick={start}>Regenerate</button>
            ) : null}
          </p>
        </div>
      ) : (
        <p style={{ color: '#8f98ba', padding: '20px' }}>Generating pairing code…</p>
      )}
    </section>
  );
}
