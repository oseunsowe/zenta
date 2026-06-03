# Webhook bridges

Two directions:

- **Outbound**: every chat reply is POSTed to `WEBHOOK_OUT_URL`.
- **Inbound**: `POST /api/v1/bridge/inbound` injects a message into a session as if a user typed it.

Both are off by default. Setting the env var enables them.

## Outbound: companion → Slack/Discord/OBS

```env
WEBHOOK_OUT_URL=https://hooks.slack.com/services/T000/B000/XYZ
WEBHOOK_OUT_TOKEN=         # adds Authorization: Bearer <token> if set
```

Payload:
```json
{
  "session_id": "abc123def456",
  "user": "what's on my calendar today?",
  "reply": "You have a 2pm sync and a 4pm interview."
}
```

Fire-and-forget — outbound failures are swallowed so they can't break the chat reply.

### Slack incoming webhook

Slack expects a `text` field. Easiest pattern: stand up a 5-line proxy that reshapes the payload, or use Slack's Workflow Builder webhook trigger which accepts JSON as-is.

### Discord

Discord webhooks accept `{"content": "..."}`. Same proxy approach — or write a tiny serverless function (Cloudflare Worker, Vercel function) that translates.

### OBS

OBS-WebSocket protocol is JSON over WebSocket. Run a small bridge process that subscribes to your `WEBHOOK_OUT_URL` and translates to OBS scene/text-source updates.

## Inbound: external app → companion

```env
BRIDGE_INBOUND_TOKEN=long-random-token
```

Empty disables the endpoint entirely (returns 404 even with the right token).

```bash
curl -X POST http://127.0.0.1:8000/api/v1/bridge/inbound \
  -H "X-Bridge-Token: long-random-token" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "slack-user-U123", "message": "summarize today"}'
```

Returns the same `ChatResponse` as `/chat`. Use a consistent `session_id` per upstream user so memory stays per-user.

### Use cases

- Bot listens on Slack, forwards each DM as `/bridge/inbound`, posts the reply back to the Slack channel.
- Meeting transcription pipeline POSTs each utterance to `/bridge/inbound`, gets a companion reaction.
- Voice assistant on your phone sends transcribed text in, plays the reply back.

## Combined: full Slack relay sketch

```
Slack DM ──▶ Slack bot ──▶ POST /bridge/inbound (X-Bridge-Token)
                                   │
                                   ▼
                          companion generates reply
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
   reply returned to Slack bot              POST WEBHOOK_OUT_URL
   (synchronous response)                   (audit log to a channel)
```

## Security notes

- Inbound `session_id` is **not** authenticated beyond the bridge token — pick session IDs that map 1:1 to your upstream auth (Slack user ID, Discord member ID).
- The bridge token is the only thing protecting `/bridge/inbound`. Rotate it like a password. Don't embed it in client-side code.
- Outbound URLs leak the user prompt + reply to whoever owns the receiver. Treat with the same care as the LLM API key.
