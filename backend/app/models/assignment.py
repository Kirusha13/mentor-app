import enum
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, SmallInteger, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin


class CompletionStatus(str, enum.Enum):
    assigned = "assigned"
    in_progress = "in_progress"
    completed = "completed"
    overdue = "overdue"


class Assignment(TimestampMixin, Base):
    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completion_status: Mapped[CompletionStatus] = mapped_column(
        SAEnum(CompletionStatus, name="completion_status_enum"),
        nullable=False,
        default=CompletionStatus.assigned,
    )
    grade: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    attachments: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    tutor_student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tutor_student.id", ondelete="RESTRICT"), nullable=False
    )
    topic_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("theory_topics.id", ondelete="SET NULL"), nullable=True
    )

    tutor_student: Mapped["TutorStudent"] = relationship(back_populates="assignments")
