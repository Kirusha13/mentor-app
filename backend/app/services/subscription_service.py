from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lesson import ConductStatus, Lesson, PaymentStatus
from app.models.tutor_student import TutorStudent


@dataclass
class SubscriptionStateError(Exception):
    code: str
    message: str
    subscription_lessons: int | None = None
    used_lessons: int | None = None
    remaining_lessons: int | None = None

    def to_detail(self) -> dict[str, int | str | None]:
        return {
            "code": self.code,
            "message": self.message,
            "subscription_lessons": self.subscription_lessons,
            "used_lessons": self.used_lessons,
            "remaining_lessons": self.remaining_lessons,
        }


def has_subscription(tutor_student: TutorStudent) -> bool:
    return bool(tutor_student.subscription_lessons and tutor_student.subscription_lessons > 0)


def remaining_lessons(tutor_student: TutorStudent) -> int:
    total = tutor_student.subscription_lessons or 0
    used = tutor_student.used_lessons or 0
    return max(total - used, 0)


def validate_subscription_state(
    subscription_lessons: int | None,
    used_lessons: int | None,
) -> None:
    if subscription_lessons is not None and subscription_lessons < 0:
        raise SubscriptionStateError(
            code="INVALID_SUBSCRIPTION_LESSONS",
            message="Количество занятий в абонементе не может быть отрицательным.",
            subscription_lessons=subscription_lessons,
            used_lessons=used_lessons,
        )

    if used_lessons is not None and used_lessons < 0:
        raise SubscriptionStateError(
            code="INVALID_USED_LESSONS",
            message="Количество использованных занятий не может быть отрицательным.",
            subscription_lessons=subscription_lessons,
            used_lessons=used_lessons,
        )

    if (
        subscription_lessons is not None
        and used_lessons is not None
        and used_lessons > subscription_lessons
    ):
        raise SubscriptionStateError(
            code="INVALID_SUBSCRIPTION_STATE",
            message="Использованные занятия не могут превышать размер абонемента.",
            subscription_lessons=subscription_lessons,
            used_lessons=used_lessons,
            remaining_lessons=max(subscription_lessons - used_lessons, 0),
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
    old_status = lesson.conduct_status
    if old_status == new_status or tutor_student is None or not has_subscription(tutor_student):
        lesson.conduct_status = new_status
        return

    total = tutor_student.subscription_lessons or 0
    used = tutor_student.used_lessons or 0

    if old_status != ConductStatus.conducted and new_status == ConductStatus.conducted:
        if used >= total:
            raise SubscriptionStateError(
                code="SUBSCRIPTION_EXHAUSTED",
                message="У ученика закончились занятия по абонементу.",
                subscription_lessons=total,
                used_lessons=used,
                remaining_lessons=0,
            )
        tutor_student.used_lessons = used + 1
        lesson.payment_status = PaymentStatus.paid

    if old_status == ConductStatus.conducted and new_status != ConductStatus.conducted:
        if used <= 0:
            raise SubscriptionStateError(
                code="SUBSCRIPTION_ROLLBACK_INVALID",
                message="Нельзя откатить абонемент ниже нуля.",
                subscription_lessons=total,
                used_lessons=used,
                remaining_lessons=remaining_lessons(tutor_student),
            )
        tutor_student.used_lessons = used - 1
        lesson.payment_status = PaymentStatus.unpaid

    lesson.conduct_status = new_status
