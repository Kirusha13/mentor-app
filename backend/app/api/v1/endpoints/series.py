from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tutor
from app.core.database import get_db
from app.models.lesson_series import LessonSeries
from app.models.tutor import Tutor
from app.models.tutor_student import TutorStudent
from app.schemas.lesson_series import SeriesCreate, SeriesOut, SeriesUpdate
from app.services.series_service import delete_untouched_future, materialize_series

router = APIRouter()


async def _owned_link(db: AsyncSession, link_id: int, tutor: Tutor) -> TutorStudent:
    link = await db.get(TutorStudent, link_id)
    if link is None or link.tutor_id != tutor.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Связка не найдена")
    return link


@router.get("/by-link/{link_id}", response_model=list[SeriesOut], summary="Серии связки")
async def list_series(link_id: int, db: AsyncSession = Depends(get_db),
                      tutor: Tutor = Depends(get_current_tutor)):
    await _owned_link(db, link_id, tutor)
    rows = (await db.execute(
        select(LessonSeries).where(LessonSeries.tutor_student_id == link_id)
    )).scalars().all()
    return list(rows)


@router.post("", response_model=SeriesOut, status_code=status.HTTP_201_CREATED, summary="Создать серию")
async def create_series(payload: SeriesCreate, db: AsyncSession = Depends(get_db),
                        tutor: Tutor = Depends(get_current_tutor)):
    await _owned_link(db, payload.tutor_student_id, tutor)
    series = LessonSeries(
        tutor_student_id=payload.tutor_student_id,
        weekday=payload.weekday,
        start_time=payload.start_time,
        duration_minutes=payload.duration_minutes,
        starts_on=payload.starts_on or date.today(),
        ends_on=payload.ends_on,
    )
    db.add(series)
    await db.flush()
    await materialize_series(db, series.id)
    await db.commit()
    await db.refresh(series)
    return series


@router.patch("/{series_id}", response_model=SeriesOut, summary="Изменить серию (перегенерация будущих)")
async def update_series(series_id: int, payload: SeriesUpdate, db: AsyncSession = Depends(get_db),
                        tutor: Tutor = Depends(get_current_tutor)):
    series = await db.get(LessonSeries, series_id)
    if series is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Серия не найдена")
    await _owned_link(db, series.tutor_student_id, tutor)

    await delete_untouched_future(db, series.id)
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        if value is None and field != "ends_on":
            continue  # null допустим только для ends_on (сделать серию бессрочной)
        setattr(series, field, value)
    await db.flush()
    if series.is_active:
        await materialize_series(db, series.id)
    await db.commit()
    await db.refresh(series)
    return series


@router.delete("/{series_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить серию")
async def delete_series(series_id: int, db: AsyncSession = Depends(get_db),
                        tutor: Tutor = Depends(get_current_tutor)):
    series = await db.get(LessonSeries, series_id)
    if series is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Серия не найдена")
    await _owned_link(db, series.tutor_student_id, tutor)
    await delete_untouched_future(db, series.id)
    await db.delete(series)  # у истории series_id -> NULL (ON DELETE SET NULL)
    await db.commit()
