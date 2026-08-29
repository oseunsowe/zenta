'use client';

import { useEffect, useRef, useState } from 'react';

interface StatsSample {
  candidateType?: string;
  protocol?: string;
  rttMs?: number;
  packetsLost?: number;
  jitterMs?: number;
  framesDropped?: number;
  fps?: number;
  bitrateKbps?: number;
  codec?: string;
  pointerBufferedAmount: number;
  controlBufferedAmount: number;
}

/** Polls RTCPeerConnection.getStats() ~1/sec and renders a compact overlay:
 *  candidate type/protocol, RTT, loss, jitter, bitrate, fps, frames dropped,
 *  codec, and both data channels' bufferedAmount. Bitrate isn't reported
 *  directly by getStats — it's derived from the delta of bytesReceived
 *  between two polls. */
export default function RtcStatsPanel({
  pc,
  pointerChannel,
  controlChannel,
}: {
  pc: RTCPeerConnection | null;
  pointerChannel: RTCDataChannel | null;
  controlChannel: RTCDataChannel | null;
}) {
  const [sample, setSample] = useState<StatsSample | null>(null);
  const prevRef = useRef<{ bytesReceived: number; ts: number } | null>(null);

  useEffect(() => {
    if (!pc) {
      setSample(null);
      prevRef.current = null;
      return;
    }

    let cancelled = false;

    async function poll() {
      if (!pc || pc.connectionState === 'closed') return;
      const report = await pc.getStats();

      let selectedPair: any = null;
      let inboundVideo: any = null;
      report.forEach((s: any) => {
        if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.nominated !== false) {
          selectedPair = s;
        }
        if (s.type === 'inbound-rtp' && s.kind === 'video') {
          inboundVideo = s;
        }
      });

      const localCandidate = selectedPair ? report.get(selectedPair.localCandidateId) : null;
      const codecStat = inboundVideo ? report.get(inboundVideo.codecId) : null;

      let bitrateKbps: number | undefined;
      if (inboundVideo?.bytesReceived != null) {
        const prev = prevRef.current;
        const now = Date.now();
        if (prev) {
          const deltaBytes = inboundVideo.bytesReceived - prev.bytesReceived;
          const deltaSeconds = (now - prev.ts) / 1000;
          if (deltaSeconds > 0) bitrateKbps = Math.max(0, (deltaBytes * 8) / deltaSeconds / 1000);
        }
        prevRef.current = { bytesReceived: inboundVideo.bytesReceived, ts: now };
      }

      if (cancelled) return;
      setSample({
        candidateType: localCandidate?.candidateType,
        protocol: localCandidate?.protocol,
        rttMs: selectedPair?.currentRoundTripTime != null ? selectedPair.currentRoundTripTime * 1000 : undefined,
        packetsLost: inboundVideo?.packetsLost,
        jitterMs: inboundVideo?.jitter != null ? inboundVideo.jitter * 1000 : undefined,
        framesDropped: inboundVideo?.framesDropped,
        fps: inboundVideo?.framesPerSecond,
        bitrateKbps,
        codec: codecStat?.mimeType,
        pointerBufferedAmount: pointerChannel?.bufferedAmount ?? 0,
        controlBufferedAmount: controlChannel?.bufferedAmount ?? 0,
      });
    }

    void poll();
    const timer = window.setInterval(() => void poll(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pc, pointerChannel, controlChannel]);

  if (!sample) {
    return <p style={{ fontSize: '12px', color: '#5a6388', padding: '8px 16px' }}>Waiting for connection stats…</p>;
  }

  const row = (label: string, value: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
      <span style={{ color: '#8f98ba' }}>{label}</span>
      <span style={{ color: '#e6e9f2', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );

  return (
    <div
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
        fontSize: '12px',
        background: 'rgba(10, 13, 20, 0.9)',
        border: '1px solid #2a2f4a',
        borderRadius: '8px',
        padding: '10px 14px',
        display: 'grid',
        gap: '4px',
        minWidth: '220px',
      }}
    >
      {row('candidate', `${sample.candidateType ?? '—'} / ${sample.protocol ?? '—'}`)}
      {row('rtt', sample.rttMs != null ? `${sample.rttMs.toFixed(0)} ms` : '—')}
      {row('packet loss', sample.packetsLost != null ? String(sample.packetsLost) : '—')}
      {row('jitter', sample.jitterMs != null ? `${sample.jitterMs.toFixed(1)} ms` : '—')}
      {row('bitrate', sample.bitrateKbps != null ? `${sample.bitrateKbps.toFixed(0)} kbps` : '—')}
      {row('fps / dropped', `${sample.fps ?? '—'} / ${sample.framesDropped ?? '—'}`)}
      {row('codec', sample.codec ?? '—')}
      {row('pointer buffered', `${sample.pointerBufferedAmount} B`)}
      {row('control buffered', `${sample.controlBufferedAmount} B`)}
    </div>
  );
}
