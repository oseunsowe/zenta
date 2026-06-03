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

# No --reload in production. Workers share JWT_SECRET via the environment, so
# JWT_SECRET MUST be set (see .env) or tokens will fail across workers.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
