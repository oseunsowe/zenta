import { getStoredUserToken } from './users';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';

export type ShareRequestStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export interface ShareRequest {
  id: number;
  from_username: string;
  to_username: string;
  note: string | null;
  status: ShareRequestStatus;
  session_id: string | null;
  created_at: number;
  expires_at: number;
}

function authHeaders(): HeadersInit {
  const token = getStoredUserToken();
  if (!token) throw new Error('Not logged in');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers || {}) },
  });
  if (response.status === 401) throw new Error('Login required');
  if (response.status === 403) throw new Error('Forbidden');
  if (response.status === 404) throw new Error('Not found');
  if (response.status === 409) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || 'Conflict');
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export function createShareRequest(toUsername: string, note?: string): Promise<ShareRequest> {
  return call('/api/v1/share-request', {
    method: 'POST',
    body: JSON.stringify({ to_username: toUsername, note }),
  });
}

export function listIncoming(): Promise<ShareRequest[]> {
  return call('/api/v1/share-request/incoming');
}

export function listOutgoing(): Promise<ShareRequest[]> {
  return call('/api/v1/share-request/outgoing');
}

export function respondShareRequest(id: number, accept: boolean): Promise<ShareRequest> {
  return call(`/api/v1/share-request/${id}/respond`, {
    method: 'POST',
    body: JSON.stringify({ accept }),
  });
}

export function cancelShareRequest(id: number): Promise<ShareRequest> {
  return call(`/api/v1/share-request/${id}/cancel`, { method: 'POST' });
}
