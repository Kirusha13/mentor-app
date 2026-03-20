import { useEffect, useMemo, useState } from 'react';
import {
  createLesson,
  getLessons,
  updateLesson,
  type ConductStatus,
  type Lesson,
  type PaymentStatus,
} from '../api/lessons';
import { getStudents, type Student } from '../api/students';
import { getSubjects, type Subject } from '../api/subjects';
import { getTutorStudents, type TutorStudent } from '../api/tutorStudents';

type CalendarMode = 'day' | 'week' | 'month';

const panelStyle = {
  background: 'rgba(255,255,255,0.88)',
  padding: '20px',
  borderRadius: '22px',
  border: '1px solid rgba(24,33,47,0.08)',
  boxShadow: 'var(--shadow-card)',
} as const;

const GRID_START_HOUR = 8;
const GRID_END_HOUR = 22;
const HOUR_HEIGHT = 72;
const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function atMidnight(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfWeek(date: Date) {
  const copy = atMidnight(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function startOfMonth(date: Date) {
  const copy = atMidnight(date);
  copy.setDate(1);
  return copy;
}

function endOfMonth(date: Date) {
  const copy = atMidnight(date);
  copy.setMonth(copy.getMonth() + 1, 0);
  return copy;
}

function addDays(date: Date, amount: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function addMonths(date: Date, amount: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + amount);
  return copy;
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDayShort(date: Date) {
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function formatDayLong(date: Date) {
  return date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatWeekLabel(start: Date, end: Date) {
  return `${start.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} - ${end.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`;
}

function formatMonthLabel(date: Date) {
  return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

function toMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number);
  return hours * 60 + minutes;
}

function toTime(value: string) {
  return value.slice(0, 5);
}

function statusColor(status: ConductStatus) {
  if (status === 'conducted') return '#2f7d63';
  if (status === 'cancelled') return '#a63f3b';
  if (status === 'rescheduled') return '#7b61c8';
  if (status === 'reschedule_pending') return '#d96f32';
  if (status === 'reschedule_rejected') return '#7b3f00';
  return '#2a6fdb';
}

function statusLabel(status: ConductStatus) {
  if (status === 'conducted') return 'Проведено';
  if (status === 'cancelled') return 'Отменено';
  if (status === 'rescheduled') return 'Перенесено';
  if (status === 'reschedule_pending') return 'Ждёт переноса';
  if (status === 'reschedule_rejected') return 'Перенос отклонён';
  return 'Запланировано';
}

function monthGrid(date: Date) {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const gridStart = startOfWeek(monthStart);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index)).map((day) => ({
    day,
    inMonth: day.getMonth() === monthStart.getMonth(),
    isToday: formatDate(day) === formatDate(new Date()),
    isCurrentMonth: day >= monthStart && day <= monthEnd,
  }));
}

export default function SchedulePage() {
  const [mode, setMode] = useState<CalendarMode>('week');
  const [anchorDate, setAnchorDate] = useState(() => atMidnight(new Date()));
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [tutorStudents, setTutorStudents] = useState<TutorStudent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedTutorStudentId, setSelectedTutorStudentId] = useState('');
  const [lessonDate, setLessonDate] = useState('');
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [cost, setCost] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null);
  const [isEditingLesson, setIsEditingLesson] = useState(false);
  const [editLessonDate, setEditLessonDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editCost, setEditCost] = useState('');

  const dayDate = useMemo(() => atMidnight(anchorDate), [anchorDate]);
  const weekStart = useMemo(() => startOfWeek(anchorDate), [anchorDate]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const monthDays = useMemo(() => monthGrid(anchorDate), [anchorDate]);

  const range = useMemo(() => {
    if (mode === 'day') return { from: dayDate, to: dayDate };
    if (mode === 'month') return { from: monthDays[0].day, to: monthDays[monthDays.length - 1].day };
    return { from: weekDays[0], to: weekDays[6] };
  }, [dayDate, mode, monthDays, weekDays]);

  const rangeLabel = useMemo(() => {
    if (mode === 'day') return formatDayLong(dayDate);
    if (mode === 'month') return formatMonthLabel(anchorDate);
    return formatWeekLabel(weekDays[0], weekDays[6]);
  }, [anchorDate, dayDate, mode, weekDays]);

  const selectedLesson = useMemo(
    () => lessons.find((lesson) => lesson.id === selectedLessonId) ?? null,
    [lessons, selectedLessonId]
  );

  const tutorStudentOptions = useMemo(() => {
    return tutorStudents.map((item) => {
      const student = students.find((entry) => entry.id === item.student_id);
      const subject = subjects.find((entry) => entry.id === item.subject_id);
      return {
        id: item.id,
        label: `${student?.full_name ?? `Ученик #${item.student_id}`} • ${subject?.name ?? 'Без предмета'}`,
        rate: Number(item.hourly_rate),
      };
    });
  }, [students, subjects, tutorStudents]);

  const dayLessons = useMemo(
    () => lessons.filter((lesson) => lesson.lesson_date === formatDate(dayDate)),
    [dayDate, lessons]
  );

  const weekLessonsByDay = useMemo(
    () => weekDays.map((day) => lessons.filter((lesson) => lesson.lesson_date === formatDate(day))),
    [lessons, weekDays]
  );

  const lessonsByDate = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    for (const lesson of lessons) {
      const existing = map.get(lesson.lesson_date) ?? [];
      existing.push(lesson);
      map.set(lesson.lesson_date, existing);
    }
    return map;
  }, [lessons]);

  useEffect(() => {
    if (!selectedLesson) {
      setIsEditingLesson(false);
      setEditLessonDate('');
      setEditStartTime('');
      setEditEndTime('');
      setEditCost('');
      return;
    }

    setIsEditingLesson(false);
    setEditLessonDate(selectedLesson.lesson_date);
    setEditStartTime(toTime(selectedLesson.start_time));
    setEditEndTime(toTime(selectedLesson.end_time));
    setEditCost(selectedLesson.cost ? String(selectedLesson.cost) : '');
  }, [selectedLesson]);

  useEffect(() => {
    if (!tutorStudentOptions.length) {
      setSelectedTutorStudentId('');
      return;
    }
    setSelectedTutorStudentId((current) =>
      current && tutorStudentOptions.some((item) => String(item.id) === current)
        ? current
        : String(tutorStudentOptions[0].id)
    );
  }, [tutorStudentOptions]);

  useEffect(() => {
    setLessonDate(formatDate(range.from));
  }, [range.from]);

  useEffect(() => {
    const selected = tutorStudentOptions.find((item) => String(item.id) === selectedTutorStudentId);
    if (!selected) return;
    setCost((current) => current || (selected.rate ? String(selected.rate) : ''));
  }, [selectedTutorStudentId, tutorStudentOptions]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [lessonData, tutorStudentData, studentData, subjectData] = await Promise.all([
          getLessons({ date_from: formatDate(range.from), date_to: formatDate(range.to) }),
          getTutorStudents(),
          getStudents(),
          getSubjects(),
        ]);
        setLessons(lessonData);
        setTutorStudents(tutorStudentData);
        setStudents(studentData);
        setSubjects(subjectData);
      } catch (error) {
        console.error('Ошибка загрузки расписания:', error);
        alert('Не удалось загрузить расписание');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [range.from, range.to]);

  const upsertLesson = (updated: Lesson) => {
    setLessons((prev) =>
      prev
        .map((lesson) => (lesson.id === updated.id ? updated : lesson))
        .sort((a, b) => `${a.lesson_date} ${a.start_time}`.localeCompare(`${b.lesson_date} ${b.start_time}`))
    );
  };

  const handleCreateLesson = async () => {
    if (!selectedTutorStudentId || !lessonDate || !startTime || !endTime || !cost) {
      alert('Заполни все поля для создания занятия');
      return;
    }

    try {
      setSaving(true);
      const created = await createLesson({
        tutor_student_id: Number(selectedTutorStudentId),
        lesson_date: lessonDate,
        start_time: `${startTime}:00`,
        end_time: `${endTime}:00`,
        cost: Number(cost),
      });
      setLessons((prev) =>
        [...prev, created].sort((a, b) => `${a.lesson_date} ${a.start_time}`.localeCompare(`${b.lesson_date} ${b.start_time}`))
      );
      alert('Занятие создано');
    } catch (error) {
      console.error('Ошибка создания занятия:', error);
      alert('Не удалось создать занятие');
    } finally {
      setSaving(false);
    }
  };

  const handleLessonPatch = async (
    lessonId: number,
    payload: { conduct_status?: ConductStatus; payment_status?: PaymentStatus; grade?: number }
  ) => {
    try {
      const updated = await updateLesson(lessonId, payload);
      upsertLesson(updated);
      setSelectedLessonId(updated.id);
    } catch (error) {
      console.error('Ошибка обновления занятия:', error);
      alert('Не удалось обновить занятие');
    }
  };

  const handleLessonDetailsSave = async () => {
    if (!selectedLesson || !editLessonDate || !editStartTime || !editEndTime || !editCost) {
      alert('Заполни дату, время и стоимость');
      return;
    }

    try {
      const updated = await updateLesson(selectedLesson.id, {
        lesson_date: editLessonDate,
        start_time: `${editStartTime}:00`,
        end_time: `${editEndTime}:00`,
        cost: Number(editCost),
      });
      upsertLesson(updated);
      setSelectedLessonId(updated.id);
      setIsEditingLesson(false);
    } catch (error) {
      console.error('Ошибка редактирования занятия:', error);
      alert('Не удалось сохранить изменения занятия');
    }
  };

  const moveRange = (direction: -1 | 1) => {
    if (mode === 'day') {
      setAnchorDate((prev) => addDays(prev, direction));
      return;
    }
    if (mode === 'month') {
      setAnchorDate((prev) => addMonths(prev, direction));
      return;
    }
    setAnchorDate((prev) => addDays(prev, direction * 7));
  };

  const renderLessonCard = (lesson: Lesson, compact = false) => {
    const relation = tutorStudents.find((item) => item.id === lesson.tutor_student_id);
    const student = students.find((item) => item.id === relation?.student_id);
    const subject = subjects.find((item) => item.id === relation?.subject_id);
    const accent = subject?.color || '#d96f32';
    const state = statusColor(lesson.conduct_status);

    return (
      <div
        key={lesson.id}
        onClick={() => setSelectedLessonId(lesson.id)}
        style={{
          padding: compact ? '8px 10px' : '10px',
          borderRadius: 16,
          background: `linear-gradient(135deg, ${accent} 0%, ${state} 100%)`,
          color: '#fff',
          boxShadow: `0 12px 22px ${accent}33`,
          overflow: 'hidden',
          cursor: 'pointer',
          border: selectedLessonId === lesson.id ? `3px solid ${accent}` : `2px solid ${accent}`,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>
          {toTime(lesson.start_time)} - {toTime(lesson.end_time)}
        </div>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{student?.full_name ?? 'Ученик'}</div>
        <div style={{ fontSize: 13, opacity: 0.92, marginBottom: compact ? 0 : 6 }}>
          {subject?.name ?? 'Без предмета'} • {lesson.cost ?? '—'} ₽
        </div>
        {!compact && (
          <div style={{ fontSize: 12, opacity: 0.9 }}>
            {lesson.grade ? `Оценка: ${lesson.grade}` : 'Нажми для деталей'}
          </div>
        )}
      </div>
    );
  };

  const renderTimeLabels = () => (
    <div style={{ position: 'relative', height: (GRID_END_HOUR - GRID_START_HOUR) * HOUR_HEIGHT }}>
      {Array.from({ length: GRID_END_HOUR - GRID_START_HOUR + 1 }, (_, index) => {
        const hour = GRID_START_HOUR + index;
        if (hour > GRID_END_HOUR) return null;
        return (
          <div
            key={hour}
            style={{ position: 'absolute', top: index * HOUR_HEIGHT - 10, fontSize: 12, color: '#748093' }}
          >
            {String(hour).padStart(2, '0')}:00
          </div>
        );
      })}
    </div>
  );

  const renderTimelineColumn = (items: Lesson[]) => (
    <div
      style={{
        position: 'relative',
        height: (GRID_END_HOUR - GRID_START_HOUR) * HOUR_HEIGHT,
        borderRadius: 18,
        background:
          'repeating-linear-gradient(to bottom, rgba(23,32,51,0.05) 0, rgba(23,32,51,0.05) 1px, transparent 1px, transparent 72px)',
        border: '1px solid rgba(24,33,47,0.06)',
        overflow: 'hidden',
      }}
    >
      {items.map((lesson) => {
        const start = toMinutes(lesson.start_time) - GRID_START_HOUR * 60;
        const end = toMinutes(lesson.end_time) - GRID_START_HOUR * 60;
        const top = (start / 60) * HOUR_HEIGHT;
        const height = Math.max(((end - start) / 60) * HOUR_HEIGHT, 52);

        return (
          <div key={lesson.id} style={{ position: 'absolute', top, left: 8, right: 8, height }}>
            {renderLessonCard(lesson)}
          </div>
        );
      })}
    </div>
  );

  const renderCalendarBody = () => {
    if (mode === 'day') {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '80px minmax(0, 1fr)', gap: 10 }}>
          <div />
          <div style={{ textAlign: 'center', padding: '10px 8px', borderRadius: 16, background: 'rgba(23,32,51,0.05)', fontWeight: 800 }}>
            {formatDayLong(dayDate)}
          </div>
          {renderTimeLabels()}
          {renderTimelineColumn(dayLessons)}
        </div>
      );
    }

    if (mode === 'week') {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: `80px repeat(7, minmax(140px, 1fr))`, gap: 10 }}>
          <div />
          {weekDays.map((day, index) => (
            <div key={formatDate(day)} style={{ textAlign: 'center', padding: '10px 8px', borderRadius: 16, background: 'rgba(23,32,51,0.05)' }}>
              <div style={{ fontWeight: 800 }}>{WEEK_DAYS[index]}</div>
              <div style={{ color: '#667386', fontSize: 13 }}>{formatDayShort(day)}</div>
            </div>
          ))}
          {renderTimeLabels()}
          {weekLessonsByDay.map((items, index) => (
            <div key={index}>{renderTimelineColumn(items)}</div>
          ))}
        </div>
      );
    }

    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 10, marginBottom: 10 }}>
          {WEEK_DAYS.map((day) => (
            <div key={day} style={{ textAlign: 'center', fontWeight: 800, color: '#445167', padding: '8px 0' }}>
              {day}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 10 }}>
          {monthDays.map(({ day, inMonth, isToday }) => {
            const key = formatDate(day);
            const items = lessonsByDate.get(key) ?? [];
            return (
              <div
                key={key}
                style={{
                  minHeight: 150,
                  borderRadius: 18,
                  padding: 12,
                  background: inMonth ? 'rgba(255,255,255,0.72)' : 'rgba(23,32,51,0.03)',
                  border: isToday ? '2px solid rgba(217,111,50,0.9)' : '1px solid rgba(24,33,47,0.06)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontWeight: 800, color: inMonth ? '#1e293b' : '#98a1af' }}>{day.getDate()}</div>
                  {items.length > 0 && (
                    <div style={{ padding: '4px 8px', borderRadius: 999, background: 'rgba(23,32,51,0.08)', color: '#4c5a70', fontSize: 12, fontWeight: 700 }}>
                      {items.length}
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {items.slice(0, 3).map((lesson) => renderLessonCard(lesson, true))}
                  {items.length > 3 && (
                    <div style={{ fontSize: 12, color: '#677487', padding: '4px 2px' }}>
                      Ещё {items.length - 3} записей
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div>
      <section
        style={{
          ...panelStyle,
          padding: 28,
          marginBottom: 22,
          background: 'linear-gradient(140deg, rgba(240,247,255,0.98) 0%, rgba(255,255,255,0.9) 100%)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'inline-flex', padding: '8px 12px', borderRadius: 999, background: 'rgba(42,111,219,0.1)', color: '#2a6fdb', fontWeight: 700, fontSize: 13, marginBottom: 14 }}>
              Этап 2
            </div>
            <h1 style={{ fontSize: 'clamp(2rem, 4vw, 3.2rem)', lineHeight: 0.98, letterSpacing: '-0.04em', marginBottom: 12 }}>
              Расписание
              <br />
              по дню, неделе и месяцу
            </h1>
            <p style={{ color: '#5e6a7b', maxWidth: 760, fontSize: 16, marginBottom: 0 }}>
              Переключай режим отображения и открывай карточку занятия по клику на запись.
            </p>
          </div>
          <div style={{ minWidth: 260, borderRadius: 22, padding: 18, background: '#172033', color: '#fff' }}>
            <div style={{ color: 'rgba(255,255,255,0.64)', fontSize: 13, marginBottom: 8 }}>Текущий диапазон</div>
            <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1, marginBottom: 8 }}>{rangeLabel}</div>
            <div style={{ color: 'rgba(255,255,255,0.74)', fontSize: 14 }}>Записей в диапазоне: {lessons.length}</div>
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 360px) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
        <section style={panelStyle}>
          <h3 style={{ fontSize: 22, marginBottom: 16 }}>Создать занятие</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            <select
              value={selectedTutorStudentId}
              onChange={(event) => {
                const nextId = event.target.value;
                const nextOption = tutorStudentOptions.find((item) => String(item.id) === nextId);
                setSelectedTutorStudentId(nextId);
                setCost(nextOption?.rate ? String(nextOption.rate) : '');
              }}
            >
              {tutorStudentOptions.length === 0 ? (
                <option value="">Нет активных связок</option>
              ) : (
                tutorStudentOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))
              )}
            </select>
            <input type="date" value={lessonDate} onChange={(event) => setLessonDate(event.target.value)} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
              <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
            </div>
            <input type="number" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="Стоимость" />
            <button onClick={handleCreateLesson} disabled={saving || !tutorStudentOptions.length}>
              {saving ? 'Сохраняем...' : 'Создать занятие'}
            </button>
          </div>
        </section>

        <section style={panelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
            <div>
              <h3 style={{ fontSize: 22, marginBottom: 6 }}>Календарь</h3>
              <div style={{ color: '#6b7788' }}>Переключайся между режимами и просматривай записи в удобном масштабе.</div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                ['day', 'День'],
                ['week', 'Неделя'],
                ['month', 'Месяц'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setMode(value as CalendarMode)}
                  style={{
                    background: mode === value ? 'rgba(217,111,50,0.92)' : 'rgba(23,32,51,0.92)',
                    boxShadow: 'none',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
            <div style={{ fontWeight: 700, color: '#334155' }}>{rangeLabel}</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => moveRange(-1)} style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}>Предыдущая</button>
              <button onClick={() => setAnchorDate(atMidnight(new Date()))} style={{ background: 'rgba(217,111,50,0.92)', boxShadow: 'none' }}>Сегодня</button>
              <button onClick={() => moveRange(1)} style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}>Следующая</button>
            </div>
          </div>

          {loading ? <p style={{ color: '#687486', marginBottom: 0 }}>Загрузка расписания...</p> : renderCalendarBody()}
        </section>
      </div>

      {selectedLesson && (() => {
        const relation = tutorStudents.find((item) => item.id === selectedLesson.tutor_student_id);
        const student = students.find((item) => item.id === relation?.student_id);
        const subject = subjects.find((item) => item.id === relation?.subject_id);
        const currentStatusColor = statusColor(selectedLesson.conduct_status);

        return (
          <div
            onClick={() => setSelectedLessonId(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.34)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 24, zIndex: 1000 }}
          >
            <div
              onClick={(event) => event.stopPropagation()}
              style={{ width: 'min(560px, 100%)', borderRadius: 28, background: 'rgba(255,255,255,0.98)', boxShadow: '0 28px 70px rgba(15, 23, 42, 0.22)', border: '1px solid rgba(24,33,47,0.08)', overflow: 'hidden' }}
            >
              <div style={{ padding: '22px 24px 18px', background: `${currentStatusColor}12`, borderBottom: '1px solid rgba(24,33,47,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'inline-flex', padding: '8px 12px', borderRadius: 999, background: currentStatusColor, color: '#fff', fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
                      {statusLabel(selectedLesson.conduct_status)}
                    </div>
                    <h3 style={{ fontSize: 28, lineHeight: 1.02, marginBottom: 8 }}>{student?.full_name ?? 'Ученик'}</h3>
                    <p style={{ color: '#5d6778', marginBottom: 0 }}>{subject?.name ?? 'Без предмета'} • {selectedLesson.lesson_date}</p>
                  </div>
                  <button onClick={() => setSelectedLessonId(null)} style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}>×</button>
                </div>
              </div>

              <div style={{ padding: 24 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 20 }}>
                  {[
                    ['Дата', selectedLesson.lesson_date],
                    ['Время', `${toTime(selectedLesson.start_time)} - ${toTime(selectedLesson.end_time)}`],
                    ['Стоимость', `${selectedLesson.cost ?? '—'} ₽`],
                    ['Оплата', selectedLesson.payment_status === 'paid' ? 'Оплачено' : 'Не оплачено'],
                    ['Оценка', selectedLesson.grade ? String(selectedLesson.grade) : 'Не выставлена'],
                    ['ID связки', selectedLesson.tutor_student_id ? String(selectedLesson.tutor_student_id) : '—'],
                  ].map(([label, value]) => (
                    <div key={label} style={{ padding: 14, borderRadius: 16, background: 'rgba(23,32,51,0.04)', border: '1px solid rgba(24,33,47,0.06)' }}>
                      <div style={{ fontSize: 13, color: '#768294', marginBottom: 6 }}>{label}</div>
                      <div style={{ fontWeight: 700, color: '#1f2a3b' }}>{value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 14, color: '#687486', marginBottom: 10 }}>Быстрые действия</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    <button onClick={() => setIsEditingLesson((prev) => !prev)} style={{ background: isEditingLesson ? 'rgba(23,32,51,0.92)' : '#d96f32', boxShadow: 'none' }}>
                      {isEditingLesson ? 'Скрыть редактирование' : 'Редактировать'}
                    </button>
                    <button onClick={() => handleLessonPatch(selectedLesson.id, { conduct_status: 'conducted' })}>Проведено</button>
                    <button
                      onClick={() =>
                        handleLessonPatch(selectedLesson.id, {
                          payment_status: selectedLesson.payment_status === 'paid' ? 'unpaid' : 'paid',
                        })
                      }
                      style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}
                    >
                      {selectedLesson.payment_status === 'paid' ? 'Вернуть в долг' : 'Отметить оплату'}
                    </button>
                    <button onClick={() => handleLessonPatch(selectedLesson.id, { conduct_status: 'cancelled' })} style={{ background: '#a63f3b', boxShadow: 'none' }}>
                      Отменить занятие
                    </button>
                  </div>
                </div>

                {isEditingLesson && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 14, color: '#687486', marginBottom: 10 }}>Редактирование занятия</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
                      <input type="date" value={editLessonDate} onChange={(event) => setEditLessonDate(event.target.value)} />
                      <input type="number" value={editCost} onChange={(event) => setEditCost(event.target.value)} placeholder="Стоимость" />
                      <input type="time" value={editStartTime} onChange={(event) => setEditStartTime(event.target.value)} />
                      <input type="time" value={editEndTime} onChange={(event) => setEditEndTime(event.target.value)} />
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button onClick={handleLessonDetailsSave}>Сохранить изменения</button>
                      <button
                        onClick={() => {
                          setEditLessonDate(selectedLesson.lesson_date);
                          setEditStartTime(toTime(selectedLesson.start_time));
                          setEditEndTime(toTime(selectedLesson.end_time));
                          setEditCost(selectedLesson.cost ? String(selectedLesson.cost) : '');
                          setIsEditingLesson(false);
                        }}
                        style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <div style={{ fontSize: 14, color: '#687486', marginBottom: 10 }}>Оценка</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      defaultValue={selectedLesson.grade ?? ''}
                      onBlur={(event) => {
                        const value = Number(event.target.value);
                        if (!value || value === selectedLesson.grade) return;
                        handleLessonPatch(selectedLesson.id, { grade: value });
                      }}
                      style={{ maxWidth: 100 }}
                    />
                    <span style={{ color: '#5d6778' }}>Оценка от 1 до 5</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
