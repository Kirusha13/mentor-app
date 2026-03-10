from datetime import datetime

from sqlalchemy import BigInteger, String, DateTime, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin


class Contact(TimestampMixin, Base):
    __tablename__ = "contacts"
    __table_args__ = (
        CheckConstraint(
            "phone_number IS NOT NULL OR telegram_id IS NOT NULL",
            name="chk_contact_communication",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone_number: Mapped[str | None] = mapped_column(String(15), nullable=True)
    telegram_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    student_contacts: Mapped[list["StudentContact"]] = relationship(
        back_populates="contact", cascade="all, delete-orphan"
    )
