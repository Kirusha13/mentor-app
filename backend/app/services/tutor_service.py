from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tutor import Tutor


async def get_tutor_by_telegram_id(db: AsyncSession, telegram_id: int) -> Tutor | None:
    result = await db.execute(select(Tutor).where(Tutor.telegram_id == telegram_id))
    return result.scalar_one_or_none()


async def get_tutor_by_invitation_token(db: AsyncSession, token: str) -> Tutor | None:
    result = await db.execute(select(Tutor).where(Tutor.invitation_token == token))
    return result.scalar_one_or_none()


async def get_tutor_by_id(db: AsyncSession, tutor_id: int) -> Tutor | None:
    result = await db.execute(select(Tutor).where(Tutor.id == tutor_id))
    return result.scalar_one_or_none()
