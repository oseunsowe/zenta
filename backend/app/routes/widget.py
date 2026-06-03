from fastapi import APIRouter, Request
from fastapi.responses import Response

from app.config import settings

router = APIRouter()


_LOADER_JS_TEMPLATE = """(function () {
  if (window.__workspaceHelperWidget) return;
  window.__workspaceHelperWidget = true;

  var script = document.currentScript;
  var dataset = script ? script.dataset : {};
  var BASE = %BASE_JS%;
  var label = dataset.label || 'Get Support Now';
  var position = dataset.position || 'bottom-right';
  var accent = dataset.accent || '#3a4170';

  var corners = {
    'bottom-right': 'right: 24px; bottom: 24px;',
    'bottom-left':  'left: 24px; bottom: 24px;',
    'top-right':    'right: 24px; top: 24px;',
    'top-left':     'left: 24px; top: 24px;'
  };
  var corner = corners[position] || corners['bottom-right'];

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.setAttribute('aria-label', label);
  btn.style.cssText = [
    'position: fixed', corner,
    'z-index: 2147483647',
    'background:' + accent,
    'color: #fff',
    'border: 0',
    'padding: 12px 18px',
    'border-radius: 999px',
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    'font-size: 14px',
    'box-shadow: 0 6px 24px rgba(0,0,0,0.25)',
    'cursor: pointer'
  ].join(';');

  btn.addEventListener('click', function () {
    var w = window.open(
      BASE + '/share',
      'workspace-helper-share',
      'popup,width=480,height=720'
    );
    if (w) w.focus();
  });

  function attach() { document.body.appendChild(btn); }
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    attach();
  } else {
    document.addEventListener('DOMContentLoaded', attach);
  }
})();
"""


def _public_base(request: Request) -> str:
    scheme = request.headers.get('x-forwarded-proto', request.url.scheme)
    host = request.headers.get('x-forwarded-host', request.headers.get('host', f'127.0.0.1:{settings.backend_port}'))
    return f'{scheme}://{host}'


@router.get('/widget/loader.js')
async def widget_loader(request: Request):
    # We point the widget at the frontend, not the backend. The frontend usually
    # lives on a sibling port (e.g. :3000 in dev). Override with WIDGET_FRONTEND_BASE.
    import os
    base = os.environ.get('WIDGET_FRONTEND_BASE') or _public_base(request).replace(':8000', ':3000')
    body = _LOADER_JS_TEMPLATE.replace('%BASE_JS%', repr(base))
    return Response(content=body, media_type='application/javascript')


@router.get('/widget/embed-snippet')
async def widget_embed_snippet(request: Request):
    base = _public_base(request)
    snippet = (
        f'<script src="{base}/widget/loader.js" '
        'data-label="Get Support Now" '
        'data-position="bottom-right" '
        'data-accent="#3a4170" defer></script>'
    )
    return Response(content=snippet, media_type='text/html')
