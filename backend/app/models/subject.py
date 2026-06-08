from datetime import datetime

from sqlalchemy import BigInteger, DateTime, String, ForeignKey, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin


class Subject(TimestampMixin, Base):
    __tablename__ = "subjects"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    tutor_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tutors.id", ondelete="CASCADE"), nullable=False)
    invitation_token: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    invitation_token_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    default_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)

    tutor: Mapped["Tutor"] = relationship(back_populates="subjects")
    tutor_students: Mapped[list["TutorStudent"]] = relationship(back_populates="subject")
    theory_topics: Mapped[list["TheoryTopic"]] = relationship(back_populates="subject")