from datetime import date, datetime, timedelta
from decimal import Decimal

from app.services.subscription_service import (
    CoverageLesson,
    CoveragePackage,
    compute_coverage,
)


def _lesson(id: int, day: int, hours: float) -> CoverageLesson:
    start = datetime(2026, 6, day, 10, 0)
    return CoverageLesson(id=id, starts_at=start, ends_at=start + timedelta(hours=hours))


def test_no_packages_nothing_covered():
    lessons = [_lesson(1, 1, 1), _lesson(2, 2, 1)]
    assert compute_coverage(lessons, []) == set()


def test_simple_package_covers_within_pool():
    # пакет 2ч с 1 июня; два занятия по 1ч → оба покрыты
    pkgs = [CoveragePackage(Decimal(2), date(2026, 6, 1))]
    lessons = [_lesson(1, 1, 1), _lesson(2, 2, 1)]
    assert compute_coverage(lessons, pkgs) == {1, 2}


def test_pool_exhausted_overflow_is_per_lesson():
    # пакет 1ч, два занятия по 1ч → покрыто только первое
    pkgs = [CoveragePackage(Decimal(1), date(2026, 6, 1))]
    lessons = [_lesson(1, 1, 1), _lesson(2, 2, 1)]
    assert compute_coverage(lessons, pkgs) == {1}


def test_start_date_excludes_earlier_lessons():
    # пакет с 5 июня не покрывает занятие 1 июня
    pkgs = [CoveragePackage(Decimal(10), date(2026, 6, 5))]
    lessons = [_lesson(1, 1, 1), _lesson(2, 6, 1)]
    assert compute_coverage(lessons, pkgs) == {2}


def test_backdated_package_covers_earlier_lessons():
    # бэкдейт на 1 июня покрывает прошедшее занятие
    pkgs = [CoveragePackage(Decimal(10), date(2026, 6, 1))]
    lessons = [_lesson(1, 1, 1), _lesson(2, 6, 1)]
    assert compute_coverage(lessons, pkgs) == {1, 2}


def test_all_or_nothing_partial_not_covered():
    # пакет 0.5ч, занятие 1.5ч → не хватает → поурочное
    pkgs = [CoveragePackage(Decimal("0.5"), date(2026, 6, 1))]
    lessons = [_lesson(1, 1, 1.5)]
    assert compute_coverage(lessons, pkgs) == set()


def test_lesson_spans_two_packages():
    # 0.5ч с 1 июня + 1ч с 3 июня; занятие 1.5ч пятого числа → покрыто из двух
    pkgs = [
        CoveragePackage(Decimal("0.5"), date(2026, 6, 1)),
        CoveragePackage(Decimal(1), date(2026, 6, 3)),
    ]
    lessons = [_lesson(1, 5, 1.5)]
    assert compute_coverage(lessons, pkgs) == {1}


def test_second_package_not_retroactive_for_overflow():
    # P1 1ч с 1 июня: 2 занятия по 1ч 1-2 июня → покрыто {1}. P2 1ч с 10 июня
    # НЕ покрывает занятие 2 (его дата раньше start_date P2)
    pkgs = [
        CoveragePackage(Decimal(1), date(2026, 6, 1)),
        CoveragePackage(Decimal(1), date(2026, 6, 10)),
    ]
    lessons = [_lesson(1, 1, 1), _lesson(2, 2, 1)]
    assert compute_coverage(lessons, pkgs) == {1}
