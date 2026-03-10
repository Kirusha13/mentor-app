from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tutor
from app.core.database import get_db
from app.models.tutor import Tutor
from app.schemas.student import StudentCreate, StudentOut, StudentUpdate
from app.services.student_service import (
    create_student,
    get_student_by_id,
    get_student_by_telegram_id,
    get_students_by_tutor,
)

router = APIRouter()


@router.get("", response_model=list[StudentOut], summary="Список учеников репетитора")
async def list_students(
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    return await get_students_by_tutor(db, tutor.id)


@router.post("", response_model=StudentOut, status_code=status.HTTP_201_CREATED, summary="Добавить ученика")
async def add_student(
    data: StudentCreate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    existing = await get_student_by_telegram_id(db, data.telegram_id)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ученик с таким telegram_id уже существует")
    return await create_student(db, data)


@router.get("/{student_id}", response_model=StudentOut, summary="Карточка ученика")
async def get_student(
    student_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    student = await get_student_by_id(db, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ученик не найден")
    return student


@router.patch("/{student_id}", response_model=StudentOut, summary="Обновить данные ученика")
async def update_student(
    student_id: int,
    data: StudentUpdate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    student = await get_student_by_id(db, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ученик не найден")

    if data.full_name is not None:
        student.full_name = data.full_name
    if data.grade is not None:
        student.grade = data.grade
    if data.phone_number is not None:
        student.phone_number = data.phone_number
    if data.avatar_url is not None:
        student.avatar_url = data.avatar_url

    await db.commit()
    await db.refresh(student)
    return student
