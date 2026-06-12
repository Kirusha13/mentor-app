import enum
from datetime import date, time

from sqlalchemy import BigInteger, Date, ForeignKey, SmallInteger, Time
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin


class OverrideKind(str, enum.Enum):
    closed = "closed"
    window = "window"


class AvailabilityRule(TimestampMixin, Base):
    __tablename__ = "availability_rules"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tutor_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tutors.id", ondelete="CASCADE"), nullable=False
    )
    weekday: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 0=Пн
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_until: Mapped[date | None] = mapped_column(Date, nullable=True)


class AvailabilityOverride(TimestampMixin, Base):
    __tablename__ = "availability_overrides"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tutor_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tutors.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    kind: Mapped[OverrideKind] = mapped_column(
        SAEnum(OverrideKind, name="override_kind_enum"), nullable=False
    )
    start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
