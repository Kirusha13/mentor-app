from datetime import datetime

from pydantic import BaseModel


class TheoryTopicOut(BaseModel):
    id: int
    title: str
    description: str | None
    level_ids: list[int]
    tutor_id: int
    subject_id: int
    parent_topic_id: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TheoryTopicCreate(BaseModel):
    title: str
    subject_id: int
    description: str | None = None
    level_ids: list[int] = []
    parent_topic_id: int | None = None


class TheoryTopicUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    level_ids: list[int] | None = None
    parent_topic_id: int | None = None
