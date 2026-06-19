from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tutor
from app.core.database import get_db
from app.models.assignment import Assignment
from app.models.lesson import ConductStatus, HomeworkStatus, Lesson
from app.models.student import Student
from app.models.tutor import Tutor
from app.models.tutor_student import TutorStudent
from app.services.homework_service import compute_homework_stats

router = APIRouter()


class HomeworkQueueItem(BaseModel):
    lesson_id: int
    tutor_student_id: int
    student_name: str
    starts_at: datetime
    topic_id: int | None


class HomeworkStatsOut(BaseModel):
    total: int
    assigned: int
    skipped: int
    pending: int
    rate: float


def _assignment_exists():
    return exists().where(Assignment.lesson_id == Lesson.id)


@router.get("/queue", response_model=list[HomeworkQueueItem], summary="Занятия без решения по ДЗ")
async def homework_queue(
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Lesson.id, Lesson.tutor_student_id, Student.full_name, Lesson.starts_at, Lesson.topic_id)
        .join(TutorStudent, TutorStudent.id == Lesson.tutor_student_id)
        .join(Student, Student.id == TutorStudent.student_id)
        .where(
            TutorStudent.tutor_id == tutor.id,
            Lesson.conduct_status == ConductStatus.conducted,
            Lesson.homework_status == HomeworkStatus.pending,
            ~_assignment_exists(),
        )
        .order_by(Lesson.starts_at)
    )).all()
    return [
        HomeworkQueueItem(
            lesson_id=r[0], tutor_student_id=r[1], student_name=r[2], starts_at=r[3], topic_id=r[4]
        )
        for r in rows
    ]


@router.post("/lessons/{lesson_id}/skip", status_code=status.HTTP_204_NO_CONTENT, summary="Без ДЗ")
async def skip_homework(
    lesson_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    lesson = (await db.execute(
        select(Lesson)
        .join(TutorStudent, TutorStudent.id == Lesson.tutor_student_id)
        .where(Lesson.id == lesson_id, TutorStudent.tutor_id == tutor.id)
    )).scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Занятие не найдено")
    lesson.homework_status = HomeworkStatus.skipped
    await db.commit()


@router.get("/stats", response_model=HomeworkStatsOut, summary="Частота ДЗ за 30 дней")
async def homework_stats(
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    window_start = datetime.now(timezone.utc) - timedelta(days=30)
    rows = (await db.execute(
        select(Lesson.homework_status, _assignment_exists().label("has_assignment"))
        .join(TutorStudent, TutorStudent.id == Lesson.tutor_student_id)
        .where(
            TutorStudent.tutor_id == tutor.id,
            Lesson.conduct_status == ConductStatus.conducted,
            Lesson.homework_status.is_not(None),
            Lesson.starts_at >= window_start,
        )
    )).all()
    stats = compute_homework_stats([(r[0].value if r[0] else None, bool(r[1])) for r in rows])
    return HomeworkStatsOut(
        total=stats.total, assigned=stats.assigned, skipped=stats.skipped,
        pending=stats.pending, rate=stats.rate,
    )
