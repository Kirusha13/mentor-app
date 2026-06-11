from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lesson import ConductStatus, Lesson
from app.models.subscription import Subscription
from app.models.tutor_student import TutorStudent


@dataclass
class SubscriptionStateError(Exception):
    code: str
    message: str
    subscription_hours: Decimal | None = None
    used_hours: Decimal | None = None
    remaining_hours: Decimal | None = None

    def to_detail(self) -> dict[str, Decimal | str | None]:
        return {
            "code": self.code,
            "message": self.message,
            "subscription_hours": self.subscription_hours,
            "used_hours": self.used_hours,
            "remaining_hours": self.remaining_hours,
        }


def has_subscription(tutor_student: TutorStudent) -> bool:
    return bool(tutor_student.subscription_hours and tutor_student.subscription_hours > 0)


def remaining_hours(tutor_student: TutorStudent) -> Decimal:
    total = tutor_student.subscription_hours or Decimal(0)
    used = tutor_student.used_hours or Decimal(0)
    return max(total - used, Decimal(0))


def validate_subscription_state(
    subscription_hours: Decimal | None,
    used_hours: Decimal | None,
) -> None:
    if subscription_hours is not None and subscription_hours < 0:
        raise SubscriptionStateError(
            code="INVALID_SUBSCRIPTION_HOURS",
            message="Количество часов в абонементе не может быть отрицательным.",
            subscription_hours=subscription_hours,
            used_hours=used_hours,
        )

    if used_hours is not None and used_hours < 0:
        raise SubscriptionStateError(
            code="INVALID_USED_HOURS",
            message="Количество использованных часов не может быть отрицательным.",
            subscription_hours=subscription_hours,
            used_hours=used_hours,
        )


async def get_tutor_student_for_lesson(
    db: AsyncSession,
    lesson: Lesson,
) -> TutorStudent | None:
    if lesson.tutor_student_id is None:
        return None

    return await db.get(TutorStudent, lesson.tutor_student_id)


def apply_conduct_status_transition(
    lesson: Lesson,
    tutor_student: TutorStudent | None,
    new_status: ConductStatus,
) -> None:
    """Сменить статус проведения занятия.

    Абонемент развязан с оплатой: израсходованные часы — это производная
    величина (TutorStudent.used_hours = сумма проведённых занятий), поэтому
    здесь не нужно вручную списывать/возвращать часы и менять payment_status.
    Параметр tutor_student сохранён ради совместимости с местами вызова.
    """
    lesson.conduct_status = new_status


@dataclass(frozen=True)
class CoverageLesson:
    id: int
    starts_at: datetime
    ends_at: datetime

    @property
    def hours(self) -> Decimal:
        seconds = (self.ends_at - self.starts_at).total_seconds()
        return Decimal(seconds) / Decimal(3600)


@dataclass(frozen=True)
class CoveragePackage:
    hours: Decimal
    start_date: date


def compute_coverage(
    lessons: list[CoverageLesson],
    packages: list[CoveragePackage],
) -> set[int]:
    """Вернуть id занятий, покрытых абонементом.

    Занятия обрабатываются по возрастанию starts_at. Для каждого:
    доступно = Σ hours пакетов с start_date <= дата занятия − уже израсходованное
    покрытыми занятиями. Если доступно >= длительности → покрыто.
    «Всё-или-ничего»: занятие либо целиком покрыто, либо поурочное.
    """
    covered: set[int] = set()
    consumed = Decimal(0)
    pkgs = sorted(packages, key=lambda p: p.start_date)
    for lesson in sorted(lessons, key=lambda l: l.starts_at):
        available = sum(
            (p.hours for p in pkgs if p.start_date <= lesson.starts_at.date()),
            Decimal(0),
        ) - consumed
        if available >= lesson.hours:
            covered.add(lesson.id)
            consumed += lesson.hours
    return covered


async def recompute_coverage(db: AsyncSession, tutor_student_id: int) -> None:
    """Пересчитать lessons.subscription_covered для связки и записать в БД.

    Коммит делает вызывающий эндпоинт.
    """
    lessons_rows = (
        await db.execute(
            select(Lesson).where(
                Lesson.tutor_student_id == tutor_student_id,
                Lesson.conduct_status == ConductStatus.conducted,
            )
        )
    ).scalars().all()
    pkg_rows = (
        await db.execute(
            select(Subscription).where(
                Subscription.tutor_student_id == tutor_student_id
            )
        )
    ).scalars().all()

    cov_lessons = [
        CoverageLesson(id=l.id, starts_at=l.starts_at, ends_at=l.ends_at)
        for l in lessons_rows
    ]
    cov_pkgs = [
        CoveragePackage(hours=p.hours, start_date=p.start_date) for p in pkg_rows
    ]
    covered_ids = compute_coverage(cov_lessons, cov_pkgs)

    for l in lessons_rows:
        new_val = l.id in covered_ids
        if l.subscription_covered != new_val:
            l.subscription_covered = new_val
    # commit делает вызывающий эндпоинт
