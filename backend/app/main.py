import logging
import os
from ipaddress import ip_address, ip_network
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.routes.admin import router as admin_router
from app.routes.auth import limiter, router as auth_router
from app.routes.bridge import router as bridge_router
from app.routes.chat import router as chat_router
from app.routes.pair import router as pair_router
from app.routes.screen import router as screen_router
from app.routes.share_request import router as share_request_router
from app.routes.users import router as users_router
from app.routes.widget import router as widget_router

app = FastAPI(title=settings.app_name, docs_url=None, redoc_url=None, openapi_url=None)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_log = logging.getLogger('uvicorn.error')

if (settings.bind_mode or '').lower() == 'lan':
    _log.warning(
        'BIND_MODE=lan: backend is exposed beyond loopback. '
        'Ensure CIDR firewall, VPN, or tunnel is in place.'
    )

# A JWT secret MUST be provided in production. Without it, config.py generates a
# random per-process secret — sessions die on restart and, critically, every
# uvicorn worker gets a *different* secret, so tokens randomly fail to validate.
if not os.environ.get('JWT_SECRET'):
    _log.warning(
        'JWT_SECRET is not set — using an ephemeral random secret. Sessions will '
        'not survive a restart and WILL break across multiple workers. Set a '
        'strong JWT_SECRET (e.g. `python -c "import secrets;print(secrets.token_urlsafe(48))"`) '
        'before deploying.'
    )

# CORS with credentials must never be combined with a wildcard origin.
if '*' in (settings.cors_allow_origins or ''):
    _log.warning('CORS_ALLOW_ORIGINS contains "*"; wildcard origins are unsafe with credentials.')

_origins = [o.strip() for o in (settings.cors_allow_origins or '').split(',') if o.strip()]
if _origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins,
        allow_credentials=True,
        allow_methods=['GET', 'POST'],
        allow_headers=['Content-Type', 'X-Invite-Code', 'X-Admin-Token', 'X-Bridge-Token', 'Authorization'],
    )

_health_networks = [
    ip_network(c.strip())
    for c in (settings.health_allowed_cidrs or '').split(',')
    if c.strip()
]


def _client_allowed(request: Request) -> bool:
    if not _health_networks:
        return False
    client = request.client.host if request.client else None
    if not client:
        return False
    try:
        addr = ip_address(client)
    except ValueError:
        return False
    return any(addr in net for net in _health_networks)


app.include_router(auth_router, prefix=settings.api_prefix)
app.include_router(chat_router, prefix=settings.api_prefix)
app.include_router(admin_router, prefix=settings.api_prefix)
app.include_router(pair_router, prefix=settings.api_prefix)
app.include_router(bridge_router, prefix=settings.api_prefix)
app.include_router(screen_router, prefix=settings.api_prefix)
app.include_router(users_router, prefix=settings.api_prefix)
app.include_router(share_request_router, prefix=settings.api_prefix)
# Widget loader served at root (no /api/v1 prefix) for clean <script src> URLs.
app.include_router(widget_router)


@app.get('/')
async def root():
    return Response(status_code=204)


@app.get('/health')
async def health(request: Request):
    if not _client_allowed(request):
        raise HTTPException(status_code=404)
    return {'status': 'ok'}
