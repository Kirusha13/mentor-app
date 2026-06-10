from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, computed_field

from app.models.tutor_student import TutorStudentStatus

# Порог остатка часов (включительно), при котором показываем предупреждение.
SUBSCRIPTION_LOW_THRESHOLD = Decimal(1)


class TutorStudentOut(BaseModel):
    id: int
    status: TutorStudentStatus
    hourly_rate: Decimal
    rate_set_at: datetime
    started_at: date
    subscription_hours: Decimal | None
    used_hours: Decimal | None
    tutor_id: int
    student_id: int
    subject_id: int
    level_ids: list[int]
    tutor_name: str | None = None
    subject_name: str | None = None

    model_config = {"from_attributes": True}

    @computed_field
    @property
    def remaining_hours(self) -> Decimal | None:
        """Остаток часов по абонементу, либо None если абонемент не задан."""
        if self.subscription_hours is None:
            return None
        used = self.used_hours or Decimal(0)
        return max(self.subscription_hours - used, Decimal(0))

    @computed_field
    @property
    def subscription_low(self) -> bool:
        """True, если абонемент задан и остаток на исходе (<= порога)."""
        remaining = self.remaining_hours
        return remaining is not None and remaining <= SUBSCRIPTION_LOW_THRESHOLD


class TutorStudentCreate(BaseModel):
    student_id: int
    subject_id: int
    hourly_rate: Decimal
    started_at: date
    subscription_hours: Decimal | None = None


class TutorStudentUpdate(BaseModel):
    status: TutorStudentStatus | None = None
    hourly_rate: Decimal | None = None
    subscription_hours: Decimal | None = None
    used_hours: Decimal | None = None
    level_ids: list[int] | None = None
