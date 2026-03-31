from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tutor
from app.core.database import get_db
from app.models.lesson import ConductStatus, Lesson
from app.models.tutor import Tutor
from app.models.tutor_student import TutorStudent
from app.schemas.lesson import ConfirmPaymentRequest, LessonCreate, LessonOut, LessonReschedule, LessonUpdate
from app.services.subscription_service import (
    SubscriptionStateError,
    apply_conduct_status_transition,
    get_tutor_student_for_lesson,
)

router = APIRouter()


async def _get_lesson_for_tutor(db: AsyncSession, lesson_id: int, tutor_id: int) -> Lesson:
    result = await db.execute(
        select(Lesson)
        .join(TutorStudent, TutorStudent.id == Lesson.tutor_student_id)
        .where(Lesson.id == lesson_id, TutorStudent.tutor_id == tutor_id)
    )
    lesson = result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Занятие не найдено")
    return lesson


@router.get("", response_model=list[LessonOut], summary="Занятия репетитора")
async def list_lessons(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    tutor_student_id: int | None = Query(None),
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(Lesson)
        .join(TutorStudent, TutorStudent.id == Lesson.tutor_student_id)
        .where(TutorStudent.tutor_id == tutor.id)
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


@router.post("", response_model=LessonOut, status_code=status.HTTP_201_CREATED, summary="Создать занятие")
async def create_lesson(
    data: LessonCreate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    ts_result = await db.execute(
        select(TutorStudent).where(
            TutorStudent.id == data.tutor_student_id,
            TutorStudent.tutor_id == tutor.id,
        )
    )
    if ts_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Связка репетитор-ученик не найдена")

    lesson = Lesson(
        tutor_student_id=data.tutor_student_id,
        lesson_date=data.lesson_date,
        start_time=data.start_time,
        end_time=data.end_time,
        cost=data.cost,
        topic_id=data.topic_id,
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

    original.conduct_status = ConductStatus.rescheduled

    new_lesson = Lesson(
        tutor_student_id=original.tutor_student_id,
        lesson_date=data.new_date,
        start_time=data.new_start_time,
        end_time=data.new_end_time,
        cost=original.cost,
        topic_id=original.topic_id,
        original_lesson_id=original.id,
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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Занятие не является ожидающим подтверждения")

    conflict = await db.execute(
        select(Lesson)
        .join(TutorStudent, TutorStudent.id == Lesson.tutor_student_id)
        .where(
            TutorStudent.tutor_id == tutor.id,
            Lesson.lesson_date == lesson.lesson_date,
            Lesson.conduct_status == ConductStatus.scheduled,
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
    return lesson


@router.post("/{lesson_id}/reject-booking", response_model=LessonOut, summary="Отклонить запрос на запись")
async def reject_booking(
    lesson_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson_for_tutor(db, lesson_id, tutor.id)
    if lesson.conduct_status != ConductStatus.booking_pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Занятие не является ожидающим подтверждения")
    lesson.conduct_status = ConductStatus.booking_rejected
    await db.commit()
    await db.refresh(lesson)
    return lesson


@router.post("/{lesson_id}/approve-reschedule", response_model=LessonOut, summary="Одобрить перенос занятия")
async def approve_reschedule(
    lesson_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    new_lesson = await _get_lesson_for_tutor(db, lesson_id, tutor.id)
    if new_lesson.conduct_status != ConductStatus.reschedule_pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Занятие не является ожидающим переноса")

    new_lesson.conduct_status = ConductStatus.scheduled

    if new_lesson.original_lesson_id:
        original = await db.get(Lesson, new_lesson.original_lesson_id)
        if original:
            original.conduct_status = ConductStatus.rescheduled

    await db.commit()
    await db.refresh(new_lesson)
    return new_lesson


@router.post("/{lesson_id}/reject-reschedule", response_model=LessonOut, summary="Отклонить перенос занятия")
async def reject_reschedule(
    lesson_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson_for_tutor(db, lesson_id, tutor.id)
    if lesson.conduct_status != ConductStatus.reschedule_pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Занятие не является ожидающим переноса")
    lesson.conduct_status = ConductStatus.reschedule_rejected
    await db.commit()
    await db.refresh(lesson)
    return lesson


@router.delete("/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Отменить занятие")
async def cancel_lesson(
    lesson_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson_for_tutor(db, lesson_id, tutor.id)
    tutor_student = await get_tutor_student_for_lesson(db, lesson)
    try:
        apply_conduct_status_transition(lesson, tutor_student, ConductStatus.cancelled)
    except SubscriptionStateError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=error.to_detail()) from error
    await db.commit()


@router.post("/{lesson_id}/confirm-payment", response_model=LessonOut, summary="Подтвердить или отклонить оплату")
async def confirm_payment(
    lesson_id: int,
    data: ConfirmPaymentRequest,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson_for_tutor(db, lesson_id, tutor.id)
    if lesson.payment_status != "payment_pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Занятие не ожидает подтверждения оплаты")

    lesson.payment_status = "paid" if data.confirm else "unpaid"
    await db.commit()
    await db.refresh(lesson)
    return lesson
