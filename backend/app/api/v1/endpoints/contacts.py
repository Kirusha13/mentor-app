from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_tutor
from app.core.database import get_db
from app.models.contact import Contact
from app.models.student_contact import StudentContact
from app.models.tutor import Tutor
from app.models.tutor_student import TutorStudent
from app.schemas.contact import ContactCreate, ContactOut, ContactUpdate, StudentContactCreate, StudentContactOut

router = APIRouter()


async def _tutor_owns_student(db: AsyncSession, student_id: int, tutor_id: int) -> bool:
    result = await db.execute(
        select(TutorStudent).where(
            TutorStudent.student_id == student_id,
            TutorStudent.tutor_id == tutor_id,
        )
    )
    return result.scalar_one_or_none() is not None


# --- Справочник контактных лиц ---

@router.post("", response_model=ContactOut, status_code=status.HTTP_201_CREATED, summary="Создать контактное лицо")
async def create_contact(
    data: ContactCreate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    contact = Contact(
        full_name=data.full_name,
        phone_number=data.phone_number,
        telegram_id=data.telegram_id,
        added_at=datetime.now(timezone.utc),
    )
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    return contact


@router.patch("/{contact_id}", response_model=ContactOut, summary="Обновить контактное лицо")
async def update_contact(
    contact_id: int,
    data: ContactUpdate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Contact).where(Contact.id == contact_id))
    contact = result.scalar_one_or_none()
    if contact is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Контакт не найден")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(contact, field, value)
    await db.commit()
    await db.refresh(contact)
    return contact


# --- Контактные лица ученика ---

@router.get("/student/{student_id}", response_model=list[StudentContactOut],
            summary="Контактные лица ученика")
async def list_student_contacts(
    student_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    if not await _tutor_owns_student(db, student_id, tutor.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому ученику")

    result = await db.execute(
        select(StudentContact)
        .where(StudentContact.student_id == student_id)
        .options(selectinload(StudentContact.contact))
    )
    return list(result.scalars().all())


@router.post("/student/{student_id}", response_model=StudentContactOut, status_code=status.HTTP_201_CREATED,
             summary="Привязать контактное лицо к ученику")
async def add_student_contact(
    student_id: int,
    data: StudentContactCreate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    if not await _tutor_owns_student(db, student_id, tutor.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому ученику")

    contact_result = await db.execute(select(Contact).where(Contact.id == data.contact_id))
    if contact_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Контакт не найден")

    sc = StudentContact(
        student_id=student_id,
        contact_id=data.contact_id,
        relationship_type=data.relationship_type,
    )
    db.add(sc)
    await db.commit()

    result = await db.execute(
        select(StudentContact)
        .where(StudentContact.id == sc.id)
        .options(selectinload(StudentContact.contact))
    )
    return result.scalar_one()


@router.delete("/student/{student_id}/{sc_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Отвязать контактное лицо")
async def remove_student_contact(
    student_id: int,
    sc_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    if not await _tutor_owns_student(db, student_id, tutor.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому ученику")

    result = await db.execute(
        select(StudentContact).where(StudentContact.id == sc_id, StudentContact.student_id == student_id)
    )
    sc = result.scalar_one_or_none()
    if sc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Не найдено")
    await db.delete(sc)
    await db.commit()
