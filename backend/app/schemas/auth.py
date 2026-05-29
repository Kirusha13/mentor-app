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
    client_timezone: str | None = None


class TelegramRegisterData(TelegramAuthData):
    invitation_token: str
    phone_number: str


class StudentRegisterData(TelegramAuthData):
    invitation_token: str | None = None
    full_name: str
    phone_number: str
    grade: int | None = None


class StudentLoginData(TelegramAuthData):
    pass


class VKMobileAuthData(BaseModel):
    """Данные VK, подписанные бэкендом и полученные от мобильного приложения."""
    vk_id: int
    first_name: str
    last_name: str | None = None
    photo_url: str | None = None
    expires_at: str
    sign: str
    client_timezone: str | None = None


class VKStudentRegisterData(VKMobileAuthData):
    invitation_token: str | None = None
    full_name: str
    phone_number: str
    grade: int | None = None