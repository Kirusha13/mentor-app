from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tutor
from app.core.config import settings
from app.core.database import get_db
from app.core.telegram_auth import verify_telegram_data
from app.core.vk_auth import exchange_pkce_code, get_vk_user_from_token
from app.models.tutor import Tutor
from app.schemas.tutor import TutorOut, TutorUpdate

router = APIRouter()


class VKLinkRequest(BaseModel):
    code: str
    code_verifier: str
    device_id: str


class TelegramLinkRequest(BaseModel):
    id: int
    first_name: str
    last_name: str | None = None
    username: str | None = None
    photo_url: str | None = None
    auth_date: str
    hash: str


@router.get("/me", response_model=TutorOut, summary="Профиль текущего репетитора")
async def get_me(tutor: Tutor = Depends(get_current_tutor)):
    return tutor


@router.post("/me/link-vk", response_model=TutorOut, summary="Привязать VK ID к аккаунту репетитора")
async def link_vk(
    body: VKLinkRequest,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    token_data = await exchange_pkce_code(
        code=body.code,
        code_verifier=body.code_verifier,
        device_id=body.device_id,
        redirect_uri=settings.BACKEND_URL + "/vk-callback",
        app_id=str(settings.VK_APP_ID),
        app_secret=settings.VK_APP_SECRET,
    )
    if not token_data:
        raise HTTPException(status_code=400, detail="Не удалось получить токен VK")

    user = await get_vk_user_from_token(token_data["access_token"], str(settings.VK_APP_ID))
    if not user:
        raise HTTPException(status_code=400, detail="Не удалось получить данные пользователя VK")

    result = await db.execute(select(Tutor).where(Tutor.vk_id == user["vk_id"]))
    existing = result.scalar_one_or_none()
    if existing and existing.id != tutor.id:
        raise HTTPException(status_code=409, detail="Этот VK ID уже привязан к другому аккаунту")

    tutor.vk_id = user["vk_id"]
    if not tutor.avatar_url and user.get("photo_url"):
        tutor.avatar_url = user["photo_url"]
    await db.commit()
    await db.refresh(tutor)
    return tutor


@router.post("/me/link-telegram", response_model=TutorOut, summary="Привязать Telegram к аккаунту репетитора")
async def link_telegram(
    body: TelegramLinkRequest,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    tg_dict = body.model_dump()
    if not verify_telegram_data(tg_dict):
        raise HTTPException(status_code=400, detail="Невалидные данные Telegram")

    result = await db.execute(select(Tutor).where(Tutor.telegram_id == body.id))
    existing = result.scalar_one_or_none()
    if existing and existing.id != tutor.id:
        raise HTTPException(status_code=409, detail="Этот Telegram уже привязан к другому аккаунту")

    tutor.telegram_id = body.id
    if not tutor.avatar_url and body.photo_url:
        tutor.avatar_url = body.photo_url
    await db.commit()
    await db.refresh(tutor)
    return tutor


@router.patch("/me", response_model=TutorOut, summary="Обновить профиль репетитора")
async def update_me(
    data: TutorUpdate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    if data.full_name is not None:
        tutor.full_name = data.full_name
    if data.phone_number is not None:
        tutor.phone_number = data.phone_number
    if data.avatar_url is not None:
        tutor.avatar_url = data.avatar_url
    await db.commit()
    await db.refresh(tutor)
    return tutor
