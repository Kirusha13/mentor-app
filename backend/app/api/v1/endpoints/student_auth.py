from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.auth import StudentLoginData, StudentRegisterData, Token, VKMobileAuthData, VKStudentRegisterData
from app.services.student_auth_service import student_login, student_register, student_login_vk, student_register_vk

router = APIRouter()


@router.post("/register", response_model=Token, summary="Регистрация ученика по ссылке репетитора")
async def register(data: StudentRegisterData, db: AsyncSession = Depends(get_db)):
    try:
        token = await student_register(db, data)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверная подпись Telegram")
    except LookupError as e:
        if "expired" in str(e):
            raise HTTPException(status_code=status.HTTP_410_GONE, detail="Токен приглашения устарел, попросите репетитора обновить его")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Токен приглашения не найден")
    return Token(access_token=token)


@router.post("/vk-register", response_model=Token, summary="Регистрация ученика через VK ID")
async def vk_register(data: VKStudentRegisterData, db: AsyncSession = Depends(get_db)):
    try:
        token = await student_register_vk(db, data)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверная подпись VK")
    except LookupError as e:
        if "expired" in str(e):
            raise HTTPException(status_code=status.HTTP_410_GONE, detail="Токен приглашения устарел, попросите репетитора обновить его")
        detail = "Токен приглашения не найден" if "invitation" in str(e) else "Ошибка регистрации"
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    return Token(access_token=token)


@router.post("/vk-login", response_model=Token, summary="Вход ученика через VK ID")
async def vk_login(data: VKMobileAuthData, db: AsyncSession = Depends(get_db)):
    try:
        token = await student_login_vk(db, data)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверная подпись VK")
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ученик не найден. Зарегистрируйтесь")
    return Token(access_token=token)


@router.post("/login", response_model=Token, summary="Вход ученика через Telegram")
async def login(data: StudentLoginData, db: AsyncSession = Depends(get_db)):
    try:
        token = await student_login(db, data)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверная подпись Telegram")
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ученик не найден. Зарегистрируйтесь")
    return Token(access_token=token)
