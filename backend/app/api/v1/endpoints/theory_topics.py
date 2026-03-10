from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tutor
from app.core.database import get_db
from app.models.theory_topic import TheoryTopic
from app.models.tutor import Tutor
from app.schemas.theory_topic import TheoryTopicCreate, TheoryTopicOut, TheoryTopicUpdate

router = APIRouter()


async def _get_topic_for_tutor(db: AsyncSession, topic_id: int, tutor_id: int) -> TheoryTopic:
    result = await db.execute(
        select(TheoryTopic).where(TheoryTopic.id == topic_id, TheoryTopic.tutor_id == tutor_id)
    )
    topic = result.scalar_one_or_none()
    if topic is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Тема не найдена")
    return topic


@router.get("", response_model=list[TheoryTopicOut], summary="Список тем теории")
async def list_topics(
    subject_id: int | None = Query(None),
    parent_topic_id: int | None = Query(None),
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    q = select(TheoryTopic).where(TheoryTopic.tutor_id == tutor.id)
    if subject_id:
        q = q.where(TheoryTopic.subject_id == subject_id)
    if parent_topic_id is not None:
        q = q.where(TheoryTopic.parent_topic_id == parent_topic_id)
    result = await db.execute(q.order_by(TheoryTopic.title))
    return list(result.scalars().all())


@router.post("", response_model=TheoryTopicOut, status_code=status.HTTP_201_CREATED, summary="Создать тему")
async def create_topic(
    data: TheoryTopicCreate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    topic = TheoryTopic(tutor_id=tutor.id, **data.model_dump())
    db.add(topic)
    await db.commit()
    await db.refresh(topic)
    return topic


@router.get("/{topic_id}", response_model=TheoryTopicOut, summary="Детали темы")
async def get_topic(
    topic_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    return await _get_topic_for_tutor(db, topic_id, tutor.id)


@router.patch("/{topic_id}", response_model=TheoryTopicOut, summary="Обновить тему")
async def update_topic(
    topic_id: int,
    data: TheoryTopicUpdate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    topic = await _get_topic_for_tutor(db, topic_id, tutor.id)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(topic, field, value)
    await db.commit()
    await db.refresh(topic)
    return topic


@router.delete("/{topic_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить тему")
async def delete_topic(
    topic_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    topic = await _get_topic_for_tutor(db, topic_id, tutor.id)
    await db.delete(topic)
    await db.commit()
