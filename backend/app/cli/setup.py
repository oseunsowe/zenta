"""
Generate a backend .env with strong secrets and hashed invite codes.

Usage:
  python -m app.cli.setup --invites STEALTH-01,STEALTH-02 --out backend/.env
  python -m app.cli.setup --hash STEALTH-FOO     # just print one hash
  python -m app.cli.setup --secret                # just print a fresh JWT_SECRET
"""

import argparse
import hashlib
import secrets
import sys
from pathlib import Path


DEFAULT_ENV = {
    'APP_NAME': 'Echoface API',
    'API_PREFIX': '/api/v1',
    'INVITE_ONLY': 'true',
    'INVITE_RATE_LIMIT': '5/minute',
    'JWT_ALGORITHM': 'HS256',
    'JWT_TTL_SECONDS': '28800',
    'BACKEND_HOST': '127.0.0.1',
    'BACKEND_PORT': '8000',
    'CORS_ALLOW_ORIGINS': 'http://127.0.0.1:3000',
    'HEALTH_ALLOWED_CIDRS': '127.0.0.0/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16',
    'STATE_FILE': 'runtime_state.json',
    'LLM_PROVIDER': 'echo',
    'LLM_MODEL': 'llama-3.1-8b-instant',
    'LLM_BASE_URL': 'https://api.groq.com/openai/v1',
    'LLM_TIMEOUT_SECONDS': '15',
    'MEMORY_BACKEND': 'null',
    'MEMORY_SQLITE_PATH': 'memory.sqlite3',
    'MEMORY_WINDOW': '10',
}


def hash_code(code: str) -> str:
    return hashlib.sha256(code.strip().encode('utf-8')).hexdigest()


def write_env(path: Path, values: dict[str, str]) -> None:
    lines = [f'{k}={v}' for k, v in values.items()]
    path.write_text('\n'.join(lines) + '\n', encoding='utf-8')


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description='Bootstrap backend secrets and invite hashes.')
    parser.add_argument('--invites', help='Comma-separated invite codes to hash')
    # If cwd is already the backend dir, write to ./.env. Otherwise write to backend/.env.
    default_out = '.env' if Path.cwd().name == 'backend' else 'backend/.env'
    parser.add_argument('--out', default=default_out, help=f'Path to write the .env (default: {default_out})')
    parser.add_argument('--hash', help='Just hash one code and print it')
    parser.add_argument('--secret', action='store_true', help='Just print a fresh JWT_SECRET')
    parser.add_argument('--force', action='store_true', help='Overwrite existing .env')
    parser.add_argument('--admin', action='store_true', help='Include a generated ADMIN_TOKEN')
    parser.add_argument('--llm-key', help='Set LLM_API_KEY and switch LLM_PROVIDER to groq')
    args = parser.parse_args(argv)

    if args.hash:
        print(hash_code(args.hash))
        return 0

    if args.secret:
        print(secrets.token_urlsafe(48))
        return 0

    if not args.invites:
        parser.error('--invites is required (or use --hash / --secret)')

    out_path = Path(args.out)
    if out_path.exists() and not args.force:
        print(f'refusing to overwrite {out_path}; pass --force to replace', file=sys.stderr)
        return 1

    codes = [c.strip() for c in args.invites.split(',') if c.strip()]
    if not codes:
        parser.error('no invite codes parsed from --invites')

    env = dict(DEFAULT_ENV)
    env['INVITE_CODE_HASHES'] = ','.join(hash_code(c) for c in codes)
    env['JWT_SECRET'] = secrets.token_urlsafe(48)
    if args.admin:
        env['ADMIN_TOKEN'] = secrets.token_urlsafe(32)
    else:
        env['ADMIN_TOKEN'] = ''
    if args.llm_key:
        env['LLM_PROVIDER'] = 'groq'
        env['LLM_API_KEY'] = args.llm_key
    else:
        env['LLM_API_KEY'] = ''

    out_path.parent.mkdir(parents=True, exist_ok=True)
    write_env(out_path, env)
    print(f'wrote {out_path}')
    print(f'  invite codes hashed: {len(codes)}')
    print('  JWT_SECRET: generated')
    if args.admin:
        print(f'  ADMIN_TOKEN: {env["ADMIN_TOKEN"]}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
