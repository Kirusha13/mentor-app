from datetime import datetime

from pydantic import BaseModel

from app.models.assignment import CompletionStatus


class AssignmentOut(BaseModel):
    id: int
    title: str | None
    description: str
    deadline: datetime
    completion_status: CompletionStatus
    grade: int | None
    attachments: dict | None
    tutor_student_id: int
    topic_id: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AssignmentCreate(BaseModel):
    tutor_student_id: int
    description: str
    deadline: datetime
    title: str | None = None
    topic_id: int | None = None
    attachments: dict | None = None


class AssignmentUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    deadline: datetime | None = None
    completion_status: CompletionStatus | None = None
    grade: int | None = None
    attachments: dict | None = None
    topic_id: int | None = None
