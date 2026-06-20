from dataclasses import dataclass


@dataclass
class HomeworkStats:
    total: int      # отслеживаемые проведённые занятия в окне
    assigned: int   # из них с привязанным ДЗ
    skipped: int    # осознанно без ДЗ
    pending: int    # висят

    @property
    def rate(self) -> float:
        return self.assigned / self.total if self.total else 0.0


def compute_homework_stats(rows: list[tuple[str | None, bool]]) -> HomeworkStats:
    """rows: (homework_status, has_assignment) по отслеживаемым проведённым занятиям окна."""
    total = assigned = skipped = pending = 0
    for status, has_assignment in rows:
        total += 1
        if has_assignment:
            assigned += 1
        elif status == "skipped":
            skipped += 1
        else:
            pending += 1
    return HomeworkStats(total=total, assigned=assigned, skipped=skipped, pending=pending)


def is_in_queue(homework_status: str | None, has_assignment: bool) -> bool:
    """Занятие ждёт решения = статус pending и нет привязанного ДЗ (FK главнее)."""
    return homework_status == "pending" and not has_assignment


def can_skip_homework(conduct_status: str) -> bool:
    """Отметить «без ДЗ» можно только у проведённого занятия."""
    return conduct_status == "conducted"
