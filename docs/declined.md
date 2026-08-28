# Items I won't ship, and why

A few items from the AnyDesk/UltraViewer competitive analysis aren't built. These are deliberate refusals or deferrals.

## Refused

### Process name spoofing as `svchost_helper.exe` / `WinAudio.exe` / similar

The request: rename the executable to mimic a Windows system process so it blends in Task Manager.

Not building this. Specifically:

- Names matching the `svchost*`, `winlogon*`, `csrss*`, `lsass*`, `dwm*`, `winaudio*` patterns are a defining technique of credential-stealing malware and trojanised remote-access tools (Cobalt Strike, RedLine, AsyncRAT all use it). Windows Defender and every commercial EDR (CrowdStrike, SentinelOne, Defender for Endpoint) flag non-Microsoft-signed binaries with `svchost`-style names on sight. The stealth gain is negative: it draws *more* attention because security tools now alert on it.
- It crosses the line from "low-profile" (legitimate, e.g. an unbranded IT helper) into "deceptive masquerade as the OS" — which deceives the *owner* of the machine, not just bystanders. The current product is built for users who own the device and want privacy. Process-name impersonation works against the device owner.
- "Workspace Helper" / `com.workspace.helper` is already low-profile. A reviewer who opens Task Manager sees a plausibly-IT-issued utility. That's stealth-by-being-mundane, not stealth-by-impersonation, and it's the sustainable form.

If you need a stronger no-trace deployment, the right options are:
- The browser extension (no separate process at all — runs inside Chrome).
- A portable build that runs from a USB stick without installing.
- Tightening the existing rename to something neutral and project-specific (e.g. your company's internal tool name).

## Deferred (built primitives are ready; finish work needs decisions)

### One-click zero-code support sessions

Right now the embed widget opens a popup that asks the customer to type a pair code. To make it truly zero-click — customer hits the button, agent gets a notification, session auto-pairs — we need:

- An agent-side "incoming requests" view (probably an admin-token-gated page).
- A new endpoint `/api/v1/support/request` that creates an anonymous pair code without requiring an invite.
- A pending-session model so the agent can see/claim incoming requests.

This is ~2 hours of work and one design decision (how does an agent authenticate to see pending sessions — admin token, or a separate "agent" role?). Not built; happy to ship when you pick the auth model.

### Session recording + AI summary (Whisper + vision)

Big feature. Real implementation needs:

- A blob store (filesystem path, S3, R2) for the recordings.
- Server-side encoding (ffmpeg) of the inbound JPEG stream into mp4.
- Audio capture path (currently we only send video).
- A worker process that runs Whisper on the audio + a vision model on keyframes.
- A retrieval UI (admin view of past sessions with summaries).

This is a week of work and probably introduces a real dependency on a worker queue (Celery/RQ) and a real storage backend. Worth doing if revenue depends on it — happy to plan it out properly.

### Paystack / ToriPay billing

Pure business work. Needs:

- Stripe-style customer model on the backend (currently invite codes are the only identity).
- Webhooks from Paystack for successful payments → flips a paid flag.
- Plan-gated features (e.g. session recording paid-only).

I can build the integration when you have an account and webhook URL — it's a couple of hours once those decisions are made.

### WebRTC P2P upgrade (replacing the JPEG relay)

The current screen sharing sends JPEG frames over WebSocket at 5 fps. Functional but bandwidth-heavy. WebRTC would give:

- 30+ fps with VP9/H.264 encoding (~10× less bandwidth)
- Audio support
- Lower latency
- True P2P (server only does signalling) — better privacy

This is the right next-step, but it's a significant refactor (new STUN/TURN dependency, new signaling protocol). The current JPEG relay stays as a fallback for environments where WebRTC's UDP/STUN is blocked.

### OS-level remote control — done

This used to require a native helper; it now has one. `desktop/remote-input.js`
drives real OS mouse/keyboard via `@nut-tree-fork/nut-js` in the Electron main
process, and `SharePanel.tsx` auto-arms it the moment a desktop-app host starts
sharing. A browser tab still can't drive OS input — the host side needs the
desktop app — but the viewer can be a plain browser.
