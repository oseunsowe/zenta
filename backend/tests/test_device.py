import pytest

from app.services.device_store import (
    LOCKOUT_THRESHOLD,
    PASSWORD_ALPHABET,
    PASSWORD_LENGTH,
    generate_password,
    is_valid_device_id,
    normalize_device_id,
)


def claim(client, device_id=None, secret=None):
    body = {}
    if device_id is not None:
        body['device_id'] = device_id
    if secret is not None:
        body['secret'] = secret
    r = client.post('/api/v1/device/claim', json=body)
    assert r.status_code == 200, r.text
    return r.json()


# --------------------------------------------------------------------- claim


def test_claim_mints_identity(client):
    d = claim(client)
    assert is_valid_device_id(d['device_id'])
    assert not d['device_id'].startswith('0')
    assert len(d['password']) == PASSWORD_LENGTH
    assert set(d['password']) <= set(PASSWORD_ALPHABET)
    assert d['secret'] and d['token']


def test_device_id_is_stable_across_relaunches(client):
    first = claim(client)
    again = claim(client, first['device_id'], first['secret'])
    # Same identity, fresh password — the UltraViewer behaviour.
    assert again['device_id'] == first['device_id']
    assert again['password'] != first['password']


def test_cannot_claim_someone_elses_id_without_the_secret(client):
    victim = claim(client)
    attacker = claim(client, victim['device_id'], 'wrong-secret')
    # Must not hand over the victim's ID; a fresh one is minted instead.
    assert attacker['device_id'] != victim['device_id']
    # And the victim's password is untouched.
    assert client.post(
        '/api/v1/device/connect',
        json={'device_id': victim['device_id'], 'password': victim['password']},
    ).status_code == 200


# -------------------------------------------------------------------- rotate


def test_rotate_changes_password_and_invalidates_the_old_one(client):
    d = claim(client)
    old = d['password']
    r = client.post(
        '/api/v1/device/rotate', json={'device_id': d['device_id'], 'secret': d['secret']}
    )
    assert r.status_code == 200
    new = r.json()['password']
    assert new != old

    assert client.post(
        '/api/v1/device/connect', json={'device_id': d['device_id'], 'password': old}
    ).status_code == 403
    assert client.post(
        '/api/v1/device/connect', json={'device_id': d['device_id'], 'password': new}
    ).status_code == 200


def test_rotate_requires_the_secret(client):
    d = claim(client)
    r = client.post(
        '/api/v1/device/rotate', json={'device_id': d['device_id'], 'secret': 'nope'}
    )
    assert r.status_code == 403


def test_auto_rotate_does_not_clear_an_active_lockout(client):
    """The client's periodic timer must not double as a lockout bypass."""
    host = claim(client)
    for _ in range(LOCKOUT_THRESHOLD):
        client.post(
            '/api/v1/device/connect',
            json={'device_id': host['device_id'], 'password': 'aaaaaaaa'},
        )
    assert client.post(
        '/api/v1/device/connect',
        json={'device_id': host['device_id'], 'password': host['password']},
    ).status_code == 429

    r = client.post(
        '/api/v1/device/rotate',
        json={'device_id': host['device_id'], 'secret': host['secret'], 'auto': True},
    )
    assert r.status_code == 200
    new = r.json()['password']

    # Still locked out, even with the fresh password.
    assert client.post(
        '/api/v1/device/connect', json={'device_id': host['device_id'], 'password': new}
    ).status_code == 429


def test_manual_rotate_still_clears_lockout(client):
    host = claim(client)
    for _ in range(LOCKOUT_THRESHOLD):
        client.post(
            '/api/v1/device/connect',
            json={'device_id': host['device_id'], 'password': 'aaaaaaaa'},
        )
    new = client.post(
        '/api/v1/device/rotate',
        json={'device_id': host['device_id'], 'secret': host['secret']},
    ).json()['password']
    assert client.post(
        '/api/v1/device/connect', json={'device_id': host['device_id'], 'password': new}
    ).status_code == 200


# ------------------------------------------------------------------- connect


def test_connect_succeeds_and_shares_the_host_session(client):
    host = claim(client)
    r = client.post(
        '/api/v1/device/connect',
        json={'device_id': host['device_id'], 'password': host['password']},
    )
    assert r.status_code == 200, r.text
    assert r.json()['session_id'] == f"d:{host['device_id']}"


def test_connect_accepts_spaced_and_dashed_ids(client):
    host = claim(client)
    raw = host['device_id']
    for pretty in (f'{raw[:3]} {raw[3:6]} {raw[6:]}', f'{raw[:3]}-{raw[3:6]}-{raw[6:]}'):
        r = client.post(
            '/api/v1/device/connect', json={'device_id': pretty, 'password': host['password']}
        )
        assert r.status_code == 200, pretty


def test_password_is_case_insensitive(client):
    host = claim(client)
    r = client.post(
        '/api/v1/device/connect',
        json={'device_id': host['device_id'], 'password': host['password'].upper()},
    )
    assert r.status_code == 200


def test_wrong_password_rejected(client):
    host = claim(client)
    r = client.post(
        '/api/v1/device/connect',
        json={'device_id': host['device_id'], 'password': 'aaaaaaaa'},
    )
    assert r.status_code == 403


def test_unknown_id_is_indistinguishable_from_a_wrong_password(client):
    host = claim(client)
    unknown = client.post(
        '/api/v1/device/connect', json={'device_id': '987654321', 'password': 'aaaaaaaa'}
    )
    wrong = client.post(
        '/api/v1/device/connect',
        json={'device_id': host['device_id'], 'password': 'aaaaaaaa'},
    )
    # Same status AND same body, or the API becomes a device-ID oracle.
    assert unknown.status_code == wrong.status_code == 403
    assert unknown.json() == wrong.json()


def test_malformed_id_rejected(client):
    r = client.post('/api/v1/device/connect', json={'device_id': '123', 'password': 'aaaaaaaa'})
    assert r.status_code == 400


def test_brute_force_locks_the_device_out(client):
    host = claim(client)
    for _ in range(LOCKOUT_THRESHOLD):
        client.post(
            '/api/v1/device/connect',
            json={'device_id': host['device_id'], 'password': 'aaaaaaaa'},
        )
    locked = client.post(
        '/api/v1/device/connect',
        json={'device_id': host['device_id'], 'password': 'aaaaaaaa'},
    )
    assert locked.status_code == 429
    assert 'Retry-After' in locked.headers

    # Lockout must also block the CORRECT password, or it is not a lockout.
    assert client.post(
        '/api/v1/device/connect',
        json={'device_id': host['device_id'], 'password': host['password']},
    ).status_code == 429


def test_lockout_does_not_rotate_the_password(client):
    """An attacker must not be able to invalidate the code the host read out."""
    host = claim(client)
    for _ in range(LOCKOUT_THRESHOLD + 2):
        client.post(
            '/api/v1/device/connect',
            json={'device_id': host['device_id'], 'password': 'aaaaaaaa'},
        )
    # Owner rotates deliberately; the password they get must still work.
    new = client.post(
        '/api/v1/device/rotate',
        json={'device_id': host['device_id'], 'secret': host['secret']},
    ).json()['password']
    assert client.post(
        '/api/v1/device/connect', json={'device_id': host['device_id'], 'password': new}
    ).status_code == 200


def test_successful_connect_clears_failures(client):
    host = claim(client)
    for _ in range(LOCKOUT_THRESHOLD - 1):
        client.post(
            '/api/v1/device/connect',
            json={'device_id': host['device_id'], 'password': 'aaaaaaaa'},
        )
    assert client.post(
        '/api/v1/device/connect',
        json={'device_id': host['device_id'], 'password': host['password']},
    ).status_code == 200
    # Counter reset, so we are nowhere near the lockout threshold again.
    r = client.post(
        '/api/v1/device/connect',
        json={'device_id': host['device_id'], 'password': 'aaaaaaaa'},
    )
    assert r.status_code == 403


# ---------------------------------------------------------------- unattended


def test_claim_reports_unattended_disabled_by_default(client):
    assert claim(client)['unattended_enabled'] is False


def test_set_unattended_password_enables_a_second_stable_credential(client):
    host = claim(client)
    r = client.post(
        '/api/v1/device/unattended/set',
        json={'device_id': host['device_id'], 'secret': host['secret'], 'password': 'letmein1'},
    )
    assert r.status_code == 200, r.text
    assert r.json()['enabled'] is True

    # The rotating password still works too — this is additive, not a replacement.
    assert client.post(
        '/api/v1/device/connect',
        json={'device_id': host['device_id'], 'password': host['password']},
    ).status_code == 200
    assert client.post(
        '/api/v1/device/connect',
        json={'device_id': host['device_id'], 'password': 'letmein1'},
    ).status_code == 200


def test_unattended_password_survives_rotation_of_the_one_time_password(client):
    host = claim(client)
    client.post(
        '/api/v1/device/unattended/set',
        json={'device_id': host['device_id'], 'secret': host['secret'], 'password': 'letmein1'},
    )
    client.post(
        '/api/v1/device/rotate', json={'device_id': host['device_id'], 'secret': host['secret']}
    )
    # Unattended access is exactly the point: still works with nobody around to
    # read out whatever the one-time password rotated to.
    assert client.post(
        '/api/v1/device/connect',
        json={'device_id': host['device_id'], 'password': 'letmein1'},
    ).status_code == 200


def test_unattended_password_survives_relaunch(client):
    host = claim(client)
    client.post(
        '/api/v1/device/unattended/set',
        json={'device_id': host['device_id'], 'secret': host['secret'], 'password': 'letmein1'},
    )
    relaunched = claim(client, host['device_id'], host['secret'])
    assert relaunched['unattended_enabled'] is True
    assert client.post(
        '/api/v1/device/connect',
        json={'device_id': host['device_id'], 'password': 'letmein1'},
    ).status_code == 200


def test_set_unattended_password_requires_the_secret(client):
    host = claim(client)
    r = client.post(
        '/api/v1/device/unattended/set',
        json={'device_id': host['device_id'], 'secret': 'nope', 'password': 'letmein1'},
    )
    assert r.status_code == 403


def test_set_unattended_password_enforces_minimum_length(client):
    host = claim(client)
    r = client.post(
        '/api/v1/device/unattended/set',
        json={'device_id': host['device_id'], 'secret': host['secret'], 'password': 'short'},
    )
    assert r.status_code == 422


def test_clear_unattended_password_disables_it(client):
    host = claim(client)
    client.post(
        '/api/v1/device/unattended/set',
        json={'device_id': host['device_id'], 'secret': host['secret'], 'password': 'letmein1'},
    )
    r = client.post(
        '/api/v1/device/unattended/clear',
        json={'device_id': host['device_id'], 'secret': host['secret']},
    )
    assert r.status_code == 200
    assert r.json()['enabled'] is False
    assert client.post(
        '/api/v1/device/connect',
        json={'device_id': host['device_id'], 'password': 'letmein1'},
    ).status_code == 403
    # The rotating password is unaffected by clearing the unattended one.
    assert client.post(
        '/api/v1/device/connect',
        json={'device_id': host['device_id'], 'password': host['password']},
    ).status_code == 200


def test_clear_unattended_password_requires_the_secret(client):
    host = claim(client)
    client.post(
        '/api/v1/device/unattended/set',
        json={'device_id': host['device_id'], 'secret': host['secret'], 'password': 'letmein1'},
    )
    r = client.post(
        '/api/v1/device/unattended/clear',
        json={'device_id': host['device_id'], 'secret': 'nope'},
    )
    assert r.status_code == 403


def test_unattended_disabled_flag_hides_its_endpoints_too(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, 'device_access_enabled', False)
    for path in ('/api/v1/device/unattended/set', '/api/v1/device/unattended/clear'):
        assert client.post(
            path, json={'device_id': '123456789', 'secret': 'x', 'password': 'letmein1'}
        ).status_code == 404, path


# --------------------------------------------------------------- kill switch


def test_disabled_flag_hides_every_endpoint(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, 'device_access_enabled', False)
    for path, body in (
        ('/api/v1/device/claim', {}),
        ('/api/v1/device/rotate', {'device_id': '123456789', 'secret': 'x'}),
        ('/api/v1/device/connect', {'device_id': '123456789', 'password': 'x'}),
    ):
        assert client.post(path, json=body).status_code == 404, path


# ------------------------------------------------------------------ helpers


@pytest.mark.parametrize(
    'raw,expected',
    [('129 354 196', '129354196'), ('129-354-196', '129354196'), (' 129354196 ', '129354196')],
)
def test_normalize_device_id(raw, expected):
    assert normalize_device_id(raw) == expected


def test_generated_passwords_avoid_ambiguous_characters():
    joined = ''.join(generate_password() for _ in range(200))
    assert not (set(joined) & set('01loi'))
