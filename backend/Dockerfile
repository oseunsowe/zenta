FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY ./app ./app

# Persist SQLite DBs + runtime state under /app/state (mount a volume here).
# Run as a non-root user.
RUN mkdir -p /app/state \
    && useradd -r -u 10001 appuser \
    && chown -R appuser /app
USER appuser

ENV USERS_DB_PATH=/app/state/users.sqlite3 \
    STATE_FILE=/app/state/runtime_state.json \
    MEMORY_SQLITE_PATH=/app/state/memory.sqlite3 \
    BACKEND_HOST=0.0.0.0 \
    BACKEND_PORT=8000

EXPOSE 8000

# No --reload in production. JWT_SECRET MUST be set (see .env).
#
# --workers 1 is REQUIRED, not a tuning choice. The screen relay
# (app/services/screen_relay.py) holds live WebSocket objects in a per-process
# dict, and pair_store/slowapi keep per-process state too. With 2 workers a
# publisher and a viewer can be accepted by different processes, and the
# viewer then receives no frames at all — screen sharing fails silently,
# intermittently, and only ever between two separate machines.
# Scaling past one process requires a shared backplane (e.g. Redis pub/sub)
# in the relay first. The workload is I/O-bound, so asyncio handles the
# concurrency within this single process.
#
# --forwarded-allow-ips=* makes uvicorn trust Caddy's X-Forwarded-For. Caddy
# reaches the published port through the Docker NAT gateway, not loopback, so
# uvicorn's default (trust 127.0.0.1 only) would discard the header and report
# the gateway IP as the client for EVERY request. That collapses the per-IP
# invite rate limit into one global bucket — a single attacker could lock out
# invite login for everyone — and makes the /health CIDR gate meaningless.
# The wildcard is safe only because the port is published on 127.0.0.1 and the
# firewall blocks 8000, so Caddy is the only thing that can reach it.
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", "--port", "8000", "--workers", "1", \
     "--proxy-headers", "--forwarded-allow-ips", "*"]
