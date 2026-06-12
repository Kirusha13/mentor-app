"""Серии занятий: вычисление вхождений (pure) и материализация в lessons."""
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo


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
