"""Серии занятий: вычисление вхождений (pure) и материализация в lessons."""
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select


def compute_series_occurrences(
    weekday: int,
    start_time: time,
    duration_minutes: int,
    starts_on: date,
    ends_on: date | None,
    horizon_from: date,
    horizon_to: date,
    tz: ZoneInfo,
) -> list[tuple[date, datetime, datetime]]:
    """Вхождения серии в горизонте: (локальная дата, starts_at UTC, ends_at UTC)."""
    lower = max(horizon_from, starts_on)
    upper = min(horizon_to, ends_on) if ends_on else horizon_to

    out: list[tuple[date, datetime, datetime]] = []
    day = lower + timedelta(days=(weekday - lower.weekday()) % 7)
    while day <= upper:
        starts_at = datetime.combine(day, start_time, tzinfo=tz).astimezone(timezone.utc)
        out.append((day, starts_at, starts_at + timedelta(minutes=duration_minutes)))
        day += timedelta(days=7)
    return out


HORIZON_DAYS = 28


async def materialize_series(db, series_id: int | None = None) -> int:
    """Создать недостающие занятия активных серий на 28 дней вперёд. Возвращает число созданных."""
    from app.models.lesson import ConductStatus, Lesson, PaymentStatus
    from app.models.lesson_series import LessonSeries
    from app.models.tutor import Tutor
    from app.models.tutor_student import TutorStudent, TutorStudentStatus

    q = select(LessonSeries).where(LessonSeries.is_active.is_(True))
    if series_id is not None:
        q = q.where(LessonSeries.id == series_id)
    series_rows = (await db.execute(q)).scalars().all()
    created = 0
    today = date.today()

    for series in series_rows:
        link = await db.get(TutorStudent, series.tutor_student_id)
        if link is None or link.status != TutorStudentStatus.active:
            continue
        tutor = await db.get(Tutor, link.tutor_id)
        tz = ZoneInfo(tutor.timezone) if tutor and tutor.timezone else ZoneInfo("Europe/Moscow")

        occurrences = compute_series_occurrences(
            series.weekday, series.start_time, series.duration_minutes,
            series.starts_on, series.ends_on,
            today, today + timedelta(days=HORIZON_DAYS), tz,
        )
        if not occurrences:
            continue

        # дедуп: даты, на которые занятие серии уже существует (в любом статусе)
        existing = (await db.execute(
            select(Lesson.starts_at).where(Lesson.series_id == series.id)
        )).scalars().all()
        existing_dates = {s.astimezone(tz).date() for s in existing}

        # конфликты: занятия репетитора scheduled/reschedule_pending в горизонте
        busy = (await db.execute(
            select(Lesson.starts_at, Lesson.ends_at)
            .join(TutorStudent, TutorStudent.id == Lesson.tutor_student_id)
            .where(
                TutorStudent.tutor_id == link.tutor_id,
                Lesson.conduct_status.in_((ConductStatus.scheduled, ConductStatus.reschedule_pending)),
                Lesson.ends_at > datetime.now(timezone.utc),
            )
        )).all()

        hourly = float(link.hourly_rate)
        for occ_date, starts_at, ends_at in occurrences:
            if occ_date in existing_dates:
                continue
            if starts_at <= datetime.now(timezone.utc):
                continue
            if any(b_start < ends_at and b_end > starts_at for b_start, b_end in busy):
                continue
            db.add(Lesson(
                tutor_student_id=series.tutor_student_id,
                series_id=series.id,
                starts_at=starts_at,
                ends_at=ends_at,
                cost=hourly * series.duration_minutes / 60,
                reminder_sent=False,
            ))
            created += 1
    await db.flush()
    return created


async def delete_untouched_future(db, series_id: int) -> None:
    """Удалить будущие нетронутые вхождения серии (scheduled + unpaid) — перед перегенерацией/остановкой."""
    from app.models.lesson import ConductStatus, Lesson, PaymentStatus

    rows = (await db.execute(
        select(Lesson).where(
            Lesson.series_id == series_id,
            Lesson.conduct_status == ConductStatus.scheduled,
            Lesson.payment_status == PaymentStatus.unpaid,
            Lesson.starts_at > datetime.now(timezone.utc),
        )
    )).scalars().all()
    for l in rows:
        await db.delete(l)
    await db.flush()


async def pause_series_for_link(db, tutor_student_id: int) -> None:
    """Авто-пауза всех серий связки (вызывается при переводе связки в paused/completed)."""
    from app.models.lesson_series import LessonSeries

    rows = (await db.execute(
        select(LessonSeries).where(
            LessonSeries.tutor_student_id == tutor_student_id,
            LessonSeries.is_active.is_(True),
        )
    )).scalars().all()
    for s in rows:
        s.is_active = False
        await delete_untouched_future(db, s.id)
