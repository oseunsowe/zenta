// Accountless device identity for the UltraViewer-style connect screen.
//
// The ID must survive restarts, so it lives in localStorage alongside a secret
// that proves ownership of it. The password never persists — a fresh one is
// issued on every claim, which is exactly how UltraViewer behaves.

const ID_KEY = 'zenta.device.id';
const SECRET_KEY = 'zenta.device.secret';
const TOKEN_KEY = 'zenta.device.token';

export interface DeviceIdentity {
  deviceId: string;
  password: string;
  token: string;
  unattendedEnabled: boolean;
}

function store(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null; // private mode / blocked storage
  }
}

export function storedDeviceId(): string | null {
  return store()?.getItem(ID_KEY) ?? null;
}

export function storedDeviceToken(): string | null {
  return store()?.getItem(TOKEN_KEY) ?? null;
}

/** Group as 129 354 196, matching how the ID is read aloud. */
export function formatDeviceId(id: string): string {
  const digits = id.replace(/\D/g, '');
  return digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.detail) detail = String(data.detail);
    } catch {
      /* keep the status-code message */
    }
    const err = new Error(detail) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

/**
 * Claim this machine's identity. Re-presents a stored ID (with its secret) so
 * the same ID comes back, or mints a new one on first run. Always returns a
 * freshly generated password.
 */
export async function claimDevice(): Promise<DeviceIdentity> {
  const s = store();
  const data = await post<{
    device_id: string;
    secret: string;
    password: string;
    token: string;
    unattended_enabled: boolean;
  }>('/api/v1/device/claim', {
    device_id: s?.getItem(ID_KEY) ?? null,
    secret: s?.getItem(SECRET_KEY) ?? null,
  });
  try {
    s?.setItem(ID_KEY, data.device_id);
    s?.setItem(SECRET_KEY, data.secret);
    s?.setItem(TOKEN_KEY, data.token);
  } catch {
    // Storage unavailable: the session still works, the ID just won't persist.
  }
  return {
    deviceId: data.device_id,
    password: data.password,
    token: data.token,
    unattendedEnabled: data.unattended_enabled,
  };
}

function identityOrThrow(): { deviceId: string; secret: string } {
  const s = store();
  const deviceId = s?.getItem(ID_KEY);
  const secret = s?.getItem(SECRET_KEY);
  if (!deviceId || !secret) throw new Error('This device has no identity yet.');
  return { deviceId, secret };
}

/**
 * Issue a new password for this machine, invalidating the previous one.
 *
 * `auto` marks a rotation fired by the background timer rather than the user
 * clicking "New" — the server preserves an in-progress lockout in that case,
 * so a scheduled rotation can never double as a brute-force reset.
 */
export async function rotatePassword(auto = false): Promise<string> {
  const { deviceId, secret } = identityOrThrow();
  const data = await post<{ password: string }>('/api/v1/device/rotate', {
    device_id: deviceId,
    secret,
    auto,
  });
  return data.password;
}

/** Set (or replace) the fixed password used to connect with nobody present. */
export async function setUnattendedPassword(password: string): Promise<void> {
  const { deviceId, secret } = identityOrThrow();
  await post<{ enabled: boolean }>('/api/v1/device/unattended/set', {
    device_id: deviceId,
    secret,
    password,
  });
}

/** Turn off unattended access. The rotating password is unaffected. */
export async function clearUnattendedPassword(): Promise<void> {
  const { deviceId, secret } = identityOrThrow();
  await post<{ enabled: boolean }>('/api/v1/device/unattended/clear', {
    device_id: deviceId,
    secret,
  });
}

// The viewer token is for controlling SOMEONE ELSE's machine, so it is kept
// apart from this device's own host token — one machine can host and view at
// the same time. sessionStorage, not localStorage: control of another person's
// computer should not outlive the tab.
const VIEWER_TOKEN_KEY = 'zenta.device.viewerToken';

export function setViewerToken(token: string): void {
  try {
    window.sessionStorage.setItem(VIEWER_TOKEN_KEY, token);
  } catch {
    /* non-fatal */
  }
}

export function getViewerToken(): string | null {
  try {
    return window.sessionStorage.getItem(VIEWER_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Exchange a partner's ID + password for a viewer session on their machine. */
export async function connectToPartner(
  deviceId: string,
  password: string
): Promise<{ token: string; sessionId: string }> {
  const data = await post<{ token: string; session_id: string }>('/api/v1/device/connect', {
    device_id: deviceId,
    password,
  });
  return { token: data.token, sessionId: data.session_id };
}
