// Shared WebRTC plumbing for SharePanel (publisher) and ViewPanel (viewer):
// signaling envelope/URL, ICE server fetch, and the default video send profile.
// See frontend/lib/endpoints.ts (URL resolution) and lib/host.ts (ControlEvent).

import { wsBase } from './endpoints';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';

export type SignalMessage =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit }
  | { type: 'hangup' }
  | { type: 'viewer-joined' };

export const POINTER_CHANNEL_LABEL = 'pointer';
export const CONTROL_CHANNEL_LABEL = 'control';

// Default screen-share profile: 1280x720, 15-20 fps, ~2.5 Mbps.
export const VIDEO_SEND_PROFILE = {
  width: 1280,
  height: 720,
  frameRate: 20,
  maxBitrateBps: 2_500_000,
};

export function signalingUrl(token: string, role: 'publisher' | 'viewer', sessionId?: string | null): string {
  const params = new URLSearchParams({ role, token });
  if (sessionId) params.set('session', sessionId);
  return `${wsBase()}/api/v1/ws/screen-webrtc?${params.toString()}`;
}

export function sendSignal(ws: WebSocket, msg: SignalMessage): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // socket closed mid-send — the caller's onclose/onerror handles teardown
  }
}

/** Fetches STUN (+ TURN, when the backend has a shared secret configured)
 *  ICE servers scoped to this session's JWT. Falls back to STUN-only if the
 *  request fails, so a transient backend hiccup degrades gracefully instead
 *  of blocking the peer connection outright. */
export async function fetchIceServers(token: string): Promise<RTCConfiguration> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/rtc/ice-servers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`ice-servers ${res.status}`);
    const body = (await res.json()) as { iceServers: RTCIceServer[] };
    return { iceServers: body.iceServers };
  } catch {
    return { iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }] };
  }
}

/** Applies the default video profile's bitrate/framerate cap to an already
 *  negotiated video sender. Must mutate the object `getParameters()` returns
 *  (not a fresh object) and `encodings` must be non-empty before mutating —
 *  most browsers reject `setParameters()` otherwise. */
export async function applyVideoSendProfile(sender: RTCRtpSender): Promise<void> {
  const params = sender.getParameters();
  if (!params.encodings || params.encodings.length === 0) {
    params.encodings = [{}];
  }
  params.encodings[0].maxBitrate = VIDEO_SEND_PROFILE.maxBitrateBps;
  params.encodings[0].maxFramerate = VIDEO_SEND_PROFILE.frameRate;
  try {
    await sender.setParameters(params);
  } catch {
    // Some browsers reject setParameters before the first negotiation
    // completes — the profile just falls back to the encoder's defaults.
  }
}
