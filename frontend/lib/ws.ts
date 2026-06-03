import { AUTH_LOST_EVENT } from './api';
import { wsBase } from './endpoints';

type CompanionSocketEvent = 'connected' | 'disconnected' | 'reconnecting' | 'error' | 'message';

type CompanionSocketListener = (payload?: any) => void;

function getWebSocketUrl(sessionToken: string) {
  return `${wsBase()}/api/v1/ws/companion?token=${encodeURIComponent(sessionToken)}`;
}

function createRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class CompanionSocket {
  private sessionToken: string;
  private url: string;
  private socket: WebSocket | null = null;
  private listeners = new Map<CompanionSocketEvent, Set<CompanionSocketListener>>();
  private pendingResponses = new Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void }>();
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;

  constructor(sessionToken: string) {
    this.sessionToken = sessionToken;
    this.url = getWebSocketUrl(sessionToken);
    this.connect();
  }

  on(event: CompanionSocketEvent, listener: CompanionSocketListener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  off(event: CompanionSocketEvent, listener: CompanionSocketListener) {
    this.listeners.get(event)?.delete(listener);
  }

  private emit(event: CompanionSocketEvent, payload?: any) {
    this.listeners.get(event)?.forEach((listener) => listener(payload));
  }

  private connect() {
    this.disconnect();
    this.socket = new WebSocket(this.url);
    this.emit('reconnecting', { attempt: this.reconnectAttempts });

    this.socket.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      this.emit('connected');
    });

    this.socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'reply' && payload.request_id) {
          const pending = this.pendingResponses.get(payload.request_id);
          if (pending) {
            pending.resolve(payload.reply);
            this.pendingResponses.delete(payload.request_id);
            return;
          }
        }
        this.emit('message', payload);
      } catch (error) {
        this.emit('message', event.data);
      }
    });

    this.socket.addEventListener('close', (event) => {
      this.emit('disconnected');
      if (event.code === 1008) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event(AUTH_LOST_EVENT));
        }
        return;
      }
      this.scheduleReconnect();
    });

    this.socket.addEventListener('error', (event) => {
      this.emit('error', event);
      this.scheduleReconnect();
    });
  }

  private disconnect() {
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  private scheduleReconnect() {
    this.reconnectAttempts += 1;
    const delay = Math.min(10000, 1000 * this.reconnectAttempts);
    this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
  }

  isConnected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  async sendText(message: string, characterId?: string) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    const requestId = createRequestId();
    const payload = {
      type: 'text',
      content: message,
      character_id: characterId,
      request_id: requestId,
    };

    return new Promise<string>((resolve, reject) => {
      this.pendingResponses.set(requestId, { resolve, reject });
      this.socket?.send(JSON.stringify(payload));
      window.setTimeout(() => {
        if (this.pendingResponses.has(requestId)) {
          this.pendingResponses.delete(requestId);
          reject(new Error('WebSocket request timeout'));
        }
      }, 10000);
    });
  }

  close() {
    this.disconnect();
    this.pendingResponses.forEach(({ reject }) => reject(new Error('WebSocket closed')));
    this.pendingResponses.clear();
  }
}

export function createCompanionSocket(sessionToken: string) {
  return new CompanionSocket(sessionToken);
}
