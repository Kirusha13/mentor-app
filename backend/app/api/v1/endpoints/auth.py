from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import create_access_token
from app.core.telegram_auth import verify_telegram_data
from app.models.tutor import Tutor
from app.schemas.auth import TelegramAuthData, Token

router = APIRouter()


@router.post("/login", response_model=Token)
async def telegram_login(
    data: TelegramAuthData,
    db: AsyncSession = Depends(get_db),
):
    telegram_data = data.model_dump()
    client_timezone = telegram_data.pop("client_timezone", None)
    if not verify_telegram_data(telegram_data):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверная подпись Telegram")

    result = await db.execute(
        select(Tutor).where(Tutor.telegram_id == data.id)
    )
    tutor = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    full_name = " ".join(
        part for part in [data.first_name, data.last_name] if part
    ).strip()

    if tutor is None:
        tutor = Tutor(
            telegram_id=data.id,
            full_name=full_name or "Без имени",
            phone_number=None,
            avatar_url=data.photo_url,
            registered_at=now,
            last_visited_at=now,
            timezone=client_timezone or "Europe/Moscow",
        )
        db.add(tutor)
        await db.commit()
        await db.refresh(tutor)
    else:
        tutor.avatar_url = data.photo_url or tutor.avatar_url
        tutor.last_visited_at = now
        if client_timezone:
            tutor.timezone = client_timezone
        await db.commit()
        await db.refresh(tutor)

    access_token = create_access_token(subject=str(tutor.id))

    return Token(
        access_token=access_token,
        token_type="bearer",
    )