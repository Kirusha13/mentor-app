from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class SubscriptionCreate(BaseModel):
    tutor_student_id: int
    hours: Decimal
    price: Decimal
    start_date: date | None = None  # дефолт — сегодня (проставляет эндпоинт)


class SubscriptionUpdate(BaseModel):
    hours: Decimal | None = None
    price: Decimal | None = None
    start_date: date | None = None


class SubscriptionOut(BaseModel):
    id: int
    tutor_student_id: int
    hours: Decimal
    price: Decimal
    start_date: date
    created_at: datetime
    model_config = {"from_attributes": True}
