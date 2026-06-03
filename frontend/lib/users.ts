const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
const USER_TOKEN_KEY = 'echoface_user_token';
const USER_INFO_KEY = 'echoface_user_info';

export interface User {
  id: number;
  username: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export function getStoredUserToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(USER_TOKEN_KEY);
}

export function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_INFO_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function clearUserSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(USER_TOKEN_KEY);
  localStorage.removeItem(USER_INFO_KEY);
}

function saveSession(res: LoginResponse) {
  localStorage.setItem(USER_TOKEN_KEY, res.token);
  localStorage.setItem(USER_INFO_KEY, JSON.stringify(res.user));
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error(`Cannot reach backend at ${url}`);
  }
  if (response.status === 409) throw new Error('Username already taken');
  if (response.status === 429) throw new Error('Too many attempts. Please wait a minute.');
  if (response.status === 400 || response.status === 403) {
    // Prefer the backend's specific message (e.g. "Current password is incorrect").
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || (response.status === 403 ? 'Not authorized' : 'Invalid input'));
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await call<LoginResponse>('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  saveSession(res);
  return res;
}

export async function register(
  username: string,
  password: string,
  inviteCode: string,
): Promise<LoginResponse> {
  const res = await call<LoginResponse>('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, invite_code: inviteCode }),
  });
  saveSession(res);
  return res;
}

export async function fetchMe(): Promise<User> {
  const token = getStoredUserToken();
  if (!token) throw new Error('Not logged in');
  return call<User>('/api/v1/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<User> {
  const token = getStoredUserToken();
  if (!token) throw new Error('Not logged in');
  return call<User>('/api/v1/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

/** Clears the stored session. JWTs are stateless, so this is purely client-side. */
export function logout() {
  clearUserSession();
}
