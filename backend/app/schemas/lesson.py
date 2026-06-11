from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, computed_field, model_validator

from app.models.lesson import ConductStatus, PaymentStatus

# Порог остатка часов (включительно), при котором показываем предупреждение.
SUBSCRIPTION_LOW_THRESHOLD = Decimal(1)


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
    subscription_covered: bool = False

    model_config = {"from_attributes": True}


class StudentLessonOut(BaseModel):
    """Занятие для ученика."""
    id: int
    lesson_date: date
    start_time: time
    end_time: time
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
    # Покрыто ли ЭТО занятие абонементом — per-lesson флаг из lessons.subscription_covered.
    subscription_covered: bool = False
    # Баланс абонемента связки (для отображения остатка ученику).
    purchased_hours: Decimal | None = None
    used_hours: Decimal | None = None

    @computed_field
    @property
    def remaining_hours(self) -> Decimal | None:
        """Остаток часов по абонементу, либо None если пакетов нет."""
        if not self.purchased_hours:
            return None
        used = self.used_hours or Decimal(0)
        return max(self.purchased_hours - used, Decimal(0))

    @computed_field
    @property
    def subscription_low(self) -> bool:
        """True, если абонемент задан и остаток на исходе (<= порога)."""
        remaining = self.remaining_hours
        return remaining is not None and remaining <= SUBSCRIPTION_LOW_THRESHOLD


class AvailableSlot(BaseModel):
    """Свободный временной промежуток в окне репетитора."""
    lesson_date: date
    start_time: time
    end_time: time
    tutor_id: int
    tutor_name: str | None = None
    # Сколько заявок на запись уже претендуют на это время (популярность слота).
    # 0 — слот свободен и без конкуренции; >0 — заявку могут отклонить.
    pending_count: int = 0


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
    new_starts_at: datetime
    new_ends_at: datetime

    @model_validator(mode="after")
    def check_time(self):
        if self.new_ends_at <= self.new_starts_at:
            raise ValueError("new_ends_at должно быть позже new_starts_at")
        return self


class ConfirmPaymentRequest(BaseModel):
    confirm: bool
