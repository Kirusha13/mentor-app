from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tutor
from app.core.database import get_db
from app.models.lesson import ConductStatus, HomeworkStatus, Lesson, PaymentStatus
from app.models.student import Student
from app.models.tutor import Tutor
from app.models.tutor_student import TutorStudent
from app.schemas.lesson import ConfirmPaymentRequest, LessonCreate, LessonOut, LessonReschedule, LessonUpdate
from app.services.scheduling import lock_tutor_schedule
from app.services.subscription_service import (
    apply_conduct_status_transition,
    get_tutor_student_for_lesson,
    recompute_coverage,
)
from app.services.telegram_service import notify_student_contacts, send_to_user

router = APIRouter()


ACTIVE_BOOKING_STATUSES = (
    ConductStatus.scheduled,
    ConductStatus.booking_pending,
    ConductStatus.reschedule_pending,
)


def _format_lesson_for_user(dt: datetime, user_tz: str | None) -> str:
    tz = ZoneInfo(user_tz) if user_tz else ZoneInfo("Europe/Moscow")
    local = dt.astimezone(tz)
    return local.strftime("%d.%m.%Y в %H:%M")


async def _get_lesson_for_tutor(db: AsyncSession, lesson_id: int, tutor_id: int) -> Lesson:
    result = await db.execute(
        select(Lesson)
        .outerjoin(TutorStudent, TutorStudent.id == Lesson.tutor_student_id)
        .where(
            Lesson.id == lesson_id,
            or_(
                TutorStudent.tutor_id == tutor_id,
                and_(Lesson.tutor_id == tutor_id, Lesson.tutor_student_id.is_(None)),
            ),
        )
    )
    lesson = result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Занятие не найдено")
    return lesson


async def _get_student_for_lesson(db: AsyncSession, lesson: Lesson) -> Student | None:
    tutor_student = await get_tutor_student_for_lesson(db, lesson)
    if tutor_student is None:
        return None
    return await db.get(Student, tutor_student.student_id)


def _ensure_not_past(starts_at: datetime) -> None:
    now = datetime.now(timezone.utc)
    if starts_at <= now:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Нельзя создавать слот или занятие в прошлом",
        )



async def _ensure_lesson_has_no_overlap(
    db: AsyncSession,
    tutor_id: int,
    starts_at: datetime,
    ends_at: datetime,
) -> None:
    conflict_result = await db.execute(
        select(Lesson.id)
        .join(TutorStudent, TutorStudent.id == Lesson.tutor_student_id)
        .where(
            TutorStudent.tutor_id == tutor_id,
            Lesson.conduct_status.in_(ACTIVE_BOOKING_STATUSES),
            Lesson.starts_at < ends_at,
            Lesson.ends_at > starts_at,
        )
    )
    if conflict_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Это время уже занято или забронировано",
        )


@router.get("", response_model=list[LessonOut], summary="Занятия и свободные слоты репетитора")
async def list_lessons(
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    tutor_student_id: int | None = Query(None),
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(Lesson)
        .outerjoin(TutorStudent, TutorStudent.id == Lesson.tutor_student_id)
        .where(
            or_(
                TutorStudent.tutor_id == tutor.id,
                and_(Lesson.tutor_id == tutor.id, Lesson.tutor_student_id.is_(None)),
            )
        )
    )

    if date_from:
        q = q.where(Lesson.starts_at >= date_from)
    if date_to:
        q = q.where(Lesson.starts_at < date_to + timedelta(days=1))
    if tutor_student_id:
        q = q.where(Lesson.tutor_student_id == tutor_student_id)

    q = q.order_by(Lesson.starts_at)
    result = await db.execute(q)
    return list(result.scalars().all())


@router.get("/pending-count", response_model=dict, summary="Количество ожидающих запросов")
async def pending_count(
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(func.count(Lesson.id))
        .join(TutorStudent, TutorStudent.id == Lesson.tutor_student_id)
        .where(
            TutorStudent.tutor_id == tutor.id,
            or_(
                Lesson.conduct_status.in_(
                    [ConductStatus.booking_pending, ConductStatus.reschedule_pending]
                ),
                Lesson.payment_status == PaymentStatus.payment_pending,
            ),
        )
    )
    return {"count": result.scalar_one()}


@router.post("", response_model=LessonOut, status_code=status.HTTP_201_CREATED, summary="Создать занятие или свободный слот")
async def create_lesson(
    data: LessonCreate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    _ensure_not_past(data.starts_at)

    await lock_tutor_schedule(db, tutor.id)

    ts_result = await db.execute(
        select(TutorStudent).where(
            TutorStudent.id == data.tutor_student_id,
            TutorStudent.tutor_id == tutor.id,
        )
    )
    tutor_student = ts_result.scalar_one_or_none()
    if tutor_student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Связка репетитор-ученик не найдена")

    await _ensure_lesson_has_no_overlap(db, tutor.id, data.starts_at, data.ends_at)

    lesson = Lesson(
        tutor_student_id=data.tutor_student_id,
        starts_at=data.starts_at,
        ends_at=data.ends_at,
        cost=data.cost or 0,
        topic_id=data.topic_id,
        reminder_sent=False,
    )

    db.add(lesson)
    await db.commit()
    await db.refresh(lesson)
    return lesson


@router.get("/{lesson_id}", response_model=LessonOut, summary="Детали занятия")
async def get_lesson(
    lesson_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    return await _get_lesson_for_tutor(db, lesson_id, tutor.id)


@router.patch("/{lesson_id}", response_model=LessonOut, summary="Обновить занятие")
async def update_lesson(
    lesson_id: int,
    data: LessonUpdate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson_for_tutor(db, lesson_id, tutor.id)
    payload = data.model_dump(exclude_none=True)

    next_starts_at = payload.get("starts_at", lesson.starts_at)
    next_ends_at = payload.get("ends_at", lesson.ends_at)
    if next_ends_at <= next_starts_at:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "INVALID_LESSON_TIME_RANGE",
                "message": "Время окончания должно быть позже времени начала.",
            },
        )

    tutor_student = None
    if "conduct_status" in payload:
        tutor_student = await get_tutor_student_for_lesson(db, lesson)

    for field, value in payload.items():
        if field == "conduct_status":
            apply_conduct_status_transition(lesson, tutor_student, value)
            # Ручное проведение тоже открывает решение по ДЗ (как auto_conduct).
            if lesson.conduct_status == ConductStatus.conducted and lesson.homework_status is None:
                lesson.homework_status = HomeworkStatus.pending
            continue
        setattr(lesson, field, value)

    if "starts_at" in payload or "ends_at" in payload:
        lesson.reminder_sent = False

    if "conduct_status" in payload and lesson.tutor_student_id is not None:
        await recompute_coverage(db, lesson.tutor_student_id)

    await db.commit()
    await db.refresh(lesson)

    notify_conducted = "conduct_status" in payload and lesson.conduct_status == ConductStatus.conducted
    notify_grade = "grade" in payload and lesson.grade is not None
    if notify_conducted or notify_grade:
        student = await _get_student_for_lesson(db, lesson)
        if student is not None:
            when = _format_lesson_for_user(lesson.starts_at, student.timezone)
            if notify_conducted:
                await notify_student_contacts(
                    db, student.id, f"Занятие {student.full_name} {when} проведено."
                )
            if notify_grade:
                await notify_student_contacts(
                    db,
                    student.id,
                    f"За занятие {student.full_name} {when} выставлена оценка: {lesson.grade}.",
                )
    return lesson


@router.post("/{lesson_id}/reschedule", response_model=LessonOut, summary="Перенести занятие")
async def reschedule_lesson(
    lesson_id: int,
    data: LessonReschedule,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    original = await _get_lesson_for_tutor(db, lesson_id, tutor.id)

    await lock_tutor_schedule(db, tutor.id)

    await _ensure_lesson_has_no_overlap(db, tutor.id, data.new_starts_at, data.new_ends_at)

    original.conduct_status = ConductStatus.rescheduled
    new_lesson = Lesson(
        tutor_student_id=original.tutor_student_id,
        starts_at=data.new_starts_at,
        ends_at=data.new_ends_at,
        cost=original.cost,
        topic_id=original.topic_id,
        original_lesson_id=original.id,
        reminder_sent=False,
    )
    db.add(new_lesson)
    await db.commit()
    await db.refresh(new_lesson)
    return new_lesson


@router.post("/{lesson_id}/approve-booking", response_model=LessonOut, summary="Одобрить запрос на запись")
async def approve_booking(
    lesson_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson_for_tutor(db, lesson_id, tutor.id)
    if lesson.conduct_status != ConductStatus.booking_pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Занятие не ожидает подтверждения записи")

    relation = await get_tutor_student_for_lesson(db, lesson)
    tutor_id = relation.tutor_id if relation is not None else tutor.id
    await lock_tutor_schedule(db, tutor_id)
    # Слот блокируют только подтверждённое занятие или ожидающий перенос.
    # Конкурирующие заявки (booking_pending) не мешают подтверждению — их отклоняем ниже.
    conflict = await db.execute(
        select(Lesson)
        .join(TutorStudent, TutorStudent.id == Lesson.tutor_student_id)
        .where(
            TutorStudent.tutor_id == tutor_id,
            Lesson.conduct_status.in_((ConductStatus.scheduled, ConductStatus.reschedule_pending)),
            Lesson.starts_at < lesson.ends_at,
            Lesson.ends_at > lesson.starts_at,
            Lesson.id != lesson.id,
        )
    )
    if conflict.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Этот слот уже занят другим занятием")

    lesson.conduct_status = ConductStatus.scheduled

    # Авто-отклоняем остальные заявки на пересекающееся время — слот занят.
    competitors_result = await db.execute(
        select(Lesson)
        .join(TutorStudent, TutorStudent.id == Lesson.tutor_student_id)
        .where(
            TutorStudent.tutor_id == tutor_id,
            Lesson.conduct_status == ConductStatus.booking_pending,
            Lesson.starts_at < lesson.ends_at,
            Lesson.ends_at > lesson.starts_at,
            Lesson.id != lesson.id,
        )
    )
    competitors = list(competitors_result.scalars().all())
    for competitor in competitors:
        competitor.conduct_status = ConductStatus.booking_rejected

    await db.commit()
    await db.refresh(lesson)

    student = await _get_student_for_lesson(db, lesson)
    await send_to_user(
        student.telegram_id if student else None,
        f"Репетитор подтвердил запись на {_format_lesson_for_user(lesson.starts_at, student.timezone if student else None)}",
    )

    # Уведомляем отклонённых конкурентов нейтрально — без упоминания, что слот достался другому ученику.
    for competitor in competitors:
        rejected_student = await _get_student_for_lesson(db, competitor)
        if rejected_student is None:
            continue
        when = _format_lesson_for_user(competitor.starts_at, rejected_student.timezone)
        await send_to_user(
            rejected_student.telegram_id,
            f"Запись на {when} не подтверждена — это время уже занято. "
            "Вы можете выбрать другое свободное время.",
        )

    return lesson


@router.post("/{lesson_id}/reject-booking", response_model=LessonOut, summary="Отклонить запрос на запись")
async def reject_booking(
    lesson_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson_for_tutor(db, lesson_id, tutor.id)
    if lesson.conduct_status != ConductStatus.booking_pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Занятие не ожидает подтверждения записи")

    lesson.conduct_status = ConductStatus.booking_rejected
    await db.commit()
    await db.refresh(lesson)
    student = await _get_student_for_lesson(db, lesson)
    await send_to_user(
        student.telegram_id if student else None,
        f"Репетитор отклонил запрос на запись ({_format_lesson_for_user(lesson.starts_at, student.timezone if student else None)})",
    )
    return lesson


@router.post("/{lesson_id}/approve-reschedule", response_model=LessonOut, summary="Одобрить перенос занятия")
async def approve_reschedule(
    lesson_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    new_lesson = await _get_lesson_for_tutor(db, lesson_id, tutor.id)
    if new_lesson.conduct_status != ConductStatus.reschedule_pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Занятие не ожидает переноса")

    new_lesson.conduct_status = ConductStatus.scheduled
    if new_lesson.original_lesson_id:
        original = await db.get(Lesson, new_lesson.original_lesson_id)
        if original:
            original.conduct_status = ConductStatus.rescheduled

    if new_lesson.tutor_student_id is not None:
        await recompute_coverage(db, new_lesson.tutor_student_id)

    await db.commit()
    await db.refresh(new_lesson)
    student = await _get_student_for_lesson(db, new_lesson)
    when = _format_lesson_for_user(new_lesson.starts_at, student.timezone if student else None)
    await send_to_user(
        student.telegram_id if student else None,
        f"Перенос подтверждён — новое занятие {when}",
    )
    if student is not None:
        await notify_student_contacts(
            db, student.id, f"Занятие {student.full_name} перенесено на {when}."
        )
    return new_lesson


@router.post("/{lesson_id}/reject-reschedule", response_model=LessonOut, summary="Отклонить перенос занятия")
async def reject_reschedule(
    lesson_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson_for_tutor(db, lesson_id, tutor.id)
    if lesson.conduct_status != ConductStatus.reschedule_pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Занятие не ожидает переноса")

    lesson.conduct_status = ConductStatus.reschedule_rejected
    await db.commit()
    await db.refresh(lesson)
    student = await _get_student_for_lesson(db, lesson)
    await send_to_user(
        student.telegram_id if student else None,
        f"Репетитор отклонил запрос на перенос занятия {_format_lesson_for_user(lesson.starts_at, student.timezone if student else None)}",
    )
    return lesson


@router.delete("/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Отменить занятие или удалить слот")
async def cancel_lesson(
    lesson_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson_for_tutor(db, lesson_id, tutor.id)

    if lesson.tutor_student_id is None:
        await db.delete(lesson)
        await db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    tutor_student = await get_tutor_student_for_lesson(db, lesson)
    apply_conduct_status_transition(lesson, tutor_student, ConductStatus.cancelled)

    await recompute_coverage(db, lesson.tutor_student_id)

    await db.commit()
    student = await _get_student_for_lesson(db, lesson)
    when = _format_lesson_for_user(lesson.starts_at, student.timezone if student else None)
    await send_to_user(
        student.telegram_id if student else None,
        f"Занятие {when} отменено репетитором",
    )
    if student is not None:
        await notify_student_contacts(
            db, student.id, f"Занятие {student.full_name} {when} отменено репетитором."
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{lesson_id}/confirm-payment", response_model=LessonOut, summary="Подтвердить или отклонить оплату")
async def confirm_payment(
    lesson_id: int,
    data: ConfirmPaymentRequest,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson_for_tutor(db, lesson_id, tutor.id)
    if lesson.payment_status != PaymentStatus.payment_pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Занятие не ожидает подтверждения оплаты")

    lesson.payment_status = PaymentStatus.paid if data.confirm else PaymentStatus.unpaid
    await db.commit()
    await db.refresh(lesson)
    student = await _get_student_for_lesson(db, lesson)
    student_tz = student.timezone if student else None
    when = _format_lesson_for_user(lesson.starts_at, student_tz)
    await send_to_user(
        student.telegram_id if student else None,
        (
            f"Оплата за занятие {when} подтверждена"
            if data.confirm
            else f"Репетитор не подтвердил оплату за занятие {when}"
        ),
    )
    if student is not None:
        await notify_student_contacts(
            db,
            student.id,
            (
                f"Оплата за занятие {student.full_name} {when} подтверждена."
                if data.confirm
                else f"Оплата за занятие {student.full_name} {when} не подтверждена."
            ),
        )
    return lesson
