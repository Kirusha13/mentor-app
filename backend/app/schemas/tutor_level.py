from datetime import datetime

from pydantic import BaseModel


class TutorLevelOut(BaseModel):
    id: int
    tutor_id: int
    name: str
    is_favourite: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TutorLevelCreate(BaseModel):
    name: str
    is_favourite: bool = False


class TutorLevelUpdate(BaseModel):
    name: str | None = None
    is_favourite: bool | None = None
