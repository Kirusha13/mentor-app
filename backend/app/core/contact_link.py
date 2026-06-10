"""Подписанные токены для привязки контактного лица (родителя) к Telegram.

Репетитор создаёт контакт и получает deep-link `https://t.me/<bot>?start=<token>`.
Родитель открывает ссылку → бот по токену узнаёт contact_id и записывает
telegram_id родителя в contacts. Токен подписан HMAC, иначе кто угодно мог бы
подставить чужой contact_id и получать уведомления о чужом ученике.

Ограничения Telegram на параметр start: только [A-Za-z0-9_-], максимум 64
символа. Поэтому токен — компактная бинарная структура (contact_id + усечённый
HMAC-тег), закодированная base64url без padding, а не JSON, как в vk_auth.
"""
import base64
import hmac
from hashlib import sha256

from app.core.config import settings

# contact_id влезает в 6 байт (до 2^48), тег HMAC — 10 байт (80 бит против
# подбора). Итог 16 байт → ~22 символа base64url, с запасом под лимит Telegram.
_ID_BYTES = 6
_TAG_BYTES = 10


def _tag(raw: bytes) -> bytes:
    return hmac.new(settings.SECRET_KEY.encode(), raw, sha256).digest()[:_TAG_BYTES]


def encode_contact_token(contact_id: int) -> str:
    raw = contact_id.to_bytes(_ID_BYTES, "big")
    return base64.urlsafe_b64encode(raw + _tag(raw)).rstrip(b"=").decode()


def decode_contact_token(token: str) -> int | None:
    """Вернуть contact_id или None, если токен повреждён/подделан."""
    try:
        padded = token + "=" * (-len(token) % 4)
        data = base64.urlsafe_b64decode(padded)
        raw, sig = data[:_ID_BYTES], data[_ID_BYTES:]
        if len(raw) != _ID_BYTES or not hmac.compare_digest(_tag(raw), sig):
            return None
        return int.from_bytes(raw, "big")
    except Exception:
        return None
