import enum

from sqlalchemy import BigInteger, ForeignKey, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class RelationshipType(str, enum.Enum):
    parent = "parent"
    guardian = "guardian"
    other = "other"


class StudentContact(Base):
    __tablename__ = "student_contact"
    __table_args__ = (UniqueConstraint("student_id", "contact_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    relationship_type: Mapped[RelationshipType] = mapped_column(
        SAEnum(RelationshipType, name="relationship_type_enum"), nullable=False
    )
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    contact_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False
    )

    student: Mapped["Student"] = relationship(back_populates="student_contacts")
    contact: Mapped["Contact"] = relationship(back_populates="student_contacts")
