from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.models.student import Student
from app.models.tutor import Tutor
from app.services.student_service import get_student_by_id
from app.services.tutor_service import get_tutor_by_id

bearer = HTTPBearer()


async def get_current_tutor(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> Tutor:
    data = decode_token(credentials.credentials)
    if data is None or data["role"] != "tutor":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Невалидный токен")

    tutor = await get_tutor_by_id(db, int(data["sub"]))
    if tutor is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Репетитор не найден")
    return tutor


async def get_current_student(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> Student:
    data = decode_token(credentials.credentials)
    if data is None or data["role"] != "student":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Невалидный токен")

    student = await get_student_by_id(db, int(data["sub"]))
    if student is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Ученик не найден")
    return student
