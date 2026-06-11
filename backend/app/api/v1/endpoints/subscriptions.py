from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tutor
from app.core.database import get_db
from app.models.lesson import Lesson, PaymentStatus
from app.models.subscription import Subscription
from app.models.tutor import Tutor
from app.models.tutor_student import TutorStudent
from app.schemas.subscription import SubscriptionCreate, SubscriptionOut, SubscriptionUpdate
from app.services.subscription_service import recompute_coverage

router = APIRouter()


async def _owned_link(db: AsyncSession, link_id: int, tutor: Tutor) -> TutorStudent:
    link = await db.get(TutorStudent, link_id)
    if link is None or link.tutor_id != tutor.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Связка не найдена")
    return link


@router.get("/by-link/{link_id}", response_model=list[SubscriptionOut], summary="Абонементы связки")
async def list_subscriptions(
    link_id: int,
    db: AsyncSession = Depends(get_db),
    tutor: Tutor = Depends(get_current_tutor),
):
    await _owned_link(db, link_id, tutor)
    rows = (await db.execute(
        select(Subscription).where(Subscription.tutor_student_id == link_id).order_by(Subscription.start_date)
    )).scalars().all()
    return list(rows)


@router.get("/backdate-check", summary="Оплаченные занятия, которые накроет бэкдейт")
async def backdate_check(
    link_id: int,
    start_date: date,
    db: AsyncSession = Depends(get_db),
    tutor: Tutor = Depends(get_current_tutor),
):
    await _owned_link(db, link_id, tutor)
    rows = (await db.execute(
        select(Lesson).where(
            Lesson.tutor_student_id == link_id,
            Lesson.starts_at >= datetime.combine(start_date, time.min),
            Lesson.payment_status == PaymentStatus.paid,
        )
    )).scalars().all()
    return {"covered_paid_lessons": [{"id": l.id, "starts_at": l.starts_at} for l in rows]}


@router.post("", response_model=SubscriptionOut, status_code=status.HTTP_201_CREATED, summary="Добавить абонемент")
async def create_subscription(
    payload: SubscriptionCreate,
    db: AsyncSession = Depends(get_db),
    tutor: Tutor = Depends(get_current_tutor),
):
    await _owned_link(db, payload.tutor_student_id, tutor)
    sub = Subscription(
        tutor_student_id=payload.tutor_student_id,
        hours=payload.hours,
        price=payload.price,
        start_date=payload.start_date or date.today(),
    )
    db.add(sub)
    await db.flush()
    await recompute_coverage(db, payload.tutor_student_id)
    await db.commit()
    await db.refresh(sub)
    return sub


@router.patch("/{sub_id}", response_model=SubscriptionOut, summary="Изменить абонемент")
async def update_subscription(
    sub_id: int,
    payload: SubscriptionUpdate,
    db: AsyncSession = Depends(get_db),
    tutor: Tutor = Depends(get_current_tutor),
):
    sub = await db.get(Subscription, sub_id)
    if sub is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Абонемент не найден")
    await _owned_link(db, sub.tutor_student_id, tutor)
    if payload.hours is not None:
        sub.hours = payload.hours
    if payload.price is not None:
        sub.price = payload.price
    if payload.start_date is not None:
        sub.start_date = payload.start_date
    await recompute_coverage(db, sub.tutor_student_id)
    await db.commit()
    await db.refresh(sub)
    return sub


@router.delete("/{sub_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить абонемент")
async def delete_subscription(
    sub_id: int,
    db: AsyncSession = Depends(get_db),
    tutor: Tutor = Depends(get_current_tutor),
):
    sub = await db.get(Subscription, sub_id)
    if sub is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Абонемент не найден")
    link_id = sub.tutor_student_id
    await _owned_link(db, link_id, tutor)
    await db.delete(sub)
    await db.flush()
    await recompute_coverage(db, link_id)
    await db.commit()
