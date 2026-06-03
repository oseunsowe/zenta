# Embed widget

A single-line `<script>` tag that drops a "Get Support Now" button onto any website. Click → opens a popup with the screen-share UI. The customer pairs with the support agent's pre-generated code.

## Embed snippet

```html
<script
  src="http://YOUR-BACKEND-HOST:8000/widget/loader.js"
  data-label="Get Support Now"
  data-position="bottom-right"
  data-accent="#3a4170"
  defer
></script>
```

Or fetch the snippet for your specific backend:

```bash
curl http://127.0.0.1:8000/widget/embed-snippet
```

## Customisation

| `data-` attribute | Default | Purpose |
| --- | --- | --- |
| `data-label` | `Get Support Now` | Button text |
| `data-position` | `bottom-right` | One of `bottom-right`, `bottom-left`, `top-right`, `top-left` |
| `data-accent` | `#3a4170` | CSS color for the button background |

## How the session links up

The widget opens `<frontend>/share` in a popup. The customer is asked for a 6-digit pair code. Meanwhile the agent has opened `/view` on their side and shares the displayed code (call, SMS, in-band on your site). Customer enters it → screen streams to the agent.

For truly **zero-click** sessions (no code entry), you'd add an agent-side endpoint that creates a session and returns a URL with the code embedded (`/share?code=123456`). That's a future upgrade — the primitives are already in place ([pair_store.py](../backend/app/services/pair_store.py)).

## Configuring the popup target

By default the widget points the popup at `https://<your-domain>:3000/share` (swap port `8000`→`3000`). To override (e.g. when frontend is on a different domain):

```bash
WIDGET_FRONTEND_BASE=https://app.example.com
```

…in the backend `.env`. The loader picks this up on each request.

## Security & abuse model

- The widget is **public** — anyone can embed it. The backend has zero exposure beyond what's already on `/share`.
- The popup uses the same `/api/v1/auth/invite` and `/pair/*` flow as the rest of the app, so the existing rate-limit (`5/minute` per IP) and pair-code TTL (5 minutes, single-use) apply.
- The agent's pair code is the only thing tying customer ↔ agent. Don't put it in a public DM.
- The customer sees a normal browser screen-share prompt — they can deny.
