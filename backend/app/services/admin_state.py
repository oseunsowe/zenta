import json
import os
import threading
from pathlib import Path

from app.config import settings

_lock = threading.Lock()
_path = Path(settings.state_file)


def _load() -> dict:
    if not _path.exists():
        return {'invite_only': bool(settings.invite_only)}
    try:
        data = json.loads(_path.read_text(encoding='utf-8'))
        if not isinstance(data, dict):
            raise ValueError
        return {'invite_only': bool(data.get('invite_only', settings.invite_only))}
    except (OSError, ValueError, json.JSONDecodeError):
        return {'invite_only': bool(settings.invite_only)}


def _save(state: dict) -> None:
    tmp = _path.with_suffix(_path.suffix + '.tmp')
    tmp.write_text(json.dumps(state), encoding='utf-8')
    os.replace(tmp, _path)


_state = _load()


def is_invite_only() -> bool:
    with _lock:
        return bool(_state['invite_only'])


def set_invite_only(enabled: bool) -> None:
    with _lock:
        _state['invite_only'] = bool(enabled)
        _save(_state)
