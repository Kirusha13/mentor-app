from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.core.telegram_auth import verify_telegram_data
from app.models.student import Student
from app.schemas.auth import StudentLoginData, StudentRegisterData
from app.services.student_service import get_student_by_telegram_id
from app.services.tutor_service import get_tutor_by_invitation_token


async def student_register(db: AsyncSession, data: StudentRegisterData) -> str:
    tg_dict = data.model_dump(exclude={"invitation_token", "full_name", "phone_number"})
    if not verify_telegram_data(tg_dict):
        raise ValueError("invalid_telegram_hash")

    tutor = await get_tutor_by_invitation_token(db, data.invitation_token)
    if tutor is None:
        raise LookupError("invalid_invitation_token")

    # Если ученик с таким telegram_id уже есть — просто выдаём ему токен
    existing = await get_student_by_telegram_id(db, data.id)
    if existing:
        existing.last_visited_at = datetime.now(timezone.utc)
        await db.commit()
        return create_access_token(existing.id, role="student")

    now = datetime.now(timezone.utc)
    student = Student(
        full_name=data.full_name,
        telegram_id=data.id,
        phone_number=data.phone_number,
        avatar_url=data.photo_url,
        started_at=now,
        last_visited_at=now,
    )
    db.add(student)
    await db.commit()
    await db.refresh(student)
    return create_access_token(student.id, role="student")


async def student_login(db: AsyncSession, data: StudentLoginData) -> str:
    if not verify_telegram_data(data.model_dump()):
        raise ValueError("invalid_telegram_hash")

    student = await get_student_by_telegram_id(db, data.id)
    if student is None:
        raise LookupError("student_not_found")

    student.last_visited_at = datetime.now(timezone.utc)
    await db.commit()
    return create_access_token(student.id, role="student")
