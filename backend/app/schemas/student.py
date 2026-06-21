from datetime import datetime

from pydantic import BaseModel, Field

# Верхняя граница PostgreSQL BigInteger — защищает telegram_id/vk_id от переполнения
BIGINT_MAX = 9_223_372_036_854_775_807


class StudentOut(BaseModel):
    id: int
    full_name: str
    grade: int | None
    phone_number: str | None
    telegram_id: int | None
    vk_id: int | None
    started_at: datetime
    last_visited_at: datetime | None
    avatar_url: str | None
    timezone: str

    model_config = {"from_attributes": True}


class StudentCreate(BaseModel):
    full_name: str
    telegram_id: int = Field(gt=0, le=BIGINT_MAX)
    grade: int | None = Field(default=None, ge=1, le=13)
    phone_number: str | None = Field(default=None, max_length=15)


class StudentUpdate(BaseModel):
    full_name: str | None = None
    grade: int | None = Field(default=None, ge=1, le=13)
    phone_number: str | None = Field(default=None, max_length=15)
    avatar_url: str | None = None
    timezone: str | None = None
