import logging

from telegram import Bot

from app.core.config import settings


logger = logging.getLogger(__name__)


async def send_to_user(telegram_id: int | None, text: str) -> None:
    if not telegram_id or not text.strip():
        return

    try:
        async with Bot(token=settings.TELEGRAM_BOT_TOKEN) as bot:
            await bot.send_message(chat_id=telegram_id, text=text)
    except Exception:
        logger.exception("Не удалось отправить Telegram-уведомление пользователю %s", telegram_id)
