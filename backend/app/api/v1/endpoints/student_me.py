"""
Эндпоинты для ученика: только свои данные.
"""
from datetime import date

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from telegram import Bot
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_student
from app.core.config import settings
from app.core.database import get_db
from app.models.assignment import Assignment
from app.models.lesson import Lesson
from app.models.material import Material
from app.models.student import Student
from app.models.subject import Subject
from app.models.theory_topic import TheoryTopic
from app.models.tutor import Tutor
from app.models.tutor_student import TutorStudent
from app.schemas.assignment import AssignmentOut, AssignmentUpdate
from app.schemas.lesson import LessonOut
from app.schemas.material import MaterialOut
from app.schemas.student import StudentOut, StudentUpdate
from app.schemas.theory_topic import TheoryTopicOut

router = APIRouter()


@router.get("/me", response_model=StudentOut, summary="Профиль ученика")
async def get_me(student: Student = Depends(get_current_student)):
    return student


@router.get("/avatar", summary="Аватар ученика через Bot API")
async def get_avatar(student: Student = Depends(get_current_student)):
    try:
        async with Bot(token=settings.TELEGRAM_BOT_TOKEN) as bot:
            photos = await bot.get_user_profile_photos(user_id=student.telegram_id, limit=1)
            if not photos.photos:
                raise HTTPException(status_code=404, detail="Аватар не найден")
            # Берём наибольший размер первого фото
            file_id = photos.photos[0][-1].file_id
            tg_file = await bot.get_file(file_id)
            # file_path в PTB 21+ — полный HTTPS URL
            async with httpx.AsyncClient() as client:
                r = await client.get(tg_file.file_path, timeout=10)
            return Response(content=r.content, media_type="image/jpeg")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=404, detail="Аватар не найден")


@router.patch("/me", response_model=StudentOut, summary="Обновить профиль")
async def update_me(
    data: StudentUpdate,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(student, field, value)
    await db.commit()
    await db.refresh(student)
    return student


@router.get("/lessons", response_model=list[LessonOut], summary="Мои занятия")
async def my_lessons(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(Lesson, Tutor.full_name.label("tutor_name"), Subject.name.label("subject_name"))
        .join(TutorStudent, TutorStudent.id == Lesson.tutor_student_id)
        .join(Tutor, Tutor.id == TutorStudent.tutor_id)
        .join(Subject, Subject.id == TutorStudent.subject_id)
        .where(TutorStudent.student_id == student.id)
    )
    if date_from:
        q = q.where(Lesson.lesson_date >= date_from)
    if date_to:
        q = q.where(Lesson.lesson_date <= date_to)
    result = await db.execute(q.distinct(Lesson.id).order_by(Lesson.id, Lesson.lesson_date, Lesson.start_time))
    rows = result.all()
    seen = set()
    lessons = []
    for row in rows:
        if row.Lesson.id in seen:
            continue
        seen.add(row.Lesson.id)
        d = LessonOut.model_validate(row.Lesson).model_dump()
        d["tutor_name"] = row.tutor_name
        d["subject_name"] = row.subject_name
        lessons.append(d)
    return lessons


@router.get("/assignments", response_model=list[AssignmentOut], summary="Мои задания")
async def my_assignments(
    completion_status: str | None = Query(None),
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(Assignment)
        .join(TutorStudent, TutorStudent.id == Assignment.tutor_student_id)
        .where(TutorStudent.student_id == student.id)
    )
    if completion_status:
        q = q.where(Assignment.completion_status == completion_status)
    result = await db.execute(q.order_by(Assignment.deadline))
    return list(result.scalars().all())


@router.patch("/assignments/{assignment_id}", response_model=AssignmentOut, summary="Обновить статус задания")
async def update_assignment(
    assignment_id: int,
    data: AssignmentUpdate,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Assignment)
        .join(TutorStudent, TutorStudent.id == Assignment.tutor_student_id)
        .where(Assignment.id == assignment_id, TutorStudent.student_id == student.id)
    )
    assignment = result.scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задание не найдено")
    # Ученик может менять только статус выполнения
    if data.completion_status is not None:
        assignment.completion_status = data.completion_status
    await db.commit()
    await db.refresh(assignment)
    return assignment


@router.get("/topics", response_model=list[TheoryTopicOut], summary="Темы теории")
async def my_topics(
    subject_id: int | None = Query(None),
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    # Получаем tutor_id через связку
    ts_result = await db.execute(
        select(TutorStudent.tutor_id).where(TutorStudent.student_id == student.id).limit(1)
    )
    row = ts_result.scalar_one_or_none()
    if row is None:
        return []
    tutor_id = row

    q = select(TheoryTopic).where(TheoryTopic.tutor_id == tutor_id)
    if subject_id:
        q = q.where(TheoryTopic.subject_id == subject_id)
    result = await db.execute(q.order_by(TheoryTopic.title))
    return list(result.scalars().all())


@router.get("/materials", response_model=list[MaterialOut], summary="Материалы")
async def my_materials(
    topic_id: int | None = Query(None),
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    ts_result = await db.execute(
        select(TutorStudent.tutor_id).where(TutorStudent.student_id == student.id).limit(1)
    )
    row = ts_result.scalar_one_or_none()
    if row is None:
        return []
    tutor_id = row

    q = select(Material).where(Material.tutor_id == tutor_id)
    if topic_id:
        q = q.where(Material.topic_id == topic_id)
    result = await db.execute(q.order_by(Material.created_at.desc()))
    return list(result.scalars().all())
