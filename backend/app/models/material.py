import enum

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin


class MaterialLevel(str, enum.Enum):
    basic = "basic"
    advanced = "advanced"


class MaterialFormat(str, enum.Enum):
    text = "text"
    pdf = "pdf"
    video = "video"
    presentation = "presentation"
    image = "image"
    link = "link"


class Material(TimestampMixin, Base):
    __tablename__ = "materials"
    __table_args__ = (
        CheckConstraint(
            "(content_text IS NOT NULL AND content_url IS NULL) OR "
            "(content_text IS NULL AND content_url IS NOT NULL)",
            name="chk_material_content",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    content_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    level: Mapped[MaterialLevel] = mapped_column(
        SAEnum(MaterialLevel, name="material_level_enum"), nullable=False
    )
    format: Mapped[MaterialFormat] = mapped_column(
        SAEnum(MaterialFormat, name="material_format_enum"), nullable=False
    )
    topic_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("theory_topics.id", ondelete="RESTRICT"), nullable=False
    )
    tutor_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tutors.id", ondelete="CASCADE"), nullable=False
    )

    topic: Mapped["TheoryTopic"] = relationship(back_populates="materials")
