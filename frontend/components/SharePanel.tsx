'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

import { claimPair } from '../lib/pair';
import { getStoredUserToken, homePath } from '../lib/users';
import { storedDeviceToken } from '../lib/device';
import { wsBase } from '../lib/endpoints';
import { applyRemoteInput, isDesktop, remoteControlAvailable, setRemoteControl, type ControlEvent } from '../lib/host';

function wsUrl(token: string, sessionId?: string | null) {
  const params = new URLSearchParams({ role: 'publisher', token });
  if (sessionId) params.set('session', sessionId);
  return `${wsBase()}/api/v1/ws/screen?${params.toString()}`;
}

export default function SharePanel({ initialCode, sessionId }: { initialCode?: string; sessionId?: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState(initialCode ?? '');
  const [pairing, setPairing] = useState(false);
  const [status, setStatus] = useState<'idle' | 'requesting' | 'streaming' | 'stopped'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [viewers, setViewers] = useState<number | null>(null);
  const [acceptInput, setAcceptInput] = useState(false);
  const [canControl, setCanControl] = useState(false);
  const [remotePointer, setRemotePointer] = useState<{ x: number; y: number } | null>(null);
  const acceptInputRef = useRef(false);
  const remoteControlArmedRef = useRef(false);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => {
    // session-id mode: use stored user JWT, no pair-code dance.
    if (sessionId && !token) {
      // Accountless device flow has no user JWT — fall back to this
      // machine's device token, which is scoped to its own session.
      const userToken = getStoredUserToken() ?? storedDeviceToken();
      if (userToken) {
        setToken(userToken);
        return;
      }
    }
    if (initialCode && !token) void doPair(initialCode);
  }, [initialCode, sessionId]);

  async function doPair(code: string) {
    setPairing(true);
    setError(null);
    try {
      const res = await claimPair(code.trim());
      setToken(res.token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'claim failed';
      setError(msg === 'invalid-or-expired' ? 'Code expired or already used.' : msg);
    } finally {
      setPairing(false);
    }
  }

  async function startSharing() {
    if (!token) return;
    if (!('mediaDevices' in navigator) || !('getDisplayMedia' in navigator.mediaDevices)) {
      setError('Screen capture is not available. Use Chrome or Edge on this page over localhost or HTTPS.');
      return;
    }

    setStatus('requesting');
    setError(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: false,
      });
    } catch (err) {
      setStatus('idle');
      const name = err instanceof DOMException ? err.name : '';
      const detail = err instanceof Error ? err.message : '';
      if (name === 'NotAllowedError' || name === 'AbortError') {
        // Cancelled at the picker, OR blocked (e.g. opened over a LAN IP with an
        // untrusted cert, or in an embedded/desktop context without capture).
        setError(
          !window.isSecureContext
            ? 'Blocked: this page is not a secure context. Open it via https://localhost:8443 or HTTPS.'
            : 'Screen share was cancelled or blocked. Click "Start sharing", then choose a screen/window/tab and press Share. If you opened this via a LAN IP, use https://localhost:8443 on the sharing PC instead (untrusted certs block capture).'
        );
      } else if (name === 'NotFoundError') {
        setError('No screen, window, or tab was available to share.');
      } else if (name === 'NotReadableError') {
        setError('The OS could not start capture (another app may be using it). Close it and retry.');
      } else if (name === 'NotSupportedError' || name === 'SecurityError' || name === 'TypeError') {
        setError('Screen capture is not supported here. Use Chrome/Edge over https://localhost:8443 or HTTPS.');
      } else {
        setError(`Screen share failed${name ? ` (${name})` : ''}${detail ? `: ${detail}` : '.'}`);
      }
      return;
    }
    streamRef.current = stream;
    if (previewRef.current) {
      previewRef.current.srcObject = stream;
      void previewRef.current.play();
    }

    const ws = new WebSocket(wsUrl(token, sessionId));
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    let stopped = false;

    function stop() {
      if (stopped) return;
      stopped = true;
      try { ws.close(); } catch {}
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStatus('stopped');
    }
    stopRef.current = stop;

    stream.getVideoTracks()[0].addEventListener('ended', stop);

    ws.onopen = () => {
      setStatus('streaming');
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      // Cap the long edge — for remote control, frame rate matters far more than
      // resolution, and a smaller frame encodes/transmits much faster.
      const srcW = settings.width || 1280;
      const srcH = settings.height || 720;
      const scale = Math.min(1, 1280 / srcW);
      const width = Math.max(1, Math.round(srcW * scale));
      const height = Math.max(1, Math.round(srcH * scale));

      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      void video.play();

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setError('Canvas unsupported');
        stop();
        return;
      }

      const MIN_FRAME_MS = 66; // ceiling ~15 fps
      const MAX_BUFFERED = 384_000; // wait, don't drop, when the socket is busy
      let lastSent = 0;

      // Self-paced loop: send as fast as the socket drains, up to ~15 fps.
      // Replaces the old fixed 200ms interval that collapsed to ~1 fps under
      // any back-pressure.
      const pump = async () => {
        if (stopped || ws.readyState !== WebSocket.OPEN) return;
        const elapsed = performance.now() - lastSent;
        if (elapsed < MIN_FRAME_MS) {
          setTimeout(pump, MIN_FRAME_MS - elapsed);
          return;
        }
        if (ws.bufferedAmount > MAX_BUFFERED || video.readyState < 2) {
          setTimeout(pump, 16);
          return;
        }
        try {
          ctx.drawImage(video, 0, 0, width, height);
          const blob: Blob | null = await new Promise((resolve) =>
            canvas.toBlob(resolve, 'image/jpeg', 0.55)
          );
          if (blob && !stopped && ws.readyState === WebSocket.OPEN) {
            ws.send(await blob.arrayBuffer());
            lastSent = performance.now();
          }
        } catch {
          // skip this frame
        }
        if (!stopped) setTimeout(pump, 0);
      };
      void pump();
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      let msg: ControlEvent;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      // Visual feedback dot for positional events.
      if ((acceptInputRef.current || remoteControlArmedRef.current) && 'x' in msg && typeof msg.x === 'number') {
        setRemotePointer({ x: msg.x, y: msg.y });
      }
      // Real OS input — auto-armed in desktop mode (UltraViewer-style host).
      if (remoteControlArmedRef.current) {
        applyRemoteInput(msg);
      }
    };

    ws.onclose = () => stop();
    ws.onerror = () => {
      setError('Relay connection failed.');
      stop();
    };
  }

  useEffect(() => () => stopRef.current?.(), []);

  // Native remote control is only possible inside the desktop app.
  useEffect(() => {
    const canArm = isDesktop() && remoteControlAvailable();
    setCanControl(canArm);
    remoteControlArmedRef.current = canArm;
    setRemoteControl(canArm);
  }, []);

  // Always revoke on unmount.
  useEffect(() => () => setRemoteControl(false), []);

  if (!token) {
    return (
      <main style={{ maxWidth: '480px', margin: '0 auto', padding: '24px' }}>
        <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>Share your screen</h2>
        <p style={{ color: '#8f98ba', fontSize: '14px', marginBottom: '16px' }}>
          Enter the 6-digit pair code shown on the viewer's device.
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

  function endAndLeave() {
    stopRef.current?.();
    window.location.assign(homePath());
  }

  return (
    <main style={{ maxWidth: '720px', margin: '0 auto', padding: '24px' }}>
      <div className="session-toolbar">
        <button type="button" className="btn btn--ghost btn--sm" onClick={endAndLeave}>← Back to home</button>
        {status === 'streaming' ? (
          <button type="button" className="btn btn--danger btn--sm" onClick={endAndLeave}>End session</button>
        ) : null}
      </div>
      <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>Screen share</h2>
      <p style={{ color: '#8f98ba', fontSize: '14px', marginBottom: '16px' }}>
        Status: <strong>{status}</strong>
        {viewers !== null ? <> · {viewers} viewer{viewers === 1 ? '' : 's'}</> : null}
      </p>

      {status === 'idle' || status === 'stopped' ? (
        <button type="button" onClick={startSharing} style={{ padding: '12px 20px', fontSize: '16px' }}>
          Start sharing my screen
        </button>
      ) : (
        <button type="button" onClick={() => stopRef.current?.()} style={{ padding: '12px 20px', fontSize: '16px' }}>
          Stop sharing
        </button>
      )}

      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: '12px', fontSize: '13px', color: '#aab1d8' }}>
        <input
          type="checkbox"
          checked={acceptInput}
          onChange={(event) => {
            acceptInputRef.current = event.target.checked;
            setAcceptInput(event.target.checked);
            if (!event.target.checked) setRemotePointer(null);
          }}
        />
        show remote pointer
      </label>

      <span
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: '12px', fontSize: '13px', color: canControl ? '#7ee0a0' : '#5a6388' }}
        title={canControl
          ? 'Remote control is automatically enabled while this share page is open in the desktop app.'
          : 'Remote control requires the Zenta desktop app (a browser cannot grant OS control).'}
      >
        {canControl ? '🖱 remote control armed automatically' : 'remote control unavailable in browser host mode'}
      </span>

      {error ? <p style={{ color: '#ff9b9b', marginTop: '12px' }}>{error}</p> : null}

      <div style={{ position: 'relative', marginTop: '16px', border: '1px solid #2a2f4a', borderRadius: '8px', overflow: 'hidden', background: '#000' }}>
        <video ref={previewRef} muted style={{ width: '100%', maxHeight: '360px', display: 'block' }} />
        {remotePointer ? (
          <div
            style={{
              position: 'absolute',
              left: `${remotePointer.x * 100}%`,
              top: `${remotePointer.y * 100}%`,
              width: '18px',
              height: '18px',
              marginLeft: '-9px',
              marginTop: '-9px',
              borderRadius: '50%',
              background: 'rgba(255, 80, 80, 0.6)',
              border: '2px solid #fff',
              pointerEvents: 'none',
            }}
          />
        ) : null}
      </div>
      <p style={{ color: '#5a6388', fontSize: '12px', marginTop: '8px' }}>
        Browser requirement: Chrome/Edge over <code>localhost</code> or HTTPS. Over LAN HTTP, enable
        chrome://flags/#unsafely-treat-insecure-origin-as-secure and add this origin.
      </p>
    </main>
  );
}
