from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tutor
from app.core.database import get_db
from app.models.assignment import Assignment, CompletionStatus
from app.models.student import Student
from app.models.subject import Subject
from app.models.tutor import Tutor
from app.models.tutor_student import TutorStudent
from app.schemas.assignment import AssignmentCreate, AssignmentOut, AssignmentUpdate
from app.services.telegram_service import send_to_user

router = APIRouter()


async def _get_assignment_for_tutor(db: AsyncSession, assignment_id: int, tutor_id: int) -> Assignment:
    result = await db.execute(
        select(Assignment)
        .join(TutorStudent, TutorStudent.id == Assignment.tutor_student_id)
        .where(Assignment.id == assignment_id, TutorStudent.tutor_id == tutor_id)
    )
    assignment = result.scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задание не найдено")
    return assignment


@router.get("", response_model=list[AssignmentOut], summary="Список домашних заданий")
async def list_assignments(
    tutor_student_id: int | None = Query(None),
    completion_status: CompletionStatus | None = Query(None),
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(Assignment)
        .join(TutorStudent, TutorStudent.id == Assignment.tutor_student_id)
        .where(TutorStudent.tutor_id == tutor.id)
    )
    if tutor_student_id:
        q = q.where(Assignment.tutor_student_id == tutor_student_id)
    if completion_status:
        q = q.where(Assignment.completion_status == completion_status)
    q = q.order_by(Assignment.deadline)
    result = await db.execute(q)
    return list(result.scalars().all())


@router.post("", response_model=AssignmentOut, status_code=status.HTTP_201_CREATED, summary="Назначить задание")
async def create_assignment(
    data: AssignmentCreate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    ts_result = await db.execute(
        select(TutorStudent).where(
            TutorStudent.id == data.tutor_student_id,
            TutorStudent.tutor_id == tutor.id,
        )
    )
    ts = ts_result.scalar_one_or_none()
    if ts is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Связка репетитор-ученик не найдена")

    assignment = Assignment(**data.model_dump())
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)

    student_result = await db.execute(select(Student).where(Student.id == ts.student_id))
    student = student_result.scalar_one_or_none()
    if student and student.telegram_id:
        title = assignment.title or (assignment.description[:50] if assignment.description else "")
        deadline_str = assignment.deadline.strftime("%d.%m.%Y") if assignment.deadline else "не указан"
        await send_to_user(
            student.telegram_id,
            f"Репетитор {tutor.full_name} назначил вам новое задание: «{title}».\nДедлайн: {deadline_str}",
        )

    return assignment


@router.get("/{assignment_id}", response_model=AssignmentOut, summary="Детали задания")
async def get_assignment(
    assignment_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    return await _get_assignment_for_tutor(db, assignment_id, tutor.id)


@router.patch("/{assignment_id}", response_model=AssignmentOut, summary="Обновить задание")
async def update_assignment(
    assignment_id: int,
    data: AssignmentUpdate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    assignment = await _get_assignment_for_tutor(db, assignment_id, tutor.id)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(assignment, field, value)
    await db.commit()
    await db.refresh(assignment)
    return assignment


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить задание")
async def delete_assignment(
    assignment_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    assignment = await _get_assignment_for_tutor(db, assignment_id, tutor.id)
    await db.delete(assignment)
    await db.commit()
