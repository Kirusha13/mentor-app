from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tutor
from app.core.database import get_db
from app.models.tutor import Tutor
from app.schemas.tutor import TutorOut, TutorUpdate

router = APIRouter()


@router.get("/me", response_model=TutorOut, summary="Профиль текущего репетитора")
async def get_me(tutor: Tutor = Depends(get_current_tutor)):
    return tutor


@router.patch("/me", response_model=TutorOut, summary="Обновить профиль репетитора")
async def update_me(
    data: TutorUpdate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    if data.full_name is not None:
        tutor.full_name = data.full_name
    if data.phone_number is not None:
        tutor.phone_number = data.phone_number
    if data.avatar_url is not None:
        tutor.avatar_url = data.avatar_url
    await db.commit()
    await db.refresh(tutor)
    return tutor
