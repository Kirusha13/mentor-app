from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tutor
from app.core.database import get_db
from app.models.lesson import ConductStatus, Lesson
from app.models.tutor import Tutor
from app.models.tutor_student import TutorStudent
from app.schemas.lesson import LessonCreate, LessonOut, LessonReschedule, LessonUpdate

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

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(lesson, field, value)

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


@router.delete("/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Отменить занятие")
async def cancel_lesson(
    lesson_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson_for_tutor(db, lesson_id, tutor.id)
    lesson.conduct_status = ConductStatus.cancelled
    await db.commit()
