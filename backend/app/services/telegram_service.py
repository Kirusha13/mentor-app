import logging

from telegram import Bot
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.contact import Contact
from app.models.student_contact import StudentContact


logger = logging.getLogger(__name__)


async def send_to_user(telegram_id: int | None, text: str) -> None:
    if not telegram_id or not text.strip():
        return

    try:
        async with Bot(token=settings.TELEGRAM_BOT_TOKEN) as bot:
            await bot.send_message(chat_id=telegram_id, text=text)
    except Exception:
        logger.exception("Не удалось отправить Telegram-уведомление пользователю %s", telegram_id)


async def notify_student_contacts(db: AsyncSession, student_id: int, text: str) -> None:
    """Разослать уведомление всем контактным лицам ученика с привязанным Telegram.

    Контакты без telegram_id (не прошли привязку через бота) пропускаются.
    Ошибки доставки не прерывают остальных — за это отвечает send_to_user.
    """
    result = await db.execute(
        select(Contact.telegram_id)
        .join(StudentContact, StudentContact.contact_id == Contact.id)
        .where(
            StudentContact.student_id == student_id,
            Contact.telegram_id.is_not(None),
        )
        .distinct()
    )
    for (telegram_id,) in result.all():
        await send_to_user(telegram_id, text)
