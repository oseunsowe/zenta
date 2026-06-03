# Echoface Stealth AI Companion

A private, invite-only AI companion app built with Next.js and FastAPI.

## Setup

1. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```

2. Install backend dependencies:
   ```bash
   cd backend
   python -m venv .venv
   .\.venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. Copy environment examples:
   ```bash
   copy .env.example .env
   copy backend\.env.example backend\.env
   ```

4. Start locally with Docker Compose:
   ```bash
   docker compose up --build
   ```

## Local URLs
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`

## Desktop Runner
- `desktop/` contains a hidden Electron runner for stealth mode.
- The runner does not create a system tray icon or visible taskbar entry while hidden.
- Toggle the UI using `Ctrl+Alt+E` / `Cmd+Alt+E`.

## Notes
- This app is intentionally built for stealth mode with internal access controls and gated staging.
- The desktop build must avoid exposing a system tray icon or other visible OS shell entry while in stealth mode.
- The frontend includes poor-network handling: offline message queueing, retries, and connectivity status indication.
- Do not expose invite flows or analytics before private QA.
