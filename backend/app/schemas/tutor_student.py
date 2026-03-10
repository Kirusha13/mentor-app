from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel

from app.models.tutor_student import TutorStudentStatus


class TutorStudentOut(BaseModel):
    id: int
    status: TutorStudentStatus
    hourly_rate: Decimal
    rate_set_at: datetime
    started_at: date
    subscription_lessons: int | None
    used_lessons: int | None
    tutor_id: int
    student_id: int
    subject_id: int

    model_config = {"from_attributes": True}


class TutorStudentCreate(BaseModel):
    student_id: int
    subject_id: int
    hourly_rate: Decimal
    started_at: date
    subscription_lessons: int | None = None


class TutorStudentUpdate(BaseModel):
    status: TutorStudentStatus | None = None
    hourly_rate: Decimal | None = None
    subscription_lessons: int | None = None
    used_lessons: int | None = None
