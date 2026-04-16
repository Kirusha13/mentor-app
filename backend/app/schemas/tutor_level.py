from datetime import datetime

from pydantic import BaseModel


class TutorLevelOut(BaseModel):
    id: int
    tutor_id: int
    name: str
    sort_order: int
    created_at: datetime

    model_config = {"from_attributes": True}


class TutorLevelCreate(BaseModel):
    name: str
    sort_order: int = 0


class TutorLevelUpdate(BaseModel):
    name: str | None = None
    sort_order: int | None = None
