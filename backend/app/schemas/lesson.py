from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, model_validator

from app.models.lesson import ConductStatus, PaymentStatus


class LessonOut(BaseModel):
    id: int
    lesson_date: date
    start_time: time
    end_time: time
    conduct_status: ConductStatus
    payment_status: PaymentStatus
    cost: Decimal | None
    grade: int | None
    tutor_student_id: int | None
    tutor_id: int | None = None
    topic_id: int | None
    original_lesson_id: int | None
    created_at: datetime
    tutor_name: str | None = None
    subject_name: str | None = None

    model_config = {"from_attributes": True}


class AvailableSlot(BaseModel):
    """Свободный временной промежуток в окне репетитора."""
    lesson_date: date
    start_time: time
    end_time: time
    tutor_id: int
    tutor_name: str | None = None


class RescheduleRequest(BaseModel):
    """Запрос на перенос занятия."""
    lesson_date: date
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def check_time(self):
        if self.end_time <= self.start_time:
            raise ValueError("end_time должно быть позже start_time")
        return self


class LessonCreate(BaseModel):
    tutor_student_id: int
    lesson_date: date
    start_time: time
    end_time: time
    cost: Decimal
    topic_id: int | None = None

    @model_validator(mode="after")
    def check_time(self):
        if self.end_time <= self.start_time:
            raise ValueError("end_time должно быть позже start_time")
        return self


class LessonUpdate(BaseModel):
    lesson_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None
    conduct_status: ConductStatus | None = None
    payment_status: PaymentStatus | None = None
    cost: Decimal | None = None
    grade: int | None = None
    topic_id: int | None = None


class StudentLessonCreate(BaseModel):
    """Самостоятельная запись ученика на занятие."""
    tutor_student_id: int
    lesson_date: date
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def check_time(self):
        if self.end_time <= self.start_time:
            raise ValueError("end_time должно быть позже start_time")
        return self


class LessonReschedule(BaseModel):
    """Перенос занятия — создаёт новое, помечает исходное как rescheduled."""
    new_date: date
    new_start_time: time
    new_end_time: time

    @model_validator(mode="after")
    def check_time(self):
        if self.new_end_time <= self.new_start_time:
            raise ValueError("new_end_time должно быть позже new_start_time")
        return self
