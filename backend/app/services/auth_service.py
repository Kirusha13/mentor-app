from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.core.telegram_auth import verify_telegram_data
from app.models.tutor import Tutor
from app.schemas.auth import TelegramAuthData, TelegramRegisterData
from app.services.tutor_service import get_tutor_by_invitation_token, get_tutor_by_telegram_id


async def telegram_login(db: AsyncSession, data: TelegramAuthData) -> str:
    """
    Вход репетитора через Telegram Login Widget.
    Возвращает JWT-токен или вызывает исключение.
    """
    if not verify_telegram_data(data.model_dump()):
        raise ValueError("invalid_telegram_hash")

    tutor = await get_tutor_by_telegram_id(db, data.id)
    if tutor is None:
        raise LookupError("tutor_not_found")

    tutor.last_visited_at = datetime.now(timezone.utc)
    await db.commit()

    return create_access_token(tutor.id, role="tutor")


async def telegram_register(db: AsyncSession, data: TelegramRegisterData) -> str:
    """
    Регистрация репетитора по токену-приглашению + Telegram-данные.
    Возвращает JWT-токен или вызывает исключение.
    """
    if not verify_telegram_data(data.model_dump(exclude={"invitation_token", "phone_number"})):
        raise ValueError("invalid_telegram_hash")

    tutor = await get_tutor_by_invitation_token(db, data.invitation_token)
    if tutor is None:
        raise LookupError("invalid_invitation_token")

    if tutor.telegram_id != 0 and tutor.telegram_id != data.id:
        # Токен уже был активирован другим пользователем
        raise PermissionError("token_already_used")

    now = datetime.now(timezone.utc)
    tutor.telegram_id = data.id
    tutor.full_name = data.first_name + (f" {data.last_name}" if data.last_name else "")
    tutor.phone_number = data.phone_number
    tutor.avatar_url = data.photo_url
    tutor.registered_at = now
    tutor.last_visited_at = now

    await db.commit()
    await db.refresh(tutor)

    return create_access_token(tutor.id, role="tutor")
