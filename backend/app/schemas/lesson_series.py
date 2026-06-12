from datetime import date, time

from pydantic import BaseModel, Field


class SeriesCreate(BaseModel):
    tutor_student_id: int
    weekday: int = Field(ge=0, le=6)
    start_time: time
    duration_minutes: int = Field(gt=0)
    starts_on: date | None = None  # дефолт сегодня
    ends_on: date | None = None


class SeriesUpdate(BaseModel):
    weekday: int | None = Field(default=None, ge=0, le=6)
    start_time: time | None = None
    duration_minutes: int | None = Field(default=None, gt=0)
    ends_on: date | None = None
    is_active: bool | None = None


class SeriesOut(BaseModel):
    id: int
    tutor_student_id: int
    weekday: int
    start_time: time
    duration_minutes: int
    starts_on: date
    ends_on: date | None
    is_active: bool
    model_config = {"from_attributes": True}
