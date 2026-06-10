"""Telegram-бот для контактных лиц (родителей).

Принимает входящие апдейты через long-polling, запускается/останавливается
из lifespan FastAPI (см. app/main.py). Единственная команда — /start с
deep-link токеном: родитель открывает персональную ссылку от репетитора,
бот по токену находит contact_id и записывает его telegram_id в contacts,
после чего родитель начинает получать уведомления (send_to_user).

Polling, а не webhook: серверу не нужен публичный HTTPS-URL и регистрация
setWebhook, бот работает на любом 24/7-хосте. Это единственный потребитель
getUpdates — нельзя запускать несколько инстансов одновременно (Telegram
вернёт 409). Ошибки старта проглатываются, чтобы API поднимался даже без
доступной сети/валидного токена.
"""
import logging

from telegram import Update
from telegram.ext import Application, ApplicationBuilder, CommandHandler, ContextTypes

from app.core.config import settings
from app.core.contact_link import decode_contact_token
from app.core.database import AsyncSessionLocal
from app.models.contact import Contact

logger = logging.getLogger(__name__)

_application: Application | None = None


async def _start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.effective_message
    user = update.effective_user
    if message is None or user is None:
        return

    args = context.args or []
    if not args:
        await message.reply_text(
            "Здравствуйте! Чтобы получать уведомления о занятиях ученика, "
            "откройте персональную ссылку-приглашение, которую пришлёт репетитор."
        )
        return

    contact_id = decode_contact_token(args[0])
    if contact_id is None:
        await message.reply_text(
            "Ссылка недействительна. Попросите репетитора прислать новую."
        )
        return

    async with AsyncSessionLocal() as db:
        contact = await db.get(Contact, contact_id)
        if contact is None:
            await message.reply_text(
                "Контакт не найден. Попросите репетитора прислать новую ссылку."
            )
            return
        contact.telegram_id = user.id
        await db.commit()
        contact_name = contact.full_name

    await message.reply_text(
        f"Готово, {user.first_name}! Вы подключены как контактное лицо "
        f"«{contact_name}» и будете получать уведомления о занятиях, "
        "оценках и оплате."
    )


async def start_bot() -> None:
    """Запустить бота (polling). Безопасно вызывать из lifespan."""
    global _application
    if not settings.TELEGRAM_BOT_TOKEN:
        logger.info("TELEGRAM_BOT_TOKEN не задан — бот не запущен")
        return
    try:
        application = ApplicationBuilder().token(settings.TELEGRAM_BOT_TOKEN).build()
        application.add_handler(CommandHandler("start", _start))
        await application.initialize()
        await application.start()
        await application.updater.start_polling(drop_pending_updates=True)
        _application = application
        logger.info("Telegram-бот запущен (polling)")
    except Exception:
        logger.exception("Не удалось запустить Telegram-бота — API работает без него")
        _application = None


async def stop_bot() -> None:
    """Остановить бота. Безопасно вызывать, даже если он не запускался."""
    global _application
    if _application is None:
        return
    try:
        if _application.updater is not None:
            await _application.updater.stop()
        await _application.stop()
        await _application.shutdown()
    except Exception:
        logger.exception("Ошибка остановки Telegram-бота")
    finally:
        _application = None
