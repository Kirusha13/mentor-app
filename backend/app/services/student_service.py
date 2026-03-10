from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.student import Student
from app.schemas.student import StudentCreate


async def get_students_by_tutor(db: AsyncSession, tutor_id: int) -> list[Student]:
    """Все ученики репетитора (через tutor_student)."""
    from app.models.tutor_student import TutorStudent
    result = await db.execute(
        select(Student)
        .join(TutorStudent, TutorStudent.student_id == Student.id)
        .where(TutorStudent.tutor_id == tutor_id)
        .distinct()
    )
    return list(result.scalars().all())


async def get_student_by_id(db: AsyncSession, student_id: int) -> Student | None:
    result = await db.execute(select(Student).where(Student.id == student_id))
    return result.scalar_one_or_none()


async def get_student_by_telegram_id(db: AsyncSession, telegram_id: int) -> Student | None:
    result = await db.execute(select(Student).where(Student.telegram_id == telegram_id))
    return result.scalar_one_or_none()


async def create_student(db: AsyncSession, data: StudentCreate) -> Student:
    now = datetime.now(timezone.utc)
    student = Student(
        full_name=data.full_name,
        telegram_id=data.telegram_id,
        grade=data.grade,
        phone_number=data.phone_number,
        started_at=now,
    )
    db.add(student)
    await db.commit()
    await db.refresh(student)
    return student
