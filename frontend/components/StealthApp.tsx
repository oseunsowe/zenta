'use client';

import { useEffect, useRef, useState } from 'react';
import ChatInterface from './ChatInterface';
import TalkingHead from './TalkingHead';
import CharacterSelector from './CharacterSelector';
import StealthLogin from './StealthLogin';
import SecureLoginOverlay from './SecureLoginOverlay';
import { CompanionSocket, createCompanionSocket } from '../lib/ws';
import { AUTH_LOST_EVENT } from '../lib/api';
import {
  authenticateInvite,
  clearInviteCode,
  clearSessionToken,
  getStoredInviteCode,
  getStoredSessionToken,
  saveInviteCode,
  saveSessionToken,
} from '../lib/invite';

export default function StealthApp() {
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [socketStatus, setSocketStatus] = useState('disconnected');
  const [socket, setSocket] = useState<CompanionSocket | null>(null);
  const [networkStatus, setNetworkStatus] = useState('online');
  const [showSecureOverlay, setShowSecureOverlay] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const reconnectTimer = useRef<number | null>(null);

  useEffect(() => {
    const savedInvite = getStoredInviteCode();
    const savedToken = getStoredSessionToken();
    if (savedInvite) setInviteCode(savedInvite);
    if (savedToken) setSessionToken(savedToken);
  }, []);

  useEffect(() => {
    if (!inviteCode || sessionToken) return;
    let cancelled = false;
    authenticateInvite(inviteCode)
      .then((res) => {
        if (!cancelled) setSessionToken(res.token);
      })
      .catch(() => {
        if (!cancelled) {
          clearSessionToken();
          setInviteCode(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [inviteCode, sessionToken]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateStatus = () => {
      setNetworkStatus(window.navigator.onLine ? 'online' : 'offline');
    };

    updateStatus();
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);

    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
    };
  }, []);

  useEffect(() => {
    if (!sessionToken) return;
    if (networkStatus !== 'online') {
      setSocketStatus('offline');
      return;
    }

    const companionSocket = createCompanionSocket(sessionToken);
    setSocketStatus('connecting');

    const handleConnected = () => {
      setSocketStatus('connected');
      setRetryCount(0);
    };

    const handleDisconnected = () => {
      setSocketStatus('disconnected');
      if (networkStatus === 'online') {
        setSocketStatus('reconnecting');
        const delay = Math.min(10000, 1000 + retryCount * 2000);
        reconnectTimer.current = window.setTimeout(() => setRetryCount((current) => current + 1), delay);
      }
    };

    companionSocket.on('connected', handleConnected);
    companionSocket.on('disconnected', handleDisconnected);
    companionSocket.on('reconnecting', () => setSocketStatus('reconnecting'));
    companionSocket.on('error', () => setSocketStatus('error'));
    companionSocket.on('message', (event) => {
      console.debug('Stealth WS message:', event);
    });

    setSocket(companionSocket);

    return () => {
      companionSocket.off('connected', handleConnected);
      companionSocket.off('disconnected', handleDisconnected);
      companionSocket.close();
      setSocket(null);
      if (reconnectTimer.current) {
        window.clearTimeout(reconnectTimer.current);
      }
    };
  }, [sessionToken, networkStatus, retryCount]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      clearSessionToken();
      clearInviteCode();
      setSessionToken(null);
      setInviteCode(null);
    };
    window.addEventListener(AUTH_LOST_EVENT, handler);
    return () => window.removeEventListener(AUTH_LOST_EVENT, handler);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const api = (window as any).__host;
    if (!api?.onShowSecureLogin) return;

    const handler = () => setShowSecureOverlay(true);
    api.onShowSecureLogin(handler);

    return () => {
      api.removeShowSecureLogin?.(handler);
    };
  }, []);

  function handleAuthorized(code: string) {
    saveInviteCode(code);
    setInviteCode(code);
    const token = getStoredSessionToken();
    if (token) {
      saveSessionToken(token);
      setSessionToken(token);
    }
  }

  if (!inviteCode || !sessionToken) {
    return <StealthLogin onAuthorized={handleAuthorized} />;
  }

  return (
    <>
      <SecureLoginOverlay
        visible={showSecureOverlay}
        onClose={() => setShowSecureOverlay(false)}
        onAuthorized={handleAuthorized}
      />
      <main className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <h1>Echoface</h1>
            <p>Stealth companion access granted</p>
          </div>
          <CharacterSelector />
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
            <a href="/view" style={{ color: '#aab1d8', fontSize: '14px' }}>👁 View remote screen</a>
            <a href="/pair" style={{ color: '#aab1d8', fontSize: '14px' }}>📱 Pair another device</a>
          </nav>
        </aside>
        <section className="main-panel">
          <div className="chat-header" style={{ marginBottom: '18px' }}>
            <p style={{ color: '#8f98ba' }}>
              Network: {networkStatus} • WebSocket: {socketStatus}
            </p>
          </div>
          <TalkingHead />
          <ChatInterface
            sessionToken={sessionToken}
            connectionStatus={socketStatus}
            sendMessage={socket?.isConnected() ? (message: string, character_id?: string) => socket.sendText(message, character_id) : undefined}
          />
        </section>
      </main>
    </>
  );
}
