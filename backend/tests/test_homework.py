from app.services.homework_service import HomeworkStats, compute_homework_stats, is_in_queue


def test_compute_stats_mixes_states():
    rows = [
        ("pending", True),    # задано (есть ДЗ — FK главнее статуса)
        ("pending", False),   # висит
        ("skipped", False),   # без ДЗ
        ("pending", True),    # задано
    ]
    stats = compute_homework_stats(rows)
    assert stats == HomeworkStats(total=4, assigned=2, skipped=1, pending=1)
    assert stats.rate == 0.5


def test_compute_stats_empty_is_zero_rate():
    stats = compute_homework_stats([])
    assert stats.total == 0
    assert stats.rate == 0.0


def test_in_queue_only_pending_without_assignment():
    assert is_in_queue("pending", has_assignment=False) is True
    assert is_in_queue("pending", has_assignment=True) is False   # ДЗ уже задано
    assert is_in_queue("skipped", has_assignment=False) is False  # решено «без ДЗ»
    assert is_in_queue(None, has_assignment=False) is False       # легаси
