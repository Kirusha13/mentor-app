from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.core.telegram_auth import verify_telegram_data
from app.models.student import Student
from app.models.subject import Subject
from app.models.tutor_student import TutorStudent
from app.schemas.auth import StudentLoginData, StudentRegisterData
from app.services.student_service import get_student_by_telegram_id


async def student_register(db: AsyncSession, data: StudentRegisterData) -> str:
    tg_dict = data.model_dump(exclude={"invitation_token", "full_name", "phone_number", "client_timezone"})
    if not verify_telegram_data(tg_dict):
        raise ValueError("invalid_telegram_hash")

    subject_result = await db.execute(
        select(Subject).where(Subject.invitation_token == data.invitation_token)
    )
    subject = subject_result.scalar_one_or_none()
    if subject is None:
        raise LookupError("invalid_invitation_token")

    existing_student = await get_student_by_telegram_id(db, data.id)
    if existing_student:
        existing_student.last_visited_at = datetime.now(timezone.utc)
        if data.client_timezone:
            existing_student.timezone = data.client_timezone
        student = existing_student
    else:
        now = datetime.now(timezone.utc)
        student = Student(
            full_name=data.full_name,
            telegram_id=data.id,
            phone_number=data.phone_number,
            avatar_url=data.photo_url,
            started_at=now,
            last_visited_at=now,
            timezone=data.client_timezone or "Europe/Moscow",
        )
        db.add(student)
        await db.flush()

    existing_relation_result = await db.execute(
        select(TutorStudent).where(
            TutorStudent.student_id == student.id,
            TutorStudent.tutor_id == subject.tutor_id,
            TutorStudent.subject_id == subject.id,
        )
    )
    existing_relation = existing_relation_result.scalar_one_or_none()

    if existing_relation is None:
        db.add(
            TutorStudent(
                tutor_id=subject.tutor_id,
                student_id=student.id,
                subject_id=subject.id,
                hourly_rate=subject.default_rate or 0,
                rate_set_at=datetime.now(timezone.utc),
                started_at=datetime.now(timezone.utc).date(),
            )
        )

    await db.commit()
    await db.refresh(student)
    return create_access_token(student.id, role="student")


async def student_login(db: AsyncSession, data: StudentLoginData) -> str:
    tg_dict = data.model_dump(exclude={"client_timezone"})
    if not verify_telegram_data(tg_dict):
        raise ValueError("invalid_telegram_hash")

    student = await get_student_by_telegram_id(db, data.id)
    if student is None:
        raise LookupError("student_not_found")

    student.last_visited_at = datetime.now(timezone.utc)
    if data.client_timezone:
        student.timezone = data.client_timezone
    await db.commit()
    return create_access_token(student.id, role="student")
