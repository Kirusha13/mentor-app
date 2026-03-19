from pydantic import BaseModel


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TelegramAuthData(BaseModel):
    id: int
    first_name: str
    last_name: str | None = None
    username: str | None = None
    photo_url: str | None = None
    auth_date: int
    hash: str


class TelegramRegisterData(TelegramAuthData):
    invitation_token: str
    phone_number: str


class StudentRegisterData(TelegramAuthData):
    invitation_token: str
    full_name: str
    phone_number: str


class StudentLoginData(TelegramAuthData):
    pass