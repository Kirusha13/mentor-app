import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, CalendarDays, Check, Pencil, Trash2, Wallet } from 'lucide-react';
import {
  approveBooking,
  approveReschedule,
  confirmPayment,
  createLesson,
  deleteLesson,
  getLessons,
  rejectBooking,
  rejectReschedule,
  rescheduleLesson,
  updateLesson,
  type ConductStatus,
  type Lesson,
  type PaymentStatus,
} from '../api/lessons';
import { getDay, getWindows, saveDay, type ComputedWindow, type DayWindow } from '../api/availability';
import { getStudents, type Student } from '../api/students';
import { getSubjects, type Subject } from '../api/subjects';
import { getTopics, type TheoryTopic } from '../api/topics';
import { getTutorLevels, type TutorLevel } from '../api/tutorLevels';
import { getTutorStudents, type TutorStudent } from '../api/tutorStudents';
import { getApiErrorCode, getApiErrorMessage } from '../utils/apiError';
import { formatTopicLevels, topicMatchesStudentLevel } from '../utils/studyLevel';
import { useToast } from '../components/Toast';
import { useFieldErrors, FieldError, type FieldRules } from '../components/formValidation';
import { Modal } from '../components/Modal';
import { DateField } from '../components/DateField';
import {
  lessonDate as toLessonDateStr,
  lessonDateRu,
  lessonStartTime as toStartTime,
  lessonEndTime as toEndTime,
  lessonStartMinutes,
  lessonEndMinutes,
  buildLocalIso,
  buildLocalDayStartIso,
  buildLocalDayEndIso,
} from '../utils/lessonTime';

type CalendarMode = 'day' | 'week' | 'month';
type LessonCardViewMode = 'day' | 'week' | 'month';
type LessonCardDensity = 'standard' | 'compact';

interface DayEditorWindow {
  start: string;
  end: string;
  error?: string;
}

const DEFAULT_GRID_START_HOUR = 8;
const DEFAULT_GRID_END_HOUR = 22;
const TIMELINE_SLOT_MINUTES = 30;
const MIN_EVENT_CARD_HEIGHT = 86;
const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function dayEditorTimeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function validateDayEditorWindows(windows: DayEditorWindow[]): DayEditorWindow[] {
  const validated = windows.map((w) => ({ ...w, error: undefined as string | undefined }));

  // Шаг 1: формат каждого окна.
  const formatBad = validated.map((w) => {
    if (!w.start || !w.end) { w.error = 'Укажи начало и конец'; return true; }
    if (dayEditorTimeToMinutes(w.start) >= dayEditorTimeToMinutes(w.end)) {
      w.error = 'Начало должно быть раньше конца';
      return true;
    }
    return false;
  });

  // Шаг 2: пересечения — помечаем ОБА окна пары, чтобы было видно что с чем.
  for (let i = 0; i < validated.length; i++) {
    if (formatBad[i]) continue;
    const a = validated[i];
    for (let j = i + 1; j < validated.length; j++) {
      if (formatBad[j]) continue;
      const b = validated[j];
      const aStart = dayEditorTimeToMinutes(a.start);
      const aEnd = dayEditorTimeToMinutes(a.end);
      const bStart = dayEditorTimeToMinutes(b.start);
      const bEnd = dayEditorTimeToMinutes(b.end);
      if (aStart < bEnd && aEnd > bStart) {
        a.error = 'Пересекается с другим окном — измени одно из них';
        b.error = 'Пересекается с другим окном — измени одно из них';
      }
    }
  }

  return validated;
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
  if (status === 'conducted') return '#4CAF50';
  if (status === 'cancelled') return '#F44336';
  if (status === 'rescheduled') return '#FF9800';
  if (status === 'reschedule_pending') return '#FF9800';
  if (status === 'reschedule_rejected') return '#F44336';
  if (status === 'booking_pending') return '#9C27B0';
  if (status === 'booking_rejected') return '#F44336';
  return '#2AABEE';
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

function statusShortLabel(status: ConductStatus) {
  if (status === 'conducted') return 'Проведено';
  if (status === 'cancelled') return 'Отмена';
  if (status === 'rescheduled') return 'Перенос';
  if (status === 'reschedule_pending') return 'Ждёт переноса';
  if (status === 'reschedule_rejected') return 'Отклонён';
  if (status === 'booking_pending') return 'Запрос';
  if (status === 'booking_rejected') return 'Отклонён';
  return 'План';
}

function paymentLabel(status: PaymentStatus, covered = false) {
  if (covered && status !== 'paid') return 'Абонемент';
  if (status === 'paid') return 'Оплачено';
  if (status === 'payment_pending') return 'Ожидает подтверждения';
  return 'Не оплачено';
}

function requestTitle(lesson: Lesson) {
  if (lesson.payment_status === 'payment_pending') return 'Подтверждение оплаты';
  if (lesson.conduct_status === 'booking_pending') return 'Запрос на запись';
  if (lesson.conduct_status === 'reschedule_pending') return 'Запрос на перенос';
  return 'Запрос';
}

function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString('ru-RU')} ₽`;
}

function pluralRu(value: number, forms: [string, string, string]) {
  const abs = Math.abs(value) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

function isWindow(lesson: Lesson) {
  return lesson.tutor_student_id == null;
}

function CalendarEventCard({
  lesson,
  student,
  subject,
  topic,
  selected,
  viewMode,
  density,
  onClick,
}: {
  lesson: Lesson;
  student?: Student;
  subject?: Subject;
  topic?: TheoryTopic;
  selected: boolean;
  viewMode: LessonCardViewMode;
  density: LessonCardDensity;
  onClick: () => void;
}) {
  const windowCard = isWindow(lesson);
  const accent = windowCard ? '#2AABEE' : subject?.color || '#2AABEE';
  const state = statusColor(lesson.conduct_status);
  const studentName = windowCard ? '' : student?.full_name ?? 'Ученик';
  const subjectName = windowCard ? '' : subject?.name ?? lesson.subject_name ?? 'Без предмета';
  const costText = windowCard ? '' : `${lesson.cost ?? '—'} ₽`;
  const subjectLine = windowCard ? subjectName : `${subjectName} • ${costText}`;
  const statusText = viewMode === 'month' || density === 'compact' ? statusShortLabel(lesson.conduct_status) : statusLabel(lesson.conduct_status);
  const isCompact = density === 'compact';
  const cardBackground = windowCard
    ? 'linear-gradient(135deg, rgba(226,238,255,0.98), rgba(247,250,255,0.98))'
    : `linear-gradient(135deg, ${state}26, rgba(255,255,255,0.96))`;
  const cardBorderColor = windowCard ? 'rgba(42,171,238,0.34)' : `${state}4a`;
  const badgeBackground = windowCard ? 'rgba(42,171,238,0.18)' : `${state}26`;
  const timeFontSize = isCompact ? 11.5 : 12.5;
  const titleFontSize = isCompact ? 11.5 : 12.5;
  const metaFontSize = isCompact ? 10 : 10.5;
  const statusFontSize = isCompact ? 8.5 : 9.5;
  const titleClamp = viewMode === 'month' || isCompact ? 1 : 2;

  return (
    <div
      key={lesson.id}
      onClick={onClick}
      title={
        windowCard
          ? `Свободный слот • ${toTime(toStartTime(lesson))} - ${toTime(toEndTime(lesson))}`
          : `${toTime(toStartTime(lesson))} - ${toTime(toEndTime(lesson))} • ${studentName} • ${subjectLine} • ${statusLabel(lesson.conduct_status)}`
      }
      style={{
        minHeight: isCompact ? 54 : 72,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        gap: isCompact ? 2 : 4,
        padding: isCompact ? '6px 8px' : '8px 10px',
        borderRadius: 10,
        background: cardBackground,
        color: '#111827',
        boxShadow: isCompact ? '0 10px 22px rgba(15,23,42,0.08)' : '0 14px 28px rgba(15,23,42,0.11)',
        overflow: 'hidden',
        cursor: 'pointer',
        border: selected ? `2px solid ${accent}` : `1px solid ${cardBorderColor}`,
        borderLeft: `5px solid ${state}`,
      }}
    >
      <div style={{ fontSize: timeFontSize, fontWeight: 900, lineHeight: 1.08, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>
        {toTime(toStartTime(lesson))} - {toTime(toEndTime(lesson))}
      </div>
      {windowCard && (
        <div
          style={{
            fontSize: titleFontSize,
            fontWeight: 900,
            lineHeight: 1.12,
            color: '#0f5f89',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          Свободный слот
        </div>
      )}
      {!windowCard && (
        <>
          <div
            style={{
              fontSize: titleFontSize,
              fontWeight: 800,
              lineHeight: 1.12,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: titleClamp,
              WebkitBoxOrient: 'vertical',
              wordBreak: 'break-word',
              flexShrink: 0,
            }}
          >
            {studentName}
          </div>
          <div style={{ fontSize: metaFontSize, color: '#334155', lineHeight: 1.12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>
            {subjectLine}
          </div>
        </>
      )}
      {!windowCard && topic && !isCompact && (
        <div style={{ fontSize: 10, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Тема: {topic.title}
        </div>
      )}
      {!windowCard && (
        <div style={{ marginTop: 'auto', display: 'flex', gap: 5, alignItems: 'center', minHeight: 16, overflow: 'hidden' }}>
          <span style={{ padding: isCompact ? '2px 6px' : '3px 7px', borderRadius: 999, background: badgeBackground, color: state, fontSize: statusFontSize, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', border: `1px solid ${state}30` }}>
            {statusText}
          </span>
        </div>
      )}
    </div>
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

function getTimelineOffsetFromSlots(minutesFromWindowStart: number, slotHeights: number[]) {
  const clampedMinutes = Math.max(0, minutesFromWindowStart);
  const slotIndex = Math.floor(clampedMinutes / TIMELINE_SLOT_MINUTES);
  const slotRemainder = clampedMinutes % TIMELINE_SLOT_MINUTES;
  const fullSlotHeight = slotHeights
    .slice(0, Math.min(slotIndex, slotHeights.length))
    .reduce((sum, height) => sum + height, 0);
  const currentSlotHeight = slotHeights[Math.min(slotIndex, slotHeights.length - 1)] ?? 0;
  return fullSlotHeight + (slotRemainder / TIMELINE_SLOT_MINUTES) * currentSlotHeight;
}

function layoutTimelineLessons(items: Lesson[], startHour: number, slotHeights: number[]) {
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
    const top = getTimelineOffsetFromSlots(start, slotHeights);
    const bottom = getTimelineOffsetFromSlots(end, slotHeights);

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
      top,
      height: Math.max(bottom - top, MIN_EVENT_CARD_HEIGHT),
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
  const navigate = useNavigate();
  const toast = useToast();
  const { errors, validateField, validateAll, clearError, reset } = useFieldErrors();
  const [mode, setMode] = useState<CalendarMode>('week');
  const [anchorDate, setAnchorDate] = useState(() => atMidnight(new Date()));
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [requestLessons, setRequestLessons] = useState<Lesson[]>([]);
  const [tutorStudents, setTutorStudents] = useState<TutorStudent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<TheoryTopic[]>([]);
  const [tutorLevels, setTutorLevels] = useState<TutorLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === 'undefined' ? 900 : window.innerHeight
  );
  const [windows, setWindows] = useState<ComputedWindow[]>([]);
  const [selectedTutorStudentId, setSelectedTutorStudentId] = useState('');
  const [lessonDate, setLessonDate] = useState(() => formatDate(new Date()));
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [cost, setCost] = useState('');
  const [newTopicId, setNewTopicId] = useState('');
  const [isCreateLessonOpen, setIsCreateLessonOpen] = useState(false);
  const [isDayEditorOpen, setIsDayEditorOpen] = useState(false);
  const [dayEditorDate, setDayEditorDate] = useState('');
  const [dayEditorClosed, setDayEditorClosed] = useState(false);
  const [dayEditorWindows, setDayEditorWindows] = useState<DayEditorWindow[]>([]);
  const [dayEditorOverridden, setDayEditorOverridden] = useState(false);
  const [dayEditorSaving, setDayEditorSaving] = useState(false);
  const [dayEditorResult, setDayEditorResult] = useState<{ conflicts: { lesson_id: number; starts_at: string; student_name: string | null }[]; rejected_bookings: number } | null>(null);
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
  const [isRequestsModalOpen, setIsRequestsModalOpen] = useState(false);
  const [processingRequestId, setProcessingRequestId] = useState<number | null>(null);

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

      return true;
    });
  }, [lessons, showRescheduledLessons]);

  const pendingRequests = useMemo(
    () =>
      requestLessons.filter(
        (lesson) =>
          lesson.conduct_status === 'booking_pending' ||
          lesson.conduct_status === 'reschedule_pending' ||
          lesson.payment_status === 'payment_pending'
      ),
    [requestLessons]
  );

  const pendingRequestsWithMeta = useMemo(
    () =>
      pendingRequests.map((lesson) => {
        const relation = tutorStudents.find((item) => item.id === lesson.tutor_student_id);
        const student = students.find((item) => item.id === relation?.student_id);
        const subject = subjects.find((item) => item.id === relation?.subject_id);
        return { lesson, relation, student, subject };
      }),
    [pendingRequests, students, subjects, tutorStudents]
  );

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

  const rangeLessons = useMemo(() => {
    const from = formatDate(range.from);
    const to = formatDate(range.to);
    return visibleLessons.filter((lesson) => {
      const date = toLessonDateStr(lesson);
      return date >= from && date <= to;
    });
  }, [range.from, range.to, visibleLessons]);

  const rangeBookedLessons = useMemo(
    () => rangeLessons.filter((lesson) => lesson.tutor_student_id != null),
    [rangeLessons]
  );

  const rangeMovedLessons = useMemo(
    () =>
      rangeBookedLessons.filter((lesson) =>
        ['rescheduled', 'reschedule_pending', 'cancelled'].includes(lesson.conduct_status)
      ),
    [rangeBookedLessons]
  );

  const rangeExpectedIncome = useMemo(
    () =>
      rangeBookedLessons
        .filter((lesson) => !['cancelled', 'booking_rejected', 'reschedule_rejected'].includes(lesson.conduct_status))
        .reduce((sum, lesson) => sum + Number(lesson.cost ?? 0), 0),
    [rangeBookedLessons]
  );

  const selectedMonthDayLessons = useMemo(() => {
    if (!selectedMonthDay) return [];
    return [...(lessonsByDate.get(selectedMonthDay) ?? [])].sort(
      (a, b) => lessonStartMinutes(a) - lessonStartMinutes(b)
    );
  }, [lessonsByDate, selectedMonthDay]);
  const selectedMonthDayDate = selectedMonthDay ? new Date(`${selectedMonthDay}T00:00:00`) : null;

  // Computed windows grouped by date string for quick lookup in timeline
  const windowsByDate = useMemo(() => {
    const map = new Map<string, ComputedWindow[]>();
    for (const w of windows) {
      const existing = map.get(w.date) ?? [];
      existing.push(w);
      map.set(w.date, existing);
    }
    return map;
  }, [windows]);

  const dayWindows = useMemo(
    () => windowsByDate.get(formatDate(dayDate)) ?? [],
    [dayDate, windowsByDate]
  );

  const weekWindowsByDay = useMemo(
    () => weekDays.map((day) => windowsByDate.get(formatDate(day)) ?? []),
    [weekDays, windowsByDate]
  );

  const timelineWindow = useMemo(() => {
    const timelineLessons =
      mode === 'day'
        ? dayLessons
        : mode === 'week'
          ? weekLessonsByDay.flat()
          : [];

    const timelineWins =
      mode === 'day'
        ? dayWindows
        : mode === 'week'
          ? weekWindowsByDay.flat()
          : [];

    if (!timelineLessons.length && !timelineWins.length) {
      return { startHour: DEFAULT_GRID_START_HOUR, endHour: DEFAULT_GRID_END_HOUR };
    }

    const lessonMins = timelineLessons.map((lesson) => lessonStartMinutes(lesson));
    const lessonMaxes = timelineLessons.map((lesson) => lessonEndMinutes(lesson));
    const winMins = timelineWins.map((w) => toMinutes(w.start_time));
    const winMaxes = timelineWins.map((w) => toMinutes(w.end_time));

    const minStart = Math.min(...lessonMins, ...winMins);
    const maxEnd = Math.max(...lessonMaxes, ...winMaxes);
    const startHour = Math.max(0, Math.floor(minStart / 60) - 1);
    const endHour = Math.min(24, Math.ceil(maxEnd / 60) + 1);

    return {
      startHour,
      endHour: Math.max(startHour + 2, endHour),
    };
  }, [dayLessons, dayWindows, mode, weekLessonsByDay, weekWindowsByDay]);
  const availableTimelineHeight = useMemo(() => {
    if (mode === 'month') {
      return 0;
    }

    return Math.max(500, viewportHeight - 235);
  }, [mode, viewportHeight]);

  const timelineSlotHeights = useMemo(() => {
    const slots = Math.max(1, (timelineWindow.endHour - timelineWindow.startHour) * (60 / TIMELINE_SLOT_MINUTES));
    const baseSlotHeight = Math.max(34, Math.floor(availableTimelineHeight / slots));
    const heights = Array.from({ length: slots }, () => baseSlotHeight);
    const timelineLessons =
      mode === 'day'
        ? dayLessons
        : mode === 'week'
          ? weekLessonsByDay.flat()
          : [];

    for (const lesson of timelineLessons) {
      const startMinutes = lessonStartMinutes(lesson) - timelineWindow.startHour * 60;
      const endMinutes = lessonEndMinutes(lesson) - timelineWindow.startHour * 60;
      const startSlot = Math.max(0, Math.floor(startMinutes / TIMELINE_SLOT_MINUTES));
      const endSlot = Math.min(slots, Math.ceil(endMinutes / TIMELINE_SLOT_MINUTES));
      const span = Math.max(1, endSlot - startSlot);
      const currentHeight = heights.slice(startSlot, endSlot).reduce((sum, height) => sum + height, 0);
      const requiredHeight = MIN_EVENT_CARD_HEIGHT + 8;

      if (currentHeight < requiredHeight) {
        const extraPerSlot = Math.ceil((requiredHeight - currentHeight) / span);
        for (let index = startSlot; index < endSlot; index += 1) {
          heights[index] += extraPerSlot;
        }
      }
    }

    return heights;
  }, [availableTimelineHeight, dayLessons, mode, timelineWindow.endHour, timelineWindow.startHour, weekLessonsByDay]);

  const timelineHeight = useMemo(
    () => timelineSlotHeights.reduce((sum, height) => sum + height, 0),
    [timelineSlotHeights]
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
    if (!isCreateLessonOpen) return;
    setLessonDate(formatDate(new Date()));
  }, [isCreateLessonOpen]);

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
    const loadData = async () => {
      try {
        setLoading(true);
        const dateFrom = buildLocalDayStartIso(formatDate(range.from));
        const dateTo = buildLocalDayEndIso(formatDate(range.to));
        const fromStr = formatDate(range.from);
        const toStr = formatDate(range.to);

        // окна доступности — некритичны: при ошибке страница живёт без них
        const windowsPromise = getWindows(fromStr, toStr).catch((err) => {
          console.error('Не удалось загрузить окна доступности:', err);
          return [] as ComputedWindow[];
        });

        const [lessonData, requestLessonData, tutorStudentData, studentData, subjectData, topicData, levelData, windowData] = await Promise.all([
          getLessons({ date_from: dateFrom, date_to: dateTo }),
          getLessons(),
          getTutorStudents(),
          getStudents(),
          getSubjects(),
          getTopics(),
          getTutorLevels(),
          windowsPromise,
        ]);
        setLessons(lessonData);
        setRequestLessons(requestLessonData);
        setTutorStudents(tutorStudentData);
        setStudents(studentData);
        setSubjects(subjectData);
        setTopics(topicData);
        setTutorLevels(levelData);
        setWindows(windowData);
      } catch (error) {
        console.error('Ошибка загрузки расписания:', error);
        toast.error('Не удалось загрузить расписание');
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
    setRequestLessons((prev) =>
      prev.some((lesson) => lesson.id === updated.id)
        ? prev
            .map((lesson) => (lesson.id === updated.id ? updated : lesson))
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        : [updated, ...prev].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    );
  };

  // Клиентское зеркало серверной проверки накладок (lessons.py:_ensure_lesson_has_no_overlap):
  // предупреждаем до отправки, сервер остаётся источником правды (409).
  const creationConflict = useMemo(() => {
    if (!lessonDate || !startTime || !endTime) return false;
    const ns = new Date(buildLocalIso(lessonDate, startTime)).getTime();
    const ne = new Date(buildLocalIso(lessonDate, endTime)).getTime();
    if (Number.isNaN(ns) || Number.isNaN(ne) || ne <= ns) return false;
    return lessons.some(
      (lesson) =>
        (lesson.conduct_status === 'scheduled' ||
          lesson.conduct_status === 'booking_pending' ||
          lesson.conduct_status === 'reschedule_pending') &&
        new Date(lesson.starts_at).getTime() < ne &&
        new Date(lesson.ends_at).getTime() > ns
    );
  }, [lessonDate, startTime, endTime, lessons]);

  const createLessonRules: FieldRules = {
    selectedTutorStudentId: () => (selectedTutorStudentId ? null : 'Выбери ученика и предмет'),
    lessonDate: () => {
      if (!lessonDate) return 'Укажи дату';
      if (lessonDate < formatDate(new Date())) return 'Дата уже прошла';
      return null;
    },
    startTime: () => {
      if (!startTime) return 'Укажи время начала';
      // прошедший день ловится в правиле даты; здесь — только время сегодняшнего дня
      if (
        lessonDate === formatDate(new Date()) &&
        new Date(buildLocalIso(lessonDate, startTime)).getTime() <= Date.now()
      ) {
        return 'Время уже прошло';
      }
      return null;
    },
    endTime: () =>
      !endTime ? 'Укажи время окончания' : endTime <= startTime ? 'Время конца должно быть позже начала' : null,
    cost: () => (Number(cost) > 0 ? null : 'Стоимость должна быть больше нуля'),
  };

  const handleCreateLesson = async () => {
    if (!validateAll(createLessonRules)) return;

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
      setRequestLessons((prev) =>
        [...prev, created].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      );
      setSelectedLessonId(created.id);
      setIsCreateLessonOpen(false);
      toast.success('Занятие создано');
    } catch (error) {
      console.error('Ошибка создания записи:', error);
      toast.error(getApiErrorMessage(error, 'Не удалось создать занятие'));
    } finally {
      setSaving(false);
    }
  };

  const openDayEditor = async (dateStr: string) => {
    setDayEditorDate(dateStr);
    setDayEditorResult(null);
    setDayEditorSaving(false);
    try {
      const override = await getDay(dateStr);
      setDayEditorOverridden(override.overridden);
      setDayEditorClosed(override.closed);
      setDayEditorWindows(override.windows.map((w) => ({ start: w.start_time.slice(0, 5), end: w.end_time.slice(0, 5) })));
    } catch {
      setDayEditorOverridden(false);
      setDayEditorClosed(false);
      setDayEditorWindows([]);
    }
    setIsDayEditorOpen(true);
  };

  const handleDayEditorSave = async () => {
    const validated = validateDayEditorWindows(dayEditorWindows);
    const hasError = validated.some((w) => w.error);
    if (hasError) {
      setDayEditorWindows(validated);
      return;
    }
    const payload: { closed: boolean; windows: DayWindow[] } = {
      closed: dayEditorClosed,
      windows: dayEditorClosed ? [] : validated.map((w) => ({ start_time: w.start, end_time: w.end })),
    };
    try {
      setDayEditorSaving(true);
      const result = await saveDay(dayEditorDate, payload);
      setDayEditorResult(result);
      // Refetch windows for visible range
      const fromStr = formatDate(range.from);
      const toStr = formatDate(range.to);
      const updated = await getWindows(fromStr, toStr).catch((err) => {
        console.error('Не удалось загрузить окна доступности при рефетче:', err);
        return [] as ComputedWindow[];
      });
      setWindows(updated);
      setDayEditorOverridden(true);
    } catch (error) {
      console.error('Ошибка сохранения дня:', error);
      toast.error(getApiErrorMessage(error, 'Не удалось сохранить расписание дня'));
    } finally {
      setDayEditorSaving(false);
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
        toast.error('У ученика закончились занятия по абонементу. Обнови абонемент и повтори действие.');
        return;
      }

      toast.error(getApiErrorMessage(error, 'Не удалось обновить занятие'));
    }
  };

  const handleBookingDecision = async (lessonId: number, approve: boolean) => {
    try {
      const updated = approve ? await approveBooking(lessonId) : await rejectBooking(lessonId);
      upsertLesson(updated);
      setSelectedLessonId(updated.id);
    } catch (error) {
      console.error('Ошибка обработки запроса на запись:', error);
      toast.error(
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
      toast.error(
        getApiErrorMessage(
          error,
          confirm ? 'Не удалось подтвердить оплату' : 'Не удалось отклонить оплату'
        )
      );
    }
  };

  const handleRequestResolve = async (
    lesson: Lesson,
    action: 'approve-booking' | 'reject-booking' | 'approve-reschedule' | 'reject-reschedule' | 'approve-payment' | 'reject-payment'
  ) => {
    try {
      setProcessingRequestId(lesson.id);
      let updated: Lesson;

      if (action === 'approve-booking') updated = await approveBooking(lesson.id);
      else if (action === 'reject-booking') updated = await rejectBooking(lesson.id);
      else if (action === 'approve-reschedule') updated = await approveReschedule(lesson.id);
      else if (action === 'reject-reschedule') updated = await rejectReschedule(lesson.id);
      else if (action === 'approve-payment') updated = await confirmPayment(lesson.id, { confirm: true });
      else updated = await confirmPayment(lesson.id, { confirm: false });

      upsertLesson(updated);
    } catch (error) {
      console.error('Ошибка обработки запроса:', error);
      toast.error(getApiErrorMessage(error, 'Не удалось обработать запрос'));
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleLessonDelete = async (lesson: Lesson) => {
    try {
      await deleteLesson(lesson.id);
      setLessons((prev) => prev.filter((item) => item.id !== lesson.id));
      setRequestLessons((prev) => prev.filter((item) => item.id !== lesson.id));
      setSelectedLessonId(null);
    } catch (error) {
      console.error('Ошибка удаления записи из расписания:', error);
      toast.error(
        getApiErrorMessage(
          error,
          isWindow(lesson) ? 'Не удалось удалить свободный слот' : 'Не удалось отменить занятие'
        )
      );
    }
  };

  const editLessonRules: FieldRules = {
    editLessonDate: () => (editLessonDate ? null : 'Укажи дату'),
    editStartTime: () => (editStartTime ? null : 'Укажи время начала'),
    editEndTime: () =>
      !editEndTime ? 'Укажи время окончания' : editEndTime <= editStartTime ? 'Время конца должно быть позже начала' : null,
    editCost: () => (isWindow(selectedLesson as Lesson) ? null : Number(editCost) > 0 ? null : 'Стоимость должна быть больше нуля'),
  };

  const handleLessonDetailsSave = async () => {
    if (!selectedLesson) return;
    if (!validateAll(editLessonRules)) return;

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
      toast.error(getApiErrorMessage(error, isWindow(selectedLesson) ? 'Не удалось сохранить слот' : 'Не удалось сохранить изменения занятия'));
    }
  };

  const rescheduleRules: FieldRules = {
    rescheduleDate: () => (rescheduleDate ? null : 'Укажи новую дату'),
    rescheduleStartTime: () => (rescheduleStartTime ? null : 'Укажи время начала'),
    rescheduleEndTime: () =>
      !rescheduleEndTime ? 'Укажи время окончания'
        : rescheduleEndTime <= rescheduleStartTime ? 'Время конца должно быть позже начала' : null,
  };

  const handleLessonReschedule = async () => {
    if (!selectedLesson) return;
    if (!validateAll(rescheduleRules)) return;

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
      setRequestLessons((prev) =>
        [...prev.filter((lesson) => lesson.id !== movedLesson.id && lesson.id !== updatedOriginal.id), updatedOriginal, movedLesson]
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      );

      setSelectedLessonId(movedLesson.id);
      setIsReschedulingLesson(false);
    } catch (error) {
      console.error('Ошибка переноса занятия:', error);
      toast.error(getApiErrorMessage(error, 'Не удалось перенести занятие'));
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

  const renderLessonCard = (lesson: Lesson, viewMode: LessonCardViewMode, density: LessonCardDensity = 'standard') => {
    const relation = tutorStudents.find((item) => item.id === lesson.tutor_student_id);
    const student = students.find((item) => item.id === relation?.student_id);
    const subject = subjects.find((item) => item.id === relation?.subject_id);
    const topic = topics.find((item) => item.id === lesson.topic_id);

    return (
      <CalendarEventCard
        key={lesson.id}
        lesson={lesson}
        student={student}
        subject={subject}
        topic={topic}
        selected={selectedLessonId === lesson.id}
        viewMode={viewMode}
        density={density}
        onClick={() => setSelectedLessonId(lesson.id)}
      />
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
      toast.error(getApiErrorMessage(error, 'Не удалось сохранить заметки к занятию'));
    } finally {
      setLessonCommentSaving(false);
    }
  };

  const getTimelineOffset = (minutesFromWindowStart: number) =>
    getTimelineOffsetFromSlots(minutesFromWindowStart, timelineSlotHeights);

  const renderTimeLabels = () => (
    <div style={{ position: 'relative', height: timelineHeight }}>
      {Array.from({ length: timelineWindow.endHour - timelineWindow.startHour + 1 }, (_, index) => {
        const hour = timelineWindow.startHour + index;
        if (hour > timelineWindow.endHour) return null;
        const top = getTimelineOffset(index * 60);
        return (
          <div
            key={hour}
            style={{
              position: 'absolute',
              top: Math.max(4, Math.min(top - 8, timelineHeight - 18)),
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

  const renderTimelineColumn = (items: Lesson[], viewMode: LessonCardViewMode, colWindows: ComputedWindow[] = []) => (
    <div
      style={{
        position: 'relative',
        height: timelineHeight,
        borderRadius: 0,
        background: '#fff',
        borderRight: '1px solid rgba(24,33,47,0.09)',
        borderBottom: '1px solid rgba(24,33,47,0.09)',
        overflow: 'hidden',
      }}
    >
      {timelineSlotHeights.map((_, index) => (
        <div
          key={`slot-line-${index}`}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: getTimelineOffset(index * TIMELINE_SLOT_MINUTES),
            borderTop: `1px solid ${index % 2 === 0 ? 'rgba(23,32,51,0.075)' : 'rgba(23,32,51,0.04)'}`,
            pointerEvents: 'none',
          }}
        />
      ))}
      {colWindows.map((w, wi) => {
        const startMin = toMinutes(w.start_time) - timelineWindow.startHour * 60;
        const endMin = toMinutes(w.end_time) - timelineWindow.startHour * 60;
        const top = getTimelineOffset(Math.max(0, startMin));
        const bottom = getTimelineOffset(Math.max(0, endMin));
        const height = Math.max(4, bottom - top);
        return (
          <div
            key={`win-${wi}`}
            title={`Свободное окно • ${w.start_time.slice(0, 5)} - ${w.end_time.slice(0, 5)}`}
            onClick={() => { void openDayEditor(w.date); }}
            style={{
              position: 'absolute',
              left: 4,
              right: 4,
              top: top + 2,
              height: height - 4,
              borderRadius: 8,
              background: 'linear-gradient(135deg, rgba(42,171,238,0.13), rgba(200,230,255,0.18))',
              border: '1px dashed rgba(42,171,238,0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 700,
              color: '#1a6fa8',
              zIndex: 0,
              cursor: 'pointer',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              pointerEvents: 'auto',
            }}
          >
            {height > 20 ? `${w.start_time.slice(0, 5)}–${w.end_time.slice(0, 5)}` : ''}
          </div>
        );
      })}
      {layoutTimelineLessons(items, timelineWindow.startHour, timelineSlotHeights).map(({ lesson, top, height, column, columns }) => {
        const laneGap = viewMode === 'week' ? 4 : 6;
        const width = `calc((100% - 16px - ${(columns - 1) * laneGap}px) / ${columns})`;
        const left = `calc(8px + ${column} * (((100% - 16px - ${(columns - 1) * laneGap}px) / ${columns}) + ${laneGap}px))`;

        const rawCardHeight = Math.max(height - 8, 0);
        const density: LessonCardDensity = rawCardHeight < MIN_EVENT_CARD_HEIGHT || columns > 1 ? 'compact' : 'standard';
        const cardHeight = Math.max(rawCardHeight, density === 'compact' ? MIN_EVENT_CARD_HEIGHT : 92);

        return (
          <div
            key={lesson.id}
            style={{
              position: 'absolute',
              top: top + 3,
              left,
              width,
              minWidth: 0,
              height: cardHeight,
              zIndex: column + 1,
            }}
          >
            {renderLessonCard(lesson, viewMode, density)}
          </div>
        );
      })}
    </div>
  );

  const renderCalendarBody = () => {
    if (mode === 'day') {
      const dayStr = formatDate(dayDate);
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '58px minmax(0, 1fr)', gap: 0, width: '100%', minWidth: 0, border: '1px solid rgba(24,33,47,0.1)', borderRadius: 20, overflow: 'hidden', background: '#fff' }}>
          <div />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 6px', background: 'rgba(248,250,252,0.96)', fontWeight: 900, borderLeft: '1px solid rgba(24,33,47,0.09)', borderBottom: '1px solid rgba(24,33,47,0.09)' }}>
            {formatDayLong(dayDate)}
            <button type="button" title="Редактировать доступность дня" onClick={() => { void openDayEditor(dayStr); }} style={{ padding: '2px 8px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1px solid rgba(42,171,238,0.35)', background: 'rgba(42,171,238,0.08)', color: '#1a6fa8', cursor: 'pointer', flexShrink: 0 }}><Pencil size={12} /></button>
          </div>
          {renderTimeLabels()}
          {renderTimelineColumn(dayLessons, 'day', dayWindows)}
        </div>
      );
    }

    if (mode === 'week') {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '58px repeat(7, minmax(0, 1fr))', gap: 0, width: '100%', minWidth: 0, border: '1px solid rgba(24,33,47,0.1)', borderRadius: 20, overflow: 'hidden', background: '#fff' }}>
          <div style={{ background: 'rgba(248,250,252,0.96)', borderBottom: '1px solid rgba(24,33,47,0.09)' }} />
          {weekDays.map((day, index) => {
            const dayStr = formatDate(day);
            return (
              <div key={dayStr} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 4px', background: 'rgba(248,250,252,0.96)', minWidth: 0, borderLeft: '1px solid rgba(24,33,47,0.09)', borderBottom: '1px solid rgba(24,33,47,0.09)' }}>
                <span style={{ fontWeight: 900, color: '#1f2a3b', fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0 }}>{WEEK_DAYS[index]}</span>
                <span style={{ color: '#667386', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{formatDayShort(day)}</span>
                <button type="button" title="Редактировать доступность дня" onClick={() => { void openDayEditor(dayStr); }} style={{ padding: '2px 5px', borderRadius: 7, fontSize: 11, fontWeight: 700, border: '1px solid rgba(42,171,238,0.3)', background: 'rgba(42,171,238,0.07)', color: '#1a6fa8', cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}><Pencil size={11} /></button>
              </div>
            );
          })}
          {renderTimeLabels()}
          {weekLessonsByDay.map((items, index) => (
            <div key={index} style={{ minWidth: 0 }}>{renderTimelineColumn(items, 'week', weekWindowsByDay[index])}</div>
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
                  border: isToday ? '2px solid rgba(42,171,238,0.9)' : '1px solid rgba(24,33,47,0.06)',
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
                      background: isToday ? 'rgba(42,171,238,0.12)' : 'transparent',
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
                  {items.slice(0, 3).map((lesson) => renderLessonCard(lesson, 'month', 'compact'))}
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
    <div style={{ display: 'grid', gridTemplateRows: 'auto auto auto minmax(0, 1fr)', gap: 16, height: '100%', minHeight: 0, overflow: 'hidden' }}>
      <h1 className="page-heading">Расписание</h1>

      <section
        className="mentor-panel"
        style={{
          padding: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'nowrap',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0, flex: '1 1 auto' }}>
          <button title="Предыдущий период" onClick={() => moveRange(-1)} className="icon-button ghost-button">
            ‹
          </button>
          <button
            type="button"
            title="Вернуться к сегодня"
            onClick={() => setAnchorDate(atMidnight(new Date()))}
            className="ghost-button"
            style={{ height: 42, padding: '0 16px', display: 'inline-flex', alignItems: 'center', gap: 9, minWidth: 0 }}
          >
            <span style={{ color: '#536177', display: 'inline-flex', flex: '0 0 auto' }}><CalendarDays size={18} /></span>
            <span style={{ fontWeight: 900, color: '#1f2a3b', fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {rangeLabel}
            </span>
          </button>
          <button title="Следующий период" onClick={() => moveRange(1)} className="icon-button ghost-button">
            ›
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'flex-end', flex: '0 0 auto' }}>
          <div style={{ display: 'inline-flex', padding: 4, borderRadius: 16, background: 'rgba(23,32,51,0.06)', border: '1px solid rgba(24,33,47,0.08)' }}>
            {[
              ['week', 'Неделя'],
              ['day', 'День'],
              ['month', 'Месяц'],
            ].map(([value, label]) => {
              const active = mode === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value as CalendarMode)}
                  style={{
                    height: 38,
                    minWidth: 0,
                    padding: '0 16px',
                    borderRadius: 13,
                    background: active ? '#172033' : 'transparent',
                    color: active ? '#fff' : '#435066',
                    border: 'none',
                    boxShadow: active ? '0 8px 18px rgba(15,23,42,0.16)' : 'none',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            title="Запросы"
            onClick={() => setIsRequestsModalOpen(true)}
            style={{
              position: 'relative',
              height: 42,
              padding: '0 16px',
              borderRadius: 14,
              background: '#fff',
              color: '#1f2a3b',
              border: '1px solid rgba(24,33,47,0.12)',
              boxShadow: 'none',
              fontWeight: 800,
            }}
          >
            Запросы
            {pendingRequests.length > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  minWidth: 22,
                  height: 22,
                  padding: '0 6px',
                  borderRadius: 999,
                  background: '#F44336',
                  color: '#fff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 900,
                  boxShadow: '0 8px 18px rgba(244,67,54,0.28)',
                }}
              >
                {pendingRequests.length > 99 ? '99+' : pendingRequests.length}
              </span>
            )}
          </button>

          <button type="button" title="Добавить занятие" onClick={() => { reset(); setIsCreateLessonOpen(true); }} className="add-trigger">
            +
          </button>
        </div>
      </section>

      <section className="metric-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
        <div className="metric-card" style={{ minHeight: 92, background: 'linear-gradient(135deg, rgba(42,171,238,0.10), rgba(255,255,255,0.96))', borderColor: 'rgba(42,171,238,0.18)' }}>
          <span className="metric-icon" style={{ background: 'rgba(42,171,238,0.13)', color: '#2AABEE' }}><CalendarDays size={20} /></span>
          <div><div className="metric-value">{rangeBookedLessons.length} {pluralRu(rangeBookedLessons.length, ['занятие', 'занятия', 'занятий'])}</div><div className="metric-label">{mode === 'day' ? 'В выбранный день' : mode === 'month' ? 'В этом месяце' : 'На этой неделе'}</div></div>
        </div>
        <div className="metric-card" style={{ minHeight: 92, background: 'linear-gradient(135deg, rgba(42,171,238,0.12), rgba(255,250,244,0.98))', borderColor: 'rgba(42,171,238,0.18)' }}>
          <span className="metric-icon" style={{ background: 'rgba(42,171,238,0.14)', color: '#2AABEE' }}><ArrowLeftRight size={20} /></span>
          <div><div className="metric-value">{rangeMovedLessons.length} {pluralRu(rangeMovedLessons.length, ['перенос', 'переноса', 'переносов'])}</div><div className="metric-label">В выбранном периоде</div></div>
        </div>
        <div className="metric-card" style={{ minHeight: 92, background: 'linear-gradient(135deg, rgba(47,125,99,0.12), rgba(247,255,251,0.98))', borderColor: 'rgba(47,125,99,0.18)' }}>
          <span className="metric-icon" style={{ background: 'rgba(47,125,99,0.14)', color: '#4CAF50' }}><Wallet size={20} /></span>
          <div><div className="metric-value">{formatMoney(rangeExpectedIncome)}</div><div className="metric-label">Ожидаемый доход</div></div>
        </div>
        <label className="metric-card" style={{ minHeight: 92, cursor: 'pointer', background: 'rgba(255,255,255,0.9)' }}>
          <span className="metric-icon" style={{ background: 'rgba(23,32,51,0.06)', color: '#536177' }}>
            <input
              type="checkbox"
              checked={showRescheduledLessons}
              onChange={(event) => setShowRescheduledLessons(event.target.checked)}
              style={{ width: 18, height: 18 }}
            />
          </span>
          <div><div className="metric-value">Перенесённые</div><div className="metric-label">и отменённые занятия</div></div>
        </label>
      </section>

      <section className="mentor-panel" style={{ padding: 10, minHeight: 0, overflow: 'auto', borderRadius: 24, boxShadow: 'var(--shadow-card)', scrollbarWidth: 'thin' }}>
        <div style={{ width: '100%', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
          {loading ? <p style={{ color: '#687486', marginBottom: 0 }}>Загрузка расписания...</p> : renderCalendarBody()}
        </div>
      </section>

      {isRequestsModalOpen && (
        <Modal onClose={() => setIsRequestsModalOpen(false)} className="wide" style={{ width: 'min(860px, calc(100vw - 48px))' }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Запросы</h3>
                <p className="modal-subtitle">Подтверди запись, перенос или оплату ученика.</p>
              </div>
              <button type="button" title="Закрыть" onClick={() => setIsRequestsModalOpen(false)} className="modal-close">×</button>
            </div>

            {loading ? (
              <p style={{ color: '#687486', marginBottom: 0 }}>Загрузка запросов...</p>
            ) : pendingRequestsWithMeta.length === 0 ? (
              <p style={{ color: '#687486', marginBottom: 0 }}>Активных запросов сейчас нет.</p>
            ) : (
              <div style={{ display: 'grid', gap: 14 }}>
                {pendingRequestsWithMeta.map(({ lesson, student, subject }) => (
                  <div
                    key={lesson.id}
                    style={{
                      padding: 18,
                      borderRadius: 18,
                      background: 'rgba(23,32,51,0.04)',
                      border: '1px solid rgba(24,33,47,0.06)',
                      display: 'grid',
                      gap: 14,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'inline-flex', padding: '6px 10px', borderRadius: 999, background: 'rgba(42,171,238,0.12)', color: '#2AABEE', fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
                          {requestTitle(lesson)}
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#1f2a3b', marginBottom: 6 }}>
                          {student?.full_name ?? 'Ученик'}
                        </div>
                        <div style={{ color: '#5d6778' }}>
                          {subject?.name ?? lesson.subject_name ?? 'Без предмета'} • {lessonDateRu(lesson)} • {toTime(toStartTime(lesson))} - {toTime(toEndTime(lesson))}
                        </div>
                      </div>
                      <div style={{ fontWeight: 700, color: '#1f2a3b' }}>{lesson.cost ?? '—'} ₽</div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {lesson.conduct_status === 'booking_pending' && (
                        <>
                          <button onClick={() => handleRequestResolve(lesson, 'approve-booking')} disabled={processingRequestId === lesson.id} className="modal-success">
                            Подтвердить запись
                          </button>
                          <button
                            onClick={() => handleRequestResolve(lesson, 'reject-booking')}
                            disabled={processingRequestId === lesson.id}
                            className="modal-danger"
                          >
                            Отклонить запись
                          </button>
                        </>
                      )}

                      {lesson.conduct_status === 'reschedule_pending' && (
                        <>
                          <button onClick={() => handleRequestResolve(lesson, 'approve-reschedule')} disabled={processingRequestId === lesson.id} className="modal-success">
                            Подтвердить перенос
                          </button>
                          <button
                            onClick={() => handleRequestResolve(lesson, 'reject-reschedule')}
                            disabled={processingRequestId === lesson.id}
                            className="modal-danger"
                          >
                            Отклонить перенос
                          </button>
                        </>
                      )}

                      {lesson.payment_status === 'payment_pending' && (
                        <>
                          <button onClick={() => handleRequestResolve(lesson, 'approve-payment')} disabled={processingRequestId === lesson.id} className="modal-success">
                            Подтвердить оплату
                          </button>
                          <button
                            onClick={() => handleRequestResolve(lesson, 'reject-payment')}
                            disabled={processingRequestId === lesson.id}
                            className="modal-danger"
                          >
                            Отклонить оплату
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </Modal>
      )}

      {selectedMonthDay && selectedMonthDayDate && (
        <Modal onClose={() => setSelectedMonthDay(null)} style={{ width: 'min(560px, calc(100vw - 48px))', padding: 0, gap: 0 }}>
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid rgba(24,33,47,0.08)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: 22, lineHeight: 1.05, marginBottom: 6 }}>
                  {selectedMonthDayDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })}
                </h3>
                <div style={{ color: '#687486', fontSize: 13 }}>
                  {selectedMonthDayLessons.length} записей
                </div>
              </div>
              <button type="button" title="Закрыть" onClick={() => setSelectedMonthDay(null)} className="modal-close">×</button>
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
                  const color = windowCard ? '#2AABEE' : statusColor(lesson.conduct_status);

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
                        {!windowCard && (
                          <span style={{ color: color, fontSize: 12, fontWeight: 800 }}>{statusLabel(lesson.conduct_status)}</span>
                        )}
                      </div>
                      {windowCard && (
                        <div style={{ fontWeight: 800, marginBottom: 4 }}>
                          Свободный слот
                        </div>
                      )}
                      {!windowCard && (
                        <>
                          <div style={{ fontWeight: 800, marginBottom: 4 }}>
                            {student?.full_name ?? 'Ученик'}
                          </div>
                          <div style={{ color: '#687486', fontSize: 13 }}>
                            {subject?.name ?? 'Без предмета'} • {lesson.cost ?? '—'} ₽ • {paymentLabel(lesson.payment_status, Boolean(lesson.subscription_covered))}
                          </div>
                        </>
                      )}
                    </button>
                  );
                })
              )}
            </div>
        </Modal>
      )}

      {isCreateLessonOpen && (
        <Modal onClose={() => { reset(); setIsCreateLessonOpen(false); }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Создать занятие</h3>
                <p className="modal-subtitle">Заполни ученика, дату, время и тему занятия. Стоимость посчитается автоматически.</p>
              </div>
              <button type="button" title="Закрыть" onClick={() => { reset(); setIsCreateLessonOpen(false); }} className="modal-close">×</button>
            </div>

            <div className="modal-form-grid">
              <label className="modal-field">
                Ученик и предмет
                <select
                  className={errors.selectedTutorStudentId ? 'field-invalid' : undefined}
                  value={selectedTutorStudentId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    const nextOption = tutorStudentOptions.find((item) => String(item.id) === nextId);
                    setSelectedTutorStudentId(nextId);
                    setCost(nextOption?.rate ? String(nextOption.rate) : '');
                    clearError('selectedTutorStudentId');
                    clearError('cost');
                  }}
                  onBlur={() => validateField('selectedTutorStudentId', createLessonRules)}
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
                <FieldError message={errors.selectedTutorStudentId} />
              </label>
              <label className="modal-field">
                Дата
                <DateField
                  value={lessonDate}
                  onChange={(value) => { setLessonDate(value); clearError('lessonDate'); clearError('startTime'); }}
                  onBlur={() => validateField('lessonDate', createLessonRules)}
                  invalid={!!errors.lessonDate}
                />
                <FieldError message={errors.lessonDate} />
              </label>
              <div className="modal-row">
                <label className="modal-field">
                  Время начала
                  <input
                    type="time"
                    className={errors.startTime ? 'field-invalid' : undefined}
                    value={startTime}
                    onChange={(event) => { setStartTime(event.target.value); clearError('startTime'); clearError('endTime'); }}
                    onBlur={() => validateField('startTime', createLessonRules)}
                  />
                  <FieldError message={errors.startTime} />
                </label>
                <label className="modal-field">
                  Время окончания
                  <input
                    type="time"
                    className={errors.endTime ? 'field-invalid' : undefined}
                    value={endTime}
                    onChange={(event) => { setEndTime(event.target.value); clearError('endTime'); }}
                    onBlur={() => validateField('endTime', createLessonRules)}
                  />
                  <FieldError message={errors.endTime} />
                </label>
              </div>
              <label className="modal-field">
                Стоимость
                <input type="number" value={cost} readOnly placeholder="Стоимость" className={errors.cost ? 'field-invalid' : undefined} style={{ background: '#f8fafc', color: '#435066' }} />
                <FieldError message={errors.cost} />
              </label>
              <label className="modal-field">
                Тема занятия
                <select value={newTopicId} onChange={(event) => setNewTopicId(event.target.value)}>
                  <option value="">Без темы</option>
                  {availableCreateTopics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.title} • {formatTopicLevels(topic, tutorLevels)}
                    </option>
                  ))}
                </select>
              </label>

              {creationConflict && (
                <div style={{ padding: '10px 14px', borderRadius: 12, background: '#FFF2F1', border: '1px solid #F5C6C2', color: '#B42318', fontWeight: 700, fontSize: 14 }}>
                  На это время уже есть занятие или бронь. Выбери другое время.
                </div>
              )}

              <div className="modal-actions">
                <button className="modal-primary" onClick={handleCreateLesson} disabled={saving || !tutorStudentOptions.length || creationConflict}>
                  {saving ? 'Сохраняем...' : 'Создать занятие'}
                </button>
              </div>
            </div>
        </Modal>
      )}

      {isDayEditorOpen && (
        <Modal onClose={() => setIsDayEditorOpen(false)} style={{ width: 'min(520px, calc(100vw - 48px))' }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Доступность дня</h3>
                <p className="modal-subtitle">
                  {dayEditorDate ? new Date(`${dayEditorDate}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
                  {dayEditorOverridden && (
                    <span
                      title="Этот день отличается от вашего обычного расписания — окна заданы вручную"
                      style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 999, background: 'rgba(42,171,238,0.12)', color: '#2AABEE', fontSize: 11, fontWeight: 700, cursor: 'help' }}
                    >
                      Не по расписанию
                    </span>
                  )}
                </p>
              </div>
              <button type="button" title="Закрыть" onClick={() => setIsDayEditorOpen(false)} className="modal-close">×</button>
            </div>

            <p style={{ margin: '0 0 4px', fontSize: 13, color: '#687486', lineHeight: 1.45 }}>
              Изменения применятся только к этой дате. Чтобы изменить обычное расписание по этому дню недели,{' '}
              <button
                type="button"
                onClick={() => { setIsDayEditorOpen(false); navigate('/availability'); }}
                style={{ padding: 0, background: 'none', border: 'none', boxShadow: 'none', color: '#2AABEE', fontWeight: 700, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
              >
                откройте «Доступность»
              </button>
              .
            </p>

            {dayEditorResult && (
              <div style={{ padding: '10px 14px', borderRadius: 12, background: dayEditorResult.conflicts.length > 0 ? 'rgba(237,137,54,0.1)' : 'rgba(72,187,120,0.1)', border: `1px solid ${dayEditorResult.conflicts.length > 0 ? 'rgba(237,137,54,0.3)' : 'rgba(72,187,120,0.3)'}`, color: dayEditorResult.conflicts.length > 0 ? '#c05621' : '#276749', fontSize: 13, marginBottom: 4 }}>
                {dayEditorResult.conflicts.length > 0 && (
                  <div style={{ marginBottom: dayEditorResult.rejected_bookings > 0 ? 8 : 0 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Вне новой доступности остались занятия:</div>
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {dayEditorResult.conflicts.map((c) => (
                        <li key={c.lesson_id}>{c.student_name ?? 'Ученик'} — {new Date(c.starts_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {dayEditorResult.rejected_bookings > 0 && (
                  <div>Отклонено заявок: <strong>{dayEditorResult.rejected_bookings}</strong></div>
                )}
                {dayEditorResult.conflicts.length === 0 && dayEditorResult.rejected_bookings === 0 && (
                  <span style={{ fontWeight: 700 }}>Сохранено.</span>
                )}
              </div>
            )}

            <div className="modal-form-grid">
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#1f2a3b' }}>
                <input
                  type="checkbox"
                  checked={dayEditorClosed}
                  onChange={(e) => { setDayEditorClosed(e.target.checked); setDayEditorResult(null); }}
                  style={{ width: 17, height: 17 }}
                />
                Выходной (убрать все окна в этот день)
              </label>

              {!dayEditorClosed && (
                <div style={{ display: 'grid', gap: 8 }}>
                  {dayEditorWindows.map((w, idx) => (
                    <div key={idx} style={{ display: 'grid', gap: 4 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 10px',
                          borderRadius: 12,
                          background: w.error ? 'rgba(229,62,62,0.06)' : 'rgba(23,32,51,0.035)',
                          border: w.error ? '1px solid rgba(229,62,62,0.45)' : '1px solid rgba(24,33,47,0.08)',
                        }}
                      >
                        <input
                          type="time"
                          value={w.start}
                          onChange={(e) => {
                            setDayEditorWindows((prev) => prev.map((item, i) => i === idx ? { ...item, start: e.target.value, error: undefined } : item));
                            setDayEditorResult(null);
                          }}
                          style={{ padding: '6px 8px', borderRadius: 10, border: '1px solid rgba(24,33,47,0.14)', fontSize: 14, fontFamily: 'inherit', background: '#fff', color: '#1f2a3b', outline: 'none' }}
                        />
                        <span style={{ color: '#687486', fontSize: 13, fontWeight: 600 }}>–</span>
                        <input
                          type="time"
                          value={w.end}
                          onChange={(e) => {
                            setDayEditorWindows((prev) => prev.map((item, i) => i === idx ? { ...item, end: e.target.value, error: undefined } : item));
                            setDayEditorResult(null);
                          }}
                          style={{ padding: '6px 8px', borderRadius: 10, border: '1px solid rgba(24,33,47,0.14)', fontSize: 14, fontFamily: 'inherit', background: '#fff', color: '#1f2a3b', outline: 'none' }}
                        />
                        <div style={{ flex: 1 }} />
                        <button
                          type="button"
                          title="Удалить окно"
                          onClick={() => { setDayEditorWindows((prev) => prev.filter((_, i) => i !== idx)); setDayEditorResult(null); }}
                          className="icon-button icon-button-danger"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      {w.error && <div style={{ color: '#c53030', fontSize: 12, paddingLeft: 2 }}>{w.error}</div>}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setDayEditorWindows((prev) => [...prev, { start: '', end: '' }]); setDayEditorResult(null); }}
                    style={{ alignSelf: 'start', padding: '5px 12px', borderRadius: 10, border: '1px solid rgba(42,171,238,0.35)', background: 'rgba(42,171,238,0.07)', color: '#1a6fa8', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                  >
                    + Добавить окно
                  </button>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" onClick={() => { void handleDayEditorSave(); }} disabled={dayEditorSaving} className="modal-primary">
                  {dayEditorSaving ? 'Сохраняем...' : 'Сохранить'}
                </button>
              </div>
            </div>
        </Modal>
      )}

      {selectedLesson && (() => {
        const relation = tutorStudents.find((item) => item.id === selectedLesson.tutor_student_id);
        const student = students.find((item) => item.id === relation?.student_id);
        const subject = subjects.find((item) => item.id === relation?.subject_id);
        const topic = topics.find((item) => item.id === selectedLesson.topic_id);
        const selectedWindow = isWindow(selectedLesson);
        const currentStatusColor = selectedWindow ? '#2AABEE' : statusColor(selectedLesson.conduct_status);
        const canMarkConducted = !selectedWindow && selectedLesson.conduct_status === 'scheduled';
        const canOpenReschedule = !selectedWindow && selectedLesson.conduct_status === 'scheduled';
        const canApproveBooking = !selectedWindow && selectedLesson.conduct_status === 'booking_pending';
        const canRejectBooking = !selectedWindow && selectedLesson.conduct_status === 'booking_pending';
        const canApprovePayment = !selectedWindow && selectedLesson.payment_status === 'payment_pending';
        const canRejectPayment = !selectedWindow && selectedLesson.payment_status === 'payment_pending';
        const canMarkPaid =
          !selectedWindow &&
          selectedLesson.conduct_status === 'conducted' &&
          selectedLesson.payment_status === 'unpaid';
        const canCancelLesson =
          !selectedWindow &&
          selectedLesson.conduct_status !== 'cancelled' &&
          selectedLesson.conduct_status !== 'booking_rejected' &&
          selectedLesson.conduct_status !== 'rescheduled';

        return (
          <Modal onClose={() => setSelectedLessonId(null)} style={{ width: 'min(560px, calc(100vw - 48px))', padding: 0, gap: 0, overflow: 'hidden' }}>
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
                      {!selectedWindow && selectedLesson.attendance_confirmed && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 999, background: 'rgba(72,187,120,0.15)', color: '#276749', fontSize: 12, fontWeight: 700, border: '1px solid rgba(72,187,120,0.3)' }}>
                          <Check size={14} /> Подтвердил участие
                        </span>
                      )}
                    </p>
                  </div>
                  <button type="button" title="Закрыть" onClick={() => setSelectedLessonId(null)} className="modal-close">×</button>
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
                        ['Оплата', paymentLabel(selectedLesson.payment_status, Boolean(selectedLesson.subscription_covered))],
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
                      type="button"
                      title={isEditingLesson ? 'Скрыть редактирование' : 'Редактировать занятие'}
                      onClick={() => {
                        reset();
                        setIsEditingLesson((prev) => !prev);
                        setIsReschedulingLesson(false);
                      }}
                      className="icon-button icon-button-dark"
                    >
                      <Pencil size={15} />
                    </button>
                    {!selectedWindow && (
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
                        className={`icon-button ${showLessonNoteEditor ? 'icon-button-dark' : 'icon-button-primary'}`}
                      >
                        {selectedLesson.tutor_note?.trim() ? <Pencil size={15} /> : '+'}
                      </button>
                    )}
                    {canMarkConducted && (
                      <button type="button" title="Отметить проведённым" onClick={() => handleLessonPatch(selectedLesson.id, { conduct_status: 'conducted' })} className="icon-button icon-button-success">
                        <Check size={16} />
                      </button>
                    )}
                    {canOpenReschedule && (
                      <button
                        title={isReschedulingLesson ? 'Скрыть перенос' : 'Перенести занятие'}
                        onClick={() => {
                          reset();
                          setIsReschedulingLesson((prev) => !prev);
                          setIsEditingLesson(false);
                        }}
                        className={`icon-button ${isReschedulingLesson ? 'icon-button-purple' : 'icon-button-dark'}`}
                      >
                        ↻
                      </button>
                    )}
                    {canApproveBooking && (
                      <button
                        type="button"
                        onClick={() => handleBookingDecision(selectedLesson.id, true)}
                        className="modal-success"
                      >
                        Подтвердить запись
                      </button>
                    )}
                    {canRejectBooking && (
                      <button
                        type="button"
                        onClick={() => handleBookingDecision(selectedLesson.id, false)}
                        className="modal-danger"
                      >
                        Отклонить запись
                      </button>
                    )}
                    {canApprovePayment && (
                      <button
                        type="button"
                        onClick={() => handlePaymentDecision(selectedLesson.id, true)}
                        className="modal-success"
                      >
                        Подтвердить оплату
                      </button>
                    )}
                    {canRejectPayment && (
                      <button
                        type="button"
                        onClick={() => handlePaymentDecision(selectedLesson.id, false)}
                        className="modal-danger"
                      >
                        Отклонить оплату
                      </button>
                    )}
                    {canMarkPaid && (
                      <button
                        title="Отметить оплаченным"
                        onClick={() => handleLessonPatch(selectedLesson.id, { payment_status: 'paid' })}
                        className="icon-button icon-button-success"
                      >
                        ₽
                      </button>
                    )}
                    {selectedWindow && (
                      <button
                        title="Удалить слот"
                        onClick={() => handleLessonDelete(selectedLesson)}
                        className="icon-button icon-button-danger"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                    {canCancelLesson && (
                      <button
                        title="Отменить занятие"
                        onClick={() => handleLessonPatch(selectedLesson.id, { conduct_status: 'cancelled' })}
                        className="icon-button icon-button-danger"
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 12, alignItems: 'start' }}>
                      <div>
                        <DateField value={editLessonDate} onChange={(value) => { setEditLessonDate(value); clearError('editLessonDate'); }} onBlur={() => validateField('editLessonDate', editLessonRules)} invalid={!!errors.editLessonDate} />
                        <FieldError message={errors.editLessonDate} />
                      </div>
                      {!selectedWindow && (
                        <div>
                          <input type="number" className={errors.editCost ? 'field-invalid' : undefined} value={editCost} onChange={(event) => { setEditCost(event.target.value); clearError('editCost'); }} onBlur={() => validateField('editCost', editLessonRules)} placeholder="Стоимость" style={{ width: '100%' }} />
                          <FieldError message={errors.editCost} />
                        </div>
                      )}
                      <div>
                        <input type="time" className={errors.editStartTime ? 'field-invalid' : undefined} value={editStartTime} onChange={(event) => { setEditStartTime(event.target.value); clearError('editStartTime'); clearError('editEndTime'); }} onBlur={() => validateField('editStartTime', editLessonRules)} style={{ width: '100%' }} />
                        <FieldError message={errors.editStartTime} />
                      </div>
                      <div>
                        <input type="time" className={errors.editEndTime ? 'field-invalid' : undefined} value={editEndTime} onChange={(event) => { setEditEndTime(event.target.value); clearError('editEndTime'); }} onBlur={() => validateField('editEndTime', editLessonRules)} style={{ width: '100%' }} />
                        <FieldError message={errors.editEndTime} />
                      </div>
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
                            {topic.title} • {formatTopicLevels(topic, tutorLevels)}
                          </option>
                        ))}
                      </select>
                    )}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button type="button" onClick={handleLessonDetailsSave} className="modal-primary">Сохранить изменения</button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditLessonDate(toLessonDateStr(selectedLesson));
                          setEditStartTime(toTime(toStartTime(selectedLesson)));
                          setEditEndTime(toTime(toEndTime(selectedLesson)));
                          setEditCost(selectedLesson.cost ? String(selectedLesson.cost) : '');
                          setEditTopicId(selectedLesson.topic_id ? String(selectedLesson.topic_id) : '');
                          setIsEditingLesson(false);
                        }}
                        className="modal-secondary"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                )}

                {isReschedulingLesson && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 14, color: '#687486', marginBottom: 10 }}>Перенос занятия</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 12, alignItems: 'start' }}>
                      <div>
                        <DateField value={rescheduleDate} onChange={(value) => { setRescheduleDate(value); clearError('rescheduleDate'); }} onBlur={() => validateField('rescheduleDate', rescheduleRules)} invalid={!!errors.rescheduleDate} />
                        <FieldError message={errors.rescheduleDate} />
                      </div>
                      <div />
                      <div>
                        <input type="time" className={errors.rescheduleStartTime ? 'field-invalid' : undefined} value={rescheduleStartTime} onChange={(event) => { setRescheduleStartTime(event.target.value); clearError('rescheduleStartTime'); clearError('rescheduleEndTime'); }} onBlur={() => validateField('rescheduleStartTime', rescheduleRules)} style={{ width: '100%' }} />
                        <FieldError message={errors.rescheduleStartTime} />
                      </div>
                      <div>
                        <input type="time" className={errors.rescheduleEndTime ? 'field-invalid' : undefined} value={rescheduleEndTime} onChange={(event) => { setRescheduleEndTime(event.target.value); clearError('rescheduleEndTime'); }} onBlur={() => validateField('rescheduleEndTime', rescheduleRules)} style={{ width: '100%' }} />
                        <FieldError message={errors.rescheduleEndTime} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button type="button" onClick={handleLessonReschedule} className="modal-purple">
                        Подтвердить перенос
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRescheduleDate(toLessonDateStr(selectedLesson));
                          setRescheduleStartTime(toTime(toStartTime(selectedLesson)));
                          setRescheduleEndTime(toTime(toEndTime(selectedLesson)));
                          setIsReschedulingLesson(false);
                        }}
                        className="modal-secondary"
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
                        <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(42,171,238,0.08)', border: '1px solid rgba(42,171,238,0.16)' }}>
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
        </Modal>
        );
      })()}
    </div>
  );
}
