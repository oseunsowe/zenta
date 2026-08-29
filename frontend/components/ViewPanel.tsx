'use client';

import { useEffect, useRef, useState } from 'react';

import { getStoredSessionToken } from '../lib/invite';
import { startPair } from '../lib/pair';
import { getStoredUserToken, homePath } from '../lib/users';
import { getViewerToken } from '../lib/device';
import type { ControlEvent } from '../lib/host';
import {
  CONTROL_CHANNEL_LABEL,
  fetchIceServers,
  POINTER_CHANNEL_LABEL,
  sendSignal,
  signalingUrl,
  type SignalMessage,
} from '../lib/webrtc';
import RtcStatsPanel from './RtcStatsPanel';

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

// Pointer movement is coalesced to 45 updates/sec (the unordered/no-retransmit
// channel is meant for the *latest* position, not a queue of every position),
// and dropped entirely once the channel's own bufferedAmount shows the link
// can't keep up — better to skip a stale point than pile more on top of it.
const POINTER_INTERVAL_MS = 1000 / 45;
const POINTER_BUFFERED_HIGH_WATERMARK = 4096;

// Wheel events are the opposite of pointer moves: every notch matters (it's a
// distance, not a position), so none can be dropped — but a trackpad or a
// fast wheel fling emits many onWheel events per second, and each one used to
// mean a separate reliable data-channel message AND a separate pair of native
// calls on the host (position set + scroll). Now that the transport is fast
// enough to deliver every one of those individually, the host's sequential
// native-call execution can't keep up and scrolling visibly lags behind and
// keeps "catching up" after the wheel stops. Batching into fewer, summed
// sends fixes that without losing any scroll distance.
const WHEEL_FLUSH_MS = 50;

export default function ViewPanel({ sessionId }: { sessionId?: string } = {}) {
  const PASSWORD_ROTATE_MS = 5 * 60 * 1000;
  const ROTATE_WARNING_MS = 30 * 1000;
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [pairHint, setPairHint] = useState<string | null>(null);
  const [rotationCountdownMs, setRotationCountdownMs] = useState(PASSWORD_ROTATE_MS);
  const [status, setStatus] = useState<'waiting' | 'streaming' | 'disconnected' | 'unauthorized'>('waiting');
  const [error, setError] = useState<string | null>(null);
  const [sendingInput, setSendingInput] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const signalingRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pointerChannelRef = useRef<RTCDataChannel | null>(null);
  const controlChannelRef = useRef<RTCDataChannel | null>(null);
  const sendingInputRef = useRef(false);
  const pendingMoveRef = useRef<{ x: number; y: number } | null>(null);
  const moveTimerRef = useRef<number | null>(null);
  const pendingWheelRef = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const wheelTimerRef = useRef<number | null>(null);
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
    try { signalingRef.current?.close(); } catch {}
    try { pcRef.current?.close(); } catch {}
    // Hard navigation: reliably leaves this fullscreen page even mid-stream.
    window.location.assign(homePath());
  }

  function sendCtrl(event: ControlEvent, channel: 'pointer' | 'control' = 'control') {
    const dc = channel === 'pointer' ? pointerChannelRef.current : controlChannelRef.current;
    if (!dc || dc.readyState !== 'open' || !sendingInputRef.current) return;
    try {
      dc.send(JSON.stringify(event));
    } catch {}
  }

  function flushPointerMove() {
    moveTimerRef.current = null;
    const pending = pendingMoveRef.current;
    pendingMoveRef.current = null;
    const dc = pointerChannelRef.current;
    if (!pending || !dc || dc.readyState !== 'open' || !sendingInputRef.current) return;
    if (dc.bufferedAmount > POINTER_BUFFERED_HIGH_WATERMARK) {
      // Backpressure: drop this update instead of queuing behind an already
      // full channel — reschedule so the next flush picks up whatever the
      // freshest pointer position is once the channel drains.
      moveTimerRef.current = window.setTimeout(flushPointerMove, POINTER_INTERVAL_MS);
      return;
    }
    dc.send(JSON.stringify({ type: 'move', x: pending.x, y: pending.y }));
  }

  function schedulePointerMove(x: number, y: number) {
    pendingMoveRef.current = { x, y }; // always overwrite — only the latest position matters
    if (moveTimerRef.current !== null) return; // a flush is already scheduled
    moveTimerRef.current = window.setTimeout(flushPointerMove, POINTER_INTERVAL_MS);
  }

  function flushWheel() {
    wheelTimerRef.current = null;
    const pending = pendingWheelRef.current;
    pendingWheelRef.current = null;
    if (!pending) return;
    sendCtrl({ type: 'wheel', x: pending.x, y: pending.y, dy: pending.dy, dx: pending.dx });
  }

  // Sums every notch since the last flush instead of sending one message per
  // onWheel event — no scroll distance is lost, there's just one native
  // scroll call on the host instead of a dozen per second.
  function scheduleWheel(x: number, y: number, dy: number, dx: number) {
    const pending = pendingWheelRef.current;
    pendingWheelRef.current = {
      x, y, // latest position wins, same as pointer moves
      dy: (pending?.dy ?? 0) + dy,
      dx: (pending?.dx ?? 0) + dx,
    };
    if (wheelTimerRef.current !== null) return;
    wheelTimerRef.current = window.setTimeout(flushWheel, WHEEL_FLUSH_MS);
  }

  // `object-fit: contain` scales the video to fit the element while keeping
  // its aspect ratio, which almost always leaves letterboxing (black bars) on
  // one axis — the rendered picture is a smaller, centered rectangle inside
  // the element's box, not the whole box. Dividing by the raw element rect
  // ignores that offset, so every click would land off by however much
  // letterboxing there is — worse the more the host's screen and the
  // viewer's window disagree on aspect ratio, which is the common case.
  function videoRelativeCoords(video: HTMLVideoElement, clientX: number, clientY: number) {
    const rect = video.getBoundingClientRect();
    const naturalW = video.videoWidth || rect.width;
    const naturalH = video.videoHeight || rect.height;
    const scale = Math.min(rect.width / naturalW, rect.height / naturalH) || 1;
    const renderedW = naturalW * scale;
    const renderedH = naturalH * scale;
    const offsetX = (rect.width - renderedW) / 2;
    const offsetY = (rect.height - renderedH) / 2;
    const x = (clientX - rect.left - offsetX) / renderedW;
    const y = (clientY - rect.top - offsetY) / renderedH;
    // Clicks in the letterbox padding itself clamp to the nearest edge
    // instead of sending an out-of-picture coordinate.
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  }

  function relativeCoords(event: React.MouseEvent<HTMLVideoElement> | React.WheelEvent<HTMLVideoElement>) {
    return videoRelativeCoords(event.currentTarget, event.clientX, event.clientY);
  }

  function pointerCoords(event: React.PointerEvent<HTMLVideoElement>) {
    return videoRelativeCoords(event.currentTarget, event.clientX, event.clientY);
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

    let cancelled = false;
    rotatedAfterDisconnectRef.current = false;

    const rotateAfterDrop = () => {
      if (sessionId || rotatedAfterDisconnectRef.current) return;
      rotatedAfterDisconnectRef.current = true;
      setPairHint('Connection dropped. Generated a fresh remote password for safety.');
      void generateCode();
    };

    function teardown() {
      try { signalingRef.current?.close(); } catch {}
      try { pcRef.current?.close(); } catch {}
      signalingRef.current = null;
      pcRef.current = null;
      pointerChannelRef.current = null;
      controlChannelRef.current = null;
    }

    async function connect() {
      const iceServers = await fetchIceServers(token!);
      if (cancelled) return;

      const pc = new RTCPeerConnection(iceServers);
      pcRef.current = pc;

      pc.ontrack = (event) => {
        if (videoRef.current) videoRef.current.srcObject = event.streams[0];
        setStatus('streaming');
      };
      pc.ondatachannel = (event) => {
        if (event.channel.label === POINTER_CHANNEL_LABEL) pointerChannelRef.current = event.channel;
        else if (event.channel.label === CONTROL_CHANNEL_LABEL) controlChannelRef.current = event.channel;
      };
      pc.onconnectionstatechange = () => {
        if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
          setStatus('disconnected');
          rotateAfterDrop();
        }
      };
      pc.onicecandidate = (event) => {
        if (event.candidate && signalingRef.current) {
          sendSignal(signalingRef.current, { type: 'ice-candidate', candidate: event.candidate.toJSON() });
        }
      };

      const ws = new WebSocket(signalingUrl(token!, 'viewer', sessionId));
      signalingRef.current = ws;

      ws.onmessage = async (event) => {
        let msg: SignalMessage;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.type === 'offer') {
          await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal(ws, { type: 'answer', sdp: answer.sdp! });
        } else if (msg.type === 'ice-candidate') {
          try {
            await pc.addIceCandidate(msg.candidate);
          } catch {
            // Late/duplicate candidates are expected during trickle ICE — ignore.
          }
        } else if (msg.type === 'hangup') {
          setStatus('disconnected');
          rotateAfterDrop();
        }
      };
      ws.onclose = () => {
        setStatus('disconnected');
        rotateAfterDrop();
      };
      ws.onerror = () => {
        setStatus('disconnected');
        rotateAfterDrop();
      };
    }

    void connect();

    return () => {
      cancelled = true;
      teardown();
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
          <span style={{ color: '#8f98ba', fontSize: '13px' }}>{status}</span>
        </div>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
          {status === 'streaming' ? (
            <label
              style={{ fontSize: '13px', color: showStats ? '#7ee0a0' : '#aab1d8', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
              title="Show live connection stats: candidate type, RTT, loss, jitter, bitrate, fps, codec, buffered data."
            >
              <input type="checkbox" checked={showStats} onChange={(event) => setShowStats(event.target.checked)} />
              Stats
            </label>
          ) : null}
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

      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: status === 'streaming' ? 'block' : 'none' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onPointerDown={(event) => {
            if (!sendingInputRef.current) return;
            const { x, y } = pointerCoords(event);
            activePointerRef.current = event.pointerId;
            pointerStartRef.current = { x, y, moved: false };
            if (event.pointerType === 'touch') event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            sendCtrl({ type: 'move', x, y }, 'pointer');
            sendCtrl({ type: 'down', x, y, button: event.button });
          }}
          onPointerMove={(event) => {
            if (!sendingInputRef.current) return;
            if (activePointerRef.current !== null && event.pointerId !== activePointerRef.current) return;
            const { x, y } = pointerCoords(event);
            if (pointerStartRef.current) {
              const movedFar = Math.abs(pointerStartRef.current.x - x) > 0.01 || Math.abs(pointerStartRef.current.y - y) > 0.01;
              if (movedFar) pointerStartRef.current.moved = true;
            }
            schedulePointerMove(x, y);
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
            scheduleWheel(x, y, wheelNotches(event.deltaY, event.deltaMode), wheelNotches(event.deltaX, event.deltaMode));
          }}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            background: '#000',
            display: 'block',
            touchAction: 'none',
            cursor: 'default',
          }}
        />
        {showStats ? (
          <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
            <RtcStatsPanel pc={pcRef.current} pointerChannel={pointerChannelRef.current} controlChannel={controlChannelRef.current} />
          </div>
        ) : null}
      </div>

      {error ? <p style={{ color: '#ff9b9b', padding: '8px 16px' }}>{error}</p> : null}
    </main>
  );
}
