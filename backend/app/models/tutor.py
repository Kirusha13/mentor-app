from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin


class Tutor(TimestampMixin, Base):
    __tablename__ = "tutors"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone_number: Mapped[str | None] = mapped_column(String(15), nullable=True)
    telegram_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, unique=True)
    vk_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, unique=True)
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_visited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Europe/Moscow")
    payment_bank_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    week_summary_sent_for: Mapped[date | None] = mapped_column(Date, nullable=True)

    subjects: Mapped[list["Subject"]] = relationship(
        back_populates="tutor",
        cascade="all, delete-orphan",
    )
    tutor_students: Mapped[list["TutorStudent"]] = relationship(back_populates="tutor")