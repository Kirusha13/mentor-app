from datetime import datetime

from pydantic import BaseModel, model_validator

from app.models.material import MaterialFormat, MaterialLevel


class MaterialOut(BaseModel):
    id: int
    content_text: str | None
    content_url: str | None
    level: MaterialLevel
    format: MaterialFormat
    topic_id: int
    tutor_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class MaterialCreate(BaseModel):
    topic_id: int
    level: MaterialLevel
    format: MaterialFormat
    content_text: str | None = None
    content_url: str | None = None

    @model_validator(mode="after")
    def check_content(self):
        if (self.content_text is None) == (self.content_url is None):
            raise ValueError("Укажите ровно одно из: content_text или content_url")
        return self


class MaterialUpdate(BaseModel):
    level: MaterialLevel | None = None
    format: MaterialFormat | None = None
    content_text: str | None = None
    content_url: str | None = None
