from app.core.contact_link import decode_contact_token, encode_contact_token


def test_roundtrip_returns_same_contact_id():
    token = encode_contact_token(12345)
    assert decode_contact_token(token) == 12345


def test_token_is_telegram_start_safe():
    token = encode_contact_token(987654321)
    assert len(token) <= 64
    assert all(c.isalnum() or c in "_-" for c in token)


def test_tampered_token_rejected():
    token = encode_contact_token(42)
    tampered = ("A" if token[0] != "A" else "B") + token[1:]
    assert decode_contact_token(tampered) is None


def test_garbage_token_rejected():
    assert decode_contact_token("not-a-real-token!!") is None
    assert decode_contact_token("") is None


def test_distinct_ids_distinct_tokens():
    assert encode_contact_token(1) != encode_contact_token(2)
