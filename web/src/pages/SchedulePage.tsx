import { useEffect, useMemo, useState } from 'react';
import {
  approveBooking,
  confirmPayment,
  createLesson,
  deleteLesson,
  getLessons,
  rejectBooking,
  rescheduleLesson,
  updateLesson,
  type ConductStatus,
  type Lesson,
  type PaymentStatus,
} from '../api/lessons';
import { getStudents, type Student } from '../api/students';
import { getSubjects, type Subject } from '../api/subjects';
import { getTopics, type TheoryTopic } from '../api/topics';
import { getTutorStudents, type TutorStudent } from '../api/tutorStudents';
import { getApiErrorCode, getApiErrorMessage } from '../utils/apiError';
import { formatTopicLevels, topicMatchesStudentLevel } from '../utils/studyLevel';

type CalendarMode = 'day' | 'week' | 'month';
type SlotDayDraft = {
  enabled: boolean;
  start: string;
  end: string;
};

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

function createDefaultSlotDrafts(): SlotDayDraft[] {
  return Array.from({ length: 7 }, () => ({
    enabled: false,
    start: '17:00',
    end: '18:00',
  }));
}

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
  if (status === 'booking_pending') return '#9c27b0';
  if (status === 'booking_rejected') return '#8a4f1d';
  return '#2a6fdb';
}

function statusLabel(status: ConductStatus) {
  if (status === 'conducted') return 'Проведено';
  if (status === 'cancelled') return 'Отменено';
  if (status === 'rescheduled') return 'Перенесено';
  if (status === 'reschedule_pending') return 'Ждёт переноса';
  if (status === 'reschedule_rejected') return 'Перенос отклонён';
  if (status === 'booking_pending') return 'Ждёт подтверждения записи';
  if (status === 'booking_rejected') return 'Запись отклонена';
  return 'Запланировано';
}

function paymentLabel(status: PaymentStatus) {
  if (status === 'paid') return 'Оплачено';
  if (status === 'payment_pending') return 'Ожидает подтверждения';
  return 'Не оплачено';
}

function isWindow(lesson: Lesson) {
  return lesson.tutor_student_id == null;
}

function overlaps(first: Lesson, second: Lesson) {
  return (
    first.lesson_date === second.lesson_date &&
    toMinutes(first.start_time) < toMinutes(second.end_time) &&
    toMinutes(first.end_time) > toMinutes(second.start_time)
  );
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

function layoutTimelineLessons(items: Lesson[]) {
  const sorted = [...items].sort((a, b) => {
    const startDiff = toMinutes(a.start_time) - toMinutes(b.start_time);
    if (startDiff !== 0) return startDiff;
    return toMinutes(b.end_time) - toMinutes(a.end_time);
  });

  const positioned: Array<{
    lesson: Lesson;
    top: number;
    height: number;
    column: number;
    columns: number;
  }> = [];

  let active: Array<{ end: number; column: number }> = [];
  let groupIndices: number[] = [];
  let groupMaxColumns = 1;

  const finalizeGroup = () => {
    groupIndices.forEach((index) => {
      positioned[index].columns = groupMaxColumns;
    });
    groupIndices = [];
    groupMaxColumns = 1;
  };

  for (const lesson of sorted) {
    const start = toMinutes(lesson.start_time) - GRID_START_HOUR * 60;
    const end = toMinutes(lesson.end_time) - GRID_START_HOUR * 60;

    active = active.filter((item) => item.end > start);

    if (active.length === 0 && groupIndices.length > 0) {
      finalizeGroup();
    }

    const usedColumns = new Set(active.map((item) => item.column));
    let column = 0;
    while (usedColumns.has(column)) {
      column += 1;
    }

    active.push({ end, column });
    groupMaxColumns = Math.max(groupMaxColumns, active.length);

    positioned.push({
      lesson,
      top: (start / 60) * HOUR_HEIGHT,
      height: Math.max(((end - start) / 60) * HOUR_HEIGHT, 52),
      column,
      columns: 1,
    });

    groupIndices.push(positioned.length - 1);
  }

  if (groupIndices.length > 0) {
    finalizeGroup();
  }

  return positioned;
}

export default function SchedulePage() {
  const [mode, setMode] = useState<CalendarMode>('week');
  const [anchorDate, setAnchorDate] = useState(() => atMidnight(new Date()));
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [tutorStudents, setTutorStudents] = useState<TutorStudent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<TheoryTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedTutorStudentId, setSelectedTutorStudentId] = useState('');
  const [lessonDate, setLessonDate] = useState('');
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [cost, setCost] = useState('');
  const [newTopicId, setNewTopicId] = useState('');
  const [isSlotPlannerOpen, setIsSlotPlannerOpen] = useState(false);
  const [slotWeekOffset, setSlotWeekOffset] = useState<0 | 1>(0);
  const [slotDurationMinutes, setSlotDurationMinutes] = useState('60');
  const [slotDrafts, setSlotDrafts] = useState<SlotDayDraft[]>(() => createDefaultSlotDrafts());
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null);
  const [isEditingLesson, setIsEditingLesson] = useState(false);
  const [editLessonDate, setEditLessonDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editCost, setEditCost] = useState('');
  const [editTopicId, setEditTopicId] = useState('');
  const [isReschedulingLesson, setIsReschedulingLesson] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleStartTime, setRescheduleStartTime] = useState('');
  const [rescheduleEndTime, setRescheduleEndTime] = useState('');
  const [showRescheduledLessons, setShowRescheduledLessons] = useState(true);

  const dayDate = useMemo(() => atMidnight(anchorDate), [anchorDate]);
  const weekStart = useMemo(() => startOfWeek(anchorDate), [anchorDate]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const slotPlannerWeekStart = useMemo(() => addDays(weekStart, slotWeekOffset * 7), [slotWeekOffset, weekStart]);
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

  const availableCreateTopics = useMemo(() => {
    const relation = tutorStudents.find((item) => String(item.id) === selectedTutorStudentId);
    const student = students.find((item) => item.id === relation?.student_id);

    if (!relation) return [];

    return topics.filter(
      (topic) =>
        topic.subject_id === relation.subject_id &&
        topicMatchesStudentLevel(topic, student?.grade)
    );
  }, [selectedTutorStudentId, students, topics, tutorStudents]);

  const availableEditTopics = useMemo(() => {
    const relation = tutorStudents.find((item) => item.id === selectedLesson?.tutor_student_id);
    const student = students.find((item) => item.id === relation?.student_id);

    if (!relation) return [];

    return topics.filter(
      (topic) =>
        topic.subject_id === relation.subject_id &&
        topicMatchesStudentLevel(topic, student?.grade)
    );
  }, [selectedLesson?.tutor_student_id, students, topics, tutorStudents]);

  const visibleLessons = useMemo(() => {
    const hiddenRequestStatuses: ConductStatus[] = [
      'booking_pending',
      'booking_rejected',
      'reschedule_pending',
      'reschedule_rejected',
    ];

    const occupiedLessons = lessons.filter(
      (lesson) =>
        !isWindow(lesson) &&
        ['scheduled', 'conducted', 'booking_pending', 'reschedule_pending'].includes(
          lesson.conduct_status
        )
    );

    return lessons.filter((lesson) => {
      if (hiddenRequestStatuses.includes(lesson.conduct_status)) {
        return false;
      }

      if (
        !showRescheduledLessons &&
        (lesson.conduct_status === 'rescheduled' || lesson.conduct_status === 'cancelled')
      ) {
        return false;
      }

      if (isWindow(lesson)) {
        return !occupiedLessons.some((occupied) => overlaps(lesson, occupied));
      }

      return true;
    });
  }, [lessons, showRescheduledLessons]);

  const hiddenRescheduledCount = useMemo(
    () =>
      lessons.filter(
        (lesson) =>
          lesson.conduct_status === 'rescheduled' || lesson.conduct_status === 'cancelled'
      ).length,
    [lessons]
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
    () => visibleLessons.filter((lesson) => lesson.lesson_date === formatDate(dayDate)),
    [dayDate, visibleLessons]
  );

  const weekLessonsByDay = useMemo(
    () => weekDays.map((day) => visibleLessons.filter((lesson) => lesson.lesson_date === formatDate(day))),
    [visibleLessons, weekDays]
  );

  const lessonsByDate = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    for (const lesson of visibleLessons) {
      const existing = map.get(lesson.lesson_date) ?? [];
      existing.push(lesson);
      map.set(lesson.lesson_date, existing);
    }
    return map;
  }, [visibleLessons]);

  useEffect(() => {
    if (!selectedLesson) {
      setIsEditingLesson(false);
      setIsReschedulingLesson(false);
      setEditLessonDate('');
      setEditStartTime('');
      setEditEndTime('');
      setEditCost('');
      setEditTopicId('');
      setRescheduleDate('');
      setRescheduleStartTime('');
      setRescheduleEndTime('');
      return;
    }

    setIsEditingLesson(false);
    setIsReschedulingLesson(false);
    setEditLessonDate(selectedLesson.lesson_date);
    setEditStartTime(toTime(selectedLesson.start_time));
    setEditEndTime(toTime(selectedLesson.end_time));
    setEditCost(selectedLesson.cost ? String(selectedLesson.cost) : '');
    setEditTopicId(selectedLesson.topic_id ? String(selectedLesson.topic_id) : '');
    setRescheduleDate(selectedLesson.lesson_date);
    setRescheduleStartTime(toTime(selectedLesson.start_time));
    setRescheduleEndTime(toTime(selectedLesson.end_time));
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
    setNewTopicId((current) =>
      current && availableCreateTopics.some((topic) => String(topic.id) === current) ? current : ''
    );
  }, [availableCreateTopics]);

  useEffect(() => {
    setEditTopicId((current) =>
      current && availableEditTopics.some((topic) => String(topic.id) === current)
        ? current
        : selectedLesson?.topic_id
          ? String(selectedLesson.topic_id)
          : ''
    );
  }, [availableEditTopics, selectedLesson?.topic_id]);

  useEffect(() => {
    if (!isSlotPlannerOpen) return;
    setSlotDrafts(createDefaultSlotDrafts());
    setSlotDurationMinutes('60');
  }, [isSlotPlannerOpen, slotWeekOffset]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [lessonData, tutorStudentData, studentData, subjectData, topicData] = await Promise.all([
          getLessons({ date_from: formatDate(range.from), date_to: formatDate(range.to) }),
          getTutorStudents(),
          getStudents(),
          getSubjects(),
          getTopics(),
        ]);
        setLessons(lessonData);
        setTutorStudents(tutorStudentData);
        setStudents(studentData);
        setSubjects(subjectData);
        setTopics(topicData);
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
    if (!lessonDate || !startTime || !endTime || !selectedTutorStudentId || !cost) {
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
        topic_id: newTopicId ? Number(newTopicId) : undefined,
      });
      setLessons((prev) =>
        [...prev, created].sort((a, b) => `${a.lesson_date} ${a.start_time}`.localeCompare(`${b.lesson_date} ${b.start_time}`))
      );
      setSelectedLessonId(created.id);
      alert('Занятие создано');
    } catch (error) {
      console.error('Ошибка создания записи:', error);
      alert(getApiErrorMessage(error, 'Не удалось создать занятие'));
    } finally {
      setSaving(false);
    }
  };

  const handleSlotDraftChange = (index: number, patch: Partial<SlotDayDraft>) => {
    setSlotDrafts((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  const handleCreateSlots = async () => {
    const duration = Number(slotDurationMinutes);
    if (!duration || duration <= 0) {
      alert('Укажи корректную длительность слота в минутах');
      return;
    }

    const enabledDays = slotDrafts
      .map((draft, index) => ({ draft, index }))
      .filter(({ draft }) => draft.enabled);

    if (enabledDays.length === 0) {
      alert('Выбери хотя бы один день недели для создания слотов');
      return;
    }

    const payloads: Array<{ lesson_date: string; start_time: string; end_time: string; label: string }> = [];
    const now = new Date();

    for (const { draft, index } of enabledDays) {
      if (!draft.start || !draft.end || draft.end <= draft.start) {
        alert(`Проверь время для дня ${WEEK_DAYS[index]}`);
        return;
      }

      const dayDate = addDays(slotPlannerWeekStart, index);
      const startMinutes = toMinutes(draft.start);
      const endMinutes = toMinutes(draft.end);

      if (endMinutes - startMinutes < duration) {
        alert(`Для дня ${WEEK_DAYS[index]} диапазон меньше длительности слота`);
        return;
      }

      for (let cursor = startMinutes; cursor + duration <= endMinutes; cursor += duration) {
        const slotStartHours = String(Math.floor(cursor / 60)).padStart(2, '0');
        const slotStartMinutes = String(cursor % 60).padStart(2, '0');
        const slotEndValue = cursor + duration;
        const slotEndHours = String(Math.floor(slotEndValue / 60)).padStart(2, '0');
        const slotEndMinutes = String(slotEndValue % 60).padStart(2, '0');

        const slotDate = formatDate(dayDate);
        const slotStart = new Date(`${slotDate}T${slotStartHours}:${slotStartMinutes}:00`);
        if (slotStart <= now) {
          continue;
        }

        payloads.push({
          lesson_date: slotDate,
          start_time: `${slotStartHours}:${slotStartMinutes}:00`,
          end_time: `${slotEndHours}:${slotEndMinutes}:00`,
          label: `${WEEK_DAYS[index]} ${slotStartHours}:${slotStartMinutes}-${slotEndHours}:${slotEndMinutes}`,
        });
      }
    }

    if (payloads.length === 0) {
      alert('Не осталось ни одного будущего слота для создания. Проверь неделю и время.');
      return;
    }

    try {
      setSaving(true);
      const results = await Promise.allSettled(
        payloads.map((payload) =>
          createLesson({
            lesson_date: payload.lesson_date,
            start_time: payload.start_time,
            end_time: payload.end_time,
            tutor_student_id: null,
            cost: 0,
            is_window: true,
          })
        )
      );
      const created = results
        .filter((result): result is PromiseFulfilledResult<Lesson> => result.status === 'fulfilled')
        .map((result) => result.value);
      const failed = results
        .map((result, index) => ({ result, payload: payloads[index] }))
        .filter((item): item is { result: PromiseRejectedResult; payload: { lesson_date: string; start_time: string; end_time: string; label: string } } => item.result.status === 'rejected');

      setLessons((prev) =>
        [...prev, ...created].sort((a, b) => `${a.lesson_date} ${a.start_time}`.localeCompare(`${b.lesson_date} ${b.start_time}`))
      );

      if (created.length > 0 && failed.length === 0) {
        setIsSlotPlannerOpen(false);
        alert(`Создано слотов: ${created.length}`);
        return;
      }

      if (created.length > 0 && failed.length > 0) {
        const firstError = getApiErrorMessage(failed[0].result.reason, 'Часть слотов не удалось создать');
        alert(`Создано слотов: ${created.length}. Не удалось создать: ${failed.length}. Первая ошибка: ${firstError}`);
        return;
      }

      const firstError = getApiErrorMessage(failed[0]?.result.reason, 'Не удалось создать свободные слоты');
      alert(firstError);
    } catch (error) {
      console.error('Ошибка создания свободных слотов:', error);
      alert(getApiErrorMessage(error, 'Не удалось создать свободные слоты'));
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
      const errorCode = getApiErrorCode(error);

      if (errorCode === 'SUBSCRIPTION_EXHAUSTED') {
        alert('У ученика закончились занятия по абонементу. Обнови абонемент и повтори действие.');
        return;
      }

      alert(getApiErrorMessage(error, 'Не удалось обновить занятие'));
    }
  };

  const handleBookingDecision = async (lessonId: number, approve: boolean) => {
    try {
      const updated = approve ? await approveBooking(lessonId) : await rejectBooking(lessonId);
      upsertLesson(updated);
      setSelectedLessonId(updated.id);
    } catch (error) {
      console.error('Ошибка обработки запроса на запись:', error);
      alert(
        getApiErrorMessage(
          error,
          approve ? 'Не удалось подтвердить запись ученика' : 'Не удалось отклонить запись ученика'
        )
      );
    }
  };

  const handlePaymentDecision = async (lessonId: number, confirm: boolean) => {
    try {
      const updated = await confirmPayment(lessonId, { confirm });
      upsertLesson(updated);
      setSelectedLessonId(updated.id);
    } catch (error) {
      console.error('Ошибка подтверждения оплаты:', error);
      alert(
        getApiErrorMessage(
          error,
          confirm ? 'Не удалось подтвердить оплату' : 'Не удалось отклонить оплату'
        )
      );
    }
  };

  const handleLessonDelete = async (lesson: Lesson) => {
    try {
      await deleteLesson(lesson.id);
      setLessons((prev) => prev.filter((item) => item.id !== lesson.id));
      setSelectedLessonId(null);
    } catch (error) {
      console.error('Ошибка удаления записи из расписания:', error);
      alert(
        getApiErrorMessage(
          error,
          isWindow(lesson) ? 'Не удалось удалить свободный слот' : 'Не удалось отменить занятие'
        )
      );
    }
  };

  const handleLessonDetailsSave = async () => {
    if (!selectedLesson || !editLessonDate || !editStartTime || !editEndTime || (!isWindow(selectedLesson) && !editCost)) {
      alert(isWindow(selectedLesson as Lesson) ? 'Заполни дату и время' : 'Заполни дату, время и стоимость');
      return;
    }

    try {
      const updated = await updateLesson(selectedLesson.id, {
        lesson_date: editLessonDate,
        start_time: `${editStartTime}:00`,
        end_time: `${editEndTime}:00`,
        topic_id: isWindow(selectedLesson) ? null : editTopicId ? Number(editTopicId) : null,
        ...(isWindow(selectedLesson) ? {} : { cost: Number(editCost) }),
      });
      upsertLesson(updated);
      setSelectedLessonId(updated.id);
      setIsEditingLesson(false);
    } catch (error) {
      console.error('Ошибка редактирования занятия:', error);
      alert(getApiErrorMessage(error, isWindow(selectedLesson) ? 'Не удалось сохранить слот' : 'Не удалось сохранить изменения занятия'));
    }
  };

  const handleLessonReschedule = async () => {
    if (!selectedLesson || !rescheduleDate || !rescheduleStartTime || !rescheduleEndTime) {
      alert('Заполни новую дату и время переноса');
      return;
    }

    if (rescheduleEndTime <= rescheduleStartTime) {
      alert('Время окончания должно быть позже времени начала');
      return;
    }

    try {
      const movedLesson = await rescheduleLesson(selectedLesson.id, {
        new_date: rescheduleDate,
        new_start_time: `${rescheduleStartTime}:00`,
        new_end_time: `${rescheduleEndTime}:00`,
      });

      const updatedOriginal = await updateLesson(selectedLesson.id, {
        conduct_status: 'rescheduled',
      });

      setLessons((prev) =>
        [...prev.filter((lesson) => lesson.id !== movedLesson.id && lesson.id !== updatedOriginal.id), updatedOriginal, movedLesson]
          .sort((a, b) =>
            `${a.lesson_date} ${a.start_time}`.localeCompare(`${b.lesson_date} ${b.start_time}`)
          )
      );

      setSelectedLessonId(movedLesson.id);
      setIsReschedulingLesson(false);
    } catch (error) {
      console.error('Ошибка переноса занятия:', error);
      alert(getApiErrorMessage(error, 'Не удалось перенести занятие'));
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
    const topic = topics.find((item) => item.id === lesson.topic_id);
    const windowCard = isWindow(lesson);
    const accent = windowCard ? '#2a6fdb' : subject?.color || '#d96f32';
    const state = statusColor(lesson.conduct_status);

    return (
      <div
        key={lesson.id}
        onClick={() => setSelectedLessonId(lesson.id)}
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: compact ? '8px 10px' : '10px',
          borderRadius: 16,
          background: windowCard
            ? 'linear-gradient(135deg, rgba(42,111,219,0.92) 0%, rgba(23,32,51,0.92) 100%)'
            : `linear-gradient(135deg, ${accent} 0%, ${state} 100%)`,
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
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{windowCard ? 'Свободный слот' : student?.full_name ?? 'Ученик'}</div>
        <div style={{ fontSize: 13, opacity: 0.92, marginBottom: compact ? 0 : 6 }}>
          {windowCard ? 'Окно для записи учеников' : `${subject?.name ?? 'Без предмета'} • ${lesson.cost ?? '—'} ₽`}
        </div>
        {!windowCard && topic && !compact && (
          <div
            style={{
              fontSize: 12,
              opacity: 0.86,
              marginBottom: 6,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            Тема: {topic.title}
          </div>
        )}
        {!compact && (
          <div style={{ fontSize: 12, opacity: 0.9, overflow: 'hidden' }}>
            {windowCard ? 'Нажми для управления слотом' : lesson.grade ? `Оценка: ${lesson.grade}` : 'Нажми для деталей'}
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
      {layoutTimelineLessons(items).map(({ lesson, top, height, column, columns }) => {
        const laneGap = 6;
        const width = `calc((100% - 16px - ${(columns - 1) * laneGap}px) / ${columns})`;
        const left = `calc(8px + ${column} * (((100% - 16px - ${(columns - 1) * laneGap}px) / ${columns}) + ${laneGap}px))`;

        return (
          <div
            key={lesson.id}
            style={{ position: 'absolute', top, left, width, height, zIndex: column + 1 }}
          >
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
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 0', textAlign: 'center' }}>
            <h1 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', lineHeight: 0.98, letterSpacing: '-0.04em', marginBottom: 10 }}>
              Расписание
            </h1>
          </div>
          <div style={{ minWidth: 212, borderRadius: 16, padding: '12px 14px', background: '#172033', color: '#fff' }}>
            <div style={{ color: 'rgba(255,255,255,0.64)', fontSize: 12, marginBottom: 6 }}>Текущий диапазон</div>
            <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15, marginBottom: 6 }}>{rangeLabel}</div>
            <div style={{ color: 'rgba(255,255,255,0.74)', fontSize: 12 }}>Записей: {visibleLessons.length}</div>
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 360px) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
        <section style={panelStyle}>
          <h3 style={{ fontSize: 22, marginBottom: 16 }}>Создать занятие</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={() => setIsSlotPlannerOpen(true)}
                style={{ background: 'rgba(42,111,219,0.92)', boxShadow: 'none' }}
              >
                Создать слоты
              </button>
            </div>
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
            <select value={newTopicId} onChange={(event) => setNewTopicId(event.target.value)}>
              <option value="">Без темы</option>
              {availableCreateTopics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title} • {formatTopicLevels(topic.study_level)}
                </option>
              ))}
            </select>
            <button onClick={handleCreateLesson} disabled={saving || !tutorStudentOptions.length}>
              {saving ? 'Сохраняем...' : 'Создать занятие'}
            </button>
          </div>
        </section>

        <section style={panelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
            <div>
              <h3 style={{ fontSize: 22, marginBottom: 6 }}>Календарь</h3>
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

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              alignItems: 'center',
              marginBottom: 18,
              padding: '12px 14px',
              borderRadius: 16,
              background: 'rgba(23,32,51,0.04)',
              border: '1px solid rgba(24,33,47,0.06)',
            }}
          >
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                color: '#324055',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              <input
                type="checkbox"
                checked={showRescheduledLessons}
                onChange={(event) => setShowRescheduledLessons(event.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              Показывать перенесённые и отменённые занятия
            </label>

            <div style={{ color: '#687486', fontSize: 13 }}>
              {showRescheduledLessons || hiddenRescheduledCount === 0
                ? `Показано записей: ${visibleLessons.length}`
                : `Скрыто перенесённых и отменённых: ${hiddenRescheduledCount}`}
            </div>
          </div>

          {loading ? <p style={{ color: '#687486', marginBottom: 0 }}>Загрузка расписания...</p> : renderCalendarBody()}
        </section>
      </div>

      {isSlotPlannerOpen && (
        <div
          onClick={() => setIsSlotPlannerOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.34)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 24, zIndex: 1000 }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{ width: 'min(820px, 100%)', borderRadius: 28, background: 'rgba(255,255,255,0.98)', boxShadow: '0 28px 70px rgba(15, 23, 42, 0.22)', border: '1px solid rgba(24,33,47,0.08)', overflow: 'hidden' }}
          >
            <div style={{ padding: '22px 24px 18px', background: 'rgba(42,111,219,0.08)', borderBottom: '1px solid rgba(24,33,47,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'inline-flex', padding: '8px 12px', borderRadius: 999, background: '#2a6fdb', color: '#fff', fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
                    Свободные слоты
                  </div>
                  <h3 style={{ fontSize: 28, lineHeight: 1.02, marginBottom: 8 }}>Создать слоты на неделю</h3>
                  <p style={{ color: '#5d6778', marginBottom: 0 }}>
                    Укажи по дням диапазон времени, а система сама разобьёт его на слоты нужной длительности.
                  </p>
                </div>
                <button onClick={() => setIsSlotPlannerOpen(false)} style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}>×</button>
              </div>
            </div>

            <div style={{ padding: 24 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 12, marginBottom: 20 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setSlotWeekOffset(0)}
                    style={{ background: slotWeekOffset === 0 ? 'rgba(217,111,50,0.92)' : 'rgba(23,32,51,0.92)', boxShadow: 'none' }}
                  >
                    Текущая неделя
                  </button>
                  <button
                    onClick={() => setSlotWeekOffset(1)}
                    style={{ background: slotWeekOffset === 1 ? 'rgba(217,111,50,0.92)' : 'rgba(23,32,51,0.92)', boxShadow: 'none' }}
                  >
                    Следующая неделя
                  </button>
                </div>
                <input
                  type="number"
                  min="15"
                  step="15"
                  value={slotDurationMinutes}
                  onChange={(event) => setSlotDurationMinutes(event.target.value)}
                  placeholder="Длительность, мин"
                />
              </div>

              <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
                {slotDrafts.map((draft, index) => {
                  const dayDate = addDays(slotPlannerWeekStart, index);
                  return (
                    <div
                      key={index}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '180px 1fr 1fr',
                        gap: 10,
                        alignItems: 'center',
                        padding: 14,
                        borderRadius: 16,
                        background: 'rgba(23,32,51,0.04)',
                        border: '1px solid rgba(24,33,47,0.06)',
                      }}
                    >
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, color: '#1f2a3b' }}>
                        <input
                          type="checkbox"
                          checked={draft.enabled}
                          onChange={(event) => handleSlotDraftChange(index, { enabled: event.target.checked })}
                        />
                        {WEEK_DAYS[index]} • {formatDayShort(dayDate)}
                      </label>
                      <input
                        type="time"
                        value={draft.start}
                        disabled={!draft.enabled}
                        onChange={(event) => handleSlotDraftChange(index, { start: event.target.value })}
                      />
                      <input
                        type="time"
                        value={draft.end}
                        disabled={!draft.enabled}
                        onChange={(event) => handleSlotDraftChange(index, { end: event.target.value })}
                      />
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={handleCreateSlots} disabled={saving}>
                  {saving ? 'Сохраняем...' : 'Создать слоты'}
                </button>
                <button
                  onClick={() => setIsSlotPlannerOpen(false)}
                  style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedLesson && (() => {
        const relation = tutorStudents.find((item) => item.id === selectedLesson.tutor_student_id);
        const student = students.find((item) => item.id === relation?.student_id);
        const subject = subjects.find((item) => item.id === relation?.subject_id);
        const topic = topics.find((item) => item.id === selectedLesson.topic_id);
        const selectedWindow = isWindow(selectedLesson);
        const currentStatusColor = selectedWindow ? '#2a6fdb' : statusColor(selectedLesson.conduct_status);
        const canMarkConducted = !selectedWindow && selectedLesson.conduct_status === 'scheduled';
        const canOpenReschedule = !selectedWindow && selectedLesson.conduct_status === 'scheduled';
        const canApproveBooking = !selectedWindow && selectedLesson.conduct_status === 'booking_pending';
        const canRejectBooking = !selectedWindow && selectedLesson.conduct_status === 'booking_pending';
        const canApprovePayment = !selectedWindow && selectedLesson.payment_status === 'payment_pending';
        const canRejectPayment = !selectedWindow && selectedLesson.payment_status === 'payment_pending';
        const canCancelLesson =
          !selectedWindow &&
          selectedLesson.conduct_status !== 'cancelled' &&
          selectedLesson.conduct_status !== 'booking_rejected' &&
          selectedLesson.conduct_status !== 'rescheduled';

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
                      {selectedWindow ? 'Свободный слот' : statusLabel(selectedLesson.conduct_status)}
                    </div>
                    <h3 style={{ fontSize: 28, lineHeight: 1.02, marginBottom: 8 }}>{selectedWindow ? 'Свободный слот' : student?.full_name ?? 'Ученик'}</h3>
                    <p style={{ color: '#5d6778', marginBottom: 0 }}>
                      {selectedWindow
                        ? `Окно репетитора • ${selectedLesson.lesson_date}`
                        : `${subject?.name ?? 'Без предмета'} • ${selectedLesson.lesson_date}`}
                    </p>
                  </div>
                  <button onClick={() => setSelectedLessonId(null)} style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}>×</button>
                </div>
              </div>

              <div style={{ padding: 24 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 20 }}>
                  {(selectedWindow
                    ? [
                        ['Дата', selectedLesson.lesson_date],
                        ['Время', `${toTime(selectedLesson.start_time)} - ${toTime(selectedLesson.end_time)}`],
                        ['Тип записи', 'Свободный слот'],
                        ['Статус', 'Доступен для записи'],
                      ]
                    : [
                        ['Дата', selectedLesson.lesson_date],
                        ['Время', `${toTime(selectedLesson.start_time)} - ${toTime(selectedLesson.end_time)}`],
                        ['Тема занятия', topic?.title ?? 'Без темы'],
                        ['Стоимость', `${selectedLesson.cost ?? '—'} ₽`],
                        ['Оплата', paymentLabel(selectedLesson.payment_status)],
                        ['Оценка', selectedLesson.grade ? String(selectedLesson.grade) : 'Не выставлена'],
                        ['ID связки', selectedLesson.tutor_student_id ? String(selectedLesson.tutor_student_id) : '—'],
                      ]
                  ).map(([label, value]) => (
                    <div key={label} style={{ padding: 14, borderRadius: 16, background: 'rgba(23,32,51,0.04)', border: '1px solid rgba(24,33,47,0.06)' }}>
                      <div style={{ fontSize: 13, color: '#768294', marginBottom: 6 }}>{label}</div>
                      <div style={{ fontWeight: 700, color: '#1f2a3b' }}>{value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 14, color: '#687486', marginBottom: 10 }}>Быстрые действия</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    <button
                      onClick={() => {
                        setIsEditingLesson((prev) => !prev);
                        setIsReschedulingLesson(false);
                      }}
                      style={{ background: isEditingLesson ? 'rgba(23,32,51,0.92)' : '#d96f32', boxShadow: 'none' }}
                    >
                      {isEditingLesson ? 'Скрыть редактирование' : 'Редактировать'}
                    </button>
                    {canMarkConducted && (
                      <button onClick={() => handleLessonPatch(selectedLesson.id, { conduct_status: 'conducted' })}>
                        Проведено
                      </button>
                    )}
                    {canOpenReschedule && (
                      <button
                        onClick={() => {
                          setIsReschedulingLesson((prev) => !prev);
                          setIsEditingLesson(false);
                        }}
                        style={{ background: isReschedulingLesson ? '#7b61c8' : 'rgba(23,32,51,0.92)', boxShadow: 'none' }}
                      >
                        {isReschedulingLesson ? 'Скрыть перенос' : 'Перенести'}
                      </button>
                    )}
                    {canApproveBooking && (
                      <button
                        onClick={() => handleBookingDecision(selectedLesson.id, true)}
                        style={{ background: '#2f7d63', boxShadow: 'none' }}
                      >
                        Подтвердить запись
                      </button>
                    )}
                    {canRejectBooking && (
                      <button
                        onClick={() => handleBookingDecision(selectedLesson.id, false)}
                        style={{ background: '#a63f3b', boxShadow: 'none' }}
                      >
                        Отклонить запись
                      </button>
                    )}
                    {canApprovePayment && (
                      <button
                        onClick={() => handlePaymentDecision(selectedLesson.id, true)}
                        style={{ background: '#2f7d63', boxShadow: 'none' }}
                      >
                        Подтвердить оплату
                      </button>
                    )}
                    {canRejectPayment && (
                      <button
                        onClick={() => handlePaymentDecision(selectedLesson.id, false)}
                        style={{ background: '#a63f3b', boxShadow: 'none' }}
                      >
                        Отклонить оплату
                      </button>
                    )}
                    {selectedWindow && (
                      <button
                        onClick={() => handleLessonDelete(selectedLesson)}
                        style={{ background: '#a63f3b', boxShadow: 'none' }}
                      >
                        Удалить слот
                      </button>
                    )}
                    {canCancelLesson && (
                      <button
                        onClick={() => handleLessonPatch(selectedLesson.id, { conduct_status: 'cancelled' })}
                        style={{ background: '#a63f3b', boxShadow: 'none' }}
                      >
                        Отменить занятие
                      </button>
                    )}
                  </div>
                </div>

                {isEditingLesson && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 14, color: '#687486', marginBottom: 10 }}>
                      {selectedWindow ? 'Редактирование свободного слота' : 'Редактирование занятия'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
                      <input type="date" value={editLessonDate} onChange={(event) => setEditLessonDate(event.target.value)} />
                      {!selectedWindow && (
                        <input type="number" value={editCost} onChange={(event) => setEditCost(event.target.value)} placeholder="Стоимость" />
                      )}
                      <input type="time" value={editStartTime} onChange={(event) => setEditStartTime(event.target.value)} />
                      <input type="time" value={editEndTime} onChange={(event) => setEditEndTime(event.target.value)} />
                    </div>
                    {!selectedWindow && (
                      <select
                        value={editTopicId}
                        onChange={(event) => setEditTopicId(event.target.value)}
                        style={{ marginBottom: 12 }}
                      >
                        <option value="">Без темы</option>
                        {availableEditTopics.map((topic) => (
                          <option key={topic.id} value={topic.id}>
                            {topic.title} • {formatTopicLevels(topic.study_level)}
                          </option>
                        ))}
                      </select>
                    )}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button onClick={handleLessonDetailsSave}>Сохранить изменения</button>
                      <button
                        onClick={() => {
                          setEditLessonDate(selectedLesson.lesson_date);
                          setEditStartTime(toTime(selectedLesson.start_time));
                          setEditEndTime(toTime(selectedLesson.end_time));
                          setEditCost(selectedLesson.cost ? String(selectedLesson.cost) : '');
                          setEditTopicId(selectedLesson.topic_id ? String(selectedLesson.topic_id) : '');
                          setIsEditingLesson(false);
                        }}
                        style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                )}

                {isReschedulingLesson && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 14, color: '#687486', marginBottom: 10 }}>Перенос занятия</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
                      <input type="date" value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} />
                      <div />
                      <input type="time" value={rescheduleStartTime} onChange={(event) => setRescheduleStartTime(event.target.value)} />
                      <input type="time" value={rescheduleEndTime} onChange={(event) => setRescheduleEndTime(event.target.value)} />
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button onClick={handleLessonReschedule} style={{ background: '#7b61c8', boxShadow: 'none' }}>
                        Подтвердить перенос
                      </button>
                      <button
                        onClick={() => {
                          setRescheduleDate(selectedLesson.lesson_date);
                          setRescheduleStartTime(toTime(selectedLesson.start_time));
                          setRescheduleEndTime(toTime(selectedLesson.end_time));
                          setIsReschedulingLesson(false);
                        }}
                        style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                )}

                {!selectedWindow && (
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
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
