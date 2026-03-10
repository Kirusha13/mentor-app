from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.auth import TelegramAuthData, TelegramRegisterData, Token
from app.services.auth_service import telegram_login, telegram_register

router = APIRouter()


@router.post("/login", response_model=Token, summary="Вход через Telegram Login Widget")
async def login(data: TelegramAuthData, db: AsyncSession = Depends(get_db)):
    try:
        token = await telegram_login(db, data)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверная подпись Telegram")
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Репетитор не найден")
    return Token(access_token=token)


@router.post("/register", response_model=Token, summary="Регистрация по токену приглашения")
async def register(data: TelegramRegisterData, db: AsyncSession = Depends(get_db)):
    try:
        token = await telegram_register(db, data)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверная подпись Telegram")
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Токен приглашения не найден")
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Токен уже был использован")
    return Token(access_token=token)
