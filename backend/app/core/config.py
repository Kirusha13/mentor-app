from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # App
    APP_TITLE: str = "Mentor API"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str  # async: postgresql+asyncpg://...

    # JWT
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Срок жизни токена-приглашения предмета (дни). Ученик может вступить по
    # ссылке только пока она не протухла; репетитор обновляет через refresh-token.
    INVITATION_TOKEN_TTL_DAYS: int = 30

    # Telegram bot
    TELEGRAM_BOT_TOKEN: str
    TELEGRAM_BOT_USERNAME: str  # без @, например: MentorAuthBot

    # VK ID
    VK_APP_ID: int = 0
    VK_APP_SECRET: str = ""
    BACKEND_URL: str = "http://localhost:8000"  # публичный URL бэкенда (без слеша в конце)

    # File storage
    MEDIA_DIR: str = "media"


settings = Settings()
