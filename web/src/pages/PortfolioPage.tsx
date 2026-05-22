import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getAssignments, type Assignment } from '../api/assignments';
import { getLessons, type Lesson } from '../api/lessons';
import { getStudents, type Student } from '../api/students';
import { getSubjects, type Subject } from '../api/subjects';
import { getTopics, type TheoryTopic } from '../api/topics';
import { getTutorStudents, type TutorStudent } from '../api/tutorStudents';
import { lessonDate } from '../utils/lessonTime';
import { getMediaUrl } from '../utils/media';

const COLORS = {
  primary: '#2AABEE',
  background: '#F5F7FB',
  surface: '#FFFFFF',
  text: '#1A1A1A',
  secondary: '#666666',
  border: '#E8EDF5',
  success: '#4CAF50',
  warning: '#FF9800',
  danger: '#F44336',
  purple: '#9C27B0',
} as const;

const panelStyle = {
  background: COLORS.surface,
  padding: '18px',
  borderRadius: '24px',
  border: `1px solid ${COLORS.border}`,
  boxShadow: '0 18px 44px rgba(20, 32, 56, 0.07)',
} as const;

const mutedTextStyle = {
  color: COLORS.secondary,
  fontSize: 14,
} as const;

type TopicProgress = {
  topic: TheoryTopic;
  lessonCount: number;
  assignmentCount: number;
  completedAssignments: number;
  averageGrade: number | null;
  progressPercent: number;
  activityCount: number;
};

type ProgressPoint = {
  label: string;
  averageGradePercent: number;
  homeworkPercent: number;
  overallProgress: number;
};

type AttendanceStatus = 'conducted' | 'rescheduled' | 'absence' | 'none';

type CalendarCell = {
  key: string;
  date: string | null;
  day: number | null;
  status: AttendanceStatus;
  lessonCount: number;
};

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function scoreToPercent(score: number | null) {
  if (score === null) return null;
  return clampPercent((score / 5) * 100);
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatAverage(value: number | null) {
  return value === null ? '—' : value.toFixed(1);
}

function formatMonthInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return {
    start: new Date(year, monthNumber - 1, 1),
    end: new Date(year, monthNumber, 0, 23, 59, 59, 999),
  };
}

function previousMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return formatMonthInput(new Date(year, monthNumber - 2, 1));
}

function formatMonthLabel(month: string) {
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(
    monthRange(month).start
  );
}

function formatPeriodRange(month: string) {
  const { start, end } = monthRange(month);
  const startLabel = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(start);
  const endLabel = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(end);
  return `${startLabel} — ${endLabel}`;
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
    .format(date)
    .replace('.', '');
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function formatStudentGrade(student: Student | null) {
  if (!student?.grade) return 'Класс не указан';
  return `${student.grade} класс`;
}

function topicBarColor(value: number) {
  if (value >= 70) return COLORS.success;
  if (value >= 45) return COLORS.primary;
  if (value >= 25) return COLORS.warning;
  return COLORS.danger;
}

function parsePortfolioDate(date: string | null | undefined) {
  if (!date) return null;
  const value = date.includes('T') ? new Date(date) : new Date(`${date}T00:00:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function inMonth(date: string, month: string) {
  const { start, end } = monthRange(month);
  const value = parsePortfolioDate(date);
  return Boolean(value && value >= start && value <= end);
}

function buildStats(lessons: Lesson[], assignments: Assignment[], topicPercent: number) {
  const conductedLessons = lessons.filter((lesson) => lesson.conduct_status === 'conducted');
  const cancelledLessons = lessons.filter((lesson) => lesson.conduct_status === 'cancelled');
  const completedAssignments = assignments.filter((assignment) => assignment.completion_status === 'completed');
  const overdueAssignments = assignments.filter((assignment) => assignment.completion_status === 'overdue');
  const lessonGrades = conductedLessons
    .map((lesson) => lesson.grade)
    .filter((grade): grade is number => grade !== null);
  const assignmentGrades = assignments
    .map((assignment) => assignment.grade)
    .filter((grade): grade is number => grade !== null);
  const averageLessonGrade = average(lessonGrades);
  const averageAssignmentGrade = average(assignmentGrades);
  const attendanceBase = conductedLessons.length + cancelledLessons.length;
  const attendancePercent = attendanceBase > 0 ? (conductedLessons.length / attendanceBase) * 100 : 0;
  const homeworkPercent = assignments.length > 0 ? (completedAssignments.length / assignments.length) * 100 : 0;
  const parts = [
    { value: attendancePercent, weight: attendanceBase > 0 ? 20 : 0 },
    { value: homeworkPercent, weight: assignments.length > 0 ? 25 : 0 },
    { value: scoreToPercent(averageLessonGrade), weight: averageLessonGrade !== null ? 25 : 0 },
    { value: scoreToPercent(averageAssignmentGrade), weight: averageAssignmentGrade !== null ? 15 : 0 },
    { value: topicPercent, weight: topicPercent > 0 ? 15 : 0 },
  ];
  const weightSum = parts.reduce((sum, part) => sum + part.weight, 0);
  const overallProgress =
    weightSum > 0 ? parts.reduce((sum, part) => sum + (part.value ?? 0) * part.weight, 0) / weightSum : 0;

  return {
    lessons,
    assignments,
    conductedLessons,
    completedAssignments,
    overdueAssignments,
    averageLessonGrade,
    averageAssignmentGrade,
    attendancePercent: clampPercent(attendancePercent),
    homeworkPercent: clampPercent(homeworkPercent),
    topicPercent,
    overallProgress: clampPercent(overallProgress),
  };
}

function formatDelta(current: number | null, previous: number | null, suffix = '') {
  if (current === null || previous === null) return 'нет данных';
  const diff = current - previous;
  if (Math.abs(diff) < 0.05) return '0';
  return `${diff > 0 ? '+' : ''}${diff.toFixed(suffix === '%' ? 0 : 1)}${suffix}`;
}

function formatCountDelta(current: number, previous: number) {
  const diff = current - previous;
  if (diff === 0) return '0';
  return `${diff > 0 ? '+' : ''}${diff}`;
}

function deltaTone(delta: string) {
  if (delta === 'нет данных' || delta === '0') return 'neutral';
  return delta.startsWith('-') ? 'bad' : 'good';
}

function statusForDay(lessons: Lesson[]): AttendanceStatus {
  if (lessons.some((lesson) => lesson.conduct_status === 'conducted')) return 'conducted';
  if (lessons.some((lesson) => lesson.conduct_status === 'rescheduled' || lesson.conduct_status === 'reschedule_pending')) {
    return 'rescheduled';
  }
  if (
    lessons.some(
      (lesson) =>
        lesson.conduct_status === 'cancelled' ||
        lesson.conduct_status === 'booking_rejected' ||
        lesson.conduct_status === 'reschedule_rejected'
    )
  ) {
    return 'absence';
  }
  return 'none';
}

function buildCalendarCells(month: string, lessons: Lesson[]): CalendarCell[] {
  const { start, end } = monthRange(month);
  const offset = (start.getDay() + 6) % 7;
  const cells: CalendarCell[] = Array.from({ length: offset }, (_, index) => ({
    key: `blank-start-${index}`,
    date: null,
    day: null,
    status: 'none',
    lessonCount: 0,
  }));

  for (let day = 1; day <= end.getDate(); day += 1) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const dayLessons = lessons.filter((lesson) => lessonDate(lesson) === date);
    cells.push({
      key: date,
      date,
      day,
      status: statusForDay(dayLessons),
      lessonCount: dayLessons.length,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({
      key: `blank-end-${cells.length}`,
      date: null,
      day: null,
      status: 'none',
      lessonCount: 0,
    });
  }

  return cells;
}

function buildProgressRows(
  month: string,
  lessons: Lesson[],
  assignments: Assignment[],
  topicPercent: number
): ProgressPoint[] {
  const { start, end } = monthRange(month);
  const lastDay = end.getDate();
  const checkpoints = [7, 14, 21, lastDay].filter((day, index, days) => day <= lastDay && days.indexOf(day) === index);

  return checkpoints.map((day) => {
    const checkpoint = new Date(start.getFullYear(), start.getMonth(), day, 23, 59, 59, 999);
    const pointLessons = lessons.filter((lesson) => {
      const value = parsePortfolioDate(lessonDate(lesson));
      return Boolean(value && value <= checkpoint);
    });
    const pointAssignments = assignments.filter((assignment) => {
      const value = parsePortfolioDate(assignment.deadline);
      return Boolean(value && value <= checkpoint);
    });
    const stats = buildStats(pointLessons, pointAssignments, topicPercent);

    return {
      label: formatShortDate(checkpoint),
      averageGradePercent: scoreToPercent(stats.averageLessonGrade) ?? 0,
      homeworkPercent: stats.homeworkPercent,
      overallProgress: stats.overallProgress,
    };
  });
}

function DonutChart({
  value,
  size = 116,
  stroke = 14,
  compact = false,
}: {
  value: number;
  size?: number;
  stroke?: number;
  compact?: boolean;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (clampPercent(value) / 100) * circumference;

  return (
    <div className={compact ? 'portfolio-donut portfolio-donut-compact' : 'portfolio-donut'} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E8EDF5"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={COLORS.primary}
          strokeLinecap="round"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <strong>{formatPercent(value)}</strong>
    </div>
  );
}

function RadarChart({
  values,
  variant = 'default',
}: {
  values: Array<{ label: string; value: number }>;
  variant?: 'default' | 'report';
}) {
  const isReport = variant === 'report';
  const size = isReport ? 330 : 430;
  const center = size / 2;
  const radius = isReport ? 92 : 126;
  const labelDistance = isReport ? 136 : 184;
  const labelPadding = isReport ? 16 : 22;
  const points = values.map((item, index) => {
    const angle = (Math.PI * 2 * index) / values.length - Math.PI / 2;
    const distance = radius * (clampPercent(item.value) / 100);
    const rawLabelX = center + Math.cos(angle) * labelDistance;
    const rawLabelY = center + Math.sin(angle) * labelDistance;
    const labelX = Math.max(labelPadding, Math.min(size - labelPadding, rawLabelX));
    const labelY = Math.max(labelPadding + 8, Math.min(size - labelPadding - 8, rawLabelY));
    const textAnchor: 'start' | 'middle' | 'end' =
      rawLabelX < center - 16 ? 'end' : rawLabelX > center + 16 ? 'start' : 'middle';

    return {
      ...item,
      x: center + Math.cos(angle) * distance,
      y: center + Math.sin(angle) * distance,
      axisX: center + Math.cos(angle) * radius,
      axisY: center + Math.sin(angle) * radius,
      labelX,
      labelY,
      textAnchor,
    };
  });
  const polygon = points.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <svg className={isReport ? 'portfolio-radar-svg portfolio-radar-svg-report' : 'portfolio-radar-svg'} viewBox={`0 0 ${size} ${size}`}>
      {[0.25, 0.5, 0.75, 1].map((scale) => {
        const ringPoints = values.map((_, index) => {
          const angle = (Math.PI * 2 * index) / values.length - Math.PI / 2;
          return `${center + Math.cos(angle) * radius * scale},${center + Math.sin(angle) * radius * scale}`;
        });
        return (
          <polygon
            key={scale}
            points={ringPoints.join(' ')}
            fill="none"
            stroke="rgba(26, 26, 26, 0.12)"
            strokeWidth={isReport ? 1 : 1.2}
          />
        );
      })}
      {points.map((point) => (
        <line
          key={point.label}
          x1={center}
          y1={center}
          x2={point.axisX}
          y2={point.axisY}
          stroke="rgba(26, 26, 26, 0.11)"
          strokeWidth={isReport ? 1 : 1.2}
        />
      ))}
      <polygon points={polygon} fill="rgba(42,171,238,0.16)" stroke={COLORS.primary} strokeWidth={isReport ? 3 : 4} />
      {points.map((point) => (
        <g key={point.label}>
          <circle cx={point.x} cy={point.y} r={isReport ? 4.5 : 5.5} fill={COLORS.primary} />
          <text
            x={point.labelX}
            y={point.labelY}
            textAnchor={point.textAnchor}
            dominantBaseline="middle"
            fill={COLORS.text}
            fontSize={isReport ? 11 : 13}
            fontWeight="850"
          >
            <tspan x={point.labelX}>{point.label}</tspan>
            <tspan x={point.labelX} dy={isReport ? 13 : 16} fill={COLORS.primary} fontWeight="950">
              {formatPercent(point.value)}
            </tspan>
          </text>
        </g>
      ))}
    </svg>
  );
}

function ProgressLineChart({
  rows,
  variant = 'default',
}: {
  rows: ProgressPoint[];
  variant?: 'default' | 'report';
}) {
  const isReport = variant === 'report';
  const width = isReport ? 430 : 680;
  const height = isReport ? 216 : 280;
  const padding = isReport
    ? { top: 14, right: 18, bottom: 34, left: 40 }
    : { top: 18, right: 22, bottom: 42, left: 48 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const series = [
    { key: 'averageGradePercent', label: 'Средний балл', color: COLORS.primary },
    { key: 'homeworkPercent', label: 'Выполнение ДЗ', color: COLORS.success },
    { key: 'overallProgress', label: 'Общий прогресс', color: '#7C3AED' },
  ] as const;
  const pointFor = (row: ProgressPoint, index: number, key: (typeof series)[number]['key']) => {
    const x = padding.left + (rows.length <= 1 ? plotWidth / 2 : (plotWidth * index) / (rows.length - 1));
    const y = padding.top + plotHeight - (clampPercent(row[key]) / 100) * plotHeight;
    return { x, y };
  };

  return (
    <div className={isReport ? 'portfolio-chart portfolio-chart-report' : 'portfolio-chart'}>
      <div className="portfolio-chart-legend">
        {series.map((item) => (
          <span key={item.key}>
            <i style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="portfolio-line-svg">
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = padding.top + plotHeight - (tick / 100) * plotHeight;
          return (
            <g key={tick}>
              <line x1={padding.left} x2={padding.left + plotWidth} y1={y} y2={y} stroke="rgba(26, 26, 26, 0.08)" />
              <text x={padding.left - 12} y={y + 4} textAnchor="end" fontSize={isReport ? 10 : 12} fill={COLORS.secondary}>
                {tick}%
              </text>
            </g>
          );
        })}
        {series.map((item) => {
          const points = rows.map((row, index) => pointFor(row, index, item.key));
          return (
            <g key={item.key}>
              <polyline
                points={points.map((point) => `${point.x},${point.y}`).join(' ')}
                fill="none"
                stroke={item.color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={isReport ? 2.4 : 3}
              />
              {points.map((point, index) => (
                <circle key={`${item.key}-${rows[index]?.label ?? index}`} cx={point.x} cy={point.y} r={isReport ? 3.2 : 4.2} fill={item.color} />
              ))}
            </g>
          );
        })}
        {rows.map((row, index) => {
          const x = padding.left + (rows.length <= 1 ? plotWidth / 2 : (plotWidth * index) / (rows.length - 1));
          return (
            <text key={row.label} x={x} y={height - 12} textAnchor="middle" fontSize={isReport ? 10 : 12} fill={COLORS.secondary}>
              {row.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function attendanceMeta(status: AttendanceStatus) {
  if (status === 'conducted') return { label: 'Проведено', color: '#FFFFFF', dot: COLORS.success, background: COLORS.success };
  if (status === 'rescheduled') return { label: 'Перенос', color: '#FFFFFF', dot: COLORS.warning, background: COLORS.warning };
  if (status === 'absence') return { label: 'Пропуск', color: '#FFFFFF', dot: COLORS.danger, background: COLORS.danger };
  return { label: 'Нет занятия', color: '#8A94A6', dot: '#B7C0CE', background: '#EEF2F7' };
}

function AttendanceCalendar({
  cells,
  month,
  compact = false,
}: {
  cells: CalendarCell[];
  month: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'portfolio-calendar portfolio-calendar-compact' : 'portfolio-calendar'}>
      <div className="portfolio-calendar-title">{formatMonthLabel(month)}</div>
      <div className="portfolio-calendar-weekdays">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="portfolio-calendar-grid">
        {cells.map((cell) => {
          const meta = attendanceMeta(cell.status);
          if (cell.day === null) return <span key={cell.key} className="portfolio-calendar-cell portfolio-calendar-cell-empty" />;
          return (
            <span
              key={cell.key}
              className="portfolio-calendar-cell"
              title={`${cell.day}: ${meta.label}${cell.lessonCount ? `, ${cell.lessonCount} зан.` : ''}`}
              style={{ color: meta.color, background: meta.background, borderColor: cell.status === 'none' ? '#E1E7F0' : meta.background }}
            >
              {cell.day}
            </span>
          );
        })}
      </div>
      <div className="portfolio-calendar-legend">
        {(['conducted', 'rescheduled', 'absence', 'none'] as const).map((status) => {
          const meta = attendanceMeta(status);
          return (
            <span key={status}>
              <i style={{ background: meta.dot }} />
              {meta.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  const [searchParams] = useSearchParams();
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tutorStudents, setTutorStudents] = useState<TutorStudent[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [topics, setTopics] = useState<TheoryTopic[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => formatMonthInput(new Date()));
  const [reportComment, setReportComment] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [pdfSaving, setPdfSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const reportRef = useRef<HTMLDivElement | null>(null);
  const requestedStudentId = searchParams.get('student_id');

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [studentData, subjectData, relationData, lessonData, assignmentData, topicData] =
          await Promise.all([
            getStudents(),
            getSubjects(),
            getTutorStudents(),
            getLessons(),
            getAssignments(),
            getTopics(),
          ]);
        setStudents(studentData);
        setSubjects(subjectData);
        setTutorStudents(relationData);
        setLessons(lessonData);
        setAssignments(assignmentData);
        setTopics(topicData);
      } catch (error) {
        console.error('Ошибка загрузки портфолио:', error);
        alert('Не удалось загрузить раздел портфолио');
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, []);

  const subjectMap = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject])), [subjects]);
  const activeStudents = useMemo(() => {
    const ids = new Set(tutorStudents.filter((relation) => relation.status !== 'completed').map((relation) => relation.student_id));
    return students.filter((student) => ids.has(student.id)).sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru-RU'));
  }, [students, tutorStudents]);

  useEffect(() => {
    if (!activeStudents.length) {
      setSelectedStudentId('');
      return;
    }
    setSelectedStudentId((current) => {
      if (requestedStudentId && activeStudents.some((student) => String(student.id) === requestedStudentId)) {
        return requestedStudentId;
      }

      return current && activeStudents.some((student) => String(student.id) === current) ? current : String(activeStudents[0].id);
    });
  }, [activeStudents, requestedStudentId]);

  const selectedStudent = useMemo(
    () => activeStudents.find((student) => String(student.id) === selectedStudentId) ?? null,
    [activeStudents, selectedStudentId]
  );
  const studentRelations = useMemo(
    () => (selectedStudent ? tutorStudents.filter((relation) => relation.student_id === selectedStudent.id) : []),
    [selectedStudent, tutorStudents]
  );
  const studentSubjectOptions = useMemo(() => {
    const options = new Map<number, { id: number; name: string; tutorName: string | null }>();

    studentRelations.forEach((relation) => {
      if (options.has(relation.subject_id)) return;
      options.set(relation.subject_id, {
        id: relation.subject_id,
        name: relation.subject_name ?? subjectMap.get(relation.subject_id)?.name ?? `Предмет #${relation.subject_id}`,
        tutorName: relation.tutor_name ?? null,
      });
    });

    return [...options.values()];
  }, [studentRelations, subjectMap]);

  useEffect(() => {
    const subjectIds = [...new Set(studentRelations.map((relation) => String(relation.subject_id)))];
    setSelectedSubjectFilter((current) => {
      if (!subjectIds.length) return '';
      if (subjectIds.length === 1) return subjectIds[0] ?? '';
      return subjectIds.includes(current) ? current : '';
    });
  }, [studentRelations]);

  const selectedSubject = useMemo(
    () => studentSubjectOptions.find((option) => String(option.id) === selectedSubjectFilter) ?? null,
    [selectedSubjectFilter, studentSubjectOptions]
  );
  const selectedSubjectLabel = selectedSubject?.name ?? 'Предмет не выбран';
  const subjectRequired = studentSubjectOptions.length > 1 && !selectedSubjectFilter;
  const filteredRelations = useMemo(
    () =>
      selectedSubjectFilter
        ? studentRelations.filter((relation) => String(relation.subject_id) === selectedSubjectFilter)
        : [],
    [selectedSubjectFilter, studentRelations]
  );
  const relationIds = useMemo(() => new Set(filteredRelations.map((relation) => relation.id)), [filteredRelations]);
  const studentLessons = useMemo(
    () => lessons.filter((lesson) => lesson.tutor_student_id !== null && relationIds.has(lesson.tutor_student_id)),
    [lessons, relationIds]
  );
  const studentAssignments = useMemo(
    () => assignments.filter((assignment) => relationIds.has(assignment.tutor_student_id)),
    [assignments, relationIds]
  );
  const previousMonthValue = previousMonth(selectedMonth);
  const reportCommentKey = selectedStudentId
    ? `portfolio_comment:${selectedStudentId}:${selectedSubjectFilter || 'no-subject'}:${selectedMonth}`
    : '';
  const monthLessons = useMemo(
    () => studentLessons.filter((lesson) => inMonth(lessonDate(lesson), selectedMonth)),
    [selectedMonth, studentLessons]
  );
  const previousMonthLessons = useMemo(
    () => studentLessons.filter((lesson) => inMonth(lessonDate(lesson), previousMonthValue)),
    [previousMonthValue, studentLessons]
  );
  const monthAssignments = useMemo(
    () => studentAssignments.filter((assignment) => inMonth(assignment.deadline, selectedMonth)),
    [selectedMonth, studentAssignments]
  );
  const previousMonthAssignments = useMemo(
    () => studentAssignments.filter((assignment) => inMonth(assignment.deadline, previousMonthValue)),
    [previousMonthValue, studentAssignments]
  );
  const activeTopicIds = useMemo(
    () =>
      new Set([
        ...monthLessons.map((lesson) => lesson.topic_id).filter((topicId): topicId is number => topicId !== null),
        ...monthAssignments.map((assignment) => assignment.topic_id).filter((topicId): topicId is number => topicId !== null),
      ]),
    [monthAssignments, monthLessons]
  );

  const topicProgressRows = useMemo<TopicProgress[]>(() => {
    const subjectIds = new Set(filteredRelations.map((relation) => relation.subject_id));
    return topics
      .filter((topic) => subjectIds.has(topic.subject_id) && activeTopicIds.has(topic.id))
      .map((topic) => {
        const topicLessons = monthLessons.filter((lesson) => lesson.topic_id === topic.id && lesson.conduct_status === 'conducted');
        const topicAssignments = monthAssignments.filter((assignment) => assignment.topic_id === topic.id);
        const topicCompletedAssignments = topicAssignments.filter((assignment) => assignment.completion_status === 'completed');
        const topicGrades = [
          ...topicLessons.map((lesson) => lesson.grade).filter((grade): grade is number => grade !== null),
          ...topicAssignments.map((assignment) => assignment.grade).filter((grade): grade is number => grade !== null),
        ];
        const avg = average(topicGrades);
        const activityCount = topicLessons.length + topicAssignments.length;
        const activityScore = Math.min(activityCount, 4) / 4;
        const completionScore = topicAssignments.length > 0 ? topicCompletedAssignments.length / topicAssignments.length : 0;
        const gradeScore = avg === null ? 0 : avg / 5;
        return {
          topic,
          lessonCount: topicLessons.length,
          assignmentCount: topicAssignments.length,
          completedAssignments: topicCompletedAssignments.length,
          averageGrade: avg,
          progressPercent: clampPercent((activityScore * 0.35 + completionScore * 0.35 + gradeScore * 0.3) * 100),
          activityCount,
        };
      })
      .sort((a, b) => b.activityCount - a.activityCount || b.progressPercent - a.progressPercent);
  }, [activeTopicIds, filteredRelations, monthAssignments, monthLessons, topics]);

  const topicAverage = topicProgressRows.length
    ? topicProgressRows.reduce((sum, row) => sum + row.progressPercent, 0) / topicProgressRows.length
    : 0;
  const currentStats = buildStats(monthLessons, monthAssignments, topicAverage);
  const previousStats = buildStats(previousMonthLessons, previousMonthAssignments, 0);
  const onTimeHomeworkPercent =
    currentStats.assignments.length > 0
      ? ((currentStats.assignments.length - currentStats.overdueAssignments.length) / currentStats.assignments.length) * 100
      : 0;
  const competencyRows = [
    {
      label: 'Самостоятельность',
      value: clampPercent(currentStats.homeworkPercent * 0.7 + (currentStats.overdueAssignments.length ? 0 : 30)),
    },
    {
      label: 'Теория',
      value: clampPercent(topicAverage * 0.7 + (scoreToPercent(currentStats.averageLessonGrade) ?? 0) * 0.3),
    },
    {
      label: 'Скорость',
      value: clampPercent(onTimeHomeworkPercent * 0.7 + currentStats.homeworkPercent * 0.3),
    },
    {
      label: 'Домашние задания',
      value: clampPercent(currentStats.homeworkPercent * 0.6 + (scoreToPercent(currentStats.averageAssignmentGrade) ?? 0) * 0.4),
    },
  ];
  const progressRows = buildProgressRows(selectedMonth, monthLessons, monthAssignments, topicAverage);
  const calendarCells = buildCalendarCells(selectedMonth, monthLessons);
  const topicActivityMax = Math.max(1, ...topicProgressRows.map((row) => row.activityCount));
  const periodLabel = formatPeriodRange(selectedMonth);
  const studentAvatarUrl = getMediaUrl(selectedStudent?.avatar_url);
  const studentClassLabel = formatStudentGrade(selectedStudent);

  const strengths = useMemo(() => {
    const items: string[] = [];
    const strongTopics = topicProgressRows.filter((row) => row.progressPercent >= 70).slice(0, 2).map((row) => row.topic.title);
    if (strongTopics.length > 0) items.push(`Уверенно идут темы: ${strongTopics.join(', ')}.`);
    if (currentStats.averageLessonGrade !== null && currentStats.averageLessonGrade >= 4.5) items.push('Высокие оценки на занятиях.');
    if (currentStats.averageAssignmentGrade !== null && currentStats.averageAssignmentGrade >= 4.5) items.push('Качественное выполнение ДЗ.');
    if (currentStats.homeworkPercent >= 80) items.push('Домашние задания выполняются в срок.');
    return items.length ? items.slice(0, 4) : ['Стабильность проявится после накопления данных.'];
  }, [currentStats.averageAssignmentGrade, currentStats.averageLessonGrade, currentStats.homeworkPercent, topicProgressRows]);

  const growthZones = useMemo(() => {
    const items: string[] = [];
    const weakTopics = topicProgressRows.filter((row) => row.progressPercent < 55).slice(0, 2).map((row) => row.topic.title);
    if (weakTopics.length > 0) items.push(`Повторить темы: ${weakTopics.join(', ')}.`);
    if (currentStats.overdueAssignments.length > 0) items.push(`Закрыть просроченные ДЗ: ${currentStats.overdueAssignments.length}.`);
    if (currentStats.averageLessonGrade !== null && currentStats.averageLessonGrade < 4) items.push('Подтянуть оценки на занятиях.');
    if (currentStats.averageAssignmentGrade !== null && currentStats.averageAssignmentGrade < 4) items.push('Усилить качество домашних работ.');
    return items.length ? items.slice(0, 4) : ['Критичных зон роста сейчас не видно.'];
  }, [currentStats.averageAssignmentGrade, currentStats.averageLessonGrade, currentStats.overdueAssignments.length, topicProgressRows]);

  const recommendations = useMemo(
    () => [
      currentStats.overdueAssignments.length > 0
        ? 'Разобрать просроченные задания.'
        : 'Сохранять темп выполнения ДЗ.',
      topicProgressRows.some((row) => row.progressPercent < 55)
        ? 'Вернуться к слабым темам короткой практикой.'
        : 'Добавить задачи повышенной сложности.',
      'Закреплять материал регулярными мини-повторами.',
      'Обновлять комментарий после контрольных точек.',
    ],
    [currentStats.overdueAssignments.length, topicProgressRows]
  );

  useEffect(() => {
    if (!reportCommentKey) {
      setReportComment('');
      return;
    }

    setReportComment(sessionStorage.getItem(reportCommentKey) ?? '');
  }, [reportCommentKey]);

  useEffect(() => {
    if (!reportCommentKey) return;
    sessionStorage.setItem(reportCommentKey, reportComment);
  }, [reportComment, reportCommentKey]);

  if (loading) return <div style={panelStyle}>Загружаем портфолио...</div>;

  if (!selectedStudent) {
    return (
      <div style={panelStyle}>
        <h2 style={{ marginBottom: 8 }}>Портфолио</h2>
        <p style={{ ...mutedTextStyle, marginBottom: 0 }}>
          Пока нет активных учеников, для которых можно построить портфолио прогресса.
        </p>
      </div>
    );
  }

  const handleSaveReportPdf = async () => {
    if (!reportRef.current || pdfSaving) return;

    try {
      setPdfSaving(true);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: COLORS.surface,
        scale: 2,
        useCORS: true,
        windowWidth: reportRef.current.scrollWidth,
        windowHeight: reportRef.current.scrollHeight,
      });
      const imageData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const maxWidth = pageWidth - margin * 2;
      const maxHeight = pageHeight - margin * 2;
      const ratio = canvas.width / canvas.height;
      let imageWidth = maxWidth;
      let imageHeight = imageWidth / ratio;

      if (imageHeight > maxHeight) {
        imageHeight = maxHeight;
        imageWidth = imageHeight * ratio;
      }

      pdf.addImage(imageData, 'PNG', margin + (maxWidth - imageWidth) / 2, margin, imageWidth, imageHeight);

      const safeName = selectedStudent.full_name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'student';
      pdf.save(`progress-report-${safeName}-${selectedMonth}.pdf`);
    } catch {
      alert('Не удалось сохранить PDF. Попробуйте ещё раз.');
    } finally {
      setPdfSaving(false);
    }
  };

  const handleOpenReport = () => {
    if (!selectedSubjectFilter) {
      alert('Выберите предмет для отчёта. PDF формируется только по конкретному предмету.');
      return;
    }

    setReportOpen(true);
  };

  const kpiCards = [
    {
      label: 'Средняя оценка',
      value: formatAverage(currentStats.averageLessonGrade),
      delta: formatDelta(currentStats.averageLessonGrade, previousStats.averageLessonGrade),
      color: COLORS.success,
      background: '#F1FBF2',
      icon: '★',
    },
    {
      label: 'Выполнение ДЗ',
      value: formatPercent(currentStats.homeworkPercent),
      delta: formatDelta(currentStats.homeworkPercent, previousStats.homeworkPercent, '%'),
      color: COLORS.purple,
      background: '#F9F0FF',
      icon: '✓',
    },
    {
      label: 'Посещаемость',
      value: formatPercent(currentStats.attendancePercent),
      delta: formatDelta(currentStats.attendancePercent, previousStats.attendancePercent, '%'),
      color: COLORS.warning,
      background: '#FFF8EE',
      icon: '◷',
    },
    {
      label: 'Проведено занятий',
      value: String(currentStats.conductedLessons.length),
      delta: formatCountDelta(currentStats.conductedLessons.length, previousStats.conductedLessons.length),
      color: COLORS.primary,
      background: '#EFF9FF',
      icon: '□',
    },
    {
      label: 'Средний балл ДЗ',
      value: formatAverage(currentStats.averageAssignmentGrade),
      delta: formatDelta(currentStats.averageAssignmentGrade, previousStats.averageAssignmentGrade),
      color: COLORS.success,
      background: '#F1FBF2',
      icon: '▥',
    },
  ];

  const analyticsReady = Boolean(selectedSubjectFilter && (monthLessons.length || monthAssignments.length || topicProgressRows.length));

  return (
    <div className="portfolio-page">
      <style>
        {`
          .portfolio-page {
            color: ${COLORS.text};
            height: 100%;
            min-height: 0;
            display: grid;
            grid-template-rows: auto auto minmax(0, 1fr);
            gap: 14px;
            overflow: hidden;
          }

          .portfolio-page *,
          .portfolio-report-shell * {
            box-sizing: border-box;
          }

          .portfolio-heading-row {
            display: flex;
            align-items: end;
            justify-content: space-between;
            gap: 16px;
            margin-bottom: 0;
          }

          .portfolio-toolbar {
            display: grid;
            grid-template-columns: minmax(220px, 1.15fr) minmax(180px, 0.9fr) minmax(170px, 0.74fr) auto;
            gap: 12px;
            align-items: end;
            margin-bottom: 0;
          }

          .portfolio-content-viewport {
            min-height: 0;
            display: grid;
            align-content: start;
            overflow-y: auto;
            padding-right: 4px;
            scrollbar-width: thin;
          }

          .portfolio-field {
            display: grid;
            gap: 7px;
            min-width: 0;
          }

          .portfolio-field span {
            color: ${COLORS.secondary};
            font-size: 13px;
            font-weight: 800;
          }

          .portfolio-field select,
          .portfolio-field input {
            min-height: 48px;
            border-radius: 16px;
            background: ${COLORS.surface};
            border-color: ${COLORS.border};
            font-weight: 800;
          }

          .portfolio-primary-button {
            min-height: 48px;
            padding: 0 18px;
            border-radius: 16px;
            background: ${COLORS.primary};
            white-space: nowrap;
            box-shadow: 0 12px 24px rgba(42, 171, 238, 0.22);
          }

          .portfolio-primary-button:disabled {
            opacity: 0.55;
            cursor: not-allowed;
            box-shadow: none;
          }

          .portfolio-notice {
            margin: 0 0 14px;
            padding: 12px 14px;
            border-radius: 18px;
            color: #8A5B00;
            background: #FFF8EE;
            border: 1px solid rgba(255, 152, 0, 0.18);
            font-size: 14px;
            line-height: 1.4;
          }

          .portfolio-student-card {
            display: grid;
            grid-template-columns: auto minmax(0, 1fr) auto;
            gap: 18px;
            align-items: center;
            margin-bottom: 14px;
          }

          .portfolio-avatar,
          .portfolio-avatar-fallback {
            width: 82px;
            height: 82px;
            border-radius: 28px;
            border: 1px solid ${COLORS.border};
            background: #EFF9FF;
          }

          .portfolio-avatar {
            object-fit: cover;
          }

          .portfolio-avatar-fallback {
            display: grid;
            place-items: center;
            color: ${COLORS.primary};
            font-size: 26px;
            font-weight: 950;
          }

          .portfolio-student-title {
            min-width: 0;
          }

          .portfolio-student-title h2 {
            margin: 0 0 10px;
            font-size: clamp(24px, 3vw, 34px);
            line-height: 1.05;
            letter-spacing: -0.04em;
            overflow-wrap: anywhere;
          }

          .portfolio-meta-row {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }

          .portfolio-chip {
            min-height: 30px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 5px 10px;
            border-radius: 999px;
            color: #405066;
            background: ${COLORS.background};
            border: 1px solid ${COLORS.border};
            font-size: 13px;
            font-weight: 850;
          }

          .portfolio-chip strong {
            color: ${COLORS.primary};
          }

          .portfolio-progress-summary {
            min-width: 238px;
            display: grid;
            grid-template-columns: auto minmax(0, 1fr);
            gap: 14px;
            align-items: center;
            padding: 12px;
            border-radius: 22px;
            background: #EFF9FF;
            border: 1px solid #D7EEF9;
          }

          .portfolio-progress-summary h3 {
            margin: 0 0 4px;
            font-size: 15px;
          }

          .portfolio-progress-summary p {
            margin: 0;
            color: ${COLORS.secondary};
            font-size: 13px;
            line-height: 1.35;
          }

          .portfolio-donut {
            position: relative;
            display: grid;
            place-items: center;
            flex: 0 0 auto;
          }

          .portfolio-donut svg {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
          }

          .portfolio-donut strong {
            position: relative;
            color: ${COLORS.text};
            font-size: 24px;
            font-weight: 950;
          }

          .portfolio-donut-compact strong {
            font-size: 18px;
          }

          .portfolio-kpi-grid {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 12px;
            margin-bottom: 14px;
          }

          .portfolio-kpi-card {
            min-height: 112px;
            display: grid;
            gap: 10px;
            align-content: space-between;
            padding: 15px;
            border-radius: 22px;
            background: ${COLORS.surface};
            border: 1px solid ${COLORS.border};
            box-shadow: 0 16px 34px rgba(20, 32, 56, 0.06);
            transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
          }

          .portfolio-kpi-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 20px 42px rgba(20, 32, 56, 0.09);
            border-color: #DCE7F3;
          }

          .portfolio-kpi-head {
            display: grid;
            grid-template-columns: 42px minmax(0, 1fr);
            gap: 12px;
            align-items: center;
          }

          .portfolio-icon-box {
            width: 42px;
            height: 42px;
            display: inline-grid;
            place-items: center;
            border-radius: 17px;
            flex: 0 0 auto;
            font-size: 20px;
            font-weight: 950;
          }

          .portfolio-kpi-label {
            min-width: 0;
            color: ${COLORS.secondary};
            font-size: 13px;
            font-weight: 800;
            line-height: 1.25;
          }

          .portfolio-kpi-value-row {
            display: flex;
            align-items: end;
            justify-content: space-between;
            gap: 10px;
          }

          .portfolio-kpi-value {
            color: ${COLORS.text};
            font-size: 28px;
            font-weight: 950;
            line-height: 1;
            letter-spacing: -0.03em;
          }

          .portfolio-delta {
            min-height: 24px;
            display: inline-flex;
            align-items: center;
            padding: 4px 8px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 900;
            white-space: nowrap;
          }

          .portfolio-delta-good {
            color: ${COLORS.success};
            background: #F1FBF2;
          }

          .portfolio-delta-bad {
            color: ${COLORS.danger};
            background: #FFF2F1;
          }

          .portfolio-delta-neutral {
            color: ${COLORS.secondary};
            background: ${COLORS.background};
          }

          .portfolio-analytics-grid {
            display: grid;
            grid-template-columns: minmax(380px, 0.92fr) minmax(460px, 1.08fr);
            gap: 14px;
            margin-bottom: 14px;
          }

          .portfolio-section-header {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            align-items: center;
            margin-bottom: 14px;
          }

          .portfolio-section-header h3 {
            margin: 0;
            font-size: 20px;
            letter-spacing: -0.03em;
          }

          .portfolio-section-header span {
            color: ${COLORS.secondary};
            font-size: 13px;
            font-weight: 800;
          }

          .portfolio-radar-card {
            min-height: 420px;
            display: grid;
            align-content: start;
          }

          .portfolio-radar-wrap {
            min-height: 332px;
            display: grid;
            place-items: center;
            overflow: visible;
          }

          .portfolio-radar-svg {
            width: min(100%, 430px);
            height: auto;
            overflow: visible;
            display: block;
          }

          .portfolio-radar-svg-report {
            width: 100%;
            max-width: 330px;
          }

          .portfolio-chart {
            display: grid;
            gap: 8px;
          }

          .portfolio-chart-legend {
            display: flex;
            justify-content: center;
            gap: 16px;
            flex-wrap: wrap;
            color: ${COLORS.text};
            font-size: 13px;
            font-weight: 850;
          }

          .portfolio-chart-legend span {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            white-space: nowrap;
          }

          .portfolio-chart-legend i {
            width: 18px;
            height: 3px;
            border-radius: 999px;
          }

          .portfolio-line-svg {
            width: 100%;
            height: auto;
            display: block;
          }

          .portfolio-empty {
            min-height: 260px;
            display: grid;
            place-items: center;
            color: ${COLORS.secondary};
            text-align: center;
            font-size: 14px;
            line-height: 1.45;
            border-radius: 18px;
            background: ${COLORS.background};
            border: 1px dashed ${COLORS.border};
          }

          .portfolio-lower-grid {
            display: grid;
            grid-template-columns: minmax(360px, 1fr) minmax(360px, 1fr);
            gap: 14px;
            margin-bottom: 14px;
          }

          .portfolio-topic-list {
            display: grid;
            gap: 0;
          }

          .portfolio-topic-table-head {
            display: grid;
            grid-template-columns: minmax(0, 1.2fr) minmax(140px, 0.8fr) 76px;
            gap: 12px;
            padding-bottom: 8px;
            color: ${COLORS.secondary};
            font-size: 12px;
            font-weight: 900;
            border-bottom: 1px solid ${COLORS.border};
          }

          .portfolio-topic-row {
            display: grid;
            grid-template-columns: minmax(0, 1.2fr) minmax(140px, 0.8fr) 76px;
            gap: 12px;
            align-items: center;
            padding: 10px 0;
            border-top: 1px solid ${COLORS.border};
          }

          .portfolio-topic-row:first-child {
            border-top: 0;
            padding-top: 0;
          }

          .portfolio-topic-title {
            min-width: 0;
            overflow: visible;
            white-space: normal;
            overflow-wrap: anywhere;
            color: ${COLORS.text};
            font-size: 14px;
            font-weight: 900;
            line-height: 1.3;
          }

          .portfolio-topic-meta {
            color: ${COLORS.secondary};
            font-size: 12px;
            margin-top: 3px;
          }

          .portfolio-progress-track {
            height: 8px;
            overflow: hidden;
            border-radius: 999px;
            background: ${COLORS.border};
          }

          .portfolio-progress-fill {
            height: 100%;
            border-radius: inherit;
          }

          .portfolio-topic-count {
            text-align: right;
            color: ${COLORS.text};
            font-size: 18px;
            font-weight: 950;
          }

          .portfolio-calendar-title {
            margin-bottom: 10px;
            text-align: center;
            color: ${COLORS.text};
            font-weight: 900;
          }

          .portfolio-calendar-weekdays,
          .portfolio-calendar-grid {
            display: grid;
            grid-template-columns: repeat(7, minmax(0, 1fr));
            gap: 6px;
          }

          .portfolio-calendar-weekdays {
            margin-bottom: 6px;
            color: ${COLORS.secondary};
            font-size: 12px;
            font-weight: 900;
            text-align: center;
          }

          .portfolio-calendar-cell {
            min-height: 38px;
            aspect-ratio: 1.28 / 1;
            display: grid;
            place-items: center;
            border: 1px solid;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 900;
          }

          .portfolio-calendar-cell-empty {
            border: 0;
            background: transparent;
          }

          .portfolio-calendar-legend {
            display: flex;
            justify-content: center;
            gap: 14px;
            flex-wrap: wrap;
            margin-top: 12px;
            color: ${COLORS.secondary};
            font-size: 12px;
            font-weight: 800;
          }

          .portfolio-calendar-legend span {
            display: inline-flex;
            align-items: center;
            gap: 6px;
          }

          .portfolio-calendar-legend i {
            width: 10px;
            height: 10px;
            border-radius: 50%;
          }

          .portfolio-insights-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 14px;
            margin-bottom: 14px;
          }

          .portfolio-insight-card {
            display: grid;
            grid-template-columns: 46px minmax(0, 1fr);
            gap: 14px;
            align-content: start;
          }

          .portfolio-insight-card h3 {
            margin: 0 0 10px;
            font-size: 18px;
          }

          .portfolio-insight-list {
            display: grid;
            gap: 7px;
            color: #405066;
            font-size: 14px;
            line-height: 1.4;
          }

          .portfolio-insight-list div {
            display: grid;
            grid-template-columns: 10px minmax(0, 1fr);
            gap: 8px;
          }

          .portfolio-insight-list i {
            width: 6px;
            height: 6px;
            margin-top: 8px;
            border-radius: 50%;
          }

          .portfolio-comment-card {
            display: grid;
            grid-template-columns: 48px minmax(0, 1fr);
            gap: 14px;
            align-items: start;
            margin-bottom: 0;
          }

          .portfolio-comment-card h3 {
            margin: 0 0 8px;
            font-size: 18px;
          }

          .portfolio-comment-card textarea {
            width: 100%;
            min-height: 96px;
            resize: vertical;
            border-radius: 16px;
            line-height: 1.45;
          }

          .portfolio-report-modal {
            position: fixed;
            inset: 0;
            z-index: 1000;
            display: grid;
            place-items: center;
            padding: 14px;
            background: rgba(15, 23, 42, 0.52);
            backdrop-filter: blur(6px);
          }

          .portfolio-report-shell {
            width: min(980px, calc(100vw - 24px));
            max-height: calc(100vh - 24px);
            overflow: auto;
            display: grid;
            justify-items: center;
            gap: 12px;
            padding: 12px;
            border-radius: 24px;
            background: ${COLORS.background};
            box-shadow: 0 30px 80px rgba(15, 23, 42, 0.22);
          }

          .portfolio-report-actions {
            width: min(190mm, 100%);
            display: flex;
            justify-content: space-between;
            gap: 10px;
            align-items: center;
          }

          .portfolio-report-comment-editor {
            width: min(190mm, 100%);
            display: grid;
            gap: 6px;
            color: ${COLORS.secondary};
            font-size: 13px;
            font-weight: 800;
          }

          .portfolio-report-comment-editor textarea {
            border-radius: 16px;
            line-height: 1.45;
          }

          .report-a4 {
            width: 190mm;
            min-height: auto;
            box-sizing: border-box;
            display: grid;
            gap: 3.1mm;
            color: ${COLORS.text};
            background: ${COLORS.surface};
            border: 1px solid ${COLORS.border};
            border-radius: 20px;
            padding: 7mm;
            font-size: 9.4px;
            line-height: 1.35;
            overflow: visible;
          }

          .report-card {
            background: ${COLORS.surface};
            border: 1px solid ${COLORS.border};
            border-radius: 20px;
            page-break-inside: avoid;
          }

          .report-header {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 12px;
            align-items: start;
          }

          .report-logo {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 5px;
            color: ${COLORS.text};
            font-size: 17px;
            font-weight: 950;
            letter-spacing: -0.04em;
          }

          .report-logo-icon {
            width: 26px;
            height: 26px;
            display: grid;
            place-items: center;
            border-radius: 8px;
            color: #fff;
            background: ${COLORS.primary};
            font-size: 17px;
            line-height: 1;
          }

          .report-logo small {
            display: block;
            color: ${COLORS.primary};
            font-size: 8px;
            line-height: 0.9;
            text-align: right;
            letter-spacing: 0;
          }

          .report-title {
            margin: 0;
            color: ${COLORS.text};
            font-size: 24px;
            line-height: 1.05;
            letter-spacing: -0.04em;
          }

          .report-period {
            display: grid;
            gap: 2px;
            color: ${COLORS.text};
            font-size: 10px;
            font-weight: 900;
            text-align: right;
            white-space: nowrap;
          }

          .report-period span {
            color: ${COLORS.secondary};
            font-size: 8.8px;
          }

          .report-student-card {
            display: grid;
            grid-template-columns: auto minmax(0, 1fr) auto;
            gap: 12px;
            align-items: center;
            padding: 10px;
          }

          .report-avatar,
          .report-avatar-fallback {
            width: 54px;
            height: 54px;
            border-radius: 18px;
            border: 1px solid ${COLORS.border};
            background: #EFF9FF;
          }

          .report-avatar {
            object-fit: cover;
          }

          .report-avatar-fallback {
            display: grid;
            place-items: center;
            color: ${COLORS.primary};
            font-size: 18px;
            font-weight: 950;
          }

          .report-student-name {
            margin: 0 0 5px;
            font-size: 17px;
            line-height: 1.08;
            letter-spacing: -0.03em;
          }

          .report-student-meta {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
          }

          .report-student-meta span {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            min-height: 20px;
            padding: 3px 7px;
            border-radius: 999px;
            color: #405066;
            background: ${COLORS.background};
            font-size: 8.8px;
            font-weight: 850;
          }

          .report-student-meta strong {
            color: ${COLORS.primary};
          }

          .report-progress {
            min-width: 154px;
            display: grid;
            grid-template-columns: auto minmax(0, 1fr);
            gap: 8px;
            align-items: center;
          }

          .report-progress h3 {
            margin: 0 0 2px;
            font-size: 10px;
          }

          .report-progress p {
            margin: 0;
            color: ${COLORS.secondary};
            font-size: 8.4px;
          }

          .report-kpi-grid {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 2.4mm;
          }

          .report-kpi-card {
            min-height: 23mm;
            display: grid;
            gap: 5px;
            align-content: space-between;
            padding: 8px;
            border-radius: 17px;
          }

          .report-kpi-head {
            display: grid;
            grid-template-columns: 24px minmax(0, 1fr);
            gap: 6px;
            align-items: center;
          }

          .report-icon-box {
            width: 24px;
            height: 24px;
            display: grid;
            place-items: center;
            border-radius: 10px;
            font-size: 12px;
            font-weight: 950;
          }

          .report-kpi-label {
            color: ${COLORS.secondary};
            font-size: 8px;
            font-weight: 900;
            line-height: 1.22;
          }

          .report-kpi-value {
            margin-top: 3px;
            color: ${COLORS.text};
            font-size: 17px;
            font-weight: 950;
            line-height: 1;
          }

          .report-delta {
            display: inline-flex;
            align-items: center;
            width: max-content;
            max-width: 100%;
            min-height: 16px;
            margin-top: 5px;
            padding: 2px 6px;
            border-radius: 999px;
            font-size: 8px;
            font-weight: 950;
            white-space: nowrap;
          }

          .report-analytics-grid,
          .report-middle-grid {
            display: grid;
            grid-template-columns: 1fr 1.25fr;
            gap: 3mm;
          }

          .report-section {
            padding: 10px;
          }

          .report-section-title {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin: 0 0 7px;
            font-size: 13px;
            line-height: 1.1;
            letter-spacing: -0.03em;
          }

          .report-section-title span {
            color: ${COLORS.secondary};
            font-size: 8.4px;
            font-weight: 800;
          }

          .report-radar-wrap {
            min-height: 212px;
            display: grid;
            place-items: center;
          }

          .portfolio-chart-report {
            gap: 4px;
          }

          .portfolio-chart-report .portfolio-chart-legend {
            gap: 9px;
            font-size: 8.5px;
          }

          .portfolio-chart-report .portfolio-chart-legend i {
            width: 13px;
            height: 2px;
          }

          .report-topic-list {
            display: grid;
            gap: 6px;
          }

          .report-topic-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 68px 24px;
            gap: 7px;
            align-items: center;
          }

          .report-topic-title {
            overflow: hidden;
            color: ${COLORS.text};
            font-size: 8.8px;
            font-weight: 900;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .report-topic-count {
            text-align: right;
            color: ${COLORS.text};
            font-size: 9px;
            font-weight: 950;
          }

          .portfolio-calendar-compact .portfolio-calendar-title {
            margin-bottom: 6px;
            font-size: 9px;
          }

          .portfolio-calendar-compact .portfolio-calendar-weekdays,
          .portfolio-calendar-compact .portfolio-calendar-grid {
            gap: 2px;
          }

          .portfolio-calendar-compact .portfolio-calendar-weekdays {
            margin-bottom: 3px;
            font-size: 7.4px;
          }

          .portfolio-calendar-compact .portfolio-calendar-cell {
            min-height: 17px;
            border-radius: 5px;
            font-size: 7.8px;
          }

          .portfolio-calendar-compact .portfolio-calendar-legend {
            gap: 7px;
            margin-top: 7px;
            font-size: 7.6px;
          }

          .portfolio-calendar-compact .portfolio-calendar-legend i {
            width: 6px;
            height: 6px;
          }

          .report-insights-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 3mm;
          }

          .report-insight-card {
            display: grid;
            grid-template-columns: 28px minmax(0, 1fr);
            gap: 7px;
            align-content: start;
            min-height: 28mm;
            padding: 9px;
            border-radius: 18px;
          }

          .report-insight-card h3 {
            margin: 0 0 5px;
            font-size: 10.5px;
            line-height: 1.15;
          }

          .report-insight-list {
            display: grid;
            gap: 3px;
            color: #405066;
            font-size: 8.4px;
            line-height: 1.28;
          }

          .report-insight-list div {
            display: -webkit-box;
            overflow: hidden;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
          }

          .report-comment-card {
            display: grid;
            grid-template-columns: 28px minmax(0, 1fr);
            gap: 8px;
            align-items: start;
            padding: 9px;
            border-radius: 18px;
            background: #EFF9FF;
            border-color: #D7EEF9;
          }

          .report-comment-card h3 {
            margin: 0 0 4px;
            font-size: 10.5px;
          }

          .report-comment-card p {
            display: -webkit-box;
            overflow: hidden;
            margin: 0;
            color: #405066;
            font-size: 8.6px;
            line-height: 1.35;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 3;
          }

          @page {
            size: A4 portrait;
            margin: 10mm;
          }

          @media print {
            body * {
              visibility: hidden !important;
            }

            .report-a4,
            .report-a4 * {
              visibility: visible !important;
            }

            .report-a4 {
              position: absolute !important;
              left: 10mm !important;
              top: 10mm !important;
              width: 190mm !important;
              border: 0 !important;
              border-radius: 0 !important;
              box-shadow: none !important;
              padding: 0 !important;
              overflow: visible !important;
            }

            .portfolio-print-hidden {
              display: none !important;
            }

            .report-card {
              box-shadow: none !important;
            }
          }

          @media (max-width: 1180px) {
            .portfolio-toolbar,
            .portfolio-kpi-grid,
            .portfolio-analytics-grid,
            .portfolio-lower-grid,
            .portfolio-insights-grid {
              grid-template-columns: 1fr 1fr;
            }

            .portfolio-primary-button {
              grid-column: span 2;
            }
          }

          @media (max-width: 760px) {
            .portfolio-page {
              height: auto;
              display: block;
              overflow: visible;
            }

            .portfolio-heading-row,
            .portfolio-toolbar {
              margin-bottom: 14px;
            }

            .portfolio-content-viewport {
              overflow: visible;
              padding-right: 0;
            }

            .portfolio-toolbar,
            .portfolio-kpi-grid,
            .portfolio-analytics-grid,
            .portfolio-lower-grid,
            .portfolio-insights-grid,
            .portfolio-student-card {
              grid-template-columns: 1fr;
            }

            .portfolio-primary-button {
              grid-column: auto;
            }

            .portfolio-progress-summary {
              min-width: 0;
            }

            .portfolio-topic-row {
              grid-template-columns: 1fr;
            }

            .portfolio-topic-table-head {
              display: none;
            }

            .portfolio-topic-count {
              text-align: left;
            }
          }
        `}
      </style>

      <div className="portfolio-heading-row">
        <h1 className="page-heading" style={{ marginBottom: 0 }}>Портфолио</h1>
      </div>

      <section className="portfolio-toolbar mentor-panel" style={{ padding: 16 }}>
        <label className="portfolio-field">
          <span>Ученик</span>
          <select value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)}>
            {activeStudents.map((student) => (
              <option key={student.id} value={String(student.id)}>{student.full_name}</option>
            ))}
          </select>
        </label>

        <label className="portfolio-field">
          <span>Предмет</span>
          <select
            value={selectedSubjectFilter}
            onChange={(event) => setSelectedSubjectFilter(event.target.value)}
            disabled={studentSubjectOptions.length <= 1}
          >
            {studentSubjectOptions.length === 0 && <option value="">Нет предметов</option>}
            {studentSubjectOptions.length > 0 && (studentSubjectOptions.length > 1 || !selectedSubjectFilter) && (
              <option value="">Выберите предмет</option>
            )}
            {studentSubjectOptions.map((subject) => (
              <option key={subject.id} value={String(subject.id)}>{subject.name}</option>
            ))}
          </select>
        </label>

        <label className="portfolio-field">
          <span>Месяц / период</span>
          <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
        </label>

        <button
          type="button"
          className="portfolio-primary-button"
          title="Сформировать PDF"
          onClick={handleOpenReport}
          disabled={!selectedSubjectFilter}
        >
          Сформировать PDF
        </button>
      </section>

      <div className="portfolio-content-viewport">
        {subjectRequired && (
          <p className="portfolio-notice">Выберите предмет для портфолио и PDF-отчёта. Отчёт всегда формируется по одному конкретному предмету.</p>
        )}

        <section className="portfolio-student-card" style={panelStyle}>
        {studentAvatarUrl ? (
          <img className="portfolio-avatar" src={studentAvatarUrl} alt="" />
        ) : (
          <div className="portfolio-avatar-fallback">{getInitials(selectedStudent.full_name) || 'M'}</div>
        )}
        <div className="portfolio-student-title">
          <h2>{selectedStudent.full_name}</h2>
          <div className="portfolio-meta-row">
            <span className="portfolio-chip">{studentClassLabel}</span>
            <span className="portfolio-chip">Предмет: <strong>{selectedSubjectLabel}</strong></span>
          </div>
        </div>
        <div className="portfolio-progress-summary">
          <DonutChart value={currentStats.overallProgress} size={92} stroke={12} compact />
          <div>
            <h3>Общий прогресс</h3>
            <p>Сводный показатель по оценкам, ДЗ, посещаемости и темам.</p>
          </div>
        </div>
        </section>

        <section className="portfolio-kpi-grid">
        {kpiCards.map((card) => {
          const tone = deltaTone(card.delta);
          return (
            <article key={card.label} className="portfolio-kpi-card">
              <div className="portfolio-kpi-head">
                <span className="portfolio-icon-box" style={{ color: card.color, background: card.background }}>{card.icon}</span>
                <div className="portfolio-kpi-label">{card.label}</div>
              </div>
              <div className="portfolio-kpi-value-row">
                <strong className="portfolio-kpi-value">{card.value}</strong>
                <span className={`portfolio-delta portfolio-delta-${tone}`}>{card.delta}</span>
              </div>
            </article>
          );
        })}
        </section>

        <section className="portfolio-analytics-grid">
        <article className="portfolio-radar-card" style={panelStyle}>
          <div className="portfolio-section-header">
            <h3>Роза компетенций</h3>
          </div>
          <div className="portfolio-radar-wrap">
            <RadarChart values={competencyRows} />
          </div>
        </article>

        <article style={panelStyle}>
          <div className="portfolio-section-header">
            <h3>Динамика прогресса</h3>
          </div>
          {analyticsReady ? (
            <ProgressLineChart rows={progressRows} />
          ) : (
            <div className="portfolio-empty">После выбора предмета и появления занятий здесь будет динамика среднего балла, ДЗ и общего прогресса.</div>
          )}
        </article>
        </section>

        <section className="portfolio-lower-grid">
        <article style={panelStyle}>
          <div className="portfolio-section-header">
            <h3>Пройденные темы</h3>
            <span>Всего пройдено: {topicProgressRows.length} тем</span>
          </div>
          {topicProgressRows.length === 0 ? (
            <div className="portfolio-empty">За выбранный период пока нет тем с данными.</div>
          ) : (
            <div className="portfolio-topic-list">
              <div className="portfolio-topic-table-head">
                <span>Тема</span>
                <span>Доля</span>
                <span style={{ textAlign: 'right' }}>Количество</span>
              </div>
              {topicProgressRows.map((row) => {
                const share = (row.activityCount / topicActivityMax) * 100;
                return (
                  <div key={row.topic.id} className="portfolio-topic-row">
                    <div>
                      <div className="portfolio-topic-title">{row.topic.title}</div>
                      <div className="portfolio-topic-meta">Занятий: {row.lessonCount} · ДЗ: {row.completedAssignments}/{row.assignmentCount}</div>
                    </div>
                    <div className="portfolio-progress-track">
                      <div className="portfolio-progress-fill" style={{ width: `${share}%`, background: topicBarColor(row.progressPercent) }} />
                    </div>
                    <div className="portfolio-topic-count">{row.activityCount}</div>
                  </div>
                );
              })}
            </div>
          )}
        </article>

        <article style={panelStyle}>
          <div className="portfolio-section-header">
            <h3>Посещаемость</h3>
          </div>
          <AttendanceCalendar cells={calendarCells} month={selectedMonth} />
        </article>
        </section>

        <section className="portfolio-insights-grid">
        {[
          { title: 'Сильные стороны', items: strengths, accent: COLORS.success, bg: '#F1FBF2', icon: '★' },
          { title: 'Зоны роста', items: growthZones, accent: COLORS.warning, bg: '#FFF8EE', icon: '!' },
          { title: 'Рекомендации', items: recommendations, accent: COLORS.primary, bg: '#EFF9FF', icon: '✓' },
        ].map((section) => (
          <article key={section.title} className="portfolio-insight-card" style={panelStyle}>
            <span className="portfolio-icon-box" style={{ color: section.accent, background: section.bg }}>{section.icon}</span>
            <div>
              <h3 style={{ color: section.accent }}>{section.title}</h3>
              <div className="portfolio-insight-list">
                {section.items.map((item) => (
                  <div key={item}>
                    <i style={{ background: section.accent }} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>
        ))}
        </section>

        <section className="portfolio-comment-card" style={panelStyle}>
          <span className="portfolio-icon-box" style={{ color: COLORS.primary, background: '#EFF9FF' }}>□</span>
          <div>
            <h3>Комментарий преподавателя</h3>
            <textarea
              value={reportComment}
              onChange={(event) => setReportComment(event.target.value)}
              placeholder="Например: ученик стал увереннее решать задачи, но стоит закрепить теорию и больше практиковать задания повышенной сложности."
              rows={4}
              maxLength={360}
            />
          </div>
        </section>
      </div>

      {reportOpen && (
        <div className="portfolio-report-modal" onClick={() => setReportOpen(false)}>
          <div className="portfolio-report-shell" onClick={(event) => event.stopPropagation()}>
            <div className="portfolio-report-actions portfolio-print-hidden">
              <div style={{ color: COLORS.secondary, fontSize: 13, fontWeight: 850 }}>
                PDF A4 · {selectedStudent.full_name} · {selectedSubjectLabel}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" title="Скачать PDF" onClick={handleSaveReportPdf} disabled={pdfSaving} className="modal-primary" style={{ minWidth: 130 }}>
                  {pdfSaving ? 'Сохраняем...' : 'Скачать PDF'}
                </button>
                <button type="button" title="Закрыть" onClick={() => setReportOpen(false)} className="modal-close">
                  ×
                </button>
              </div>
            </div>

            <div ref={reportRef} className="report-a4">
              <header className="report-header">
                <div>
                  <div className="report-logo">
                    <span className="report-logo-icon">M</span>
                    <strong>mentor<small>app</small></strong>
                  </div>
                  <h2 className="report-title">Отчёт о прогрессе ученика</h2>
                </div>
                <div className="report-period">
                  <span>Период отчёта:</span>
                  {periodLabel}
                </div>
              </header>

              <section className="report-card report-student-card">
                {studentAvatarUrl ? (
                  <img className="report-avatar" src={studentAvatarUrl} alt="" />
                ) : (
                  <div className="report-avatar-fallback">{getInitials(selectedStudent.full_name) || 'M'}</div>
                )}
                <div>
                  <h3 className="report-student-name">{selectedStudent.full_name}</h3>
                  <div className="report-student-meta">
                    <span>Предмет: <strong>{selectedSubjectLabel}</strong></span>
                    <span>{studentClassLabel}</span>
                  </div>
                </div>
                <div className="report-progress">
                  <DonutChart value={currentStats.overallProgress} size={64} stroke={9} compact />
                  <div>
                    <h3>Общий прогресс</h3>
                    <p>по сравнению с прошлым периодом</p>
                  </div>
                </div>
              </section>

              <section className="report-kpi-grid">
                {kpiCards.map((card) => {
                  const tone = deltaTone(card.delta);
                  return (
                    <article key={card.label} className="report-card report-kpi-card">
                      <div className="report-kpi-head">
                        <span className="report-icon-box" style={{ color: card.color, background: card.background }}>{card.icon}</span>
                        <span className="report-kpi-label">{card.label}</span>
                      </div>
                      <div>
                        <div className="report-kpi-value">{card.value}</div>
                        <div className={`report-delta portfolio-delta-${tone}`}>{card.delta}</div>
                      </div>
                    </article>
                  );
                })}
              </section>

              <section className="report-analytics-grid">
                <article className="report-card report-section">
                  <h3 className="report-section-title">Роза компетенций</h3>
                  <div className="report-radar-wrap">
                    <RadarChart values={competencyRows} variant="report" />
                  </div>
                </article>

                <article className="report-card report-section">
                  <h3 className="report-section-title">Динамика прогресса</h3>
                  <ProgressLineChart rows={progressRows} variant="report" />
                </article>
              </section>

              <section className="report-middle-grid">
                <article className="report-card report-section">
                  <h3 className="report-section-title">
                    Пройденные темы
                    <span>Всего пройдено: {topicProgressRows.length} тем</span>
                  </h3>
                  {topicProgressRows.length === 0 ? (
                    <p style={{ margin: 0, color: COLORS.secondary }}>Пока нет тем с данными.</p>
                  ) : (
                    <div className="report-topic-list">
                      {topicProgressRows.slice(0, 5).map((row) => {
                        const share = (row.activityCount / topicActivityMax) * 100;
                        return (
                          <div key={row.topic.id} className="report-topic-row">
                            <div className="report-topic-title">{row.topic.title}</div>
                            <div className="portfolio-progress-track">
                              <div className="portfolio-progress-fill" style={{ width: `${share}%`, background: topicBarColor(row.progressPercent) }} />
                            </div>
                            <div className="report-topic-count">{row.activityCount}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>

                <article className="report-card report-section">
                  <h3 className="report-section-title">Посещаемость</h3>
                  <AttendanceCalendar cells={calendarCells} month={selectedMonth} compact />
                </article>
              </section>

              <section className="report-insights-grid">
                {[
                  { title: 'Сильные стороны', items: strengths.slice(0, 3), accent: COLORS.success, bg: '#F1FBF2', icon: '★' },
                  { title: 'Зоны роста', items: growthZones.slice(0, 3), accent: COLORS.warning, bg: '#FFF8EE', icon: '!' },
                  { title: 'Рекомендации', items: recommendations.slice(0, 3), accent: COLORS.primary, bg: '#EFF9FF', icon: '✓' },
                ].map((section) => (
                  <article key={section.title} className="report-card report-insight-card">
                    <span className="report-icon-box" style={{ color: section.accent, background: section.bg }}>{section.icon}</span>
                    <div>
                      <h3 style={{ color: section.accent }}>{section.title}</h3>
                      <div className="report-insight-list">
                        {section.items.map((item) => (
                          <div key={item}>• {item}</div>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
              </section>

              {reportComment.trim() && (
                <article className="report-card report-comment-card">
                  <span className="report-icon-box" style={{ color: COLORS.primary, background: '#DFF2FF' }}>□</span>
                  <div>
                    <h3>Комментарий преподавателя</h3>
                    <p>{reportComment.trim()}</p>
                  </div>
                </article>
              )}
            </div>

            <label className="portfolio-report-comment-editor portfolio-print-hidden">
              Комментарий преподавателя
              <textarea
                value={reportComment}
                onChange={(event) => setReportComment(event.target.value)}
                placeholder="Например: ученик показывает устойчивый прогресс, хорошо выполняет домашние задания и стал увереннее решать задачи."
                rows={3}
                maxLength={360}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
