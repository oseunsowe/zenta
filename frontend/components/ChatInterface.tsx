'use client';

import { FormEvent, useEffect, useState } from 'react';
import { sendChat, ChatPayload } from '../lib/api';

interface Message {
  sender: 'user' | 'ai' | 'system';
  text: string;
}

interface ChatInterfaceProps {
  sessionToken: string;
  connectionStatus: string;
  sendMessage?: (message: string, character_id?: string) => Promise<string>;
}

export default function ChatInterface({ sessionToken, sendMessage, connectionStatus }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    { sender: 'ai', text: 'Welcome to Echoface. Start by typing a message.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [networkStatus, setNetworkStatus] = useState('online');
  const [pendingQueue, setPendingQueue] = useState<ChatPayload[]>([]);
  const [characterId] = useState('aria');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateStatus = () => {
      if (!window.navigator.onLine) {
        setNetworkStatus('offline');
        return;
      }

      const connection = (window.navigator as any).connection;
      if (connection?.downlink && connection.downlink < 1) {
        setNetworkStatus('poor');
      } else {
        setNetworkStatus('online');
      }
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
    if (networkStatus === 'online' && pendingQueue.length > 0 && !loading) {
      const flushQueuedMessages = async () => {
        const queue = [...pendingQueue];
        setPendingQueue([]);

        for (const payload of queue) {
          try {
            let aiReply: string;
            if (sendMessage) {
              aiReply = await sendMessage(payload.message, payload.character_id);
            } else {
              const response = await sendChat(payload);
              aiReply = response.reply;
            }
            setMessages((current) => [...current, { sender: 'ai', text: aiReply }]);
          } catch (error) {
            setPendingQueue((current) => [...current, payload]);
            setMessages((current) => [
              ...current,
              {
                sender: 'system',
                text: 'Unable to deliver queued messages yet. The app will retry when the network recovers.',
              },
            ]);
            break;
          }
        }
      };

      flushQueuedMessages();
    }
  }, [networkStatus, pendingQueue, loading]);

  function addSystemMessage(text: string) {
    setMessages((current) => [...current, { sender: 'system', text }]);
  }

  function queueMessage(payload: ChatPayload) {
    setPendingQueue((current) => [...current, payload]);
    addSystemMessage(
      'Network is slow or offline. Your message is queued and will be sent when connectivity improves.',
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.trim()) return;

    const userText = input.trim();
    setMessages((current) => [...current, { sender: 'user', text: userText }]);
    setInput('');

    const payload: ChatPayload = {
      message: userText,
      character_id: characterId,
      sessionToken,
    };

    if (networkStatus === 'offline' || networkStatus === 'poor') {
      queueMessage(payload);
      return;
    }

    setLoading(true);

    try {
      let aiReply: string;

      if (sendMessage) {
        aiReply = await sendMessage(userText, characterId);
      } else {
        const response = await sendChat(payload);
        aiReply = response.reply;
      }

      setMessages((current) => [...current, { sender: 'ai', text: aiReply }]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Network error';
      if (message === 'offline' || message === 'timeout' || message.includes('Network') || message.includes('WebSocket')) {
        queueMessage(payload);
      } else {
        setMessages((current) => [
          ...current,
          {
            sender: 'ai',
            text: 'Unable to reach the stealth backend. Retry when your connection stabilizes.',
          },
        ]);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="chat-container">
      <div className="chat-header">
        <h2>Companion Chat</h2>
        <p>Text chat mode with streaming-ready layout.</p>
      </div>
      {networkStatus !== 'online' ? (
        <div className={`network-status-banner ${networkStatus}`}>
          {networkStatus === 'offline'
            ? 'Offline mode: messages will queue until connectivity returns.'
            : 'Slow connection detected: requests may retry automatically.'}
        </div>
      ) : null}
      <div className="connection-summary">
        <span>WebSocket status: {connectionStatus}</span>
      </div>
      <div className="message-list">
        {messages.map((message, index) => (
          <div key={index} className={`message ${message.sender}`}>
            <span>{message.text}</span>
          </div>
        ))}
      </div>
      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={loading ? 'Waiting for the companion...' : 'Type your message...'}
          aria-label="User message"
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Sending…' : 'Send'}
        </button>
      </form>
    </section>
  );
}
