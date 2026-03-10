from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tutor
from app.core.database import get_db
from app.models.subject import Subject
from app.models.tutor import Tutor
from app.schemas.subject import SubjectCreate, SubjectOut, SubjectUpdate

router = APIRouter()


@router.get("", response_model=list[SubjectOut], summary="Список предметов репетитора")
async def list_subjects(
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Subject).where(Subject.tutor_id == tutor.id))
    return list(result.scalars().all())


@router.post("", response_model=SubjectOut, status_code=status.HTTP_201_CREATED, summary="Создать предмет")
async def create_subject(
    data: SubjectCreate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    subject = Subject(name=data.name, tutor_id=tutor.id)
    db.add(subject)
    await db.commit()
    await db.refresh(subject)
    return subject


@router.patch("/{subject_id}", response_model=SubjectOut, summary="Переименовать предмет")
async def update_subject(
    subject_id: int,
    data: SubjectUpdate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Subject).where(Subject.id == subject_id, Subject.tutor_id == tutor.id)
    )
    subject = result.scalar_one_or_none()
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Предмет не найден")
    subject.name = data.name
    await db.commit()
    await db.refresh(subject)
    return subject


@router.delete("/{subject_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить предмет")
async def delete_subject(
    subject_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Subject).where(Subject.id == subject_id, Subject.tutor_id == tutor.id)
    )
    subject = result.scalar_one_or_none()
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Предмет не найден")
    await db.delete(subject)
    await db.commit()
