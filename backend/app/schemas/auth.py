from pydantic import BaseModel


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TelegramAuthData(BaseModel):
    """Данные от Telegram Login Widget"""
    id: int
    first_name: str
    last_name: str | None = None
    username: str | None = None
    photo_url: str | None = None
    auth_date: int
    hash: str


class TelegramRegisterData(TelegramAuthData):
    """Регистрация репетитора: Telegram-данные + токен приглашения"""
    invitation_token: str
    phone_number: str


class StudentRegisterData(TelegramAuthData):
    """Регистрация ученика: Telegram-данные + токен репетитора + данные формы"""
    invitation_token: str   # универсальный токен репетитора
    full_name: str          # введённое ФИО (предзаполнено из Telegram, уточнено в форме)
    phone_number: str


class StudentLoginData(TelegramAuthData):
    """Повторный вход ученика через Telegram"""
    pass
