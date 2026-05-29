import os

# set env vars before any app.* import
os.environ.setdefault("SECRET_KEY", "test-secret-key-1234567890abcdef")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:x@localhost/x")
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "123:ABC")
os.environ.setdefault("TELEGRAM_BOT_USERNAME", "TestBot")
os.environ.setdefault("VK_APP_ID", "0")
os.environ.setdefault("VK_APP_SECRET", "secret")
os.environ.setdefault("BACKEND_URL", "http://localhost:8000")
