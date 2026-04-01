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

    # Telegram bot
    TELEGRAM_BOT_TOKEN: str
    TELEGRAM_BOT_USERNAME: str  # без @, например: MentorAuthBot

    # File storage
    MEDIA_DIR: str = "media"


settings = Settings()
