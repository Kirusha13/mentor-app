from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from app.services.availability_service import (
    BusyInterval,
    OverrideInput,
    RuleInput,
    Window,
    compute_windows,
)

TZ = ZoneInfo("Asia/Yekaterinburg")  # UTC+5, как у репетиторов проекта
PAST = datetime(2026, 1, 1, tzinfo=timezone.utc)  # "now" задолго до диапазона


def _rule(weekday, start, end, frm=date(2026, 1, 1), until=None):
    return RuleInput(
        weekday=weekday,
        start_time=time(*start),
        end_time=time(*end),
        effective_from=frm,
        effective_until=until,
    )


def _busy(d, start, end):
    # занятие в локальном времени TZ, хранится как UTC
    s = datetime.combine(d, time(*start), tzinfo=TZ).astimezone(timezone.utc)
    e = datetime.combine(d, time(*end), tzinfo=TZ).astimezone(timezone.utc)
    return BusyInterval(starts_at=s, ends_at=e)


def test_no_rules_no_windows():
    assert (
        compute_windows(date(2026, 6, 15), date(2026, 6, 21), [], [], [], TZ, PAST)
        == []
    )


def test_rule_applies_on_its_weekday():
    # 2026-06-16 — вторник (weekday=1)
    rules = [_rule(1, (14, 0), (18, 0))]
    out = compute_windows(
        date(2026, 6, 15), date(2026, 6, 21), rules, [], [], TZ, PAST
    )
    assert out == [Window(date(2026, 6, 16), time(14, 0), time(18, 0))]


def test_two_windows_same_day():
    rules = [_rule(1, (10, 0), (13, 0)), _rule(1, (16, 0), (19, 0))]
    out = compute_windows(
        date(2026, 6, 16), date(2026, 6, 16), rules, [], [], TZ, PAST
    )
    assert [(w.start_time, w.end_time) for w in out] == [
        (time(10, 0), time(13, 0)),
        (time(16, 0), time(19, 0)),
    ]


def test_override_replaces_whole_day():
    rules = [_rule(1, (10, 0), (13, 0)), _rule(1, (16, 0), (19, 0))]
    ovr = [
        OverrideInput(
            date=date(2026, 6, 16),
            kind="window",
            start_time=time(11, 0),
            end_time=time(14, 0),
        )
    ]
    out = compute_windows(
        date(2026, 6, 16), date(2026, 6, 16), rules, ovr, [], TZ, PAST
    )
    assert out == [Window(date(2026, 6, 16), time(11, 0), time(14, 0))]


def test_closed_override_empties_day():
    rules = [_rule(1, (10, 0), (13, 0))]
    ovr = [
        OverrideInput(
            date=date(2026, 6, 16), kind="closed", start_time=None, end_time=None
        )
    ]
    assert (
        compute_windows(date(2026, 6, 16), date(2026, 6, 16), rules, ovr, [], TZ, PAST)
        == []
    )


def test_effective_dates_bound_rule():
    rules = [
        _rule(1, (14, 0), (18, 0), frm=date(2026, 6, 17))
    ]  # вступает после 16-го
    assert (
        compute_windows(date(2026, 6, 16), date(2026, 6, 16), rules, [], [], TZ, PAST)
        == []
    )
    rules2 = [_rule(1, (14, 0), (18, 0), until=date(2026, 6, 15))]  # истекло до 16-го
    assert (
        compute_windows(
            date(2026, 6, 16), date(2026, 6, 16), rules2, [], [], TZ, PAST
        )
        == []
    )


def test_busy_lesson_splits_window():
    rules = [_rule(1, (14, 0), (18, 0))]
    busy = [_busy(date(2026, 6, 16), (15, 0), (16, 0))]
    out = compute_windows(
        date(2026, 6, 16), date(2026, 6, 16), rules, [], busy, TZ, PAST
    )
    assert [(w.start_time, w.end_time) for w in out] == [
        (time(14, 0), time(15, 0)),
        (time(16, 0), time(18, 0)),
    ]


def test_busy_partial_overlap_trims_edge():
    rules = [_rule(1, (14, 0), (18, 0))]
    busy = [_busy(date(2026, 6, 16), (13, 0), (15, 0))]
    out = compute_windows(
        date(2026, 6, 16), date(2026, 6, 16), rules, [], busy, TZ, PAST
    )
    assert [(w.start_time, w.end_time) for w in out] == [(time(15, 0), time(18, 0))]


def test_past_time_is_cut():
    rules = [_rule(1, (14, 0), (18, 0))]
    now = datetime.combine(date(2026, 6, 16), time(15, 30), tzinfo=TZ).astimezone(
        timezone.utc
    )
    out = compute_windows(
        date(2026, 6, 16), date(2026, 6, 16), rules, [], [], TZ, now
    )
    assert [(w.start_time, w.end_time) for w in out] == [(time(15, 30), time(18, 0))]


def test_fully_past_day_empty():
    rules = [_rule(1, (14, 0), (18, 0))]
    now = datetime.combine(date(2026, 6, 16), time(19, 0), tzinfo=TZ).astimezone(
        timezone.utc
    )
    assert (
        compute_windows(date(2026, 6, 16), date(2026, 6, 16), rules, [], [], TZ, now)
        == []
    )


def test_busy_exactly_at_boundary_no_zero_window():
    rules = [_rule(1, (14, 0), (18, 0))]
    busy = [_busy(date(2026, 6, 16), (14, 0), (15, 0))]  # начинается ровно на открытии окна
    out = compute_windows(date(2026, 6, 16), date(2026, 6, 16), rules, [], busy, TZ, PAST)
    assert [(w.start_time, w.end_time) for w in out] == [(time(15, 0), time(18, 0))]
