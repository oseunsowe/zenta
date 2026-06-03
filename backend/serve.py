"""
Pyinstaller-friendly entrypoint that boots uvicorn against the FastAPI app.

Reads BACKEND_HOST/BACKEND_PORT from env. Designed to be bundled with
`pyinstaller backend.spec` and shipped inside the Electron installer.
"""

import os
import sys

import uvicorn

from app.main import app


def main() -> None:
    # BIND_MODE=lan overrides host to 0.0.0.0 (for phone pairing). Otherwise
    # honor BACKEND_HOST, defaulting to loopback.
    bind_mode = (os.environ.get('BIND_MODE') or 'loopback').lower()
    host = os.environ.get('BACKEND_HOST', '127.0.0.1')
    if bind_mode == 'lan':
        host = '0.0.0.0'
    port = int(os.environ.get('BACKEND_PORT', '8000'))
    uvicorn.run(app, host=host, port=port, log_level='warning')


if __name__ == '__main__':
    main()
    sys.exit(0)
