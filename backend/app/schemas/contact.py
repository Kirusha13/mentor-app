from datetime import datetime

from pydantic import BaseModel, model_validator

from app.models.student_contact import RelationshipType


class ContactOut(BaseModel):
    id: int
    full_name: str
    phone_number: str | None
    telegram_id: int | None
    added_at: datetime

    model_config = {"from_attributes": True}


class ContactCreate(BaseModel):
    full_name: str
    phone_number: str | None = None
    telegram_id: int | None = None

    @model_validator(mode="after")
    def check_communication(self):
        if self.phone_number is None and self.telegram_id is None:
            raise ValueError("Укажите phone_number или telegram_id")
        return self


class ContactUpdate(BaseModel):
    full_name: str | None = None
    phone_number: str | None = None
    telegram_id: int | None = None


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
