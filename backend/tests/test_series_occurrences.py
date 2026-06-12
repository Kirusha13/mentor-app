from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

from app.services.series_service import compute_series_occurrences

TZ = ZoneInfo("Asia/Yekaterinburg")


def test_weekly_occurrences_in_horizon():
    # вторники с 2026-06-15 по 2026-07-12: 16, 23, 30 июня, 7 июля
    occ = compute_series_occurrences(
        weekday=1, start_time=time(17, 0), duration_minutes=60,
        starts_on=date(2026, 6, 1), ends_on=None,
        horizon_from=date(2026, 6, 15), horizon_to=date(2026, 7, 12), tz=TZ,
    )
    assert [o[0] for o in occ] == [date(2026, 6, 16), date(2026, 6, 23), date(2026, 6, 30), date(2026, 7, 7)]


def test_starts_at_is_utc_converted():
    occ = compute_series_occurrences(
        weekday=1, start_time=time(17, 0), duration_minutes=90,
        starts_on=date(2026, 6, 1), ends_on=None,
        horizon_from=date(2026, 6, 16), horizon_to=date(2026, 6, 16), tz=TZ,
    )
    d, starts_at, ends_at = occ[0]
    assert starts_at == datetime(2026, 6, 16, 12, 0, tzinfo=timezone.utc)  # 17:00 UTC+5
    assert ends_at == datetime(2026, 6, 16, 13, 30, tzinfo=timezone.utc)


def test_starts_on_bounds_lower():
    occ = compute_series_occurrences(
        weekday=1, start_time=time(17, 0), duration_minutes=60,
        starts_on=date(2026, 6, 20), ends_on=None,
        horizon_from=date(2026, 6, 15), horizon_to=date(2026, 6, 30), tz=TZ,
    )
    assert [o[0] for o in occ] == [date(2026, 6, 23), date(2026, 6, 30)]


def test_ends_on_bounds_upper():
    occ = compute_series_occurrences(
        weekday=1, start_time=time(17, 0), duration_minutes=60,
        starts_on=date(2026, 6, 1), ends_on=date(2026, 6, 24),
        horizon_from=date(2026, 6, 15), horizon_to=date(2026, 7, 12), tz=TZ,
    )
    assert [o[0] for o in occ] == [date(2026, 6, 16), date(2026, 6, 23)]


def test_empty_when_horizon_misses_weekday():
    occ = compute_series_occurrences(
        weekday=1, start_time=time(17, 0), duration_minutes=60,
        starts_on=date(2026, 6, 1), ends_on=None,
        horizon_from=date(2026, 6, 17), horizon_to=date(2026, 6, 22), tz=TZ,  # ср–пн, вторника нет
    )
    assert occ == []


def test_starts_on_equals_horizon_on_weekday():
    # 2026-06-16 — вторник; horizon_from == starts_on == вторник
    occ = compute_series_occurrences(
        weekday=1, start_time=time(17, 0), duration_minutes=60,
        starts_on=date(2026, 6, 16), ends_on=None,
        horizon_from=date(2026, 6, 16), horizon_to=date(2026, 6, 16), tz=TZ,
    )
    assert [o[0] for o in occ] == [date(2026, 6, 16)]
