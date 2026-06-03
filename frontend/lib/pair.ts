const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';

export interface PairStartResponse {
  code: string;
  expires_in: number;
  lan_url: string | null;
}

export interface PairClaimResponse {
  authorized: boolean;
  token: string;
}

export async function startPair(sessionToken: string): Promise<PairStartResponse> {
  const response = await fetch(`${API_BASE}/api/v1/pair/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
  });
  if (!response.ok) throw new Error(`pair-start HTTP ${response.status}`);
  return response.json();
}

export async function claimPair(code: string): Promise<PairClaimResponse> {
  const response = await fetch(`${API_BASE}/api/v1/pair/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (response.status === 404) throw new Error('invalid-or-expired');
  if (!response.ok) throw new Error(`pair-claim HTTP ${response.status}`);
  return response.json();
}
