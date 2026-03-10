import enum
from datetime import date, time

from sqlalchemy import BigInteger, CheckConstraint, Date, ForeignKey, Numeric, SmallInteger, Time
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin


class ConductStatus(str, enum.Enum):
    scheduled = "scheduled"
    conducted = "conducted"
    cancelled = "cancelled"
    rescheduled = "rescheduled"


class PaymentStatus(str, enum.Enum):
    unpaid = "unpaid"
    paid = "paid"


class Lesson(TimestampMixin, Base):
    __tablename__ = "lessons"
    __table_args__ = (
        CheckConstraint("end_time > start_time", name="chk_lesson_time"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    lesson_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    conduct_status: Mapped[ConductStatus] = mapped_column(
        SAEnum(ConductStatus, name="conduct_status_enum"),
        nullable=False,
        default=ConductStatus.scheduled,
    )
    payment_status: Mapped[PaymentStatus] = mapped_column(
        SAEnum(PaymentStatus, name="payment_status_enum"),
        nullable=False,
        default=PaymentStatus.unpaid,
    )
    cost: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    grade: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    tutor_student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tutor_student.id", ondelete="RESTRICT"), nullable=False
    )
    topic_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("theory_topics.id", ondelete="SET NULL"), nullable=True
    )
    original_lesson_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True
    )

    tutor_student: Mapped["TutorStudent"] = relationship(back_populates="lessons")
    original_lesson: Mapped["Lesson | None"] = relationship(
        "Lesson",
        foreign_keys="[Lesson.original_lesson_id]",
        remote_side="Lesson.id",
    )
