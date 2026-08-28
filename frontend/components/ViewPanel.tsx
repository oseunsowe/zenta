'use client';

import { useEffect, useRef, useState } from 'react';

import { getStoredSessionToken } from '../lib/invite';
import { startPair } from '../lib/pair';
import { getStoredUserToken, homePath } from '../lib/users';
import { getViewerToken } from '../lib/device';
import { wsBase } from '../lib/endpoints';
import type { ControlEvent } from '../lib/host';

// Convert a browser wheel delta into scroll "notches" for the host.
//
// deltaMode 0 reports pixels (~100 per notch on a typical mouse), 1 reports
// lines, 2 reports pages. The host injects the number it is given as scroll
// units, so forwarding a raw pixel delta scrolled roughly 100x too far — one
// flick of the wheel jumped the remote screen to the bottom of the document.
function wheelNotches(delta: number, deltaMode: number): number {
  if (!delta) return 0;
  const perNotch = deltaMode === 0 ? 100 : deltaMode === 1 ? 3 : 1;
  const n = delta / perNotch;
  // Never round a real scroll down to nothing — trackpads emit small deltas.
  return n > 0 ? Math.max(1, Math.round(n)) : Math.min(-1, Math.round(n));
}

function wsUrl(token: string, sessionId?: string | null) {
  const params = new URLSearchParams({ role: 'viewer', token });
  if (sessionId) params.set('session', sessionId);
  return `${wsBase()}/api/v1/ws/screen?${params.toString()}`;
}

export default function ViewPanel({ sessionId }: { sessionId?: string } = {}) {
  const PASSWORD_ROTATE_MS = 5 * 60 * 1000;
  const ROTATE_WARNING_MS = 30 * 1000;
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [pairHint, setPairHint] = useState<string | null>(null);
  const [rotationCountdownMs, setRotationCountdownMs] = useState(PASSWORD_ROTATE_MS);
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
  const activePointerRef = useRef<number | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const rotatedAfterDisconnectRef = useRef(false);
  const nextRotationAtRef = useRef<number>(Date.now() + PASSWORD_ROTATE_MS);

  function formatCountdown(ms: number) {
    const safe = Math.max(0, ms);
    const total = Math.ceil(safe / 1000);
    const minutes = Math.floor(total / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (total % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  function resetRotationDeadline() {
    nextRotationAtRef.current = Date.now() + PASSWORD_ROTATE_MS;
    setRotationCountdownMs(PASSWORD_ROTATE_MS);
  }

  function endSession() {
    try { wsRef.current?.close(); } catch {}
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    // Hard navigation: reliably leaves this fullscreen WS page even mid-stream.
    window.location.assign(homePath());
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

  function pointerCoords(event: React.PointerEvent<HTMLImageElement>) {
    const img = event.currentTarget;
    const rect = img.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  }

  function sendQuickAction(event: ControlEvent) {
    if (!sendingInputRef.current) return;
    sendCtrl(event);
  }

  async function generateCode() {
    const token = getStoredSessionToken();
    if (!token) return; // username/password mode doesn't need a pair code
    try {
      const res = await startPair(token);
      setPairCode(res.code);
      setPairHint('New remote password generated.');
      resetRotationDeadline();
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
    if (sessionId) return;
    resetRotationDeadline();
    const timer = window.setInterval(() => {
      setPairHint('Remote password auto-rotated for security. Share the newest password only.');
      void generateCode();
    }, PASSWORD_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) return;
    const ticker = window.setInterval(() => {
      const remaining = Math.max(0, nextRotationAtRef.current - Date.now());
      setRotationCountdownMs(remaining);
    }, 250);
    return () => window.clearInterval(ticker);
  }, [sessionId]);

  useEffect(() => {
    // Pick auth token: prefer logged-in user JWT when we have a session_id from the share-request flow.
    // Device-connect viewers hold a session-scoped token instead of a user JWT.
    const token = sessionId
      ? getStoredUserToken() ?? getViewerToken()
      : getStoredSessionToken();
    if (!token) {
      setStatus('unauthorized');
      return;
    }
    const ws = new WebSocket(wsUrl(token, sessionId));
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;
    rotatedAfterDisconnectRef.current = false;

    const rotateAfterDrop = () => {
      if (sessionId || rotatedAfterDisconnectRef.current) return;
      rotatedAfterDisconnectRef.current = true;
      setPairHint('Connection dropped. Generated a fresh remote password for safety.');
      void generateCode();
    };

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
    ws.onclose = () => {
      setStatus('disconnected');
      rotateAfterDrop();
    };
    ws.onerror = () => {
      setStatus('disconnected');
      rotateAfterDrop();
    };

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
  //
  // Down and up are sent separately so the host holds what you hold: Shift+drag,
  // Ctrl+click, and arrow-key repeat all need the key to stay pressed. Sending
  // only keydown (as this used to) made every key an instant press-and-release,
  // so no modifier could ever be combined with the mouse.
  useEffect(() => {
    function payload(e: KeyboardEvent, type: 'keydown' | 'keyup') {
      return {
        type,
        key: e.key,
        code: e.code,
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey,
      };
    }

    function onKeyDown(e: KeyboardEvent) {
      if (!sendingInputRef.current) return;
      // The host repeats held keys itself; forwarding OS auto-repeat as well
      // would double every character.
      if (!e.repeat) sendCtrl(payload(e, 'keydown'));
      e.preventDefault();
    }

    function onKeyUp(e: KeyboardEvent) {
      if (!sendingInputRef.current) return;
      sendCtrl(payload(e, 'keyup'));
      e.preventDefault();
    }

    // Losing focus mid-chord (alt-tab, clicking away) means the keyup never
    // arrives, so tell the host to drop everything it is holding.
    function onBlur() {
      if (!sendingInputRef.current) return;
      sendCtrl({ type: 'keyreset' });
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'unauthorized') {
    return (
      <div className="auth-viewport">
        <div className="auth-card">
          <h1 className="mt-0">Session unavailable</h1>
          <p className="muted">You need to be signed in to view a session.</p>
          <button type="button" className="btn btn--primary btn--block" onClick={() => window.location.assign(homePath())}>
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
            <button type="button" className="btn btn--primary btn--sm" onClick={() => window.location.assign(homePath())}>
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
              title="Send your mouse and keyboard to control the remote machine. The host desktop app auto-arms remote control while sharing."
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
          {status === 'streaming' && sendingInput ? (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => sendQuickAction({ type: 'click', x: 0.5, y: 0.5, button: 2 })}
                title="Right click at center"
              >
                Right click
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => sendQuickAction({ type: 'wheel', x: 0.5, y: 0.5, dy: -3 })}
                title="Scroll up"
              >
                Scroll ↑
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => sendQuickAction({ type: 'wheel', x: 0.5, y: 0.5, dy: 3 })}
                title="Scroll down"
              >
                Scroll ↓
              </button>
            </div>
          ) : null}
          {pairCode ? (
            <>
              <span style={{ color: '#8f98ba', fontSize: '12px' }}>Remote password:</span>
              <code style={{ fontSize: '20px', letterSpacing: '4px' }}>{pairCode}</code>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={async () => {
                  if (!pairCode) return;
                  try {
                    await navigator.clipboard.writeText(pairCode);
                    setPairHint('Remote password copied.');
                  } catch {
                    setPairHint('Copy failed. Please copy the password manually.');
                  }
                }}
                title="Copy current remote password"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={() => {
                  setPairHint('Remote password rotated. Share the new one only.');
                  void generateCode();
                }}
                style={{ fontSize: '12px' }}
              >
                Rotate password
              </button>
              <span
                style={{
                  fontSize: '12px',
                  color: rotationCountdownMs <= ROTATE_WARNING_MS ? '#ffb16b' : '#8f98ba',
                  fontWeight: rotationCountdownMs <= ROTATE_WARNING_MS ? 700 : 500,
                }}
                title="Time until the next automatic remote-password rotation"
              >
                rotates in {formatCountdown(rotationCountdownMs)}
              </span>
            </>
          ) : null}
        </div>
      </header>

      {status === 'waiting' ? (
        <div className="view-state">
          <p>Waiting for the other person to start sharing…</p>
          {shareUrl ? <p className="faint">Have them open: <code>{shareUrl}</code></p> : null}
          {pairCode ? <p className="faint">Or enter password <code>{pairCode}</code> at <code>/share</code>.</p> : null}
          {pairHint ? <p className="faint">{pairHint}</p> : null}
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
        onPointerDown={(event) => {
          if (!sendingInputRef.current) return;
          const { x, y } = pointerCoords(event);
          activePointerRef.current = event.pointerId;
          pointerStartRef.current = { x, y, moved: false };
          if (event.pointerType === 'touch') event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          sendCtrl({ type: 'move', x, y });
          sendCtrl({ type: 'down', x, y, button: event.button });
        }}
        onPointerMove={(event) => {
          if (!sendingInputRef.current) return;
          if (activePointerRef.current !== null && event.pointerId !== activePointerRef.current) return;
          const now = performance.now();
          if (now - lastMoveSentRef.current < 40) return; // ~25 Hz
          lastMoveSentRef.current = now;
          const { x, y } = pointerCoords(event);
          if (pointerStartRef.current) {
            const movedFar = Math.abs(pointerStartRef.current.x - x) > 0.01 || Math.abs(pointerStartRef.current.y - y) > 0.01;
            if (movedFar) pointerStartRef.current.moved = true;
          }
          sendCtrl({ type: 'move', x, y });
        }}
        onPointerUp={(event) => {
          if (!sendingInputRef.current) return;
          if (activePointerRef.current !== null && event.pointerId !== activePointerRef.current) return;
          const { x, y } = pointerCoords(event);
          sendCtrl({ type: 'up', x, y, button: event.button });
          if (pointerStartRef.current && !pointerStartRef.current.moved) {
            sendCtrl({ type: 'click', x, y, button: event.button });
          }
          pointerStartRef.current = null;
          activePointerRef.current = null;
          try {
            event.currentTarget.releasePointerCapture(event.pointerId);
          } catch {
            // Ignore if capture was not set.
          }
        }}
        onPointerCancel={(event) => {
          if (!sendingInputRef.current) return;
          const { x, y } = pointerCoords(event);
          sendCtrl({ type: 'up', x, y, button: event.button });
          pointerStartRef.current = null;
          activePointerRef.current = null;
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
          sendCtrl({
            type: 'wheel',
            x,
            y,
            dy: wheelNotches(event.deltaY, event.deltaMode),
            dx: wheelNotches(event.deltaX, event.deltaMode),
          });
        }}
        style={{
          flex: 1,
          objectFit: 'contain',
          background: '#000',
          display: status === 'streaming' ? 'block' : 'none',
          minHeight: 0,
          touchAction: 'none',
          cursor: sendingInput ? 'crosshair' : 'default',
        }}
      />

      {error ? <p style={{ color: '#ff9b9b', padding: '8px 16px' }}>{error}</p> : null}
    </main>
  );
}
