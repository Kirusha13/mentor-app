import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, text
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.api.v1.router import api_router
from app.models.lesson import ConductStatus, Lesson
from app.models.student import Student
from app.services.subscription_service import apply_conduct_status_transition
from app.services.telegram_service import send_to_user


APP_TIMEZONE = ZoneInfo("Asia/Yekaterinburg")


async def auto_conduct_lessons():
    """Обновляет статусы прошедших занятий."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Lesson)
            .options(selectinload(Lesson.tutor_student))
            .where(
                Lesson.lesson_date < text("CURRENT_DATE"),
                Lesson.conduct_status == ConductStatus.scheduled,
                Lesson.tutor_student_id.is_not(None),
            )
        )
        for lesson in result.scalars().all():
            apply_conduct_status_transition(lesson, lesson.tutor_student, ConductStatus.conducted)
        await db.execute(text("""
            UPDATE lessons
            SET conduct_status = 'reschedule_rejected'
            WHERE lesson_date < CURRENT_DATE
              AND conduct_status = 'reschedule_pending'
        """))
        await db.execute(text("""
            UPDATE lessons
            SET conduct_status = 'booking_rejected'
            WHERE lesson_date < CURRENT_DATE
              AND conduct_status = 'booking_pending'
        """))
        await db.commit()


async def send_reminders():
    reminder_date = datetime.now(APP_TIMEZONE).date() + timedelta(days=1)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Lesson)
            .options(selectinload(Lesson.tutor_student))
            .where(
                Lesson.lesson_date == reminder_date,
                Lesson.conduct_status == ConductStatus.scheduled,
                Lesson.reminder_sent.is_(False),
                Lesson.tutor_student_id.is_not(None),
            )
        )

        for lesson in result.scalars().all():
            if lesson.tutor_student is None:
                continue

            student = await db.get(Student, lesson.tutor_student.student_id)
            await send_to_user(
                student.telegram_id if student else None,
                f"Напоминание: завтра занятие в {lesson.start_time.strftime('%H:%M')}",
            )
            lesson.reminder_sent = True

        await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await auto_conduct_lessons()
    scheduler = AsyncIOScheduler(timezone=APP_TIMEZONE)
    scheduler.add_job(auto_conduct_lessons, "cron", hour=0, minute=5)
    scheduler.add_job(send_reminders, "cron", hour=18, minute=0)
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(title=settings.APP_TITLE, debug=settings.DEBUG, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://mentor-app-kappa-nine.vercel.app",
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

os.makedirs(settings.MEDIA_DIR, exist_ok=True)
app.mount("/media", StaticFiles(directory=settings.MEDIA_DIR), name="media")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/telegram-login", response_class=HTMLResponse)
async def telegram_login_page(request: Request):
    """
    Страница с Telegram Login Widget.
    Мобильное приложение открывает её через expo-web-browser.
    После авторизации Telegram вызывает /telegram-callback с данными пользователя.
    """
    redirect = request.query_params.get("redirect", "")
    callback_url = str(request.base_url) + "telegram-callback?" + urlencode({"redirect": redirect})
    html = f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Войти через Telegram</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      min-height: 100vh; margin: 0;
      background: #f5f5f5;
    }}
    h1 {{ color: #333; margin-bottom: 32px; font-size: 24px; }}
  </style>
</head>
<body>
  <h1>Mentor</h1>
  <script
    async
    src="https://telegram.org/js/telegram-widget.js?22"
    data-telegram-login="{settings.TELEGRAM_BOT_USERNAME}"
    data-size="large"
    data-auth-url="{callback_url}"
    data-request-access="write"
  ></script>
</body>
</html>"""
    return HTMLResponse(content=html)


@app.get("/telegram-callback", response_class=HTMLResponse)
async def telegram_callback(request: Request):
    """
    Telegram вызывает этот URL после авторизации.
    Используем JS-редирект вместо HTTP 302, потому что Chrome Custom Tabs
    блокирует HTTP-редиректы на кастомные схемы (exp://, mentor://).
    """
    params = dict(request.query_params)
    redirect_base = params.pop("redirect", "mentor://auth")

    deep_link = redirect_base + "?" + urlencode(params)
    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body>
  <p>Перенаправление...</p>
  <script>window.location.replace("{deep_link}");</script>
</body>
</html>"""
    return HTMLResponse(content=html)
