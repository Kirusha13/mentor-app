from datetime import datetime

from pydantic import BaseModel


class SubjectOut(BaseModel):
    id: int
    name: str
    tutor_id: int
    invitation_token: str | None = None
    invitation_token_created_at: datetime | None = None
    default_rate: float | None = None
    color: str | None = None

    model_config = {"from_attributes": True}


class SubjectCreate(BaseModel):
    name: str
    default_rate: float
    color: str | None = None


class SubjectUpdate(BaseModel):
    name: str | None = None
    default_rate: float | None = None
    color: str | None = None