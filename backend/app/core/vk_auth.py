import base64
import hashlib
import hmac
import json
import os
import time

import httpx

from app.core.config import settings

VK_OAUTH_TOKEN_URL = "https://oauth.vk.com/access_token"
VK_API_USERS_URL = "https://api.vk.com/method/users.get"
VK_API_VERSION = "5.199"
VK_SIGN_TTL = 600


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


async def exchange_code_for_vk_user(code: str, redirect_uri: str) -> dict | None:
    """Обменивает code на профиль через классический VK OAuth (oauth.vk.com).
    Возвращает {vk_id, first_name, last_name, photo_url} или None при ошибке."""
    async with httpx.AsyncClient(timeout=10) as client:
        token_resp = await client.get(VK_OAUTH_TOKEN_URL, params={
            "client_id": settings.VK_APP_ID,
            "client_secret": settings.VK_APP_SECRET,
            "redirect_uri": redirect_uri,
            "code": code,
        })
        token_data = token_resp.json()

        if "error" in token_data or "access_token" not in token_data:
            return None

        access_token = token_data["access_token"]
        user_id = token_data.get("user_id")
        if not user_id:
            return None

        users_resp = await client.get(VK_API_USERS_URL, params={
            "user_ids": str(user_id),
            "fields": "first_name,last_name,photo_200",
            "access_token": access_token,
            "v": VK_API_VERSION,
        })
        users_data = users_resp.json()

        users = users_data.get("response")
        if not users:
            return None

        user = users[0]
        return {
            "vk_id": int(user.get("id")),
            "first_name": user.get("first_name", ""),
            "last_name": user.get("last_name") or None,
            "photo_url": user.get("photo_200") or None,
        }


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
