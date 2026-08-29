import base64
import hashlib
import hmac
import time


def test_returns_none_without_shared_secret(monkeypatch):
    from app.config import settings
    from app.services.turn import generate_turn_credentials

    monkeypatch.setattr(settings, 'turn_shared_secret', '')
    assert generate_turn_credentials('u:1') is None


def test_credential_matches_hmac_sha1(monkeypatch):
    from app.config import settings
    from app.services.turn import generate_turn_credentials

    monkeypatch.setattr(settings, 'turn_shared_secret', 'shh')
    creds = generate_turn_credentials('u:1', ttl_seconds=60)
    assert creds is not None

    expiry_str, label = creds['username'].split(':', 1)
    assert label == 'u:1'
    assert int(expiry_str) - int(time.time()) in range(55, 61)

    expected_digest = hmac.new(b'shh', creds['username'].encode(), hashlib.sha1).digest()
    assert creds['credential'] == base64.b64encode(expected_digest).decode()


def test_ttl_defaults_to_settings(monkeypatch):
    from app.config import settings
    from app.services.turn import generate_turn_credentials

    monkeypatch.setattr(settings, 'turn_shared_secret', 'shh')
    monkeypatch.setattr(settings, 'turn_credential_ttl_seconds', 123)
    creds = generate_turn_credentials('label')
    assert creds['ttl'] == 123
