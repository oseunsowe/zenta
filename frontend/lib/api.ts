export interface ChatPayload {
  message: string;
  character_id?: string;
  sessionToken: string;
}

export interface ChatResponse {
  reply: string;
  stream: boolean;
}

export interface InviteResponse {
  authorized: boolean;
  token: string;
}

export const AUTH_LOST_EVENT = 'echoface:auth-lost';

export class AuthExpiredError extends Error {
  constructor() {
    super('unauthenticated');
    this.name = 'AuthExpiredError';
  }
}

function notifyAuthLost() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_LOST_EVENT));
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNetworkAvailable() {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

function isRetryableError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.message === 'offline' ||
    error.message === 'timeout' ||
    error.message.includes('Failed to fetch') ||
    error.message.includes('NetworkError')
  );
}

async function fetchWithTimeout(input: RequestInfo, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export async function sendChat(payload: ChatPayload): Promise<ChatResponse> {
  if (!isNetworkAvailable()) {
    throw new Error('offline');
  }

  const url = `${API_BASE}/api/v1/chat`;
  const init: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${payload.sessionToken}`,
    },
    body: JSON.stringify({ message: payload.message, character_id: payload.character_id }),
  };

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, init, 8000);
      if (response.status === 401 || response.status === 403) {
        notifyAuthLost();
        throw new AuthExpiredError();
      }
      if (!response.ok) {
        if (response.status >= 500 && attempt < maxAttempts) {
          await sleep(1000 * attempt);
          continue;
        }
        throw new Error(`Chat API request failed with status ${response.status}`);
      }

      return response.json();
    } catch (error) {
      if (error instanceof AuthExpiredError) throw error;

      if (error instanceof DOMException && error.name === 'AbortError') {
        if (attempt < maxAttempts) {
          await sleep(1000 * attempt);
          continue;
        }
        throw new Error('timeout');
      }

      if (isRetryableError(error) && attempt < maxAttempts) {
        await sleep(1000 * attempt);
        continue;
      }

      throw error;
    }
  }

  throw new Error('Chat request failed after retries');
}
