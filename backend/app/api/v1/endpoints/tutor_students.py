from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tutor
from app.core.database import get_db
from app.models.subject import Subject
from app.models.tutor import Tutor
from app.models.tutor_student import TutorStudent
from app.schemas.tutor_student import TutorStudentCreate, TutorStudentOut, TutorStudentUpdate
from app.services.subscription_service import SubscriptionStateError, validate_subscription_state
from app.services.student_service import get_student_by_id

router = APIRouter()


@router.get("", response_model=list[TutorStudentOut], summary="Все связки репетитор-ученик")
async def list_tutor_students(
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(TutorStudent).where(TutorStudent.tutor_id == tutor.id))
    return list(result.scalars().all())


@router.post("", response_model=TutorStudentOut, status_code=status.HTTP_201_CREATED,
             summary="Привязать ученика к репетитору")
async def create_tutor_student(
    data: TutorStudentCreate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    try:
        validate_subscription_state(data.subscription_lessons, 0)
    except SubscriptionStateError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=error.to_detail()) from error

    student = await get_student_by_id(db, data.student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ученик не найден")

    subj_result = await db.execute(
        select(Subject).where(Subject.id == data.subject_id, Subject.tutor_id == tutor.id)
    )
    if subj_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Предмет не найден")

    ts = TutorStudent(
        tutor_id=tutor.id,
        student_id=data.student_id,
        subject_id=data.subject_id,
        hourly_rate=data.hourly_rate,
        rate_set_at=datetime.now(timezone.utc),
        started_at=data.started_at,
        subscription_lessons=data.subscription_lessons,
    )
    db.add(ts)
    await db.commit()
    await db.refresh(ts)
    return ts


@router.get("/{ts_id}", response_model=TutorStudentOut, summary="Карточка связки")
async def get_tutor_student(
    ts_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TutorStudent).where(TutorStudent.id == ts_id, TutorStudent.tutor_id == tutor.id)
    )
    ts = result.scalar_one_or_none()
    if ts is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Не найдено")
    return ts


@router.patch("/{ts_id}", response_model=TutorStudentOut, summary="Обновить ставку / статус / абонемент")
async def update_tutor_student(
    ts_id: int,
    data: TutorStudentUpdate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TutorStudent).where(TutorStudent.id == ts_id, TutorStudent.tutor_id == tutor.id)
    )
    ts = result.scalar_one_or_none()
    if ts is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Не найдено")

    next_subscription_lessons = (
        data.subscription_lessons
        if data.subscription_lessons is not None
        else ts.subscription_lessons
    )
    next_used_lessons = data.used_lessons if data.used_lessons is not None else ts.used_lessons

    try:
        validate_subscription_state(next_subscription_lessons, next_used_lessons)
    except SubscriptionStateError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=error.to_detail()) from error

    if data.status is not None:
        ts.status = data.status
    if data.hourly_rate is not None:
        ts.hourly_rate = data.hourly_rate
        ts.rate_set_at = datetime.now(timezone.utc)
    if data.subscription_lessons is not None:
        ts.subscription_lessons = data.subscription_lessons
    if data.used_lessons is not None:
        ts.used_lessons = data.used_lessons

    await db.commit()
    await db.refresh(ts)
    return ts
