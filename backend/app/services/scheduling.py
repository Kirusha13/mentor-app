"""Конкурентность расписания: advisory-локи против двойной брони.

Проверка пересечений и вставка занятия в эндпоинтах брони — это две
отдельные операции (TOCTOU): две одновременные брони могут обе пройти
проверку конфликта и создать пересекающиеся занятия. Транзакционный
advisory-лок по `tutor_id` сериализует критическую секцию для каждого
репетитора и автоматически снимается при commit/rollback.
"""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Пространство имён advisory-локов брони — произвольная фиксированная
# константа, одинаковая на всех путях, чтобы наши локи не конфликтовали
# с чужими advisory-локами по тому же ключу. 'LS' — Lesson Schedule.
_SCHEDULE_LOCK_NAMESPACE = 0x4C53


async def lock_tutor_schedule(db: AsyncSession, tutor_id: int) -> None:
    """Взять транзакционный advisory-лок на расписание репетитора.

    Блокирует до освобождения лока другой транзакцией. Должен вызываться
    в начале критической секции — до проверки пересечений и вставки/
    обновления занятия. Лок снимается автоматически при завершении
    транзакции (commit или rollback).
    """
    await db.execute(
        text("SELECT pg_advisory_xact_lock(:ns, :tutor_id)"),
        {"ns": _SCHEDULE_LOCK_NAMESPACE, "tutor_id": tutor_id},
    )
