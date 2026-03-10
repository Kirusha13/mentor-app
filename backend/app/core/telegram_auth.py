import hashlib
import hmac
import time

from app.core.config import settings

MAX_AUTH_AGE_SECONDS = 86400  # 24 часа


def verify_telegram_data(data: dict) -> bool:
    """
    Верифицирует данные от Telegram Login Widget.
    https://core.telegram.org/bots/telegram-login#checking-authorization
    """
    received_hash = data.get("hash")
    if not received_hash:
        return False

    auth_date = data.get("auth_date")
    if not auth_date or (time.time() - int(auth_date)) > MAX_AUTH_AGE_SECONDS:
        return False

    # Строка для проверки: все поля кроме hash и None-значений, отсортированные, через \n
    # Telegram не включает отсутствующие поля (last_name, username, photo_url) в подпись
    data_check_string = "\n".join(
        f"{k}={v}"
        for k, v in sorted(data.items())
        if k != "hash" and v is not None
    )

    secret_key = hashlib.sha256(settings.TELEGRAM_BOT_TOKEN.encode()).digest()
    calculated_hash = hmac.new(
        secret_key,
        data_check_string.encode(),
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(calculated_hash, received_hash)
