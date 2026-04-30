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
import { lessonDate as toLessonDateStr, lessonStartTime as toStartTime, lessonEndTime as toEndTime, lessonStartMinutes, lessonEndMinutes, buildLocalIso } from '../utils/lessonTime';

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

const DEFAULT_GRID_START_HOUR = 8;
const DEFAULT_GRID_END_HOUR = 22;
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

function getDurationHours(startTime: string, endTime: string) {
  const minutes = Math.max(0, toMinutes(endTime) - toMinutes(startTime));
  return minutes / 60;
}

function calculateLessonCost(rate: number, startTime: string, endTime: string) {
  return Math.round(rate * getDurationHours(startTime, endTime));
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
    toLessonDateStr(first) === toLessonDateStr(second) &&
    lessonStartMinutes(first) < lessonEndMinutes(second) &&
    lessonEndMinutes(first) > lessonStartMinutes(second)
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

function layoutTimelineLessons(items: Lesson[], startHour: number, hourHeight: number) {
  const sorted = [...items].sort((a, b) => {
    const startDiff = lessonStartMinutes(a) - lessonStartMinutes(b);
    if (startDiff !== 0) return startDiff;
    return lessonEndMinutes(b) - lessonEndMinutes(a);
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
    const start = lessonStartMinutes(lesson) - startHour * 60;
    const end = lessonEndMinutes(lesson) - startHour * 60;

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
      top: (start / 60) * hourHeight,
      height: Math.max(((end - start) / 60) * hourHeight, 44),
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
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === 'undefined' ? 900 : window.innerHeight
  );
  const [selectedTutorStudentId, setSelectedTutorStudentId] = useState('');
  const [lessonDate, setLessonDate] = useState('');
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [cost, setCost] = useState('');
  const [newTopicId, setNewTopicId] = useState('');
  const [isCreateLessonOpen, setIsCreateLessonOpen] = useState(false);
  const [isSlotPlannerOpen, setIsSlotPlannerOpen] = useState(false);
  const [slotWeekOffset, setSlotWeekOffset] = useState<0 | 1>(0);
  const [slotDurationMinutes, setSlotDurationMinutes] = useState('60');
  const [slotDrafts, setSlotDrafts] = useState<SlotDayDraft[]>(() => createDefaultSlotDrafts());
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null);
  const [selectedMonthDay, setSelectedMonthDay] = useState<string | null>(null);
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
  const [tutorNoteDraft, setTutorNoteDraft] = useState('');
  const [lessonGradeCommentDraft, setLessonGradeCommentDraft] = useState('');
  const [lessonCommentSaving, setLessonCommentSaving] = useState(false);
  const [showLessonNoteEditor, setShowLessonNoteEditor] = useState(false);

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

  useEffect(() => {
    const handleResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
    () => visibleLessons.filter((lesson) => toLessonDateStr(lesson) === formatDate(dayDate)),
    [dayDate, visibleLessons]
  );

  const weekLessonsByDay = useMemo(
    () => weekDays.map((day) => visibleLessons.filter((lesson) => toLessonDateStr(lesson) === formatDate(day))),
    [visibleLessons, weekDays]
  );

  const lessonsByDate = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    for (const lesson of visibleLessons) {
      const dateKey = toLessonDateStr(lesson);
      const existing = map.get(dateKey) ?? [];
      existing.push(lesson);
      map.set(dateKey, existing);
    }
    return map;
  }, [visibleLessons]);

  const selectedMonthDayLessons = useMemo(() => {
    if (!selectedMonthDay) return [];
    return [...(lessonsByDate.get(selectedMonthDay) ?? [])].sort(
      (a, b) => lessonStartMinutes(a) - lessonStartMinutes(b)
    );
  }, [lessonsByDate, selectedMonthDay]);
  const selectedMonthDayDate = selectedMonthDay ? new Date(`${selectedMonthDay}T00:00:00`) : null;

  const timelineWindow = useMemo(() => {
    const timelineLessons =
      mode === 'day'
        ? dayLessons
        : mode === 'week'
          ? weekLessonsByDay.flat()
          : [];

    if (!timelineLessons.length) {
      return { startHour: DEFAULT_GRID_START_HOUR, endHour: DEFAULT_GRID_END_HOUR };
    }

    const minStart = Math.min(...timelineLessons.map((lesson) => lessonStartMinutes(lesson)));
    const maxEnd = Math.max(...timelineLessons.map((lesson) => lessonEndMinutes(lesson)));
    const startHour = Math.max(0, Math.floor(minStart / 60) - 1);
    const endHour = Math.min(24, Math.ceil(maxEnd / 60) + 1);

    return {
      startHour,
      endHour: Math.max(startHour + 2, endHour),
    };
  }, [dayLessons, mode, weekLessonsByDay]);
  const availableTimelineHeight = useMemo(() => {
    if (mode === 'month') {
      return 0;
    }

    return Math.max(420, viewportHeight - 190);
  }, [mode, viewportHeight]);

  const timelineHourHeight = useMemo(() => {
    const hours = Math.max(1, timelineWindow.endHour - timelineWindow.startHour);
    return Math.max(24, Math.floor(availableTimelineHeight / hours));
  }, [availableTimelineHeight, timelineWindow.endHour, timelineWindow.startHour]);

  const timelineHeight = useMemo(
    () => Math.max(0, (timelineWindow.endHour - timelineWindow.startHour) * timelineHourHeight),
    [timelineHourHeight, timelineWindow.endHour, timelineWindow.startHour]
  );

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
      setTutorNoteDraft('');
      setLessonGradeCommentDraft('');
      setShowLessonNoteEditor(false);
      return;
    }

    setIsEditingLesson(false);
    setIsReschedulingLesson(false);
    setEditLessonDate(toLessonDateStr(selectedLesson));
    setEditStartTime(toTime(toStartTime(selectedLesson)));
    setEditEndTime(toTime(toEndTime(selectedLesson)));
    setEditCost(selectedLesson.cost ? String(selectedLesson.cost) : '');
    setEditTopicId(selectedLesson.topic_id ? String(selectedLesson.topic_id) : '');
    setRescheduleDate(toLessonDateStr(selectedLesson));
    setRescheduleStartTime(toTime(toStartTime(selectedLesson)));
    setRescheduleEndTime(toTime(toEndTime(selectedLesson)));
    setTutorNoteDraft(selectedLesson.tutor_note ?? '');
    setLessonGradeCommentDraft(selectedLesson.grade_comment ?? '');
    setShowLessonNoteEditor(Boolean(selectedLesson.tutor_note?.trim()));
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
    const nextCost = calculateLessonCost(selected.rate, `${startTime}:00`, `${endTime}:00`);
    setCost(nextCost > 0 ? String(nextCost) : '');
  }, [endTime, selectedTutorStudentId, startTime, tutorStudentOptions]);

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
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
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
        starts_at: buildLocalIso(lessonDate, startTime),
        ends_at: buildLocalIso(lessonDate, endTime),
        cost: Number(cost),
        topic_id: newTopicId ? Number(newTopicId) : undefined,
      });
      setLessons((prev) =>
        [...prev, created].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      );
      setSelectedLessonId(created.id);
      setIsCreateLessonOpen(false);
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

    const payloads: Array<{ starts_at: string; ends_at: string; label: string }> = [];
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
          starts_at: buildLocalIso(slotDate, `${slotStartHours}:${slotStartMinutes}`),
          ends_at: buildLocalIso(slotDate, `${slotEndHours}:${slotEndMinutes}`),
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
            starts_at: payload.starts_at,
            ends_at: payload.ends_at,
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
        .filter((item): item is { result: PromiseRejectedResult; payload: { starts_at: string; ends_at: string; label: string } } => item.result.status === 'rejected');

      setLessons((prev) =>
        [...prev, ...created].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
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
    payload: {
      conduct_status?: ConductStatus;
      payment_status?: PaymentStatus;
      grade?: number;
      tutor_note?: string | null;
      grade_comment?: string | null;
    }
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
        starts_at: buildLocalIso(editLessonDate, editStartTime),
        ends_at: buildLocalIso(editLessonDate, editEndTime),
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
        new_starts_at: buildLocalIso(rescheduleDate, rescheduleStartTime),
        new_ends_at: buildLocalIso(rescheduleDate, rescheduleEndTime),
      });

      const updatedOriginal = await updateLesson(selectedLesson.id, {
        conduct_status: 'rescheduled',
      });

      setLessons((prev) =>
        [...prev.filter((lesson) => lesson.id !== movedLesson.id && lesson.id !== updatedOriginal.id), updatedOriginal, movedLesson]
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
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

  const renderLessonCard = (lesson: Lesson, density: 'normal' | 'compact' | 'tiny' | 'week' = 'normal') => {
    const relation = tutorStudents.find((item) => item.id === lesson.tutor_student_id);
    const student = students.find((item) => item.id === relation?.student_id);
    const subject = subjects.find((item) => item.id === relation?.subject_id);
    const topic = topics.find((item) => item.id === lesson.topic_id);
    const windowCard = isWindow(lesson);
    const accent = windowCard ? '#2a6fdb' : subject?.color || '#d96f32';
    const state = statusColor(lesson.conduct_status);
    const weekCard = density === 'week';
    const compact = density !== 'normal';
    const tiny = density === 'tiny';
    const title = windowCard ? 'Свободный слот' : student?.full_name ?? 'Ученик';
    const subtitle = windowCard
      ? 'Окно для записи'
      : `${subject?.name ?? 'Без предмета'} • ${lesson.cost ?? '—'} ₽`;
    const textClamp = tiny ? 1 : weekCard ? 3 : compact ? 2 : 2;

    return (
      <div
        key={lesson.id}
        onClick={() => setSelectedLessonId(lesson.id)}
        title={`${toTime(toStartTime(lesson))} - ${toTime(toEndTime(lesson))} • ${title}${windowCard ? '' : ` • ${subtitle}`}`}
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          gap: tiny ? 1 : weekCard ? 2 : compact ? 2 : 3,
          padding: tiny ? '3px 5px' : weekCard ? '5px 5px' : compact ? '5px 7px' : '8px 9px',
          borderRadius: compact ? 10 : 12,
          background: windowCard ? '#2a6fdb' : state,
          color: '#fff',
          boxShadow: compact ? 'none' : `0 8px 18px ${state}24`,
          overflow: 'hidden',
          cursor: 'pointer',
          border: selectedLessonId === lesson.id ? `2px solid ${accent}` : `1px solid ${accent}`,
        }}
      >
        <div style={{ fontSize: tiny ? 10 : weekCard ? 11.5 : compact ? 11 : 12, fontWeight: 900, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>
          {toTime(toStartTime(lesson))} - {toTime(toEndTime(lesson))}
        </div>
        <div
          style={{
            fontWeight: 800,
            fontSize: tiny ? 10 : weekCard ? 11.5 : compact ? 11 : 12,
            lineHeight: weekCard ? 1.08 : 1.08,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: textClamp,
            WebkitBoxOrient: 'vertical',
            wordBreak: 'break-word',
          }}
        >
          {title}
        </div>
        {weekCard && !windowCard && (
          <div
            style={{
              fontSize: 10,
              opacity: 0.92,
              lineHeight: 1.12,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              wordBreak: 'break-word',
              flexShrink: 0,
            }}
          >
            {(subject?.name ?? 'Без предмета')} • {lesson.cost ?? '—'} ₽
          </div>
        )}
        {!tiny && !weekCard && (
          <div style={{ fontSize: compact ? 9 : 11, opacity: 0.92, lineHeight: 1.12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>
            {subtitle}
          </div>
        )}
        {!windowCard && topic && density === 'normal' && (
          <div
            style={{
              fontSize: 10,
              opacity: 0.86,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            Тема: {topic.title}
          </div>
        )}
      </div>
    );
  };

  const handleLessonCommentsSave = async () => {
    if (!selectedLesson || isWindow(selectedLesson)) {
      return;
    }

    if (
      (selectedLesson.tutor_note ?? '') === tutorNoteDraft.trim() &&
      (selectedLesson.grade_comment ?? '') === lessonGradeCommentDraft.trim()
    ) {
      return;
    }

    try {
      setLessonCommentSaving(true);
      const updated = await updateLesson(selectedLesson.id, {
        tutor_note: tutorNoteDraft.trim() || null,
        grade_comment: lessonGradeCommentDraft.trim() || null,
      });
      upsertLesson(updated);
      setSelectedLessonId(updated.id);
    } catch (error) {
      console.error('Ошибка сохранения комментариев к занятию:', error);
      alert(getApiErrorMessage(error, 'Не удалось сохранить заметки к занятию'));
    } finally {
      setLessonCommentSaving(false);
    }
  };

  const renderTimeLabels = () => (
    <div style={{ position: 'relative', height: timelineHeight }}>
      {Array.from({ length: timelineWindow.endHour - timelineWindow.startHour + 1 }, (_, index) => {
        const hour = timelineWindow.startHour + index;
        if (hour > timelineWindow.endHour) return null;
        return (
          <div
            key={hour}
            style={{
              position: 'absolute',
              top: Math.max(4, Math.min(index * timelineHourHeight - 8, timelineHeight - 18)),
              fontSize: 11,
              lineHeight: 1,
              color: '#748093',
            }}
          >
            {String(hour).padStart(2, '0')}:00
          </div>
        );
      })}
    </div>
  );

  const renderTimelineColumn = (items: Lesson[], narrow = false) => (
    <div
      style={{
        position: 'relative',
        height: timelineHeight,
        borderRadius: 0,
        background:
          `repeating-linear-gradient(to bottom, rgba(23,32,51,0.06) 0, rgba(23,32,51,0.06) 1px, transparent 1px, transparent ${timelineHourHeight}px)`,
        borderRight: '1px solid rgba(24,33,47,0.09)',
        borderBottom: '1px solid rgba(24,33,47,0.09)',
        overflow: 'hidden',
      }}
    >
      {layoutTimelineLessons(items, timelineWindow.startHour, timelineHourHeight).map(({ lesson, top, height, column, columns }) => {
        const laneGap = 6;
        const width = `calc((100% - 16px - ${(columns - 1) * laneGap}px) / ${columns})`;
        const left = `calc(8px + ${column} * (((100% - 16px - ${(columns - 1) * laneGap}px) / ${columns}) + ${laneGap}px))`;

        const cardHeight = Math.max(height - 6, 30);
        const density = narrow ? 'week' : cardHeight < 42 ? 'tiny' : cardHeight < 64 ? 'compact' : 'normal';

        return (
          <div
            key={lesson.id}
            style={{ position: 'absolute', top: top + 3, left, width, height: cardHeight, zIndex: column + 1 }}
          >
            {renderLessonCard(lesson, density)}
          </div>
        );
      })}
    </div>
  );

  const renderCalendarBody = () => {
    if (mode === 'day') {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '58px minmax(0, 1fr)', gap: 0, width: '100%', minWidth: 0, border: '1px solid rgba(24,33,47,0.1)', borderRadius: 14, overflow: 'hidden' }}>
          <div />
          <div style={{ textAlign: 'center', padding: '8px 6px', background: 'rgba(23,32,51,0.05)', fontWeight: 800, borderLeft: '1px solid rgba(24,33,47,0.09)', borderBottom: '1px solid rgba(24,33,47,0.09)' }}>
            {formatDayLong(dayDate)}
          </div>
          {renderTimeLabels()}
          {renderTimelineColumn(dayLessons)}
        </div>
      );
    }

    if (mode === 'week') {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '58px repeat(7, minmax(0, 1fr))', gap: 0, width: '100%', minWidth: 0, border: '1px solid rgba(24,33,47,0.1)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ background: 'rgba(23,32,51,0.04)', borderBottom: '1px solid rgba(24,33,47,0.09)' }} />
          {weekDays.map((day, index) => (
            <div key={formatDate(day)} style={{ textAlign: 'center', padding: '6px 4px', background: 'rgba(23,32,51,0.05)', minWidth: 0, borderLeft: '1px solid rgba(24,33,47,0.09)', borderBottom: '1px solid rgba(24,33,47,0.09)' }}>
              <div style={{ fontWeight: 800 }}>{WEEK_DAYS[index]}</div>
              <div style={{ color: '#667386', fontSize: 12 }}>{formatDayShort(day)}</div>
            </div>
          ))}
          {renderTimeLabels()}
          {weekLessonsByDay.map((items, index) => (
            <div key={index} style={{ minWidth: 0 }}>{renderTimelineColumn(items, true)}</div>
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
                  <button
                    type="button"
                    title="Показать все записи дня"
                    onClick={() => setSelectedMonthDay(key)}
                    style={{
                      minWidth: 28,
                      height: 28,
                      padding: 0,
                      borderRadius: 999,
                      background: isToday ? 'rgba(217,111,50,0.12)' : 'transparent',
                      color: inMonth ? '#1e293b' : '#98a1af',
                      boxShadow: 'none',
                      fontWeight: 800,
                    }}
                  >
                    {day.getDate()}
                  </button>
                  {items.length > 0 && (
                    <div style={{ padding: '4px 8px', borderRadius: 999, background: 'rgba(23,32,51,0.08)', color: '#4c5a70', fontSize: 12, fontWeight: 700 }}>
                      {items.length}
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {items.slice(0, 3).map((lesson) => renderLessonCard(lesson, 'compact'))}
                  {items.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setSelectedMonthDay(key)}
                      style={{
                        justifySelf: 'start',
                        padding: '5px 8px',
                        borderRadius: 999,
                        background: 'rgba(23,32,51,0.08)',
                        color: '#435066',
                        boxShadow: 'none',
                        fontSize: 12,
                      }}
                    >
                      Ещё {items.length - 3} записей
                    </button>
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
      <div style={{ display: 'grid', gap: 12 }}>
        <section style={{ ...panelStyle, padding: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
              <button title="Предыдущий период" onClick={() => moveRange(-1)} style={{ minWidth: 38, width: 38, height: 38, padding: 0, borderRadius: 999, background: 'rgba(23,32,51,0.92)', boxShadow: 'none', fontSize: 20, display: 'inline-grid', placeItems: 'center' }}>
                ‹
              </button>
              <button onClick={() => setAnchorDate(atMidnight(new Date()))} style={{ background: 'rgba(217,111,50,0.92)', boxShadow: 'none', padding: '9px 12px' }}>Сегодня</button>
              <button title="Следующий период" onClick={() => moveRange(1)} style={{ minWidth: 38, width: 38, height: 38, padding: 0, borderRadius: 999, background: 'rgba(23,32,51,0.92)', boxShadow: 'none', fontSize: 20, display: 'inline-grid', placeItems: 'center' }}>
                ›
              </button>
              <div style={{ fontWeight: 900, color: '#1f2a3b', fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {rangeLabel}
              </div>
              <span style={{ color: '#687486', fontSize: 12, whiteSpace: 'nowrap' }}>
                {visibleLessons.length} записей
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  color: '#324055',
                  fontSize: 12,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                <input
                  type="checkbox"
                  checked={showRescheduledLessons}
                  onChange={(event) => setShowRescheduledLessons(event.target.checked)}
                  style={{ width: 14, height: 14 }}
                />
                Перенесённые/отменённые
              </label>
              <select
                value={mode}
                title="Режим расписания"
                onChange={(event) => setMode(event.target.value as CalendarMode)}
                style={{
                  width: 146,
                  height: 40,
                  minHeight: 40,
                  padding: '0 34px 0 12px',
                  lineHeight: '40px',
                  fontSize: 14,
                  boxSizing: 'border-box',
                  display: 'block',
                }}
              >
                <option value="day">День</option>
                <option value="week">Неделя</option>
                <option value="month">Месяц</option>
              </select>
              <button title="Создать занятие" type="button" onClick={() => setIsCreateLessonOpen(true)} style={{ minWidth: 38, width: 38, height: 38, padding: 0, borderRadius: 999, fontSize: 20, display: 'inline-grid', placeItems: 'center' }}>
                +
              </button>
              <button title="Создать свободные слоты" type="button" onClick={() => setIsSlotPlannerOpen(true)} style={{ minWidth: 38, width: 38, height: 38, padding: 0, borderRadius: 999, background: 'rgba(42,111,219,0.92)', boxShadow: 'none', fontSize: 18, display: 'inline-grid', placeItems: 'center' }}>
                □
              </button>
            </div>
          </div>

          <div style={{ width: '100%', minWidth: 0, overflow: 'hidden' }}>
            {loading ? <p style={{ color: '#687486', marginBottom: 0 }}>Загрузка расписания...</p> : renderCalendarBody()}
          </div>
        </section>
      </div>

      {selectedMonthDay && selectedMonthDayDate && (
        <div
          onClick={() => setSelectedMonthDay(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.34)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 24, zIndex: 1000 }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{ width: 'min(560px, 100%)', maxHeight: '82vh', overflowY: 'auto', borderRadius: 24, background: 'rgba(255,255,255,0.98)', boxShadow: '0 28px 70px rgba(15, 23, 42, 0.22)', border: '1px solid rgba(24,33,47,0.08)' }}
          >
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid rgba(24,33,47,0.08)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: 22, lineHeight: 1.05, marginBottom: 6 }}>
                  {selectedMonthDayDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })}
                </h3>
                <div style={{ color: '#687486', fontSize: 13 }}>
                  {selectedMonthDayLessons.length} записей
                </div>
              </div>
              <button type="button" title="Закрыть" onClick={() => setSelectedMonthDay(null)} style={{ minWidth: 40, width: 40, height: 40, padding: 0, borderRadius: 999, background: 'rgba(23,32,51,0.92)', boxShadow: 'none', fontSize: 22 }}>×</button>
            </div>

            <div style={{ padding: 18, display: 'grid', gap: 10 }}>
              {selectedMonthDayLessons.length === 0 ? (
                <div style={{ color: '#687486' }}>На этот день записей нет.</div>
              ) : (
                selectedMonthDayLessons.map((lesson) => {
                  const relation = tutorStudents.find((item) => item.id === lesson.tutor_student_id);
                  const student = students.find((item) => item.id === relation?.student_id);
                  const subject = subjects.find((item) => item.id === relation?.subject_id);
                  const windowCard = isWindow(lesson);
                  const color = windowCard ? '#2a6fdb' : statusColor(lesson.conduct_status);

                  return (
                    <button
                      key={lesson.id}
                      type="button"
                      onClick={() => {
                        setSelectedLessonId(lesson.id);
                        setSelectedMonthDay(null);
                      }}
                      style={{
                        textAlign: 'left',
                        padding: 14,
                        borderRadius: 16,
                        background: 'rgba(23,32,51,0.03)',
                        border: '1px solid rgba(24,33,47,0.08)',
                        borderLeft: `5px solid ${color}`,
                        boxShadow: 'none',
                        color: '#1f2a3b',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                        <strong>{toTime(toStartTime(lesson))} - {toTime(toEndTime(lesson))}</strong>
                        <span style={{ color: color, fontSize: 12, fontWeight: 800 }}>{statusLabel(lesson.conduct_status)}</span>
                      </div>
                      <div style={{ fontWeight: 800, marginBottom: 4 }}>
                        {windowCard ? 'Свободный слот' : student?.full_name ?? 'Ученик'}
                      </div>
                      <div style={{ color: '#687486', fontSize: 13 }}>
                        {windowCard ? 'Доступен для записи' : `${subject?.name ?? 'Без предмета'} • ${lesson.cost ?? '—'} ₽ • ${paymentLabel(lesson.payment_status)}`}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {isCreateLessonOpen && (
        <div
          onClick={() => setIsCreateLessonOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.34)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 24, zIndex: 1000 }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{ width: 'min(620px, 100%)', borderRadius: 28, background: 'rgba(255,255,255,0.98)', boxShadow: '0 28px 70px rgba(15, 23, 42, 0.22)', border: '1px solid rgba(24,33,47,0.08)', overflow: 'hidden' }}
          >
            <div style={{ padding: '22px 24px 18px', background: 'rgba(217,111,50,0.1)', borderBottom: '1px solid rgba(24,33,47,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ fontSize: 28, lineHeight: 1.02, marginBottom: 8 }}>Создать занятие</h3>
                  <p style={{ color: '#5d6778', marginBottom: 0 }}>Заполни ученика, дату, время и тему занятия. Стоимость посчитается автоматически.</p>
                </div>
                <button onClick={() => setIsCreateLessonOpen(false)} style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}>×</button>
              </div>
            </div>

            <div style={{ padding: 24, display: 'grid', gap: 10 }}>
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
              <input type="number" value={cost} readOnly placeholder="Стоимость" style={{ background: 'rgba(23,32,51,0.04)', color: '#435066' }} />
              <select value={newTopicId} onChange={(event) => setNewTopicId(event.target.value)}>
                <option value="">Без темы</option>
                {availableCreateTopics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.title} • {formatTopicLevels(topic.study_level)}
                  </option>
                ))}
              </select>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                <button onClick={handleCreateLesson} disabled={saving || !tutorStudentOptions.length}>
                  {saving ? 'Сохраняем...' : 'Создать занятие'}
                </button>
                <button onClick={() => setIsCreateLessonOpen(false)} style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}>
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                    title="Текущая неделя"
                    onClick={() => setSlotWeekOffset(0)}
                    style={{ background: slotWeekOffset === 0 ? 'rgba(217,111,50,0.92)' : 'rgba(23,32,51,0.92)', boxShadow: 'none' }}
                  >
                    Текущая
                  </button>
                  <button
                    title="Следующая неделя"
                    onClick={() => setSlotWeekOffset(1)}
                    style={{ background: slotWeekOffset === 1 ? 'rgba(217,111,50,0.92)' : 'rgba(23,32,51,0.92)', boxShadow: 'none' }}
                  >
                    Следующая
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
                    <p style={{ color: '#5d6778', marginBottom: 0, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      {selectedWindow
                        ? `Окно репетитора • ${toLessonDateStr(selectedLesson)} • ${toTime(toStartTime(selectedLesson))} - ${toTime(toEndTime(selectedLesson))}`
                        : `${subject?.name ?? 'Без предмета'} • ${toLessonDateStr(selectedLesson)} • ${toTime(toStartTime(selectedLesson))} - ${toTime(toEndTime(selectedLesson))}`}
                    </p>
                  </div>
                  <button onClick={() => setSelectedLessonId(null)} style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}>×</button>
                </div>
              </div>

              <div style={{ padding: 24 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 20 }}>
                  {(selectedWindow
                    ? [
                        ['Дата', toLessonDateStr(selectedLesson)],
                        ['Время', `${toTime(toStartTime(selectedLesson))} - ${toTime(toEndTime(selectedLesson))}`],
                        ['Тип записи', 'Свободный слот'],
                        ['Статус', 'Доступен для записи'],
                      ]
                    : [
                        ['Занятие', `${toLessonDateStr(selectedLesson)} • ${toTime(toStartTime(selectedLesson))} - ${toTime(toEndTime(selectedLesson))}`],
                        ['Тема занятия', topic?.title ?? 'Без темы'],
                        ['Стоимость', `${selectedLesson.cost ?? '—'} ₽`],
                        ['Оплата', paymentLabel(selectedLesson.payment_status)],
                        ['Оценка', selectedLesson.grade ? String(selectedLesson.grade) : 'Не выставлена'],
                      ]
                  ).map(([label, value]) => (
                    <div key={label} style={{ padding: 14, borderRadius: 16, background: 'rgba(23,32,51,0.04)', border: '1px solid rgba(24,33,47,0.06)' }}>
                      <div style={{ fontSize: 13, color: '#768294', marginBottom: 6 }}>{label}</div>
                      <div style={{ fontWeight: 700, color: '#1f2a3b' }}>{value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    <button
                      title={isEditingLesson ? 'Скрыть редактирование' : 'Редактировать занятие'}
                      onClick={() => {
                        setIsEditingLesson((prev) => !prev);
                        setIsReschedulingLesson(false);
                      }}
                      style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, background: isEditingLesson ? 'rgba(23,32,51,0.92)' : '#d96f32', boxShadow: 'none', fontSize: 18, display: 'inline-grid', placeItems: 'center' }}
                    >
                      ✎
                    </button>
                    {canMarkConducted && (
                      <button title="Отметить проведённым" onClick={() => handleLessonPatch(selectedLesson.id, { conduct_status: 'conducted' })} style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, background: '#2f7d63', boxShadow: 'none', fontSize: 18, display: 'inline-grid', placeItems: 'center' }}>
                        ✓
                      </button>
                    )}
                    {canOpenReschedule && (
                      <button
                        title={isReschedulingLesson ? 'Скрыть перенос' : 'Перенести занятие'}
                        onClick={() => {
                          setIsReschedulingLesson((prev) => !prev);
                          setIsEditingLesson(false);
                        }}
                        style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, background: isReschedulingLesson ? '#7b61c8' : 'rgba(23,32,51,0.92)', boxShadow: 'none', fontSize: 18, display: 'inline-grid', placeItems: 'center' }}
                      >
                        ↻
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
                        title="Удалить слот"
                        onClick={() => handleLessonDelete(selectedLesson)}
                        style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, background: '#a63f3b', boxShadow: 'none', fontSize: 18, display: 'inline-grid', placeItems: 'center' }}
                      >
                        🗑
                      </button>
                    )}
                    {canCancelLesson && (
                      <button
                        title="Отменить занятие"
                        onClick={() => handleLessonPatch(selectedLesson.id, { conduct_status: 'cancelled' })}
                        style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, background: '#a63f3b', boxShadow: 'none', fontSize: 18, display: 'inline-grid', placeItems: 'center' }}
                      >
                        ⊘
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
                          setEditLessonDate(toLessonDateStr(selectedLesson));
                          setEditStartTime(toTime(toStartTime(selectedLesson)));
                          setEditEndTime(toTime(toEndTime(selectedLesson)));
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
                          setRescheduleDate(toLessonDateStr(selectedLesson));
                          setRescheduleStartTime(toTime(toStartTime(selectedLesson)));
                          setRescheduleEndTime(toTime(toEndTime(selectedLesson)));
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
                  <div style={{ display: 'grid', gap: 14 }}>
                    <div style={{ display: 'grid', gap: 12, padding: 16, borderRadius: 18, background: 'rgba(23,32,51,0.035)', border: '1px solid rgba(24,33,47,0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ fontSize: 14, color: '#687486' }}>Оценка за занятие</div>
                        <button
                          type="button"
                          title={
                            showLessonNoteEditor
                              ? 'Скрыть заметку'
                              : selectedLesson.tutor_note?.trim()
                                ? 'Редактировать заметку'
                                : 'Добавить личную заметку'
                          }
                          onClick={() => setShowLessonNoteEditor((prev) => !prev)}
                          style={{
                            minWidth: 36,
                            width: 36,
                            height: 36,
                            padding: 0,
                            borderRadius: 999,
                            background: showLessonNoteEditor ? 'rgba(23,32,51,0.92)' : '#d96f32',
                            boxShadow: 'none',
                            fontSize: 18,
                            display: 'inline-grid',
                            placeItems: 'center',
                          }}
                        >
                          {selectedLesson.tutor_note?.trim() ? '✎' : '+'}
                        </button>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
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

                      {!showLessonNoteEditor && selectedLesson.tutor_note?.trim() && (
                        <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(217,111,50,0.08)', border: '1px solid rgba(217,111,50,0.16)' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#9b531f', marginBottom: 6 }}>Личная заметка</div>
                          <div style={{ color: '#364152', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{selectedLesson.tutor_note}</div>
                        </div>
                      )}

                      {showLessonNoteEditor && (
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={{ fontSize: 13, color: '#687486' }}>Личная заметка репетитора</span>
                          <textarea
                            value={tutorNoteDraft}
                            onChange={(event) => setTutorNoteDraft(event.target.value)}
                            rows={3}
                            placeholder="Заметка видна только репетитору"
                            style={{ resize: 'vertical' }}
                          />
                        </label>
                      )}

                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={{ fontSize: 13, color: '#687486' }}>Комментарий к оценке за занятие</span>
                        <textarea
                          value={lessonGradeCommentDraft}
                          onChange={(event) => setLessonGradeCommentDraft(event.target.value)}
                          rows={2}
                          placeholder="Короткий комментарий к оценке"
                          style={{ resize: 'vertical' }}
                        />
                      </label>

                      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <button
                          type="button"
                          onClick={handleLessonCommentsSave}
                          disabled={
                            lessonCommentSaving ||
                            (
                              (selectedLesson.tutor_note ?? '') === tutorNoteDraft.trim() &&
                              (selectedLesson.grade_comment ?? '') === lessonGradeCommentDraft.trim()
                            )
                          }
                          style={{ boxShadow: 'none' }}
                        >
                          {lessonCommentSaving ? 'Сохраняем...' : 'Сохранить заметки'}
                        </button>
                      </div>
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
