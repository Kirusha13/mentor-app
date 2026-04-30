from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tutor
from app.core.database import get_db
from app.models.material import Material
from app.models.theory_topic import TheoryTopic
from app.models.tutor import Tutor
from app.models.tutor_level import TopicLevel
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


async def _delete_topic_recursively(db: AsyncSession, topic: TheoryTopic) -> None:
    await db.execute(delete(Material).where(Material.topic_id == topic.id))
    children_result = await db.execute(select(TheoryTopic).where(TheoryTopic.parent_topic_id == topic.id))
    children = children_result.scalars().all()
    for child in children:
        await _delete_topic_recursively(db, child)
    await db.delete(topic)


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
    topic = TheoryTopic(tutor_id=tutor.id, **data.model_dump(exclude={"level_ids"}))
    db.add(topic)
    await db.flush()
    for level_id in data.level_ids:
        db.add(TopicLevel(topic_id=topic.id, level_id=level_id))
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

    update_data = data.model_dump(exclude_none=True)
    level_ids = update_data.pop("level_ids", None)

    for field, value in update_data.items():
        setattr(topic, field, value)

    if level_ids is not None:
        await db.execute(delete(TopicLevel).where(TopicLevel.topic_id == topic.id))
        for level_id in level_ids:
            db.add(TopicLevel(topic_id=topic.id, level_id=level_id))

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
    await _delete_topic_recursively(db, topic)
    await db.commit()
