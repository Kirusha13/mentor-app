import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Numeric, cast, extract, func, select
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, column_property, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin
from app.models.lesson import ConductStatus, Lesson


class TutorStudentStatus(str, enum.Enum):
    active = "active"
    paused = "paused"
    completed = "completed"
    pending = "pending"
    # Примечание: значение 'archived' есть в enum БД (миграция от 2026-06-10),
    # но в коде намеренно не используется — «убрать ученика» решается сменой
    # статуса на paused/completed + дефолтным показом только активных.


class TutorStudent(TimestampMixin, Base):
    __tablename__ = "tutor_student"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    status: Mapped[TutorStudentStatus] = mapped_column(
        SAEnum(TutorStudentStatus, name="tutor_student_status_enum"),
        nullable=False,
        default=TutorStudentStatus.active,
    )
    hourly_rate: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    rate_set_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    started_at: Mapped[date] = mapped_column(Date, nullable=False)
    subscription_hours: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    tutor_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tutors.id", ondelete="RESTRICT"), nullable=False)
    student_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("students.id", ondelete="RESTRICT"), nullable=False)
    subject_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=False)

    tutor: Mapped["Tutor"] = relationship(back_populates="tutor_students")
    student: Mapped["Student"] = relationship(back_populates="tutor_students")
    subject: Mapped["Subject"] = relationship(back_populates="tutor_students")
    lessons: Mapped[list["Lesson"]] = relationship(back_populates="tutor_student")
    assignments: Mapped[list["Assignment"]] = relationship(back_populates="tutor_student")
    student_levels: Mapped[list["StudentLevel"]] = relationship(
        back_populates="tutor_student",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    @property
    def level_ids(self) -> list[int]:
        return [sl.level_id for sl in self.student_levels]


# Израсходованные часы абонемента — производная величина, а не хранимое поле:
# сумма длительностей проведённых занятий этой связки. Так нет рассинхрона
# счётчика и не нужна ручная логика отката при отмене/переносе.
TutorStudent.used_hours = column_property(
    select(
        cast(
            func.coalesce(
                func.sum(extract("epoch", Lesson.ends_at - Lesson.starts_at) / 3600),
                0,
            ),
            Numeric(10, 2),
        )
    )
    .where(
        Lesson.tutor_student_id == TutorStudent.id,
        Lesson.conduct_status == ConductStatus.conducted,
    )
    .correlate_except(Lesson)
    .scalar_subquery(),
    deferred=False,
)
