'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

import { claimPair } from '../lib/pair';
import { wsBase } from '../lib/endpoints';

const TOKEN_KEY = 'echoface_mobile_view_token';

function wsUrl(token: string) {
  return `${wsBase()}/api/v1/ws/screen?role=viewer&token=${encodeURIComponent(token)}`;
}

export default function MobileView({ initialCode }: { initialCode?: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState(initialCode ?? '');
  const [pairing, setPairing] = useState(false);
  const [status, setStatus] = useState<'waiting' | 'streaming' | 'disconnected'>('waiting');
  const [error, setError] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) : null;
    if (saved) setToken(saved);
  }, []);

  useEffect(() => {
    if (initialCode && !token) void doPair(initialCode);
  }, [initialCode, token]);

  async function doPair(code: string) {
    setPairing(true);
    setError(null);
    try {
      const res = await claimPair(code.trim());
      sessionStorage.setItem(TOKEN_KEY, res.token);
      setToken(res.token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'claim failed';
      setError(msg === 'invalid-or-expired' ? 'Code expired or already used.' : msg);
    } finally {
      setPairing(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    const ws = new WebSocket(wsUrl(token));
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (event) => {
      if (typeof event.data === 'string') return;
      const blob = new Blob([event.data], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      if (imgRef.current) imgRef.current.src = url;
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = url;
      if (status !== 'streaming') setStatus('streaming');
    };
    ws.onclose = () => setStatus('disconnected');
    ws.onerror = () => setStatus('disconnected');
    return () => {
      try { ws.close(); } catch {}
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, [token]);

  function unpair() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setStatus('waiting');
    setCodeInput('');
  }

  if (!token) {
    return (
      <main style={{ maxWidth: '480px', margin: '0 auto', padding: '24px' }}>
        <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>View remote screen</h2>
        <p style={{ color: '#8f98ba', fontSize: '14px', marginBottom: '16px' }}>
          Enter the 6-digit code from the device that is sharing.
        </p>
        <form
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            void doPair(codeInput);
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
        >
          <input
            value={codeInput}
            onChange={(event) => setCodeInput(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            style={{ fontSize: '24px', letterSpacing: '6px', textAlign: 'center', padding: '14px' }}
          />
          <button type="submit" disabled={pairing || codeInput.length !== 6}>
            {pairing ? 'Pairing…' : 'Pair'}
          </button>
          {error ? <p style={{ color: '#ff9b9b' }}>{error}</p> : null}
        </form>
      </main>
    );
  }

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#000' }}>
      <header style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0d1024', color: '#fff' }}>
        <span style={{ fontSize: '13px', color: '#8f98ba' }}>{status}</span>
        <button type="button" onClick={unpair} style={{ fontSize: '12px' }}>Unpair</button>
      </header>
      <img ref={imgRef} alt="" style={{ flex: 1, objectFit: 'contain', background: '#000', minHeight: 0 }} />
    </main>
  );
}
