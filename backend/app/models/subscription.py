from datetime import date
from decimal import Decimal

from sqlalchemy import BigInteger, Date, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin


class Subscription(TimestampMixin, Base):
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tutor_student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tutor_student.id", ondelete="CASCADE"), nullable=False
    )
    hours: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)

    tutor_student: Mapped["TutorStudent"] = relationship(back_populates="subscriptions")
