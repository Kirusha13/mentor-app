import base64
import hashlib

from app.core.vk_auth import encode_state, decode_state, generate_pkce_pair


def test_generate_pkce_pair_lengths():
    verifier, challenge = generate_pkce_pair()
    assert len(verifier) == 64  # 48 bytes → base64url no padding
    assert len(challenge) == 43  # sha256 = 32 bytes → base64url no padding


def test_generate_pkce_pair_challenge_is_sha256_of_verifier():
    verifier, challenge = generate_pkce_pair()
    expected = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b'=').decode()
    assert challenge == expected


def test_generate_pkce_pair_unique():
    v1, _ = generate_pkce_pair()
    v2, _ = generate_pkce_pair()
    assert v1 != v2


def test_encode_decode_state_with_code_verifier():
    state = encode_state(
        redirect="https://example.com/callback",
        role="tutor",
        code_verifier="my-verifier",
    )
    decoded = decode_state(state)
    assert decoded is not None
    assert decoded["redirect"] == "https://example.com/callback"
    assert decoded["role"] == "tutor"
    assert decoded["code_verifier"] == "my-verifier"


def test_decode_state_rejects_tampered():
    state = encode_state(redirect="https://example.com/callback", role="tutor")
    tampered = state[:-4] + "XXXX"
    assert decode_state(tampered) is None
