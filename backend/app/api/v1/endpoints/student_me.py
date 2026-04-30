"""
Эндпоинты для ученика: только свои данные.
"""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import os
import uuid

import aiofiles
import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
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
from app.models.tutor_level import TutorLevel
from app.models.tutor_student import TutorStudent, TutorStudentStatus
from app.schemas.assignment import AssignmentOut, AssignmentUpdate, StudentAssignmentUpdate
from app.schemas.lesson import AvailableSlot, RescheduleRequest, StudentLessonCreate, StudentLessonNoteUpdate, StudentLessonOut
from app.schemas.material import MaterialOut
from app.schemas.student import StudentOut, StudentUpdate
from app.schemas.theory_topic import TheoryTopicOut
from app.schemas.tutor_level import TutorLevelOut
from app.schemas.tutor_student import TutorStudentOut
from app.services.telegram_service import send_to_user

router = APIRouter()


def _format_lesson_for_user(dt: datetime, user_tz: str | None) -> str:
    tz = ZoneInfo(user_tz) if user_tz else ZoneInfo("Europe/Moscow")
    local = dt.astimezone(tz)
    return local.strftime("%d.%m.%Y в %H:%M")


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


@router.post("/me/avatar", response_model=StudentOut, summary="Загрузить аватар ученика")
async def upload_avatar(
    file: UploadFile = File(...),
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    avatars_dir = os.path.join(settings.MEDIA_DIR, "avatars")
    os.makedirs(avatars_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1] or ".jpg"
    filename = f"{student.id}{ext}"
    filepath = os.path.join(avatars_dir, filename)
    async with aiofiles.open(filepath, "wb") as f:
        content = await file.read()
        await f.write(content)
    student.avatar_url = f"/media/avatars/{filename}"
    await db.commit()
    await db.refresh(student)
    return student


@router.get("/tutors", response_model=list[TutorStudentOut], summary="Мои репетиторы")
async def my_tutors(
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TutorStudent, Tutor.full_name.label("tutor_name"), Subject.name.label("subject_name"))
        .join(Tutor, Tutor.id == TutorStudent.tutor_id)
        .join(Subject, Subject.id == TutorStudent.subject_id)
        .where(TutorStudent.student_id == student.id)
    )
    rows = result.all()
    out = []
    for row in rows:
        d = TutorStudentOut.model_validate(row.TutorStudent).model_dump()
        d["tutor_name"] = row.tutor_name
        d["subject_name"] = row.subject_name
        out.append(d)
    return out


class JoinRequest(BaseModel):
    token: str


@router.post("/join", response_model=TutorStudentOut, summary="Вступить по токену приглашения")
async def join_by_token(
    data: JoinRequest,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    # Находим предмет по токену
    result = await db.execute(
        select(Subject, Tutor.full_name.label("tutor_name"))
        .join(Tutor, Tutor.id == Subject.tutor_id)
        .where(Subject.invitation_token == data.token)
    )
    row = result.first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Токен не найден")

    subject = row.Subject
    tutor_name = row.tutor_name

    # Проверяем что ученик ещё не привязан к этому предмету
    existing = await db.execute(
        select(TutorStudent).where(
            TutorStudent.student_id == student.id,
            TutorStudent.subject_id == subject.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Вы уже привязаны к этому предмету")

    ts = TutorStudent(
        tutor_id=subject.tutor_id,
        student_id=student.id,
        subject_id=subject.id,
        hourly_rate=subject.default_rate or 0,
        rate_set_at=datetime.utcnow(),
        started_at=date.today(),
    )
    db.add(ts)
    await db.commit()
    await db.refresh(ts)

    d = TutorStudentOut.model_validate(ts).model_dump()
    d["tutor_name"] = tutor_name
    d["subject_name"] = subject.name
    return d


@router.get("/lessons", response_model=list[StudentLessonOut], summary="Мои занятия")
async def my_lessons(
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
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
        q = q.where(Lesson.starts_at >= date_from)
    if date_to:
        q = q.where(Lesson.starts_at <= date_to)
    result = await db.execute(q.distinct(Lesson.id).order_by(Lesson.id, Lesson.starts_at))
    rows = result.all()
    seen = set()
    lessons = []
    for row in rows:
        if row.Lesson.id in seen:
            continue
        seen.add(row.Lesson.id)
        d = StudentLessonOut.model_validate(row.Lesson).model_dump()
        d["tutor_name"] = row.tutor_name
        d["subject_name"] = row.subject_name
        if row.Lesson.topic_id:
            topic = await db.get(TheoryTopic, row.Lesson.topic_id)
            d["topic_title"] = topic.title if topic else None
        lessons.append(d)
    return lessons


@router.patch("/lessons/{lesson_id}/note", response_model=StudentLessonOut, summary="Сохранить личную заметку к занятию")
async def update_lesson_note(
    lesson_id: int,
    data: StudentLessonNoteUpdate,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Lesson)
        .join(TutorStudent, TutorStudent.id == Lesson.tutor_student_id)
        .where(Lesson.id == lesson_id, TutorStudent.student_id == student.id)
    )
    lesson = result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Занятие не найдено")
    lesson.student_note = data.student_note
    await db.commit()
    await db.refresh(lesson)
    return lesson


@router.post("/lessons", response_model=StudentLessonOut, status_code=status.HTTP_201_CREATED, summary="Записаться на занятие")
async def book_lesson(
    data: StudentLessonCreate,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    ts_result = await db.execute(
        select(TutorStudent).where(
            TutorStudent.id == data.tutor_student_id,
            TutorStudent.student_id == student.id,
        )
    )
    ts = ts_result.scalar_one_or_none()
    if ts is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Связка не найдена")
    if ts.status != TutorStudentStatus.active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Записаться можно только по активной связи")

    if data.starts_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Нельзя записаться на время в прошлом")

    window_result = await db.execute(
        select(Lesson).where(
            Lesson.tutor_id == ts.tutor_id,
            Lesson.tutor_student_id.is_(None),
            Lesson.starts_at <= data.starts_at,
            Lesson.ends_at >= data.ends_at,
        )
    )
    if window_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Выбранный слот не существует или уже недоступен")

    conflict_result = await db.execute(
        select(Lesson)
        .join(TutorStudent, TutorStudent.id == Lesson.tutor_student_id)
        .where(
            TutorStudent.tutor_id == ts.tutor_id,
            Lesson.conduct_status.in_(("scheduled", "booking_pending", "reschedule_pending")),
            Lesson.starts_at < data.ends_at,
            Lesson.ends_at > data.starts_at,
        )
    )
    if conflict_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Этот слот уже занят")

    duration_hours = (data.ends_at - data.starts_at).total_seconds() / 3600
    cost = float(ts.hourly_rate) * duration_hours

    lesson = Lesson(
        tutor_student_id=data.tutor_student_id,
        starts_at=data.starts_at,
        ends_at=data.ends_at,
        conduct_status="booking_pending",
        payment_status="unpaid",
        cost=cost,
        reminder_sent=False,
    )
    db.add(lesson)
    await db.commit()
    await db.refresh(lesson)
    tutor = await db.get(Tutor, ts.tutor_id)
    await send_to_user(
        tutor.telegram_id if tutor else None,
        f"Ученик {student.full_name} запрашивает запись на {_format_lesson_for_user(lesson.starts_at, tutor.timezone if tutor else None)}",
    )

    d = StudentLessonOut.model_validate(lesson).model_dump()
    d["tutor_name"] = (await db.execute(select(Tutor.full_name).where(Tutor.id == ts.tutor_id))).scalar_one_or_none()
    d["subject_name"] = (await db.execute(select(Subject.name).where(Subject.id == ts.subject_id))).scalar_one_or_none()
    if lesson.topic_id:
        topic = await db.get(TheoryTopic, lesson.topic_id)
        d["topic_title"] = topic.title if topic else None
    return d

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
    assignments = list(result.scalars().all())
    out = []
    for a in assignments:
        d = AssignmentOut.model_validate(a).model_dump()
        if a.topic_id:
            topic = await db.get(TheoryTopic, a.topic_id)
            d["topic_title"] = topic.title if topic else None
        out.append(d)
    return out


@router.patch("/assignments/{assignment_id}", response_model=AssignmentOut, summary="Обновить задание ученика")
async def update_assignment(
    assignment_id: int,
    data: StudentAssignmentUpdate,
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
    if data.completion_status is not None:
        assignment.completion_status = data.completion_status
    if data.student_comment is not None:
        assignment.student_comment = data.student_comment
    await db.commit()
    await db.refresh(assignment)
    return assignment


@router.post("/assignments/{assignment_id}/upload", response_model=AssignmentOut, summary="Загрузить фото к заданию")
async def upload_assignment_photo(
    assignment_id: int,
    file: UploadFile = File(...),
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

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Только изображения")

    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "jpg"
    filename = f"{uuid.uuid4().hex}.{ext}"
    save_dir = os.path.join(settings.MEDIA_DIR, "assignments", str(assignment_id))
    os.makedirs(save_dir, exist_ok=True)
    save_path = os.path.join(save_dir, filename)

    async with aiofiles.open(save_path, "wb") as f:
        content = await file.read()
        await f.write(content)

    file_url = f"/media/assignments/{assignment_id}/{filename}"
    current_files = assignment.student_files or []
    assignment.student_files = current_files + [file_url]

    await db.commit()
    await db.refresh(assignment)
    return assignment


@router.delete("/assignments/{assignment_id}/upload", response_model=AssignmentOut, summary="Удалить фото из задания")
async def delete_assignment_photo(
    assignment_id: int,
    file_url: str,
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

    current_files = assignment.student_files or []
    assignment.student_files = [f for f in current_files if f != file_url]

    media_prefix = "/media/"
    if file_url.startswith(media_prefix):
        sub_path = file_url[len(media_prefix):]
        full_path = os.path.join(settings.MEDIA_DIR, sub_path)
        if os.path.exists(full_path):
            os.remove(full_path)

    await db.commit()
    await db.refresh(assignment)
    return assignment


@router.get("/levels", response_model=list[TutorLevelOut], summary="Уровни репетиторов ученика")
async def my_levels(
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    ts_result = await db.execute(
        select(TutorStudent.tutor_id).where(TutorStudent.student_id == student.id).distinct()
    )
    tutor_ids = [row[0] for row in ts_result.all()]
    if not tutor_ids:
        return []
    result = await db.execute(
        select(TutorLevel)
        .where(TutorLevel.tutor_id.in_(tutor_ids))
        .order_by(TutorLevel.is_favourite.desc(), TutorLevel.name)
    )
    return list(result.scalars().all())


@router.get("/topics", response_model=list[TheoryTopicOut], summary="Темы теории")
async def my_topics(
    subject_id: int | None = Query(None),
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    ts_result = await db.execute(
        select(TutorStudent.tutor_id).where(TutorStudent.student_id == student.id)
    )
    tutor_ids = list(ts_result.scalars().all())
    if not tutor_ids:
        return []

    q = select(TheoryTopic).where(TheoryTopic.tutor_id.in_(tutor_ids))
    if subject_id:
        q = q.where(TheoryTopic.subject_id == subject_id)
    result = await db.execute(q.order_by(TheoryTopic.title))
    return list(result.scalars().all())


@router.get("/windows", response_model=list[AvailableSlot], summary="Доступные окна для переноса")
async def get_available_windows(
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    import traceback
    try:
     return await _get_available_windows(student, db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=traceback.format_exc())


async def _get_available_windows(student, db):
    ts_result = await db.execute(
        select(TutorStudent.tutor_id).where(TutorStudent.student_id == student.id).distinct()
    )
    tutor_ids = [row[0] for row in ts_result.all()]
    if not tutor_ids:
        return []

    tutors_result = await db.execute(select(Tutor).where(Tutor.id.in_(tutor_ids)))
    tutors_map = {t.id: t.full_name for t in tutors_result.scalars().all()}

    windows_result = await db.execute(
        select(Lesson)
        .where(Lesson.tutor_student_id.is_(None), Lesson.tutor_id.in_(tutor_ids))
        .order_by(Lesson.starts_at)
    )
    windows = list(windows_result.scalars().all())
    if not windows:
        return []

    scheduled_result = await db.execute(
        select(Lesson)
        .join(TutorStudent, TutorStudent.id == Lesson.tutor_student_id)
        .where(
            TutorStudent.tutor_id.in_(tutor_ids),
            Lesson.conduct_status.in_(("scheduled", "booking_pending", "reschedule_pending")),
        )
    )
    scheduled = list(scheduled_result.scalars().all())

    slots: list[AvailableSlot] = []
    for window in windows:
        overlapping = sorted(
            [
                (l.starts_at, l.ends_at)
                for l in scheduled
                if l.starts_at < window.ends_at and l.ends_at > window.starts_at
            ],
            key=lambda x: x[0],
        )

        free_start = window.starts_at
        for lesson_start, lesson_end in overlapping:
            cut_start = max(lesson_start, window.starts_at)
            cut_end = min(lesson_end, window.ends_at)
            if cut_start > free_start:
                slots.append(AvailableSlot(
                    starts_at=free_start,
                    ends_at=cut_start,
                    tutor_id=window.tutor_id,
                    tutor_name=tutors_map.get(window.tutor_id),
                ))
            if cut_end > free_start:
                free_start = cut_end

        if free_start < window.ends_at:
            slots.append(AvailableSlot(
                starts_at=free_start,
                ends_at=window.ends_at,
                tutor_id=window.tutor_id,
                tutor_name=tutors_map.get(window.tutor_id),
            ))

    return slots


@router.post("/reschedule/{lesson_id}", response_model=StudentLessonOut, summary="Запрос на перенос занятия")
async def request_reschedule(
    lesson_id: int,
    data: RescheduleRequest,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    # Проверяем что занятие принадлежит ученику
    result = await db.execute(
        select(Lesson)
        .join(TutorStudent, TutorStudent.id == Lesson.tutor_student_id)
        .where(Lesson.id == lesson_id, TutorStudent.student_id == student.id)
    )
    lesson = result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Занятие не найдено")
    if lesson.conduct_status != "scheduled":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Можно переносить только запланированные занятия")

    # Проверяем что нет активного запроса на перенос
    existing = await db.execute(
        select(Lesson).where(
            Lesson.original_lesson_id == lesson_id,
            Lesson.conduct_status == "reschedule_pending",
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Запрос на перенос уже существует")

    # Создаём новое занятие со статусом reschedule_pending
    new_lesson = Lesson(
        starts_at=data.starts_at,
        ends_at=data.ends_at,
        conduct_status="reschedule_pending",
        payment_status=lesson.payment_status,
        cost=lesson.cost,
        tutor_student_id=lesson.tutor_student_id,
        topic_id=lesson.topic_id,
        original_lesson_id=lesson_id,
        reminder_sent=False,
    )
    db.add(new_lesson)
    await db.commit()
    await db.refresh(new_lesson)
    ts = await db.get(TutorStudent, lesson.tutor_student_id)
    tutor = await db.get(Tutor, ts.tutor_id) if ts else None
    tutor_tz = tutor.timezone if tutor else None
    await send_to_user(
        tutor.telegram_id if tutor else None,
        f"Ученик {student.full_name} запрашивает перенос занятия {_format_lesson_for_user(lesson.starts_at, tutor_tz)} на {_format_lesson_for_user(new_lesson.starts_at, tutor_tz)}",
    )
    return new_lesson


@router.get("/materials", response_model=list[MaterialOut], summary="Материалы")
async def my_materials(
    topic_id: int | None = Query(None),
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    ts_result = await db.execute(
        select(TutorStudent.tutor_id).where(TutorStudent.student_id == student.id)
    )
    tutor_ids = list(ts_result.scalars().all())
    if not tutor_ids:
        return []

    q = select(Material).where(Material.tutor_id.in_(tutor_ids))
    if topic_id:
        q = q.where(Material.topic_id == topic_id)
    result = await db.execute(q.order_by(Material.created_at.desc()))
    return list(result.scalars().all())


@router.post("/lessons/{lesson_id}/report-payment", response_model=StudentLessonOut, summary="Сообщить об оплате")
async def report_payment(
    lesson_id: int,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Lesson)
        .join(TutorStudent, TutorStudent.id == Lesson.tutor_student_id)
        .where(Lesson.id == lesson_id, TutorStudent.student_id == student.id)
    )
    lesson = result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Занятие не найдено")
    if lesson.conduct_status != "conducted":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Сообщить об оплате можно только для проведённых занятий")
    if lesson.payment_status != "unpaid":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Занятие уже оплачено или ожидает подтверждения")

    lesson.payment_status = "payment_pending"
    await db.commit()
    await db.refresh(lesson)
    ts = await db.get(TutorStudent, lesson.tutor_student_id)
    tutor = await db.get(Tutor, ts.tutor_id) if ts else None
    await send_to_user(
        tutor.telegram_id if tutor else None,
        f"Ученик {student.full_name} сообщил об оплате занятия {_format_lesson_for_user(lesson.starts_at, tutor.timezone if tutor else None)}",
    )

    d = StudentLessonOut.model_validate(lesson).model_dump()
    ts_result = await db.execute(
        select(TutorStudent, Tutor.full_name.label("tutor_name"), Subject.name.label("subject_name"))
        .join(Tutor, Tutor.id == TutorStudent.tutor_id)
        .join(Subject, Subject.id == TutorStudent.subject_id)
        .where(TutorStudent.id == lesson.tutor_student_id)
    )
    row = ts_result.first()
    if row:
        d["tutor_name"] = row.tutor_name
        d["subject_name"] = row.subject_name
    if lesson.topic_id:
        topic = await db.get(TheoryTopic, lesson.topic_id)
        d["topic_title"] = topic.title if topic else None
    return d
