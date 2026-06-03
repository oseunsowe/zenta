'use client';

import { useState } from 'react';
import { authenticateInvite } from '../lib/invite';

interface StealthLoginProps {
  onAuthorized: (inviteCode: string) => void;
}

export default function StealthLogin({ onAuthorized }: StealthLoginProps) {
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inviteCode.trim()) return;

    setLoading(true);
    setError(null);

    try {
      await authenticateInvite(inviteCode);
      onAuthorized(inviteCode.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="chat-container">
      <div className="chat-header">
        <h2>Private Access</h2>
        <p>Enter your stealth invite code to unlock the companion.</p>
      </div>
      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          value={inviteCode}
          onChange={(event) => setInviteCode(event.target.value)}
          placeholder="Enter invite code"
          aria-label="Invite code"
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Verifying…' : 'Authorize'}
        </button>
      </form>
      {error ? <p style={{ color: '#ff9b9b', marginTop: '12px' }}>{error}</p> : null}
    </section>
  );
}
