from datetime import datetime

from pydantic import BaseModel


class TutorOut(BaseModel):
    id: int
    full_name: str
    phone_number: str | None
    telegram_id: int | None
    vk_id: int | None
    registered_at: datetime
    last_visited_at: datetime | None
    avatar_url: str | None
    timezone: str
    payment_bank_name: str | None = None

    model_config = {"from_attributes": True}


class TutorUpdate(BaseModel):
    full_name: str | None = None
    phone_number: str | None = None
    avatar_url: str | None = None
    timezone: str | None = None
    payment_bank_name: str | None = None
