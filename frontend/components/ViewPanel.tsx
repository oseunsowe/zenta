'use client';

import { useEffect, useRef, useState } from 'react';

import { getStoredSessionToken } from '../lib/invite';
import { startPair } from '../lib/pair';
import { getStoredUserToken } from '../lib/users';
import { wsBase } from '../lib/endpoints';
import type { ControlEvent } from '../lib/host';

function wsUrl(token: string, sessionId?: string | null) {
  const params = new URLSearchParams({ role: 'viewer', token });
  if (sessionId) params.set('session', sessionId);
  return `${wsBase()}/api/v1/ws/screen?${params.toString()}`;
}

export default function ViewPanel({ sessionId }: { sessionId?: string } = {}) {
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'waiting' | 'streaming' | 'disconnected' | 'unauthorized'>('waiting');
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [sendingInput, setSendingInput] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameCountRef = useRef(0);
  const sendingInputRef = useRef(false);
  const lastMoveSentRef = useRef(0);

  function endSession() {
    try { wsRef.current?.close(); } catch {}
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    // Hard navigation: reliably leaves this fullscreen WS page even mid-stream.
    window.location.assign('/');
  }

  function sendCtrl(event: ControlEvent) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !sendingInputRef.current) return;
    try {
      ws.send(JSON.stringify(event));
    } catch {}
  }

  function relativeCoords(event: React.MouseEvent<HTMLImageElement> | React.WheelEvent<HTMLImageElement>) {
    const img = event.currentTarget;
    const rect = img.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  }

  async function generateCode() {
    const token = getStoredSessionToken();
    if (!token) return; // username/password mode doesn't need a pair code
    try {
      const res = await startPair(token);
      setPairCode(res.code);
      if (res.lan_url) {
        const url = new URL(res.lan_url);
        url.pathname = '/share';
        setShareUrl(url.toString());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'pair-start failed');
    }
  }

  useEffect(() => {
    if (!sessionId) void generateCode();
  }, [sessionId]);

  useEffect(() => {
    // Pick auth token: prefer logged-in user JWT when we have a session_id from the share-request flow.
    const token = sessionId ? getStoredUserToken() : getStoredSessionToken();
    if (!token) {
      setStatus('unauthorized');
      return;
    }
    const ws = new WebSocket(wsUrl(token, sessionId));
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') return;
      const blob = new Blob([event.data], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      if (imgRef.current) imgRef.current.src = url;
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = url;
      frameCountRef.current += 1;
      if (status !== 'streaming') setStatus('streaming');
    };
    ws.onclose = () => setStatus('disconnected');
    ws.onerror = () => setStatus('disconnected');

    const fpsTimer = window.setInterval(() => {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
    }, 1000);

    return () => {
      window.clearInterval(fpsTimer);
      try { ws.close(); } catch {}
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, [sessionId]);

  // Forward keystrokes to the remote machine while control is enabled.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!sendingInputRef.current) return;
      sendCtrl({
        type: 'key',
        key: e.key,
        code: e.code,
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey,
      });
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'unauthorized') {
    return (
      <div className="auth-viewport">
        <div className="auth-card">
          <h1 className="mt-0">Session unavailable</h1>
          <p className="muted">You need to be signed in to view a session.</p>
          <button type="button" className="btn btn--primary btn--block" onClick={() => window.location.assign('/')}>
            Back to home
          </button>
        </div>
      </div>
    );
  }

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#000' }}>
      <header style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0d1024', color: '#fff', borderBottom: '1px solid #2a2f4a' }}>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
          {status !== 'disconnected' ? (
            <button type="button" className="btn btn--danger btn--sm" onClick={endSession}>
              End session
            </button>
          ) : (
            <button type="button" className="btn btn--primary btn--sm" onClick={() => window.location.assign('/')}>
              ← Home
            </button>
          )}
          <strong>Remote screen</strong>
          <span style={{ color: '#8f98ba', fontSize: '13px' }}>
            {status === 'streaming' ? `${fps} fps` : status}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
          {status === 'streaming' ? (
            <label
              style={{ fontSize: '13px', color: sendingInput ? '#7ee0a0' : '#aab1d8', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
              title="Send your mouse and keyboard to control the remote machine. They must allow remote control on their side."
            >
              <input
                type="checkbox"
                checked={sendingInput}
                onChange={(event) => {
                  sendingInputRef.current = event.target.checked;
                  setSendingInput(event.target.checked);
                }}
              />
              {sendingInput ? '🖱 Controlling' : 'Control'}
            </label>
          ) : null}
          {pairCode ? (
            <>
              <span style={{ color: '#8f98ba', fontSize: '12px' }}>Pair code:</span>
              <code style={{ fontSize: '20px', letterSpacing: '4px' }}>{pairCode}</code>
              <button type="button" onClick={generateCode} style={{ fontSize: '12px' }}>New code</button>
            </>
          ) : null}
        </div>
      </header>

      {status === 'waiting' ? (
        <div className="view-state">
          <p>Waiting for the other person to start sharing…</p>
          {shareUrl ? <p className="faint">Have them open: <code>{shareUrl}</code></p> : null}
          {pairCode ? <p className="faint">Or enter code <code>{pairCode}</code> at <code>/share</code>.</p> : null}
          <button type="button" className="btn btn--ghost" onClick={endSession}>Cancel</button>
        </div>
      ) : null}

      {status === 'disconnected' ? (
        <div className="view-state">
          <p>The session ended or the connection dropped.</p>
          <button type="button" className="btn btn--primary" onClick={endSession}>Back to home</button>
        </div>
      ) : null}

      <img
        ref={imgRef}
        alt=""
        onMouseMove={(event) => {
          const now = performance.now();
          if (now - lastMoveSentRef.current < 40) return; // ~25 Hz
          lastMoveSentRef.current = now;
          const { x, y } = relativeCoords(event);
          sendCtrl({ type: 'move', x, y });
        }}
        onMouseDown={(event) => {
          const { x, y } = relativeCoords(event);
          sendCtrl({ type: 'down', x, y, button: event.button });
        }}
        onMouseUp={(event) => {
          const { x, y } = relativeCoords(event);
          sendCtrl({ type: 'up', x, y, button: event.button });
        }}
        onClick={(event) => {
          const { x, y } = relativeCoords(event);
          sendCtrl({ type: 'click', x, y, button: event.button });
        }}
        onDoubleClick={(event) => {
          const { x, y } = relativeCoords(event);
          sendCtrl({ type: 'dblclick', x, y, button: event.button });
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          const { x, y } = relativeCoords(event);
          sendCtrl({ type: 'click', x, y, button: 2 });
        }}
        onWheel={(event) => {
          const { x, y } = relativeCoords(event);
          sendCtrl({ type: 'wheel', x, y, dy: event.deltaY, dx: event.deltaX });
        }}
        style={{
          flex: 1,
          objectFit: 'contain',
          background: '#000',
          display: status === 'streaming' ? 'block' : 'none',
          minHeight: 0,
          cursor: sendingInput ? 'crosshair' : 'default',
        }}
      />

      {error ? <p style={{ color: '#ff9b9b', padding: '8px 16px' }}>{error}</p> : null}
    </main>
  );
}
