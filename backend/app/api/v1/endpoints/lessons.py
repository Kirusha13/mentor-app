from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tutor
from app.core.database import get_db
from app.models.lesson import ConductStatus, Lesson, PaymentStatus
from app.models.student import Student
from app.models.tutor import Tutor
from app.models.tutor_student import TutorStudent
from app.schemas.lesson import ConfirmPaymentRequest, LessonCreate, LessonOut, LessonReschedule, LessonUpdate
from app.services.subscription_service import (
    SubscriptionStateError,
    apply_conduct_status_transition,
    get_tutor_student_for_lesson,
)
from app.services.telegram_service import send_to_user

router = APIRouter()


ACTIVE_BOOKING_STATUSES = (
    ConductStatus.scheduled,
    ConductStatus.booking_pending,
    ConductStatus.reschedule_pending,
)


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


def _ensure_not_past(lesson_date: date, start_time) -> None:
    if datetime.combine(lesson_date, start_time) <= datetime.now():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Нельзя создавать слот или занятие в прошлом",
        )


async def _ensure_window_has_no_overlap(
    db: AsyncSession,
    tutor_id: int,
    lesson_date: date,
    start_time,
    end_time,
) -> None:
    window_conflict = await db.execute(
        select(Lesson.id).where(
            Lesson.tutor_id == tutor_id,
            Lesson.tutor_student_id.is_(None),
            Lesson.lesson_date == lesson_date,
            Lesson.start_time < end_time,
            Lesson.end_time > start_time,
        )
    )
    if window_conflict.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Свободный слот пересекается с другим окном",
        )

    lesson_conflict = await db.execute(
        select(Lesson.id)
        .join(TutorStudent, TutorStudent.id == Lesson.tutor_student_id)
        .where(
            TutorStudent.tutor_id == tutor_id,
            Lesson.lesson_date == lesson_date,
            Lesson.conduct_status.in_(ACTIVE_BOOKING_STATUSES),
            Lesson.start_time < end_time,
            Lesson.end_time > start_time,
        )
    )
    if lesson_conflict.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Свободный слот пересекается с уже занятым или ожидающим подтверждения временем",
        )


async def _ensure_lesson_has_no_overlap(
    db: AsyncSession,
    tutor_id: int,
    lesson_date: date,
    start_time,
    end_time,
) -> None:
    conflict_result = await db.execute(
        select(Lesson.id)
        .join(TutorStudent, TutorStudent.id == Lesson.tutor_student_id)
        .where(
            TutorStudent.tutor_id == tutor_id,
            Lesson.lesson_date == lesson_date,
            Lesson.conduct_status.in_(ACTIVE_BOOKING_STATUSES),
            Lesson.start_time < end_time,
            Lesson.end_time > start_time,
        )
    )
    if conflict_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Это время уже занято или забронировано",
        )


@router.get("", response_model=list[LessonOut], summary="Занятия и свободные слоты репетитора")
async def list_lessons(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
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
        q = q.where(Lesson.lesson_date >= date_from)
    if date_to:
        q = q.where(Lesson.lesson_date <= date_to)
    if tutor_student_id:
        q = q.where(Lesson.tutor_student_id == tutor_student_id)

    q = q.order_by(Lesson.lesson_date, Lesson.start_time)
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
    _ensure_not_past(data.lesson_date, data.start_time)

    if data.is_window or data.tutor_student_id is None:
        await _ensure_window_has_no_overlap(db, tutor.id, data.lesson_date, data.start_time, data.end_time)

        lesson = Lesson(
            tutor_id=tutor.id,
            tutor_student_id=None,
            lesson_date=data.lesson_date,
            start_time=data.start_time,
            end_time=data.end_time,
            cost=data.cost or 0,
            topic_id=data.topic_id,
            reminder_sent=False,
        )
    else:
        ts_result = await db.execute(
            select(TutorStudent).where(
                TutorStudent.id == data.tutor_student_id,
                TutorStudent.tutor_id == tutor.id,
            )
        )
        tutor_student = ts_result.scalar_one_or_none()
        if tutor_student is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Связка репетитор-ученик не найдена")

        await _ensure_lesson_has_no_overlap(db, tutor.id, data.lesson_date, data.start_time, data.end_time)

        lesson = Lesson(
            tutor_student_id=data.tutor_student_id,
            lesson_date=data.lesson_date,
            start_time=data.start_time,
            end_time=data.end_time,
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

    next_start_time = payload.get("start_time", lesson.start_time)
    next_end_time = payload.get("end_time", lesson.end_time)
    if next_end_time <= next_start_time:
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

    try:
        for field, value in payload.items():
            if field == "conduct_status":
                apply_conduct_status_transition(lesson, tutor_student, value)
                continue
            setattr(lesson, field, value)
    except SubscriptionStateError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=error.to_detail()) from error

    if "lesson_date" in payload or "start_time" in payload or "end_time" in payload:
        lesson.reminder_sent = False

    await db.commit()
    await db.refresh(lesson)
    return lesson


@router.post("/{lesson_id}/reschedule", response_model=LessonOut, summary="Перенести занятие")
async def reschedule_lesson(
    lesson_id: int,
    data: LessonReschedule,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    original = await _get_lesson_for_tutor(db, lesson_id, tutor.id)

    await _ensure_lesson_has_no_overlap(db, tutor.id, data.new_date, data.new_start_time, data.new_end_time)

    original.conduct_status = ConductStatus.rescheduled
    new_lesson = Lesson(
        tutor_student_id=original.tutor_student_id,
        lesson_date=data.new_date,
        start_time=data.new_start_time,
        end_time=data.new_end_time,
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
    conflict = await db.execute(
        select(Lesson)
        .join(TutorStudent, TutorStudent.id == Lesson.tutor_student_id)
        .where(
            TutorStudent.tutor_id == tutor_id,
            Lesson.lesson_date == lesson.lesson_date,
            Lesson.conduct_status.in_(ACTIVE_BOOKING_STATUSES),
            Lesson.start_time < lesson.end_time,
            Lesson.end_time > lesson.start_time,
            Lesson.id != lesson.id,
        )
    )
    if conflict.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Этот слот уже занят другим занятием")

    lesson.conduct_status = ConductStatus.scheduled
    await db.commit()
    await db.refresh(lesson)
    student = await _get_student_for_lesson(db, lesson)
    await send_to_user(
        student.telegram_id if student else None,
        f"Репетитор подтвердил запись на {lesson.lesson_date.strftime('%d.%m.%Y')} в {lesson.start_time.strftime('%H:%M')}",
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
        f"Репетитор отклонил запрос на запись ({lesson.lesson_date.strftime('%d.%m.%Y')} {lesson.start_time.strftime('%H:%M')})",
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

    await db.commit()
    await db.refresh(new_lesson)
    student = await _get_student_for_lesson(db, new_lesson)
    await send_to_user(
        student.telegram_id if student else None,
        f"Перенос подтверждён — новое занятие {new_lesson.lesson_date.strftime('%d.%m.%Y')} в {new_lesson.start_time.strftime('%H:%M')}",
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
        f"Репетитор отклонил запрос на перенос занятия {lesson.lesson_date.strftime('%d.%m.%Y')}",
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
    try:
        apply_conduct_status_transition(lesson, tutor_student, ConductStatus.cancelled)
    except SubscriptionStateError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=error.to_detail()) from error

    await db.commit()
    student = await _get_student_for_lesson(db, lesson)
    await send_to_user(
        student.telegram_id if student else None,
        f"Занятие {lesson.lesson_date.strftime('%d.%m.%Y')} в {lesson.start_time.strftime('%H:%M')} отменено репетитором",
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
    await send_to_user(
        student.telegram_id if student else None,
        (
            f"Оплата за занятие {lesson.lesson_date.strftime('%d.%m.%Y')} подтверждена"
            if data.confirm
            else f"Репетитор не подтвердил оплату за занятие {lesson.lesson_date.strftime('%d.%m.%Y')}"
        ),
    )
    return lesson
