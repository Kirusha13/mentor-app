import base64
import hashlib
import hmac
import json
import logging
import os
import time

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

VK_TOKEN_URL = "https://id.vk.ru/oauth2/auth"
VK_USER_INFO_URL = "https://id.vk.ru/oauth2/user_info"
VK_SIGN_TTL = 600


def _decode_id_token_payload(id_token: str) -> dict:
    """Декодирует payload JWT id_token без верификации подписи."""
    try:
        parts = id_token.split(".")
        if len(parts) != 3:
            return {}
        padding = "=" * (4 - len(parts[1]) % 4)
        return json.loads(base64.urlsafe_b64decode(parts[1] + padding))
    except Exception:
        return {}


def _decode_id_token_claim(id_token: str, claim: str) -> str | None:
    payload = _decode_id_token_payload(id_token)
    return payload.get(claim) or None


async def exchange_pkce_code(
    code: str,
    code_verifier: str,
    device_id: str,
    redirect_uri: str,
    app_id: str,
    app_secret: str = "",
) -> dict | None:
    """Обменивает authorization code на access_token через PKCE.

    Возвращает {"access_token": str, "phone": str | None} или None при ошибке.
    Номер телефона берётся из id_token (OIDC claim phone_number).
    """
    payload = {
        "grant_type": "authorization_code",
        "client_id": app_id,
        "code": code,
        "redirect_uri": redirect_uri,
        "code_verifier": code_verifier,
        "device_id": device_id,
    }
    if app_secret:
        payload["client_secret"] = app_secret
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(VK_TOKEN_URL, data=payload)
        data = resp.json()
        logger.info(
            "VK token exchange — keys: %s",
            list(data.keys()),
        )
        access_token = data.get("access_token") or None
        if not access_token:
            logger.warning("VK token exchange failed: %s", data)
            return None
        id_token_raw = data.get("id_token", "")
        id_token_payload = _decode_id_token_payload(id_token_raw)
        logger.info("VK id_token payload: %s", id_token_payload)
        phone = id_token_payload.get("phone_number") or id_token_payload.get("phone") or None
        return {"access_token": access_token, "phone": phone}


async def get_vk_user_from_token(access_token: str, app_id: str) -> dict | None:
    """Получает профиль пользователя из VK ID по access_token.
    Возвращает {vk_id, first_name, last_name, photo_url} или None при ошибке."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(VK_USER_INFO_URL, data={
            "client_id": app_id,
            "access_token": access_token,
            "lang": "ru",
        })
        data = resp.json()
        logger.info("VK user_info raw response: %s", data)
        user = data.get("user")
        if not user:
            return None
        return {
            "vk_id": int(user.get("user_id")),
            "first_name": user.get("first_name", ""),
            "last_name": user.get("last_name") or None,
            "photo_url": user.get("avatar") or None,
            "phone": user.get("phone") or None,
        }


def generate_pkce_pair() -> tuple[str, str]:
    verifier = base64.urlsafe_b64encode(os.urandom(48)).rstrip(b'=').decode()
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b'=').decode()
    return verifier, challenge


def encode_state(redirect: str, role: str, device_id: str = "", code_verifier: str = "") -> str:
    payload: dict = {"redirect": redirect, "role": role, "ts": int(time.time())}
    if device_id:
        payload["device_id"] = device_id
    if code_verifier:
        payload["code_verifier"] = code_verifier
    b64 = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode()
    sig = hmac.new(settings.SECRET_KEY.encode(), b64.encode(), hashlib.sha256).hexdigest()[:16]
    return f"{b64}.{sig}"


def decode_state(state: str) -> dict | None:
    """Возвращает {"redirect": ..., "role": ...} или None при невалидном state."""
    try:
        b64, sig = state.rsplit(".", 1)
        expected = hmac.new(settings.SECRET_KEY.encode(), b64.encode(), hashlib.sha256).hexdigest()[:16]
        if not hmac.compare_digest(expected, sig):
            return None
        return json.loads(base64.urlsafe_b64decode(b64 + "=="))
    except Exception:
        return None


def sign_vk_mobile_data(
    vk_id: int,
    first_name: str,
    last_name: str | None,
    photo_url: str | None,
) -> tuple[dict, str]:
    """Создаёт подписанный пакет данных для deep link в мобильное приложение."""
    payload: dict[str, str] = {
        "vk_id": str(vk_id),
        "first_name": first_name,
        "expires_at": str(int(time.time()) + VK_SIGN_TTL),
    }
    if last_name:
        payload["last_name"] = last_name
    if photo_url:
        payload["photo_url"] = photo_url

    data_string = "&".join(f"{k}={v}" for k, v in sorted(payload.items()))
    sign = hmac.new(settings.SECRET_KEY.encode(), data_string.encode(), hashlib.sha256).hexdigest()
    return payload, sign


def verify_vk_mobile_sign(
    vk_id: int,
    first_name: str,
    expires_at: str,
    sign: str,
    last_name: str | None = None,
    photo_url: str | None = None,
) -> bool:
    """Проверяет HMAC-подпись данных VK, полученных от мобильного приложения."""
    if time.time() > int(expires_at):
        return False

    check: dict[str, str] = {
        "vk_id": str(vk_id),
        "first_name": first_name,
        "expires_at": expires_at,
    }
    if last_name:
        check["last_name"] = last_name
    if photo_url:
        check["photo_url"] = photo_url

    data_string = "&".join(f"{k}={v}" for k, v in sorted(check.items()))
    expected = hmac.new(settings.SECRET_KEY.encode(), data_string.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sign)
