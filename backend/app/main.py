import base64
import hashlib
import json
import os
import secrets
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.security import create_access_token
from app.core.vk_auth import (
    decode_state,
    encode_state,
    exchange_code_for_vk_user,
    generate_pkce_pair,
    sign_vk_mobile_data,
)
from app.api.v1.router import api_router
from app.models.tutor import Tutor
from app.models.lesson import ConductStatus, Lesson
from app.models.student import Student
from app.services.subscription_service import apply_conduct_status_transition
from app.services.telegram_service import send_to_user


APP_TIMEZONE = ZoneInfo("Europe/Moscow")


async def auto_conduct_lessons():
    """Обновляет статусы прошедших занятий."""
    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Lesson)
            .options(selectinload(Lesson.tutor_student))
            .where(
                Lesson.ends_at <= now,
                Lesson.conduct_status == ConductStatus.scheduled,
                Lesson.tutor_student_id.is_not(None),
            )
        )
        for lesson in result.scalars().all():
            apply_conduct_status_transition(lesson, lesson.tutor_student, ConductStatus.conducted)

        pending_reschedule = await db.execute(
            select(Lesson).where(
                Lesson.starts_at <= now,
                Lesson.conduct_status == ConductStatus.reschedule_pending,
            )
        )
        for lesson in pending_reschedule.scalars().all():
            lesson.conduct_status = ConductStatus.reschedule_rejected

        pending_booking = await db.execute(
            select(Lesson).where(
                Lesson.starts_at <= now,
                Lesson.conduct_status == ConductStatus.booking_pending,
            )
        )
        for lesson in pending_booking.scalars().all():
            lesson.conduct_status = ConductStatus.booking_rejected

        await db.commit()


async def send_reminders():
    now = datetime.now(timezone.utc)
    window_start = now + timedelta(hours=23)
    window_end = now + timedelta(hours=25)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Lesson)
            .options(selectinload(Lesson.tutor_student))
            .where(
                Lesson.starts_at >= window_start,
                Lesson.starts_at < window_end,
                Lesson.conduct_status == ConductStatus.scheduled,
                Lesson.reminder_sent.is_(False),
                Lesson.tutor_student_id.is_not(None),
            )
        )

        for lesson in result.scalars().all():
            if lesson.tutor_student is None:
                continue

            student = await db.get(Student, lesson.tutor_student.student_id)
            student_tz = ZoneInfo(student.timezone) if student and student.timezone else APP_TIMEZONE
            local_time = lesson.starts_at.astimezone(student_tz)
            if student and student.telegram_id:
                await send_to_user(
                    student.telegram_id,
                    f"Напоминание: завтра занятие в {local_time.strftime('%H:%M')}",
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



def _vk_js_redirect(url: str) -> HTMLResponse:
    safe_url = json.dumps(url)
    return HTMLResponse(
        f'<!DOCTYPE html><html><head><meta charset="UTF-8"></head>'
        f'<body><script>window.location.replace({safe_url});</script></body></html>'
    )


_ALLOWED_REDIRECT_SCHEMES = (
    "mentor://",
    "exp://",
    "https://mentor-app-kappa-nine.vercel.app/",
    "http://localhost:5173/",
    "http://127.0.0.1:5173/",
    "http://localhost:3000/",
    "http://127.0.0.1:3000/",
)


@app.get("/vk-login")
async def vk_login(request: Request):
    redirect_param = request.query_params.get("redirect", "")
    role = request.query_params.get("role", "student")

    if not any(redirect_param.startswith(s) for s in _ALLOWED_REDIRECT_SCHEMES):
        redirect_param = "https://mentor-app-kappa-nine.vercel.app/auth/callback"

    code_verifier, code_challenge = generate_pkce_pair()
    state = encode_state(redirect=redirect_param, role=role, code_verifier=code_verifier)

    params = urlencode({
        "response_type": "code",
        "client_id": settings.VK_APP_ID,
        "redirect_uri": settings.BACKEND_URL + "/vk-callback",
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "state": state,
        "scope": "",
    })
    return RedirectResponse(f"https://id.vk.com/oauth2/authorize?{params}")


@app.get("/vk-callback", response_class=HTMLResponse)
async def vk_callback(request: Request):
    code = request.query_params.get("code")
    device_id = request.query_params.get("device_id", "")
    raw_state = request.query_params.get("state", "")

    state = decode_state(raw_state)
    if not state or not code:
        return _vk_js_redirect(
            "https://mentor-app-kappa-nine.vercel.app/login?error=vk_auth_failed"
        )

    if time.time() - state.get("ts", 0) > 600:
        redirect_base = state.get(
            "redirect", "https://mentor-app-kappa-nine.vercel.app/login"
        )
        return _vk_js_redirect(redirect_base + "?error=state_expired")

    redirect_base = state.get("redirect", "")
    role = state.get("role", "student")
    code_verifier = state.get("code_verifier", "")

    if not any(redirect_base.startswith(s) for s in _ALLOWED_REDIRECT_SCHEMES):
        redirect_base = "https://mentor-app-kappa-nine.vercel.app/auth/callback"

    user = await exchange_code_for_vk_user(
        code=code,
        device_id=device_id,
        redirect_uri=settings.BACKEND_URL + "/vk-callback",
        code_verifier=code_verifier,
    )
    if not user:
        return _vk_js_redirect(redirect_base + "?error=vk_exchange_failed")

    if role == "tutor":
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Tutor).where(Tutor.vk_id == user["vk_id"]))
            tutor = result.scalar_one_or_none()
            now = datetime.now(timezone.utc)
            full_name = " ".join(
                p for p in [user["first_name"], user.get("last_name") or ""] if p
            ).strip()
            if tutor is None:
                tutor = Tutor(
                    vk_id=user["vk_id"],
                    full_name=full_name or "Без имени",
                    avatar_url=user.get("photo_url"),
                    registered_at=now,
                    last_visited_at=now,
                )
                db.add(tutor)
            else:
                tutor.last_visited_at = now
                tutor.avatar_url = user.get("photo_url") or tutor.avatar_url
            await db.commit()
            await db.refresh(tutor)
            access_token = create_access_token(subject=str(tutor.id))
        location = redirect_base + "?" + urlencode({"access_token": access_token})
    else:
        vk_payload, sign = sign_vk_mobile_data(
            vk_id=user["vk_id"],
            first_name=user["first_name"],
            last_name=user.get("last_name"),
            photo_url=user.get("photo_url"),
        )
        location = redirect_base + "?" + urlencode({**vk_payload, "sign": sign})

    return _vk_js_redirect(location)



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
    :root {{
      color-scheme: light;
      --navy: #142038;
      --muted: #69758a;
      --line: rgba(20, 32, 56, 0.1);
      --blue: #2AABEE;
      --blue-soft: #EFF9FF;
      --orange: #2AABEE;
      --surface: #ffffff;
      --bg: #f6f8fc;
    }}

    * {{
      box-sizing: border-box;
    }}

    body {{
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      overflow: hidden;
      color: var(--navy);
      background:
        radial-gradient(circle at 0% 100%, rgba(42, 171, 238, 0.22) 0 14%, transparent 15%),
        radial-gradient(circle at 100% 0%, rgba(42, 171, 238, 0.34) 0 12%, transparent 13%),
        linear-gradient(135deg, #f8fbff 0%, #f4f7fc 48%, #eef4ff 100%);
      font-family: Inter, "Manrope", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}

    body::before,
    body::after {{
      content: "";
      position: fixed;
      pointer-events: none;
      border-radius: 999px;
    }}

    body::before {{
      width: 520px;
      height: 520px;
      right: -140px;
      top: -180px;
      border: 90px solid rgba(42, 171, 238, 0.2);
    }}

    body::after {{
      width: 500px;
      height: 500px;
      left: -180px;
      bottom: -260px;
      background: radial-gradient(circle, rgba(42, 171, 238, 0.18), rgba(42, 171, 238, 0));
    }}

    .decor-line {{
      position: fixed;
      inset: 0;
      pointer-events: none;
      opacity: 0.4;
      background:
        radial-gradient(circle at 16% 34%, rgba(42, 171, 238, 0.12) 0 70px, transparent 71px),
        radial-gradient(circle at 82% 88%, rgba(42, 171, 238, 0.1) 0 86px, transparent 87px);
    }}

    .decor-line::before,
    .decor-line::after {{
      content: "";
      position: absolute;
      width: 220px;
      height: 180px;
      background-image: radial-gradient(rgba(47, 141, 244, 0.14) 2px, transparent 2px);
      background-size: 24px 24px;
    }}

    .decor-line::before {{
      left: 5%;
      bottom: 22%;
    }}

    .decor-line::after {{
      right: 8%;
      bottom: 22%;
    }}

    .auth-card {{
      position: relative;
      z-index: 1;
      width: min(540px, calc(100vw - 32px));
      padding: 42px 48px 38px;
      border-radius: 30px;
      border: 1px solid rgba(20, 32, 56, 0.08);
      background: #ffffff;
      box-shadow: 0 28px 90px rgba(20, 32, 56, 0.16);
      text-align: center;
    }}

    .logo {{
      width: 64px;
      height: 64px;
      margin: 0 auto 12px;
      position: relative;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: linear-gradient(145deg, #eef5ff, #ffffff);
      border: 1px solid rgba(47, 141, 244, 0.2);
      color: #2f7edc;
      font-size: 30px;
      font-weight: 900;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.9), 0 12px 30px rgba(47, 141, 244, 0.12);
    }}

    .logo::after {{
      content: "";
      position: absolute;
      right: 7px;
      top: 9px;
      width: 13px;
      height: 13px;
      border-radius: 50%;
      background: var(--orange);
      box-shadow: 0 0 0 4px #fff;
    }}

    .brand {{
      margin: 0 0 20px;
      color: #2d4366;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.12em;
    }}

    h1 {{
      margin: 0;
      color: var(--navy);
      font-size: clamp(30px, 4vw, 40px);
      line-height: 1.08;
      font-weight: 900;
      letter-spacing: -0.04em;
    }}

    .subtitle {{
      max-width: 390px;
      margin: 14px auto 28px;
      color: var(--muted);
      font-size: 17px;
      line-height: 1.45;
    }}

    .account-preview {{
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 14px 16px;
      margin-bottom: 14px;
      border-radius: 18px;
      border: 1px solid rgba(47, 141, 244, 0.18);
      background: linear-gradient(135deg, #f9fbff, #f2f7ff);
      text-align: left;
    }}

    .avatar {{
      width: 54px;
      height: 54px;
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      border-radius: 50%;
      color: #2f7edc;
      background: #e9f3ff;
      font-size: 24px;
      font-weight: 900;
    }}

    .account-title {{
      font-size: 17px;
      font-weight: 900;
      color: var(--navy);
    }}

    .account-label {{
      margin-top: 4px;
      color: var(--muted);
      font-size: 14px;
    }}

    .benefits {{
      margin: 0 0 20px;
      padding: 10px 18px;
      border: 1px solid var(--line);
      border-radius: 20px;
      background: #ffffff;
      text-align: left;
    }}

    .benefit {{
      display: grid;
      grid-template-columns: 46px 1fr;
      gap: 12px;
      align-items: center;
      padding: 13px 0;
    }}

    .benefit + .benefit {{
      border-top: 1px solid rgba(20, 32, 56, 0.08);
    }}

    .benefit-icon {{
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: var(--blue-soft);
      color: var(--blue);
      font-size: 20px;
      font-weight: 900;
    }}

    .benefit-title {{
      color: var(--navy);
      font-size: 15px;
      font-weight: 900;
    }}

    .benefit-text {{
      margin-top: 3px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.35;
    }}

    .telegram-widget {{
      display: grid;
      place-items: center;
      min-height: 56px;
      margin: 4px 0 18px;
    }}

    .telegram-widget iframe {{
      max-width: 100%;
    }}

    .secure {{
      display: flex;
      justify-content: center;
      gap: 10px;
      align-items: flex-start;
      color: #7a8598;
      font-size: 14px;
      line-height: 1.45;
    }}

    .hint {{
      margin: 24px 0 0;
      padding-top: 20px;
      border-top: 1px solid rgba(20, 32, 56, 0.08);
      color: #8993a5;
      font-size: 13px;
      line-height: 1.45;
    }}

    @media (max-width: 640px) {{
      body {{
        overflow: auto;
        padding: 16px;
      }}

      .auth-card {{
        padding: 30px 22px 26px;
        border-radius: 24px;
      }}

      .benefit {{
        grid-template-columns: 38px 1fr;
      }}

      .benefit-icon {{
        width: 36px;
        height: 36px;
        font-size: 17px;
      }}
    }}
  </style>
</head>
<body>
  <div class="decor-line"></div>
  <main class="auth-card" aria-label="Вход через Telegram">
    <div class="logo">M</div>
    <p class="brand">MENTOR APP</p>
    <h1>Вход через Telegram</h1>

    <section class="account-preview" aria-label="Выбранный аккаунт">
      <div class="avatar">T</div>
      <div>
        <div class="account-title">Telegram-аккаунт</div>
        <div class="account-label">Выбранный аккаунт появится в виджете Telegram</div>
      </div>
    </section>

    <section class="benefits" aria-label="Преимущества входа">
      <div class="benefit">
        <div class="benefit-icon">▣</div>
        <div>
          <div class="benefit-title">Безопасный вход</div>
          <div class="benefit-text">Ваш аккаунт защищён Telegram.</div>
        </div>
      </div>
      <div class="benefit">
        <div class="benefit-icon">⌁</div>
        <div>
          <div class="benefit-title">Без пароля</div>
          <div class="benefit-text">Вход без ввода пароля и логина.</div>
        </div>
      </div>
      <div class="benefit">
        <div class="benefit-icon">M</div>
        <div>
          <div class="benefit-title">Доступ к кабинету</div>
          <div class="benefit-text">Вы получите доступ к возможностям Mentor App.</div>
        </div>
      </div>
    </section>

    <div class="telegram-widget" aria-label="Кнопка входа через Telegram">
      <script
        async
        src="https://telegram.org/js/telegram-widget.js?22"
        data-telegram-login="{settings.TELEGRAM_BOT_USERNAME}"
        data-size="large"
        data-auth-url="{callback_url}"
        data-request-access="write"
      ></script>
    </div>

  </main>
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

    if not any(redirect_base.startswith(s) for s in _ALLOWED_REDIRECT_SCHEMES):
        redirect_base = "mentor://auth"

    deep_link = redirect_base + "?" + urlencode(params)
    # JSON-кодирование гарантирует безопасную вставку строки в JS
    safe_link = json.dumps(deep_link)
    html = f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Завершаем вход</title>
  <style>
    body {{
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at 15% 85%, rgba(255, 107, 26, 0.2), transparent 26%),
        radial-gradient(circle at 92% 8%, rgba(47, 141, 244, 0.24), transparent 24%),
        #f6f8fc;
      font-family: Inter, "Manrope", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #142038;
    }}

    .redirect-card {{
      width: min(420px, calc(100vw - 32px));
      padding: 36px;
      border-radius: 28px;
      border: 1px solid rgba(20, 32, 56, 0.08);
      background: #ffffff;
      box-shadow: 0 28px 90px rgba(20, 32, 56, 0.16);
      text-align: center;
    }}

    .logo {{
      width: 58px;
      height: 58px;
      margin: 0 auto 16px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: #eaf3ff;
      color: #2f8df4;
      font-size: 28px;
      font-weight: 900;
    }}

    h1 {{
      margin: 0 0 10px;
      font-size: 28px;
      line-height: 1.1;
      letter-spacing: -0.03em;
    }}

    p {{
      margin: 0;
      color: #69758a;
      font-size: 16px;
      line-height: 1.45;
    }}

    .loader {{
      width: 44px;
      height: 44px;
      margin: 24px auto 0;
      border-radius: 50%;
      border: 4px solid #eaf3ff;
      border-top-color: #2f8df4;
      animation: spin 0.9s linear infinite;
    }}

    @keyframes spin {{
      to {{ transform: rotate(360deg); }}
    }}
  </style>
</head>
<body>
  <main class="redirect-card">
    <div class="logo">M</div>
    <h1>Завершаем вход</h1>
    <p>Проверяем Telegram-авторизацию и открываем кабинет Mentor App.</p>
    <div class="loader" aria-hidden="true"></div>
  </main>
  <script>window.location.replace({safe_link});</script>
</body>
</html>"""
    return HTMLResponse(content=html)
