from __future__ import annotations

from datetime import date, time
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, Date, ForeignKey, Integer, SmallInteger, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.tutor_student import TutorStudent


class LessonSeries(TimestampMixin, Base):
    __tablename__ = "lesson_series"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tutor_student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tutor_student.id", ondelete="CASCADE"), nullable=False
    )
    weekday: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    tutor_student: Mapped[TutorStudent] = relationship()
