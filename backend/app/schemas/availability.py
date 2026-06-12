from datetime import date, time

from pydantic import BaseModel


class RuleCreate(BaseModel):
    weekday: int
    start_time: time
    end_time: time
    effective_from: date | None = None
    effective_until: date | None = None


class RuleOut(RuleCreate):
    id: int
    effective_from: date
    model_config = {"from_attributes": True}


class DayWindow(BaseModel):
    start_time: time
    end_time: time


class DayOverrideSave(BaseModel):
    """Полное описание дня: closed=true ИЛИ список окон. Пустой список окон при closed=false = вернуть день к правилам (удалить overrides)."""
    closed: bool = False
    windows: list[DayWindow] = []


class DayOverrideOut(BaseModel):
    date: date
    overridden: bool
    closed: bool
    windows: list[DayWindow]


class WindowOut(BaseModel):
    date: date
    start_time: time
    end_time: time


class AvailabilitySaveResult(BaseModel):
    conflicts: list[dict]  # [{lesson_id, starts_at, student_name}] — занятия вне новой доступности
    rejected_bookings: int  # сколько заявок авто-отклонено
