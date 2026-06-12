"""Вычисление свободных окон из правил доступности и overrides.

Чистая функция compute_windows — без БД (по образцу compute_coverage).
Инвариант: дата либо целиком по правилам, либо целиком по override.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import TYPE_CHECKING, Literal
from zoneinfo import ZoneInfo

from sqlalchemy import select

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(frozen=True)
class RuleInput:
    weekday: int  # 0=Пн .. 6=Вс
    start_time: time
    end_time: time
    effective_from: date
    effective_until: date | None


@dataclass(frozen=True)
class OverrideInput:
    date: date
    kind: Literal["closed", "window"]
    start_time: time | None
    end_time: time | None


@dataclass(frozen=True)
class BusyInterval:
    starts_at: datetime  # UTC
    ends_at: datetime    # UTC


@dataclass(frozen=True)
class Window:
    date: date
    start_time: time  # локальное время репетитора
    end_time: time


def compute_windows(
    date_from: date,
    date_to: date,
    rules: list[RuleInput],
    overrides: list[OverrideInput],
    busy: list[BusyInterval],
    tz: ZoneInfo,
    now: datetime,
) -> list[Window]:
    """Вычислить свободные окна для записи занятий.

    Args:
        date_from: начало периода (включительно)
        date_to: конец периода (включительно)
        rules: список правил доступности (когда репетитор обычно свободен)
        overrides: список исключений на дни (закрытие/переопределение окон)
        busy: список занятостей (УЖЕ забронированные занятия), UTC
        tz: таймзона репетитора (все времена в правилах/результат в этой ТЗ)
        now: текущее время, UTC (используется для отсечения прошедших окон)

    Returns:
        Список окон (date, start_time, end_time) в локальном времени tz,
        отсортированные по датам.
    """
    # Индексируем overrides по дате для быстрого доступа
    ovr_by_date: dict[date, list[OverrideInput]] = {}
    for o in overrides:
        ovr_by_date.setdefault(o.date, []).append(o)

    result: list[Window] = []
    day = date_from
    while day <= date_to:
        # Определяем окна для дня: либо по override, либо по правилам
        if day in ovr_by_date:
            # Если день переопределён, берём только "window" overrides
            day_windows = [
                (o.start_time, o.end_time)
                for o in ovr_by_date[day]
                if o.kind == "window" and o.start_time and o.end_time
            ]
        else:
            # Иначе берём правила, применимые к этому дню недели и дате
            day_windows = [
                (r.start_time, r.end_time)
                for r in rules
                if r.weekday == day.weekday()
                and r.effective_from <= day
                and (r.effective_until is None or day <= r.effective_until)
            ]

        # Для каждого окна дня вычитаем занятость и прошедшее время
        for w_start, w_end in sorted(day_windows):
            # Конвертируем локальные времена окна в локальные datetime
            start_dt = datetime.combine(day, w_start, tzinfo=tz)
            end_dt = datetime.combine(day, w_end, tzinfo=tz)

            # Находим пересечения окна с занятостями (в локальном времени)
            cuts = sorted(
                (max(b.starts_at.astimezone(tz), start_dt), min(b.ends_at.astimezone(tz), end_dt))
                for b in busy
                if b.starts_at.astimezone(tz) < end_dt and b.ends_at.astimezone(tz) > start_dt
            )

            # Начинаем с максимума начала окна и текущего времени
            free_start = max(start_dt, now.astimezone(tz))

            # Вычитаем занятости из окна
            for cut_start, cut_end in cuts:
                if cut_start > free_start:
                    # Есть свободный промежуток до этой занятости
                    result.append(
                        Window(day, free_start.time(), cut_start.time())
                    )
                if cut_end > free_start:
                    free_start = cut_end

            # Добавляем остаток окна после последней занятости
            if free_start < end_dt:
                result.append(Window(day, free_start.time(), end_dt.time()))

        day += timedelta(days=1)
    return result


async def load_windows(
    db: "AsyncSession",
    tutor_id: int,
    date_from: date,
    date_to: date,
    tz: ZoneInfo,
    now: datetime,
) -> list[Window]:
    """Окна репетитора за период: правила/overrides из БД − занятость."""
    from app.models.availability import AvailabilityOverride, AvailabilityRule
    from app.models.lesson import Lesson
    from app.models.tutor_student import TutorStudent

    rules_rows = (await db.execute(
        select(AvailabilityRule).where(AvailabilityRule.tutor_id == tutor_id)
    )).scalars().all()
    ovr_rows = (await db.execute(
        select(AvailabilityOverride).where(
            AvailabilityOverride.tutor_id == tutor_id,
            AvailabilityOverride.date >= date_from,
            AvailabilityOverride.date <= date_to,
        )
    )).scalars().all()
    busy_rows = (await db.execute(
        select(Lesson)
        .join(TutorStudent, TutorStudent.id == Lesson.tutor_student_id)
        .where(
            TutorStudent.tutor_id == tutor_id,
            Lesson.conduct_status.in_(("scheduled", "reschedule_pending")),
        )
    )).scalars().all()

    rules = [RuleInput(r.weekday, r.start_time, r.end_time, r.effective_from, r.effective_until)
             for r in rules_rows]
    overrides = [OverrideInput(o.date, o.kind.value, o.start_time, o.end_time) for o in ovr_rows]
    busy = [BusyInterval(l.starts_at, l.ends_at) for l in busy_rows]
    return compute_windows(date_from, date_to, rules, overrides, busy, tz, now)
