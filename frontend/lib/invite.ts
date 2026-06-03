import { InviteResponse } from './api';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
const INVITE_KEY = 'echoface_invite_code';
const TOKEN_KEY = 'echoface_session_token';

export function getStoredInviteCode(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(INVITE_KEY);
}

export function saveInviteCode(code: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(INVITE_KEY, code.trim());
}

export function clearInviteCode() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(INVITE_KEY);
}

export function getStoredSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function saveSessionToken(token: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearSessionToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
}

export async function authenticateInvite(code: string): Promise<InviteResponse> {
  const url = `${API_BASE}/api/v1/auth/invite`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite_code: code.trim() }),
    });
  } catch (err) {
    // Network-level failure (CORS, DNS, firewall, server down).
    throw new Error(
      `Cannot reach backend at ${url || '(empty API_BASE — set NEXT_PUBLIC_API_BASE_URL)'}. ` +
        'Is the backend running and is your origin in CORS_ALLOW_ORIGINS?'
    );
  }

  if (response.status === 403) {
    throw new Error('Invite code rejected by backend (403). Check case and spelling — codes are case-sensitive.');
  }
  if (response.status === 429) {
    throw new Error('Too many attempts. Wait a minute and try again.');
  }
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status} when validating invite.`);
  }

  const data: InviteResponse = await response.json();
  saveSessionToken(data.token);
  return data;
}
