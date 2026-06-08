from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, model_validator

from app.models.lesson import ConductStatus, PaymentStatus


class LessonOut(BaseModel):
    """Занятие для репетитора — включает tutor_note и grade_comment, не включает student_note."""
    id: int
    starts_at: datetime
    ends_at: datetime
    conduct_status: ConductStatus
    payment_status: PaymentStatus
    cost: Decimal | None
    grade: int | None
    tutor_note: str | None = None
    grade_comment: str | None = None
    tutor_student_id: int | None
    tutor_id: int | None = None
    topic_id: int | None
    original_lesson_id: int | None
    created_at: datetime
    tutor_name: str | None = None
    subject_name: str | None = None
    topic_title: str | None = None

    model_config = {"from_attributes": True}


class StudentLessonOut(BaseModel):
    """Занятие для ученика — включает grade_comment и student_note, не включает tutor_note."""
    id: int
    starts_at: datetime
    ends_at: datetime
    conduct_status: ConductStatus
    payment_status: PaymentStatus
    cost: Decimal | None
    grade: int | None
    grade_comment: str | None = None
    student_note: str | None = None
    tutor_student_id: int | None
    topic_id: int | None
    original_lesson_id: int | None
    created_at: datetime
    tutor_name: str | None = None
    subject_name: str | None = None
    topic_title: str | None = None
    tutor_phone: str | None = None
    tutor_payment_bank_name: str | None = None

    model_config = {"from_attributes": True}


class AvailableSlot(BaseModel):
    """Свободный временной промежуток в окне репетитора."""
    starts_at: datetime
    ends_at: datetime
    tutor_id: int
    tutor_name: str | None = None


class RescheduleRequest(BaseModel):
    """Запрос на перенос занятия."""
    starts_at: datetime
    ends_at: datetime

    @model_validator(mode="after")
    def check_time(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at должно быть позже starts_at")
        return self


class LessonCreate(BaseModel):
    tutor_student_id: int | None = None
    starts_at: datetime
    ends_at: datetime
    cost: Decimal | None = None
    is_window: bool = False
    topic_id: int | None = None

    @model_validator(mode="after")
    def check_time(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at должно быть позже starts_at")
        return self


class LessonUpdate(BaseModel):
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    conduct_status: ConductStatus | None = None
    payment_status: PaymentStatus | None = None
    cost: Decimal | None = None
    grade: int | None = None
    tutor_note: str | None = None
    grade_comment: str | None = None
    topic_id: int | None = None


class StudentLessonNoteUpdate(BaseModel):
    """Обновление личной заметки ученика к занятию."""
    student_note: str | None = None


class StudentLessonCreate(BaseModel):
    """Самостоятельная запись ученика на занятие."""
    tutor_student_id: int
    starts_at: datetime
    ends_at: datetime

    @model_validator(mode="after")
    def check_time(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at должно быть позже starts_at")
        return self


class LessonReschedule(BaseModel):
    """Перенос занятия — создаёт новое, помечает исходное как rescheduled."""
    new_starts_at: datetime
    new_ends_at: datetime

    @model_validator(mode="after")
    def check_time(self):
        if self.new_ends_at <= self.new_starts_at:
            raise ValueError("new_ends_at должно быть позже new_starts_at")
        return self


class ConfirmPaymentRequest(BaseModel):
    confirm: bool
