from pydantic import BaseModel


class SubjectOut(BaseModel):
    id: int
    name: str
    tutor_id: int

    model_config = {"from_attributes": True}


class SubjectCreate(BaseModel):
    name: str


class SubjectUpdate(BaseModel):
    name: str
