from datetime import datetime

from pydantic import BaseModel


class TutorOut(BaseModel):
    id: int
    full_name: str
    phone_number: str
    telegram_id: int
    registered_at: datetime
    last_visited_at: datetime | None
    avatar_url: str | None

    model_config = {"from_attributes": True}


class TutorUpdate(BaseModel):
    full_name: str | None = None
    phone_number: str | None = None
    avatar_url: str | None = None
