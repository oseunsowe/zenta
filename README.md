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


