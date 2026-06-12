from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tutor
from app.core.database import get_db
from app.models.availability import AvailabilityOverride, AvailabilityRule, OverrideKind
from app.models.lesson import ConductStatus, Lesson
from app.models.student import Student
from app.models.tutor import Tutor
from app.models.tutor_student import TutorStudent
from app.schemas.availability import (
    AvailabilitySaveResult,
    DayOverrideOut,
    DayOverrideSave,
    DayWindow,
    RuleCreate,
    RuleOut,
    WindowOut,
)
from app.services.availability_service import load_windows
from app.services.telegram_service import send_to_user

router = APIRouter()

HORIZON_DAYS = 28


def _tutor_tz(tutor: Tutor) -> ZoneInfo:
    return ZoneInfo(tutor.timezone) if tutor.timezone else ZoneInfo("Europe/Moscow")


def _validate_no_overlap(windows: list[tuple[time, time]]) -> None:
    ordered = sorted(windows)
    for s, e in ordered:
        if s >= e:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Начало окна должно быть раньше конца",
            )
    for (s1, e1), (s2, _) in zip(ordered, ordered[1:]):
        if s2 < e1:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Окна пересекаются",
            )


async def _post_save_checks(
    db: AsyncSession, tutor: Tutor, dates: list[date]
) -> AvailabilitySaveResult:
    """После правки доступности: конфликты с занятиями + авто-отклонение заявок вне окон."""
    if not dates:
        return AvailabilitySaveResult(conflicts=[], rejected_bookings=0)
    tz = _tutor_tz(tutor)
    now = datetime.now(timezone.utc)
    windows = await load_windows(db, tutor.id, min(dates), max(dates), tz, now)

    def in_windows(starts_at: datetime, ends_at: datetime) -> bool:
        s_loc = starts_at.astimezone(tz)
        e_loc = ends_at.astimezone(tz)
        return any(
            w.date == s_loc.date()
            and w.start_time <= s_loc.time()
            and e_loc.time() <= w.end_time
            and s_loc.date() == e_loc.date()
            for w in windows
        )

    day_set = set(dates)
    affected = (await db.execute(
        select(Lesson, TutorStudent)
        .join(TutorStudent, TutorStudent.id == Lesson.tutor_student_id)
        .where(
            TutorStudent.tutor_id == tutor.id,
            Lesson.conduct_status.in_([ConductStatus.scheduled, ConductStatus.booking_pending]),
            Lesson.starts_at > now,
        )
    )).all()

    conflicts: list[dict] = []
    rejected = 0
    for lesson, link in affected:
        if lesson.starts_at.astimezone(tz).date() not in day_set:
            continue
        if in_windows(lesson.starts_at, lesson.ends_at):
            continue
        if lesson.conduct_status == ConductStatus.booking_pending:
            lesson.conduct_status = ConductStatus.booking_rejected
            rejected += 1
            student = await db.get(Student, link.student_id)
            if student and student.telegram_id:
                local = lesson.starts_at.astimezone(tz)
                await send_to_user(
                    student.telegram_id,
                    f"Запись на {local.strftime('%d.%m %H:%M')} не подтверждена — это время уже занято. "
                    "Вы можете выбрать другое свободное время.",
                )
        else:  # scheduled — не трогаем, только сообщаем
            student = await db.get(Student, link.student_id)
            conflicts.append({
                "lesson_id": lesson.id,
                "starts_at": lesson.starts_at.isoformat(),
                "student_name": student.full_name if student else None,
            })
    await db.commit()
    return AvailabilitySaveResult(conflicts=conflicts, rejected_bookings=rejected)


@router.get("/rules", response_model=list[RuleOut], summary="Правила доступности")
async def list_rules(
    db: AsyncSession = Depends(get_db),
    tutor: Tutor = Depends(get_current_tutor),
):
    rows = (await db.execute(
        select(AvailabilityRule)
        .where(AvailabilityRule.tutor_id == tutor.id)
        .order_by(AvailabilityRule.weekday, AvailabilityRule.start_time)
    )).scalars().all()
    return list(rows)


@router.put(
    "/rules",
    response_model=AvailabilitySaveResult,
    summary="Заменить все правила доступности",
)
async def replace_rules(
    payload: list[RuleCreate],
    db: AsyncSession = Depends(get_db),
    tutor: Tutor = Depends(get_current_tutor),
):
    for wd in range(7):
        _validate_no_overlap([(r.start_time, r.end_time) for r in payload if r.weekday == wd])
    await db.execute(delete(AvailabilityRule).where(AvailabilityRule.tutor_id == tutor.id))
    for r in payload:
        db.add(AvailabilityRule(
            tutor_id=tutor.id,
            weekday=r.weekday,
            start_time=r.start_time,
            end_time=r.end_time,
            effective_from=r.effective_from or date.today(),
            effective_until=r.effective_until,
        ))
    await db.flush()
    horizon = [date.today() + timedelta(days=i) for i in range(HORIZON_DAYS)]
    return await _post_save_checks(db, tutor, horizon)


@router.get(
    "/day/{day}",
    response_model=DayOverrideOut,
    summary="Окна конкретной даты (для редактора дня)",
)
async def get_day(
    day: date,
    db: AsyncSession = Depends(get_db),
    tutor: Tutor = Depends(get_current_tutor),
):
    ovr = (await db.execute(
        select(AvailabilityOverride).where(
            AvailabilityOverride.tutor_id == tutor.id,
            AvailabilityOverride.date == day,
        )
    )).scalars().all()
    if ovr:
        closed = any(o.kind == OverrideKind.closed for o in ovr)
        windows = (
            []
            if closed
            else [DayWindow(start_time=o.start_time, end_time=o.end_time) for o in ovr]
        )
        return DayOverrideOut(date=day, overridden=True, closed=closed, windows=windows)
    rules = (await db.execute(
        select(AvailabilityRule).where(
            AvailabilityRule.tutor_id == tutor.id,
            AvailabilityRule.weekday == day.weekday(),
            AvailabilityRule.effective_from <= day,
        )
    )).scalars().all()
    windows = [
        DayWindow(start_time=r.start_time, end_time=r.end_time)
        for r in rules
        if r.effective_until is None or day <= r.effective_until
    ]
    return DayOverrideOut(
        date=day,
        overridden=False,
        closed=False,
        windows=sorted(windows, key=lambda w: w.start_time),
    )


@router.put(
    "/day/{day}",
    response_model=AvailabilitySaveResult,
    summary="Атомарно заменить окна даты (override)",
)
async def save_day(
    day: date,
    payload: DayOverrideSave,
    db: AsyncSession = Depends(get_db),
    tutor: Tutor = Depends(get_current_tutor),
):
    _validate_no_overlap([(w.start_time, w.end_time) for w in payload.windows])
    await db.execute(delete(AvailabilityOverride).where(
        AvailabilityOverride.tutor_id == tutor.id,
        AvailabilityOverride.date == day,
    ))
    if payload.closed:
        db.add(AvailabilityOverride(tutor_id=tutor.id, date=day, kind=OverrideKind.closed))
    else:
        for w in payload.windows:
            db.add(AvailabilityOverride(
                tutor_id=tutor.id,
                date=day,
                kind=OverrideKind.window,
                start_time=w.start_time,
                end_time=w.end_time,
            ))
    # closed=false и пустой windows = вернуть день к правилам (overrides удалены выше)
    await db.flush()
    return await _post_save_checks(db, tutor, [day])


@router.get(
    "/windows",
    response_model=list[WindowOut],
    summary="Вычисленные свободные окна (веб репетитора)",
)
async def get_windows(
    date_from: date,
    date_to: date,
    db: AsyncSession = Depends(get_db),
    tutor: Tutor = Depends(get_current_tutor),
):
    windows = await load_windows(
        db, tutor.id, date_from, date_to, _tutor_tz(tutor), datetime.now(timezone.utc)
    )
    return [WindowOut(date=w.date, start_time=w.start_time, end_time=w.end_time) for w in windows]
