from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tutor
from app.core.database import get_db
from app.models.tutor import Tutor
from app.models.tutor_level import TutorLevel
from app.schemas.tutor_level import TutorLevelCreate, TutorLevelOut, TutorLevelUpdate

router = APIRouter()


@router.get("", response_model=list[TutorLevelOut], summary="Список уровней репетитора")
async def list_levels(
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TutorLevel)
        .where(TutorLevel.tutor_id == tutor.id)
        .order_by(TutorLevel.sort_order, TutorLevel.name)
    )
    return list(result.scalars().all())


@router.post("", response_model=TutorLevelOut, status_code=status.HTTP_201_CREATED, summary="Создать уровень")
async def create_level(
    data: TutorLevelCreate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    level = TutorLevel(tutor_id=tutor.id, **data.model_dump())
    db.add(level)
    await db.commit()
    await db.refresh(level)
    return level


@router.patch("/{level_id}", response_model=TutorLevelOut, summary="Обновить уровень")
async def update_level(
    level_id: int,
    data: TutorLevelUpdate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TutorLevel).where(TutorLevel.id == level_id, TutorLevel.tutor_id == tutor.id)
    )
    level = result.scalar_one_or_none()
    if level is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Уровень не найден")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(level, field, value)
    await db.commit()
    await db.refresh(level)
    return level


@router.delete("/{level_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить уровень")
async def delete_level(
    level_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TutorLevel).where(TutorLevel.id == level_id, TutorLevel.tutor_id == tutor.id)
    )
    level = result.scalar_one_or_none()
    if level is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Уровень не найден")

    await db.delete(level)
    await db.commit()
