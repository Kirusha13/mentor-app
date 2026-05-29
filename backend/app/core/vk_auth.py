import base64
import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import httpx

from app.core.config import settings

VK_AUTHORIZE_URL = "https://oauth.vk.com/authorize"
VK_TOKEN_URL = "https://oauth.vk.com/access_token"
VK_USER_INFO_URL = "https://api.vk.com/method/users.get"
VK_API_VERSION = "5.131"
VK_SIGN_TTL = 600  # 10 минут


def build_vk_authorize_url(redirect_uri: str, state: str) -> str:
    params = {
        "client_id": settings.VK_APP_ID,
        "redirect_uri": redirect_uri,
        "scope": "",
        "response_type": "code",
        "state": state,
        "v": VK_API_VERSION,
    }
    return f"{VK_AUTHORIZE_URL}?{urlencode(params)}"


def encode_state(redirect: str, role: str) -> str:
    payload = json.dumps({"redirect": redirect, "role": role, "ts": int(time.time())})
    b64 = base64.urlsafe_b64encode(payload.encode()).decode()
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
    """Обменивает code на токен, получает профиль пользователя VK.
    Возвращает {vk_id, first_name, last_name, photo_url} или None при ошибке."""
    async with httpx.AsyncClient(timeout=10) as client:
        token_resp = await client.get(VK_TOKEN_URL, params={
            "client_id": settings.VK_APP_ID,
            "client_secret": settings.VK_APP_SECRET,
            "redirect_uri": redirect_uri,
            "code": code,
        })
        token_data = token_resp.json()

        if "error" in token_data or "access_token" not in token_data:
            return None

        access_token = token_data["access_token"]
        vk_id = token_data.get("user_id")

        user_resp = await client.get(VK_USER_INFO_URL, params={
            "access_token": access_token,
            "fields": "photo_100",
            "v": VK_API_VERSION,
        })
        user_data = user_resp.json()

        if "response" not in user_data or not user_data["response"]:
            return None

        user = user_data["response"][0]
        return {
            "vk_id": vk_id or user.get("id"),
            "first_name": user.get("first_name", ""),
            "last_name": user.get("last_name") or None,
            "photo_url": user.get("photo_100") or None,
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
