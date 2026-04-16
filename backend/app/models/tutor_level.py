from sqlalchemy import BigInteger, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin


class TutorLevel(TimestampMixin, Base):
    __tablename__ = "tutor_levels"
    __table_args__ = (UniqueConstraint("tutor_id", "name", name="uq_tutor_levels_tutor_name"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tutor_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tutors.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    topic_levels: Mapped[list["TopicLevel"]] = relationship(
        back_populates="level", cascade="all, delete-orphan"
    )
    student_levels: Mapped[list["StudentLevel"]] = relationship(
        back_populates="level", cascade="all, delete-orphan"
    )


class TopicLevel(Base):
    __tablename__ = "topic_levels"

    topic_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("theory_topics.id", ondelete="CASCADE"), primary_key=True
    )
    level_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tutor_levels.id", ondelete="CASCADE"), primary_key=True
    )

    topic: Mapped["TheoryTopic"] = relationship(back_populates="topic_levels")
    level: Mapped["TutorLevel"] = relationship(back_populates="topic_levels")


class StudentLevel(Base):
    __tablename__ = "student_levels"

    tutor_student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tutor_student.id", ondelete="CASCADE"), primary_key=True
    )
    level_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tutor_levels.id", ondelete="CASCADE"), primary_key=True
    )

    tutor_student: Mapped["TutorStudent"] = relationship(back_populates="student_levels")
    level: Mapped["TutorLevel"] = relationship(back_populates="student_levels")
