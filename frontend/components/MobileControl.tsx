'use client';

import { FormEvent, useEffect, useState } from 'react';

import { sendChat } from '../lib/api';
import { claimPair } from '../lib/pair';

interface Msg {
  who: 'me' | 'them' | 'sys';
  text: string;
}

const TOKEN_KEY = 'echoface_control_token';

export default function MobileControl({ initialCode }: { initialCode?: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState(initialCode ?? '');
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) : null;
    if (saved) setToken(saved);
  }, []);

  useEffect(() => {
    if (initialCode && !token) void doClaim(initialCode);
  }, [initialCode, token]);

  async function doClaim(c: string) {
    setClaiming(true);
    setError(null);
    try {
      const res = await claimPair(c.trim());
      sessionStorage.setItem(TOKEN_KEY, res.token);
      setToken(res.token);
      setMessages([{ who: 'sys', text: 'Paired. You are now controlling the companion.' }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'claim failed';
      setError(msg === 'invalid-or-expired' ? 'Code expired or already used.' : msg);
    } finally {
      setClaiming(false);
    }
  }

  function signOut() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setMessages([]);
    setCodeInput('');
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !input.trim() || busy) return;
    const text = input.trim();
    setInput('');
    setMessages((m) => [...m, { who: 'me', text }]);
    setBusy(true);
    try {
      const res = await sendChat({ message: text, sessionToken: token });
      setMessages((m) => [...m, { who: 'them', text: res.reply }]);
    } catch (err) {
      setMessages((m) => [...m, { who: 'sys', text: 'Send failed. Re-pair if your token expired.' }]);
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <main style={{ maxWidth: '480px', margin: '0 auto', padding: '24px' }}>
        <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>Pair with companion</h2>
        <p style={{ color: '#8f98ba', fontSize: '14px', marginBottom: '16px' }}>
          Enter the 6-digit code shown on the desktop.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void doClaim(codeInput);
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
            aria-label="Pair code"
            style={{ fontSize: '24px', letterSpacing: '6px', textAlign: 'center', padding: '14px' }}
          />
          <button type="submit" disabled={claiming || codeInput.length !== 6}>
            {claiming ? 'Pairing…' : 'Pair'}
          </button>
          {error ? <p style={{ color: '#ff9b9b' }}>{error}</p> : null}
        </form>
      </main>
    );
  }

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: '600px', margin: '0 auto' }}>
      <header style={{ padding: '12px 16px', borderBottom: '1px solid #2a2f4a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Control</strong>
        <button type="button" onClick={signOut} style={{ fontSize: '12px' }}>Unpair</button>
      </header>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              alignSelf: msg.who === 'me' ? 'flex-end' : msg.who === 'them' ? 'flex-start' : 'center',
              maxWidth: '85%',
              background:
                msg.who === 'me' ? '#3a4f8a' : msg.who === 'them' ? '#1f2640' : 'transparent',
              color: msg.who === 'sys' ? '#8f98ba' : '#fff',
              padding: '10px 14px',
              borderRadius: '14px',
              fontSize: '15px',
            }}
          >
            {msg.text}
          </div>
        ))}
      </div>
      <form onSubmit={handleSend} style={{ display: 'flex', gap: '8px', padding: '12px 16px', borderTop: '1px solid #2a2f4a' }}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Message…"
          disabled={busy}
          style={{ flex: 1, fontSize: '16px', padding: '10px' }}
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </main>
  );
}
