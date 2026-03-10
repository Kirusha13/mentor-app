from sqlalchemy import BigInteger, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin


class TheoryTopic(TimestampMixin, Base):
    __tablename__ = "theory_topics"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    study_level: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    tutor_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tutors.id", ondelete="CASCADE"), nullable=False)
    subject_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=False)
    parent_topic_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("theory_topics.id", ondelete="SET NULL"), nullable=True
    )

    subject: Mapped["Subject"] = relationship(back_populates="theory_topics")
    parent: Mapped["TheoryTopic | None"] = relationship(
        "TheoryTopic",
        back_populates="children",
        foreign_keys="[TheoryTopic.parent_topic_id]",
        remote_side="TheoryTopic.id",
    )
    children: Mapped[list["TheoryTopic"]] = relationship(
        "TheoryTopic",
        back_populates="parent",
        foreign_keys="[TheoryTopic.parent_topic_id]",
    )
    materials: Mapped[list["Material"]] = relationship(back_populates="topic")
