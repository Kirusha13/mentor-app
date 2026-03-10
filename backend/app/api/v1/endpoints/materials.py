from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tutor
from app.core.database import get_db
from app.models.material import Material, MaterialFormat, MaterialLevel
from app.models.theory_topic import TheoryTopic
from app.models.tutor import Tutor
from app.schemas.material import MaterialCreate, MaterialOut, MaterialUpdate

router = APIRouter()


async def _get_material_for_tutor(db: AsyncSession, material_id: int, tutor_id: int) -> Material:
    result = await db.execute(
        select(Material).where(Material.id == material_id, Material.tutor_id == tutor_id)
    )
    material = result.scalar_one_or_none()
    if material is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Материал не найден")
    return material


@router.get("", response_model=list[MaterialOut], summary="Список материалов")
async def list_materials(
    topic_id: int | None = Query(None),
    level: MaterialLevel | None = Query(None),
    format: MaterialFormat | None = Query(None),
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    q = select(Material).where(Material.tutor_id == tutor.id)
    if topic_id:
        q = q.where(Material.topic_id == topic_id)
    if level:
        q = q.where(Material.level == level)
    if format:
        q = q.where(Material.format == format)
    result = await db.execute(q.order_by(Material.created_at.desc()))
    return list(result.scalars().all())


@router.post("", response_model=MaterialOut, status_code=status.HTTP_201_CREATED, summary="Добавить материал")
async def create_material(
    data: MaterialCreate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    topic_result = await db.execute(
        select(TheoryTopic).where(TheoryTopic.id == data.topic_id, TheoryTopic.tutor_id == tutor.id)
    )
    if topic_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Тема не найдена")

    material = Material(tutor_id=tutor.id, **data.model_dump())
    db.add(material)
    await db.commit()
    await db.refresh(material)
    return material


@router.get("/{material_id}", response_model=MaterialOut, summary="Детали материала")
async def get_material(
    material_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    return await _get_material_for_tutor(db, material_id, tutor.id)


@router.patch("/{material_id}", response_model=MaterialOut, summary="Обновить материал")
async def update_material(
    material_id: int,
    data: MaterialUpdate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    material = await _get_material_for_tutor(db, material_id, tutor.id)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(material, field, value)
    await db.commit()
    await db.refresh(material)
    return material


@router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить материал")
async def delete_material(
    material_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    material = await _get_material_for_tutor(db, material_id, tutor.id)
    await db.delete(material)
    await db.commit()
