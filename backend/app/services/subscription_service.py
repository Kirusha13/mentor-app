from dataclasses import dataclass
from datetime import date as date_type, datetime
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lesson import ConductStatus, Lesson, PaymentStatus
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

    if (
        subscription_hours is not None
        and used_hours is not None
        and used_hours > subscription_hours
    ):
        raise SubscriptionStateError(
            code="INVALID_SUBSCRIPTION_STATE",
            message="Использованные часы не могут превышать размер абонемента.",
            subscription_hours=subscription_hours,
            used_hours=used_hours,
            remaining_hours=max(subscription_hours - used_hours, Decimal(0)),
        )


async def get_tutor_student_for_lesson(
    db: AsyncSession,
    lesson: Lesson,
) -> TutorStudent | None:
    if lesson.tutor_student_id is None:
        return None

    return await db.get(TutorStudent, lesson.tutor_student_id)


def _lesson_duration_hours(lesson: Lesson) -> Decimal:
    seconds = (
        datetime.combine(date_type.min, lesson.end_time) -
        datetime.combine(date_type.min, lesson.start_time)
    ).seconds
    return Decimal(seconds) / Decimal(3600)


def apply_conduct_status_transition(
    lesson: Lesson,
    tutor_student: TutorStudent | None,
    new_status: ConductStatus,
) -> None:
    old_status = lesson.conduct_status
    if old_status == new_status or tutor_student is None or not has_subscription(tutor_student):
        lesson.conduct_status = new_status
        return

    total = tutor_student.subscription_hours or Decimal(0)
    used = tutor_student.used_hours or Decimal(0)
    duration = _lesson_duration_hours(lesson)

    if old_status != ConductStatus.conducted and new_status == ConductStatus.conducted:
        if used >= total:
            raise SubscriptionStateError(
                code="SUBSCRIPTION_EXHAUSTED",
                message="У ученика закончились часы по абонементу.",
                subscription_hours=total,
                used_hours=used,
                remaining_hours=Decimal(0),
            )
        tutor_student.used_hours = used + duration
        lesson.payment_status = PaymentStatus.paid

    if old_status == ConductStatus.conducted and new_status != ConductStatus.conducted:
        if used <= 0:
            raise SubscriptionStateError(
                code="SUBSCRIPTION_ROLLBACK_INVALID",
                message="Нельзя откатить абонемент ниже нуля.",
                subscription_hours=total,
                used_hours=used,
                remaining_hours=remaining_hours(tutor_student),
            )
        tutor_student.used_hours = used - duration
        lesson.payment_status = PaymentStatus.unpaid

    lesson.conduct_status = new_status
