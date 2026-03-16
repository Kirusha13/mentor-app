from datetime import datetime

from sqlalchemy import BigInteger, String, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin


class Tutor(TimestampMixin, Base):
    __tablename__ = "tutors"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone_number: Mapped[str] = mapped_column(String(15), nullable=False)
    telegram_id: Mapped[int] = mapped_column(BigInteger, nullable=False, unique=True)
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_visited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(255), nullable=True)

    subjects: Mapped[list["Subject"]] = relationship(back_populates="tutor", cascade="all, delete-orphan")
    tutor_students: Mapped[list["TutorStudent"]] = relationship(back_populates="tutor")
