from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.models.student_contact import RelationshipType

# Верхняя граница PostgreSQL BigInteger — защищает telegram_id от переполнения
BIGINT_MAX = 9_223_372_036_854_775_807


class ContactOut(BaseModel):
    id: int
    full_name: str
    phone_number: str | None
    telegram_id: int | None
    added_at: datetime

    model_config = {"from_attributes": True}


class ContactCreate(BaseModel):
    full_name: str
    phone_number: str | None = Field(default=None, max_length=15)
    telegram_id: int | None = Field(default=None, gt=0, le=BIGINT_MAX)

    @model_validator(mode="after")
    def check_communication(self):
        if self.phone_number is None and self.telegram_id is None:
            raise ValueError("Укажите phone_number или telegram_id")
        return self


class ContactUpdate(BaseModel):
    full_name: str | None = None
    phone_number: str | None = Field(default=None, max_length=15)
    telegram_id: int | None = Field(default=None, gt=0, le=BIGINT_MAX)


class StudentContactOut(BaseModel):
    id: int
    relationship_type: RelationshipType
    student_id: int
    contact_id: int
    contact: ContactOut

    model_config = {"from_attributes": True}


class StudentContactCreate(BaseModel):
    contact_id: int
    relationship_type: RelationshipType
