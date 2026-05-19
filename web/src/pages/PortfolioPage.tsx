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
import { useMediaQuery } from '../hooks/useMediaQuery';
import { lessonDate } from '../utils/lessonTime';

const panelStyle = {
  background: 'rgba(255,255,255,0.88)',
  padding: '16px',
  borderRadius: '22px',
  border: '1px solid rgba(24,33,47,0.08)',
  boxShadow: 'var(--shadow-card)',
} as const;

const mutedTextStyle = {
  color: '#687486',
  fontSize: 14,
} as const;

type TopicProgress = {
  topic: TheoryTopic;
  lessonCount: number;
  assignmentCount: number;
  completedAssignments: number;
  averageGrade: number | null;
  progressPercent: number;
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

function deltaText(current: number | null, previous: number | null, suffix = '') {
  if (current === null || previous === null) return 'Недостаточно данных';
  const diff = current - previous;
  if (Math.abs(diff) < 0.05) return 'Без изменений';
  return `${diff > 0 ? '+' : ''}${diff.toFixed(1)}${suffix}`;
}

function wrapRadarLabel(label: string) {
  if (label.length <= 13) return [label];
  const words = label.split(' ');
  if (words.length > 1) return words;
  return [label.slice(0, 13), label.slice(13)];
}

function RadarChart({ values }: { values: Array<{ label: string; value: number }> }) {
  const size = 320;
  const center = size / 2;
  const radius = 86;
  const labelDistance = radius + 54;
  const points = values.map((item, index) => {
    const angle = (Math.PI * 2 * index) / values.length - Math.PI / 2;
    const distance = radius * (item.value / 100);
    const rawLabelX = center + Math.cos(angle) * labelDistance;
    const rawLabelY = center + Math.sin(angle) * labelDistance;
    const labelAnchor: 'end' | 'start' | 'middle' =
      rawLabelX < center - 8 ? 'start' : rawLabelX > center + 8 ? 'end' : 'middle';
    return {
      ...item,
      x: center + Math.cos(angle) * distance,
      y: center + Math.sin(angle) * distance,
      labelX: Math.max(34, Math.min(size - 34, rawLabelX)),
      labelY: Math.max(34, Math.min(size - 34, rawLabelY)),
      labelLines: wrapRadarLabel(item.label),
      labelAnchor,
    };
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxWidth: 340, overflow: 'visible' }}>
      {[0.33, 0.66, 1].map((scale) => (
        <circle key={scale} cx={center} cy={center} r={radius * scale} fill="none" stroke="rgba(23,32,51,0.12)" />
      ))}
      {points.map((point) => (
        <line key={point.label} x1={center} y1={center} x2={point.labelX} y2={point.labelY} stroke="rgba(23,32,51,0.1)" />
      ))}
      <polygon points={points.map((point) => `${point.x},${point.y}`).join(' ')} fill="rgba(42,171,238,0.2)" stroke="#2AABEE" strokeWidth="3" />
      {points.map((point) => (
        <g key={point.label}>
          <circle cx={point.x} cy={point.y} r="4" fill="#2AABEE" />
          <text
            x={point.labelX}
            y={point.labelY}
            textAnchor={point.labelAnchor}
            dominantBaseline="middle"
            fontSize="11"
            fontWeight="700"
            fill="#435066"
          >
            {point.labelLines.map((line, lineIndex) => (
              <tspan key={`${point.label}-${line}`} x={point.labelX} dy={lineIndex === 0 ? 0 : 13}>
                {line}
              </tspan>
            ))}
          </text>
        </g>
      ))}
    </svg>
  );
}

function GradeLineChart({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const width = 520;
  const height = 190;
  const padding = { top: 16, right: 18, bottom: 34, left: 34 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const points = rows.map((row, index) => {
    const x = padding.left + (rows.length <= 1 ? plotWidth / 2 : (plotWidth * index) / (rows.length - 1));
    const y = padding.top + plotHeight - ((row.value - 1) / 4) * plotHeight;
    return { ...row, x, y };
  });
  const areaPoints =
    points.length > 0
      ? `${padding.left},${padding.top + plotHeight} ${points.map((point) => `${point.x},${point.y}`).join(' ')} ${padding.left + plotWidth},${padding.top + plotHeight}`
      : '';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 174, display: 'block' }}>
      <defs>
        <linearGradient id="portfolioGradeFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(42,171,238,0.28)" />
          <stop offset="100%" stopColor="rgba(42,171,238,0.04)" />
        </linearGradient>
      </defs>
      {[1, 2, 3, 4, 5].map((tick) => {
        const y = padding.top + plotHeight - ((tick - 1) / 4) * plotHeight;
        return (
          <g key={tick}>
            <line x1={padding.left} x2={padding.left + plotWidth} y1={y} y2={y} stroke="rgba(23,32,51,0.09)" />
            <text x={padding.left - 12} y={y + 4} textAnchor="end" fontSize="12" fill="#687486">
              {tick}
            </text>
          </g>
        );
      })}
      {areaPoints && <polygon points={areaPoints} fill="url(#portfolioGradeFill)" />}
      {points.length > 0 && (
        <polyline
          points={points.map((point) => `${point.x},${point.y}`).join(' ')}
          fill="none"
          stroke="#2AABEE"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {points.map((point, index) => (
        <g key={`${point.label}-${index}`}>
          <circle cx={point.x} cy={point.y} r="4.5" fill="#2AABEE" />
          <text x={point.x} y={height - 10} textAnchor="middle" fontSize="11" fill="#687486">
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function PortfolioPage() {
  const [searchParams] = useSearchParams();
  const isTablet = useMediaQuery('(max-width: 1100px)');
  const isMobile = useMediaQuery('(max-width: 720px)');
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tutorStudents, setTutorStudents] = useState<TutorStudent[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [topics, setTopics] = useState<TheoryTopic[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState(() => formatMonthInput(new Date()));
  const [goalType, setGoalType] = useState('Общее обучение');
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
          await Promise.all([getStudents(), getSubjects(), getTutorStudents(), getLessons(), getAssignments(), getTopics()]);
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

  useEffect(() => {
    const subjectIds = new Set(studentRelations.map((relation) => String(relation.subject_id)));
    setSelectedSubjectFilter((current) => (current === 'all' || subjectIds.has(current) ? current : 'all'));
  }, [studentRelations]);

  const filteredRelations = useMemo(
    () =>
      selectedSubjectFilter === 'all'
        ? studentRelations
        : studentRelations.filter((relation) => String(relation.subject_id) === selectedSubjectFilter),
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
    ? `portfolio_comment:${selectedStudentId}:${selectedSubjectFilter}:${selectedMonth}:${goalType}`
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
        const activityScore = Math.min(topicLessons.length + topicAssignments.length, 4) / 4;
        const completionScore = topicAssignments.length > 0 ? topicCompletedAssignments.length / topicAssignments.length : 0;
        const gradeScore = avg === null ? 0 : avg / 5;
        return {
          topic,
          lessonCount: topicLessons.length,
          assignmentCount: topicAssignments.length,
          completedAssignments: topicCompletedAssignments.length,
          averageGrade: avg,
          progressPercent: clampPercent((activityScore * 0.35 + completionScore * 0.35 + gradeScore * 0.3) * 100),
        };
      })
      .sort((a, b) => b.progressPercent - a.progressPercent);
  }, [activeTopicIds, filteredRelations, monthAssignments, monthLessons, topics]);

  const topicAverage = topicProgressRows.length
    ? topicProgressRows.reduce((sum, row) => sum + row.progressPercent, 0) / topicProgressRows.length
    : 0;
  const currentStats = buildStats(monthLessons, monthAssignments, topicAverage);
  const previousStats = buildStats(previousMonthLessons, previousMonthAssignments, 0);
  const gradeRows = currentStats.conductedLessons
    .filter((lesson) => lesson.grade !== null)
    .sort((a, b) => lessonDate(a).localeCompare(lessonDate(b)))
    .map((lesson) => ({
      label: new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(lesson.starts_at)),
      value: lesson.grade ?? 0,
    }));
  const onTimeHomeworkPercent =
    currentStats.assignments.length > 0
      ? ((currentStats.assignments.length - currentStats.overdueAssignments.length) / currentStats.assignments.length) * 100
      : 0;
  const competencyRows = [
    { label: 'ДЗ', value: clampPercent(currentStats.homeworkPercent * 0.6 + (scoreToPercent(currentStats.averageAssignmentGrade) ?? 0) * 0.4) },
    { label: 'Сам.', value: clampPercent(currentStats.homeworkPercent * 0.7 + (currentStats.overdueAssignments.length ? 0 : 30)) },
    { label: 'Скорость', value: clampPercent(onTimeHomeworkPercent * 0.7 + currentStats.homeworkPercent * 0.3) },
    { label: 'Теория', value: clampPercent(topicAverage * 0.7 + (scoreToPercent(currentStats.averageLessonGrade) ?? 0) * 0.3) },
  ];

  const strengths = useMemo(() => {
    const items: string[] = [];
    const strongTopics = topicProgressRows.filter((row) => row.progressPercent >= 70).slice(0, 3).map((row) => row.topic.title);
    if (strongTopics.length > 0) items.push(`Уверенно идут темы: ${strongTopics.join(', ')}.`);
    if (currentStats.averageLessonGrade !== null && currentStats.averageLessonGrade >= 4.5) items.push('Высокая средняя оценка за занятия.');
    if (currentStats.averageAssignmentGrade !== null && currentStats.averageAssignmentGrade >= 4.5) items.push('Домашние задания выполняются качественно.');
    if (currentStats.homeworkPercent >= 80) items.push('Хорошая дисциплина по домашним заданиям.');
    return items.length ? items : ['Сильные стороны проявятся после накопления большего количества данных.'];
  }, [currentStats.averageAssignmentGrade, currentStats.averageLessonGrade, currentStats.homeworkPercent, topicProgressRows]);

  const weaknesses = useMemo(() => {
    const items: string[] = [];
    const weakTopics = topicProgressRows.filter((row) => row.progressPercent < 55).slice(0, 3).map((row) => row.topic.title);
    if (weakTopics.length > 0) items.push(`Требуют проработки темы: ${weakTopics.join(', ')}.`);
    if (currentStats.overdueAssignments.length > 0) items.push(`Есть просроченные задания: ${currentStats.overdueAssignments.length}.`);
    if (currentStats.averageLessonGrade !== null && currentStats.averageLessonGrade < 4) items.push('Средняя оценка за занятия ниже 4.');
    if (currentStats.averageAssignmentGrade !== null && currentStats.averageAssignmentGrade < 4) items.push('Средняя оценка за ДЗ ниже 4.');
    return items.length ? items : ['Явных слабых сторон по текущим данным не видно.'];
  }, [currentStats.averageAssignmentGrade, currentStats.averageLessonGrade, currentStats.overdueAssignments.length, topicProgressRows]);

  const nextSteps = [
    currentStats.overdueAssignments.length > 0
      ? 'Разобрать просроченные домашние задания и закрыть хвосты.'
      : 'Поддерживать текущий темп выполнения домашних заданий.',
    topicProgressRows.some((row) => row.progressPercent < 55)
      ? 'Вернуться к самым слабым темам и дать короткую закрепляющую практику.'
      : 'Добавить задачи повышенной сложности по уже освоенным темам.',
    'В конце месяца обновить комментарий репетитора и сформировать отчёт для опекуна.',
  ];

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
      reportRef.current.classList.add('portfolio-exporting-pdf');
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        ignoreElements: (element) => element.classList.contains('portfolio-pdf-hidden'),
      });
      const imageData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imageHeight = (canvas.height * pageWidth) / canvas.width;
      const renderHeight = Math.min(imageHeight, pageHeight);
      const renderWidth = imageHeight > pageHeight ? (canvas.width * pageHeight) / canvas.height : pageWidth;
      const renderX = (pageWidth - renderWidth) / 2;

      pdf.addImage(imageData, 'PNG', renderX, 0, renderWidth, renderHeight);

      const safeName = selectedStudent.full_name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'student';
      pdf.save(`portfolio-${safeName}-${selectedMonth}.pdf`);
    } catch {
      alert('Не удалось сохранить PDF. Попробуйте ещё раз.');
    } finally {
      reportRef.current?.classList.remove('portfolio-exporting-pdf');
      setPdfSaving(false);
    }
  };

  const comparisonRows = [
    {
      label: 'Общий прогресс',
      before: formatPercent(previousStats.overallProgress),
      after: formatPercent(currentStats.overallProgress),
      delta: deltaText(currentStats.overallProgress, previousStats.overallProgress, '%'),
    },
    {
      label: 'Оценка за занятия',
      before: formatAverage(previousStats.averageLessonGrade),
      after: formatAverage(currentStats.averageLessonGrade),
      delta: deltaText(currentStats.averageLessonGrade, previousStats.averageLessonGrade),
    },
    {
      label: 'Оценка за ДЗ',
      before: formatAverage(previousStats.averageAssignmentGrade),
      after: formatAverage(currentStats.averageAssignmentGrade),
      delta: deltaText(currentStats.averageAssignmentGrade, previousStats.averageAssignmentGrade),
    },
    {
      label: 'Выполнение ДЗ',
      before: formatPercent(previousStats.homeworkPercent),
      after: formatPercent(currentStats.homeworkPercent),
      delta: deltaText(currentStats.homeworkPercent, previousStats.homeworkPercent, '%'),
    },
  ];
  const selectedMonthRange = monthRange(selectedMonth);
  const firstMonthDayOffset = (selectedMonthRange.start.getDay() + 6) % 7;
  const calendarDays = [
    ...Array.from({ length: firstMonthDayOffset }, () => null),
    ...Array.from({ length: selectedMonthRange.end.getDate() }, (_, index) => index + 1),
  ];

  return (
    <div>
      <style>
        {`
          .portfolio-pdf-only {
            display: none !important;
          }

          .portfolio-exporting-pdf .portfolio-pdf-only {
            display: block !important;
          }

          .portfolio-report-visuals + .portfolio-pdf-hidden,
          .portfolio-report-visuals + .portfolio-pdf-hidden + .portfolio-pdf-only,
          .portfolio-report-visuals ~ .portfolio-pdf-hidden,
          .portfolio-report-visuals ~ .portfolio-pdf-only,
          .portfolio-exporting-pdf .portfolio-report-visuals + .portfolio-pdf-hidden + .portfolio-pdf-only {
            display: none !important;
          }

          .portfolio-exporting-pdf {
            width: 820px !important;
            max-height: none !important;
            overflow: visible !important;
          }

          .portfolio-exporting-pdf .portfolio-report-visuals {
            grid-template-columns: 1fr !important;
          }

          @media print {
            body * {
              visibility: hidden !important;
            }

            .portfolio-print-area,
            .portfolio-print-area * {
              visibility: visible !important;
            }

            .portfolio-print-area {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              max-height: none !important;
              overflow: visible !important;
              border-radius: 0 !important;
              box-shadow: none !important;
            }

            .portfolio-print-hidden {
              display: none !important;
            }

            .portfolio-pdf-only {
              display: block !important;
            }
          }
        `}
      </style>
      <section
        className="toolbar-panel mentor-panel"
        style={{
          gridTemplateColumns: isTablet ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))',
          gap: 14,
          padding: '14px 18px',
          marginBottom: 10,
          borderRadius: 18,
        }}
      >
        <label style={{ display: 'grid', gap: 5 }}>
          <span style={{ ...mutedTextStyle, fontSize: 13, fontWeight: 700 }}>Ученик</span>
          <select value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)}>
            {activeStudents.map((student) => (
              <option key={student.id} value={String(student.id)}>{student.full_name}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'grid', gap: 5 }}>
          <span style={{ ...mutedTextStyle, fontSize: 13, fontWeight: 700 }}>Предмет</span>
          <select value={selectedSubjectFilter} onChange={(event) => setSelectedSubjectFilter(event.target.value)}>
            <option value="all">Все предметы</option>
            {studentRelations.map((relation) => {
              const subject = subjectMap.get(relation.subject_id);
              return <option key={relation.id} value={String(relation.subject_id)}>{relation.subject_name ?? subject?.name ?? `Предмет #${relation.subject_id}`}</option>;
            })}
          </select>
        </label>

        <label style={{ display: 'grid', gap: 5 }}>
          <span style={{ ...mutedTextStyle, fontSize: 13, fontWeight: 700 }}>Цель</span>
          <select value={goalType} onChange={(event) => setGoalType(event.target.value)}>
            <option value="Общее обучение">Общее обучение</option>
            <option value="ОГЭ">ОГЭ</option>
            <option value="ЕГЭ">ЕГЭ</option>
            <option value="Повышение успеваемости">Повышение успеваемости</option>
          </select>
        </label>

        <label style={{ display: 'grid', gap: 5 }}>
          <span style={{ ...mutedTextStyle, fontSize: 13, fontWeight: 700 }}>Месяц</span>
          <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
        </label>
      </section>

      <section className="metric-grid" style={{ gridTemplateColumns: isTablet ? undefined : 'repeat(5, minmax(0, 1fr))', gap: 10, marginBottom: 10 }}>
        {[
          ['Общий прогресс', formatPercent(currentStats.overallProgress), '#2AABEE', '◔'],
          ['Оценка занятий', formatAverage(currentStats.averageLessonGrade), '#e5a11f', '★'],
          ['Оценка ДЗ', formatAverage(currentStats.averageAssignmentGrade), '#2AABEE', '▣'],
          ['Выполнено ДЗ', `${currentStats.completedAssignments.length}/${currentStats.assignments.length}`, '#4CAF50', '☑'],
          ['Посещаемость', formatPercent(currentStats.attendancePercent), '#9C27B0', '●'],
        ].map(([label, value, color, icon]) => (
          <article key={label} className="metric-card" style={{ minHeight: 68, padding: '12px 14px', borderRadius: 18, background: 'rgba(255,255,255,0.9)', borderColor: `${color}18` }}>
            <span className="metric-icon" style={{ width: 38, height: 38, borderRadius: 14, background: `${color}14`, color, fontSize: 19 }}>{icon}</span>
            <div>
              <div className="metric-label" style={{ fontSize: 13 }}>{label}</div>
              <div className="metric-value" style={{ fontSize: 26, lineHeight: 1.05 }}>{value}</div>
            </div>
          </article>
        ))}
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: isTablet ? '1fr' : '1.34fr 0.86fr 1.1fr',
          gap: 10,
          marginBottom: 10,
          alignItems: 'stretch',
        }}
      >
        <article style={{ ...panelStyle, padding: 14, borderRadius: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', marginBottom: 8 }}>
            <div>
              <h3 style={{ fontSize: 19, marginBottom: 2 }}>Было / стало</h3>
              <div style={{ ...mutedTextStyle, fontSize: 12 }}>
                Сравнение {formatMonthLabel(previousMonthValue)} и {formatMonthLabel(selectedMonth)}.
              </div>
            </div>
            <button type="button" title="Сформировать отчёт для опекуна" onClick={() => setReportOpen(true)} style={{ minWidth: 52, height: 36, padding: '0 14px', borderRadius: 999, background: '#2AABEE', boxShadow: 'none' }}>
              PDF
            </button>
          </div>
          <div style={{ border: '1px solid rgba(24,33,47,0.08)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.9fr 0.8fr 1fr', gap: 8, padding: '8px 12px', color: '#687486', fontSize: 12, fontWeight: 800 }}>
              <span>Показатель</span>
              <span>{formatMonthLabel(previousMonthValue).replace(' г.', '')}</span>
              <span>{formatMonthLabel(selectedMonth).replace(' г.', '')}</span>
              <span>Изменение</span>
            </div>
            {comparisonRows.map((row) => (
              <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.9fr 0.8fr 1fr', gap: 8, alignItems: 'center', padding: '8px 12px', borderTop: '1px solid rgba(24,33,47,0.08)', background: 'rgba(255,255,255,0.72)', fontSize: 13 }}>
                <strong style={{ color: '#1f2a3b' }}>{row.label}</strong>
                <span style={{ color: '#687486' }}>{row.before}</span>
                <strong style={{ color: '#1f2a3b' }}>{row.after}</strong>
                <strong style={{ color: row.delta.startsWith('+') ? '#4CAF50' : '#435066', fontSize: 12 }}>{row.delta}</strong>
              </div>
            ))}
          </div>
        </article>

        <article style={{ ...panelStyle, padding: 14, borderRadius: 18, display: 'grid', justifyItems: 'center', gap: 4 }}>
          <h3 style={{ fontSize: 19, marginBottom: 0, justifySelf: 'start' }}>Роза компетенций</h3>
          <div style={{ width: '100%', maxWidth: 270 }}>
            <RadarChart values={competencyRows} />
          </div>
          <div style={{ ...mutedTextStyle, fontSize: 12, textAlign: 'center' }}>
            Компетенции рассчитаны по текущим учебным данным.
          </div>
        </article>

        <article style={{ ...panelStyle, padding: 14, borderRadius: 18 }}>
          <h3 style={{ fontSize: 19, marginBottom: 8 }}>Динамика оценок</h3>
          {gradeRows.length === 0 ? (
            <p style={{ ...mutedTextStyle, marginBottom: 0 }}>За выбранный месяц пока нет оценок за занятия.</p>
          ) : (
            <GradeLineChart rows={gradeRows} />
          )}
        </article>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: isTablet ? '1fr' : '1.34fr 0.62fr 1.34fr',
          gap: 10,
          alignItems: 'stretch',
        }}
      >
        <article style={{ ...panelStyle, padding: 14, borderRadius: 18 }}>
          <h3 style={{ fontSize: 19, marginBottom: 10 }}>Посещаемость</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
            {[
              ['Проведено', currentStats.conductedLessons.length, '#4CAF50'],
              ['Запланировано', currentStats.lessons.filter((lesson) => lesson.conduct_status === 'scheduled').length, '#2AABEE'],
              ['Отменено', currentStats.lessons.filter((lesson) => lesson.conduct_status === 'cancelled').length, '#F44336'],
            ].map(([label, value, color]) => (
              <div key={label} style={{ padding: '8px 10px', borderRadius: 12, background: `${color}10` }}>
                <strong style={{ color: String(color), fontSize: 20 }}>{String(value)}</strong>
                <div style={{ ...mutedTextStyle, fontSize: 12 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, color: '#687486', fontSize: 12, fontWeight: 800, marginBottom: 6, textAlign: 'center' }}>
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {calendarDays.map((day, index) => {
              if (day === null) return <span key={`empty-${index}`} />;
              const date = `${selectedMonth}-${String(day).padStart(2, '0')}`;
              const dayLessons = monthLessons.filter((lesson) => lessonDate(lesson) === date);
              const conducted = dayLessons.some((lesson) => lesson.conduct_status === 'conducted');
              const cancelled = dayLessons.some((lesson) => lesson.conduct_status === 'cancelled');
              const scheduled = dayLessons.some((lesson) => lesson.conduct_status === 'scheduled');
              const color = conducted ? '#4CAF50' : cancelled ? '#F44336' : scheduled ? '#2AABEE' : 'rgba(23,32,51,0.06)';

              return (
                <span key={date} title={`${day}: ${dayLessons.length} занятий`} style={{ height: 30, borderRadius: 9, background: color, color: conducted || cancelled || scheduled ? '#fff' : '#435066', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 900 }}>
                  {day}
                </span>
              );
            })}
          </div>
        </article>

        <article style={{ ...panelStyle, padding: 14, borderRadius: 18, display: 'grid', alignContent: 'start', gap: 10 }}>
          <h3 style={{ fontSize: 19, marginBottom: 0 }}>Освоение тем</h3>
          <p style={{ ...mutedTextStyle, fontSize: 13, lineHeight: 1.45, marginBottom: 0 }}>
            Показываются только темы, которые реально использовались в занятиях или ДЗ за выбранный месяц.
          </p>
          {topicProgressRows.length === 0 ? (
            <div style={{ display: 'grid', justifyItems: 'center', gap: 8, marginTop: 8, color: '#687486', textAlign: 'center' }}>
              <span style={{ width: 58, height: 58, borderRadius: '50%', background: 'rgba(23,32,51,0.06)', display: 'grid', placeItems: 'center', fontSize: 28 }}>▤</span>
              <p style={{ margin: 0, fontSize: 13 }}>За выбранный месяц пока нет тем с данными.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8, maxHeight: 192, overflow: 'auto', paddingRight: 4 }}>
              {topicProgressRows.map((row) => (
                <div key={row.topic.id} style={{ display: 'grid', gap: 5, padding: 8, borderRadius: 12, background: 'rgba(23,32,51,0.035)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                    <strong>{row.topic.title}</strong>
                    <strong style={{ color: '#2AABEE' }}>{formatPercent(row.progressPercent)}</strong>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: 'rgba(23,32,51,0.08)', overflow: 'hidden' }}>
                    <div style={{ width: `${row.progressPercent}%`, height: '100%', borderRadius: 999, background: '#4CAF50' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article style={{ ...panelStyle, padding: 14, borderRadius: 18, display: 'grid', gap: 10 }}>
          {[
            { title: 'Сильные стороны', items: strengths, accent: '#4CAF50', icon: '✓' },
            { title: 'Зоны роста', items: weaknesses, accent: '#F44336', icon: '↗' },
            { title: 'Следующие шаги', items: nextSteps, accent: '#FF9800', icon: '◎' },
          ].map((section) => (
            <div key={section.title} style={{ display: 'grid', gridTemplateColumns: '30px 1fr', gap: 10, paddingBottom: 8, borderBottom: section.title === 'Следующие шаги' ? 'none' : '1px solid rgba(24,33,47,0.08)' }}>
              <span style={{ width: 28, height: 28, borderRadius: '50%', background: `${section.accent}16`, color: section.accent, display: 'grid', placeItems: 'center', fontWeight: 900 }}>{section.icon}</span>
              <div>
                <h3 style={{ color: section.accent, fontSize: 17, marginBottom: 6 }}>{section.title}</h3>
                <div style={{ display: 'grid', gap: 5 }}>
                  {section.items.map((item) => (
                    <div key={item} style={{ color: '#435066', lineHeight: 1.35, fontSize: 13 }}>• {item}</div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </article>
      </section>

      {false && (
        <>
      <h1 className="page-heading">Портфолио</h1>
      <section
        className="toolbar-panel mentor-panel"
        style={{
          gridTemplateColumns: isTablet ? '1fr 1fr' : '1.2fr 1fr 1fr 0.9fr auto',
          marginBottom: 12,
        }}
      >
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ ...mutedTextStyle, fontSize: 14 }}>Ученик</span>
            <select value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)}>
              {activeStudents.map((student) => (
                <option key={student.id} value={String(student.id)}>{student.full_name}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ ...mutedTextStyle, fontSize: 14 }}>Предмет</span>
            <select value={selectedSubjectFilter} onChange={(event) => setSelectedSubjectFilter(event.target.value)}>
              <option value="all">Все предметы</option>
              {studentRelations.map((relation) => {
                const subject = subjectMap.get(relation.subject_id);
                return <option key={relation.id} value={String(relation.subject_id)}>{relation.subject_name ?? subject?.name ?? `Предмет #${relation.subject_id}`}</option>;
              })}
            </select>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ ...mutedTextStyle, fontSize: 14 }}>Цель</span>
            <select value={goalType} onChange={(event) => setGoalType(event.target.value)}>
              <option value="Общее обучение">Общее обучение</option>
              <option value="ОГЭ">ОГЭ</option>
              <option value="ЕГЭ">ЕГЭ</option>
              <option value="Повышение успеваемости">Повышение успеваемости</option>
            </select>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ ...mutedTextStyle, fontSize: 14 }}>Месяц</span>
            <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
          </label>
          <button type="button" title="Сформировать отчёт для опекуна" onClick={() => setReportOpen(true)} style={{ alignSelf: 'end', minWidth: 52, height: 44, padding: '0 16px', borderRadius: 14, background: '#2AABEE', boxShadow: 'none' }}>
            PDF
          </button>
      </section>

      <section className="metric-grid" style={{ gridTemplateColumns: isTablet ? undefined : 'repeat(5, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
        {[
          ['Общий прогресс', formatPercent(currentStats.overallProgress), '#2AABEE', '↗'],
          ['Оценка занятий', formatAverage(currentStats.averageLessonGrade), '#4CAF50', '★'],
          ['Оценка ДЗ', formatAverage(currentStats.averageAssignmentGrade), '#2AABEE', '✓'],
          ['Выполнено ДЗ', `${currentStats.completedAssignments.length}/${currentStats.assignments.length}`, '#9C27B0', '▣'],
          ['Посещаемость', formatPercent(currentStats.attendancePercent), '#2AABEE', '●'],
        ].map(([label, value, color, icon]) => (
          <article key={label} className="metric-card" style={{ minHeight: 82, padding: '14px 16px', background: `linear-gradient(135deg, ${color}10, rgba(255,255,255,0.92))`, borderColor: `${color}24` }}>
            <span className="metric-icon" style={{ width: 44, height: 44, borderRadius: 16, background: `${color}14`, color }}>{icon}</span>
            <div>
              <div className="metric-label">{label}</div>
              <div className="metric-value">{value}</div>
            </div>
          </article>
        ))}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 0.92fr', gap: 12, marginBottom: 12 }}>
        <article style={panelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ fontSize: 19, marginBottom: 4 }}>Было / стало</h3>
              <div style={mutedTextStyle}>
                Сравнение {formatMonthLabel(previousMonthValue)} и {formatMonthLabel(selectedMonth)}.
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {comparisonRows.map((row) => (
              <div key={row.label} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 88px 88px 120px', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 14, background: 'rgba(23,32,51,0.03)', border: '1px solid rgba(24,33,47,0.06)' }}>
                <strong style={{ color: '#1f2a3b' }}>{row.label}</strong>
                <span style={mutedTextStyle}>{row.before}</span>
                <span style={{ color: '#1f2a3b', fontWeight: 800 }}>{row.after}</span>
                <span style={{ color: row.delta.startsWith('+') ? '#4CAF50' : '#687486', fontWeight: 800 }}>{row.delta}</span>
              </div>
            ))}
          </div>
        </article>

        <article style={{ ...panelStyle, display: 'grid', placeItems: 'center', padding: 14 }}>
          <div style={{ width: '100%', display: 'grid', justifyItems: 'center', gap: 8 }}>
            <h3 style={{ fontSize: 19, marginBottom: 0, justifySelf: 'start' }}>Роза компетенций</h3>
            <RadarChart values={competencyRows} />
            <div style={{ ...mutedTextStyle, textAlign: 'center' }}>
              ДЗ, самостоятельность, скорость и теория считаются по текущим учебным данным.
            </div>
          </div>
        </article>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '0.95fr 1.05fr', gap: 12, marginBottom: 12 }}>
        <article style={panelStyle}>
          <h3 style={{ fontSize: 19, marginBottom: 10 }}>Динамика оценок</h3>
          {gradeRows.length === 0 ? (
            <p style={{ ...mutedTextStyle, marginBottom: 0 }}>За выбранный месяц пока нет оценок за занятия.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gradeRows.length}, minmax(22px, 1fr))`, gap: 8, alignItems: 'end', minHeight: 122 }}>
              {gradeRows.map((row, index) => (
                <div key={`${row.label}-${index}`} title={`${row.label}: ${row.value}`} style={{ display: 'grid', gap: 6 }}>
                  <div style={{ height: `${Math.max(10, (row.value / 5) * 96)}px`, borderRadius: '12px 12px 6px 6px', background: 'linear-gradient(180deg, #2AABEE 0%, #2AABEE 100%)' }} />
                  <div style={{ color: '#687486', fontSize: 11, textAlign: 'center' }}>{row.label}</div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article style={panelStyle}>
          <h3 style={{ fontSize: 19, marginBottom: 10 }}>Посещаемость</h3>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
            {[
              ['Проведено', currentStats.conductedLessons.length, '#4CAF50'],
              ['Запланировано', currentStats.lessons.filter((lesson) => lesson.conduct_status === 'scheduled').length, '#2AABEE'],
              ['Отменено', currentStats.lessons.filter((lesson) => lesson.conduct_status === 'cancelled').length, '#F44336'],
            ].map(([label, value, color]) => (
              <div key={label} style={{ padding: 10, borderRadius: 14, background: `${color}12` }}>
                <div style={{ color: String(color), fontWeight: 900, fontSize: 20 }}>{String(value)}</div>
                <div style={{ ...mutedTextStyle, fontSize: 13 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {Array.from({ length: monthRange(selectedMonth).end.getDate() }, (_, index) => {
              const date = `${selectedMonth}-${String(index + 1).padStart(2, '0')}`;
              const dayLessons = monthLessons.filter((lesson) => lessonDate(lesson) === date);
              const conducted = dayLessons.some((lesson) => lesson.conduct_status === 'conducted');
              const cancelled = dayLessons.some((lesson) => lesson.conduct_status === 'cancelled');
              const scheduled = dayLessons.some((lesson) => lesson.conduct_status === 'scheduled');
              const color = conducted ? '#4CAF50' : cancelled ? '#F44336' : scheduled ? '#2AABEE' : 'rgba(23,32,51,0.08)';

              return (
                <span key={date} title={`${index + 1}: ${dayLessons.length} зан.`} style={{ height: 28, borderRadius: 9, background: color, color: conducted || cancelled || scheduled ? '#fff' : '#687486', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800 }}>
                  {index + 1}
                </span>
              );
            })}
          </div>
        </article>
      </section>

      <section style={{ ...panelStyle, marginBottom: 12 }}>
        <div style={{ marginBottom: 12 }}>
          <h3 style={{ fontSize: 19, marginBottom: 4 }}>Освоение тем</h3>
          <div style={mutedTextStyle}>
            Показываются только темы, которые реально использовались в занятиях или ДЗ за выбранный месяц.
          </div>
        </div>

        {topicProgressRows.length === 0 ? (
          <p style={{ ...mutedTextStyle, marginBottom: 0 }}>За выбранный месяц пока нет тем с данными.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            {topicProgressRows.map((row) => (
              <div key={row.topic.id} style={{ padding: 12, borderRadius: 16, border: '1px solid rgba(24,33,47,0.08)', background: 'rgba(23,32,51,0.03)', display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 800, color: '#1f2a3b' }}>{row.topic.title}</div>
                    <div style={{ ...mutedTextStyle, marginTop: 4 }}>{row.topic.description || 'Описание темы не заполнено'}</div>
                  </div>
                  <strong style={{ color: '#2AABEE' }}>{formatPercent(row.progressPercent)}</strong>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: 'rgba(23,32,51,0.08)', overflow: 'hidden' }}>
                  <div style={{ width: `${row.progressPercent}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, #4CAF50 0%, #4CAF50 100%)' }} />
                </div>
                <div style={{ color: '#435066', fontSize: 13 }}>
                  Занятий: {row.lessonCount} • ДЗ: {row.completedAssignments}/{row.assignmentCount} • Средняя: {formatAverage(row.averageGrade)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 1fr 1fr', gap: 12 }}>
        {[
          { title: 'Сильные стороны', items: strengths, accent: '#4CAF50' },
          { title: 'Зоны роста', items: weaknesses, accent: '#F44336' },
          { title: 'Следующие шаги', items: nextSteps, accent: '#FF9800' },
        ].map((section) => (
          <article key={section.title} style={panelStyle}>
            <h3 style={{ color: section.accent, fontSize: 19, marginBottom: 10 }}>{section.title}</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              {section.items.map((item) => (
                <div key={item} style={{ color: '#435066', lineHeight: 1.4, fontSize: 14 }}>{item}</div>
              ))}
            </div>
          </article>
        ))}
      </section>

        </>
      )}

      {reportOpen && (
        <div onClick={() => setReportOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.46)', display: 'grid', placeItems: 'center', padding: 12, zIndex: 50 }}>
          <div ref={reportRef} className="portfolio-print-area" onClick={(event) => event.stopPropagation()} style={{ width: 'min(1160px, 100%)', maxHeight: 'calc(100vh - 24px)', overflow: 'auto', background: '#fff', borderRadius: 24, padding: isMobile ? 14 : 18, boxShadow: '0 30px 80px rgba(15,23,42,0.22)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <div>
                <h2 style={{ fontSize: 26, marginBottom: 4 }}>Отчёт для опекуна</h2>
                <div style={mutedTextStyle}>{selectedStudent.full_name} • {formatMonthLabel(selectedMonth)} • {goalType}</div>
              </div>
              <div className="portfolio-print-hidden portfolio-pdf-hidden" style={{ display: 'flex', gap: 8, alignItems: 'start' }}>
                <button type="button" title="Сохранить отчёт в PDF" onClick={handleSaveReportPdf} disabled={pdfSaving} style={{ minWidth: 52, height: 42, padding: '0 14px', borderRadius: 999, background: '#2AABEE', boxShadow: 'none', alignSelf: 'start' }}>{pdfSaving ? '...' : 'PDF'}</button>
                <button type="button" title="Закрыть" onClick={() => setReportOpen(false)} style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, background: '#172033', boxShadow: 'none', alignSelf: 'start' }}>×</button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ ...panelStyle, padding: 14, borderRadius: 18, boxShadow: 'none' }}>
                <h3 style={{ fontSize: 18, marginBottom: 8 }}>Краткая сводка</h3>
                <p style={{ color: '#435066', lineHeight: 1.45, marginBottom: 0 }}>
                  Общий прогресс: <strong>{formatPercent(currentStats.overallProgress)}</strong>. Средняя оценка за занятия: <strong>{formatAverage(currentStats.averageLessonGrade)}</strong>. Средняя оценка за ДЗ: <strong>{formatAverage(currentStats.averageAssignmentGrade)}</strong>. Посещаемость: <strong>{formatPercent(currentStats.attendancePercent)}</strong>.
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                <div style={{ ...panelStyle, padding: 14, borderRadius: 18, boxShadow: 'none' }}>
                  <h3 style={{ fontSize: 17, marginBottom: 8 }}>Сильные стороны</h3>
                  {strengths.map((item) => <p key={item} style={{ color: '#435066', lineHeight: 1.35, marginBottom: 6 }}>{item}</p>)}
                </div>
                <div style={{ ...panelStyle, padding: 14, borderRadius: 18, boxShadow: 'none' }}>
                  <h3 style={{ fontSize: 17, marginBottom: 8 }}>Зоны роста</h3>
                  {weaknesses.map((item) => <p key={item} style={{ color: '#435066', lineHeight: 1.35, marginBottom: 6 }}>{item}</p>)}
                </div>
              </div>
              <label className="portfolio-pdf-hidden" style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>
                Комментарий репетитора
                <textarea value={reportComment} onChange={(event) => setReportComment(event.target.value)} placeholder="Например: ученик стал увереннее решать квадратные уравнения, но стоит закрепить задачи на проценты." rows={3} />
              </label>
              {reportComment && (
                <div className="portfolio-pdf-only" style={{ ...panelStyle, padding: 14, borderRadius: 18, boxShadow: 'none', background: 'rgba(42,171,238,0.08)' }}>
                  <h3 style={{ fontSize: 17, marginBottom: 8 }}>Комментарий</h3>
                  <p style={{ color: '#435066', lineHeight: 1.4, marginBottom: 0 }}>{reportComment}</p>
                </div>
              )}
              <div className="portfolio-report-visuals" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '0.9fr 1.1fr', gap: 10, alignItems: 'stretch' }}>
                <div style={{ ...panelStyle, padding: 14, borderRadius: 18, boxShadow: 'none', display: 'grid', justifyItems: 'center', gap: 4 }}>
                  <h3 style={{ fontSize: 17, marginBottom: 0, justifySelf: 'start' }}>Роза компетенций</h3>
                  <RadarChart values={competencyRows} />
                  <p style={{ display: 'none' }}>
                    ДЗ, самостоятельность, скорость и теория рассчитаны по занятиям, домашним заданиям и освоенным темам.
                  </p>
                  <div style={{ width: '100%', display: 'grid', gap: 4, color: '#687486', fontSize: 11, lineHeight: 1.3 }}>
                    <div><strong style={{ color: '#435066' }}>ДЗ</strong> — качество и регулярность домашних заданий.</div>
                    <div><strong style={{ color: '#435066' }}>Сам.</strong> — насколько ученик справляется без постоянной помощи.</div>
                    <div><strong style={{ color: '#435066' }}>Скорость</strong> — соблюдение дедлайнов и общий темп выполнения ДЗ.</div>
                    <div><strong style={{ color: '#435066' }}>Теория</strong> — понимание тем и умение применять правила.</div>
                  </div>
                </div>

                <div style={{ ...panelStyle, padding: 14, borderRadius: 18, boxShadow: 'none' }}>
                  <h3 style={{ fontSize: 17, marginBottom: 8 }}>Календарь посещений</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
                    {[
                      ['Проведено', currentStats.conductedLessons.length, '#4CAF50'],
                      ['План', currentStats.lessons.filter((lesson) => lesson.conduct_status === 'scheduled').length, '#2AABEE'],
                      ['Отменено', currentStats.lessons.filter((lesson) => lesson.conduct_status === 'cancelled').length, '#F44336'],
                    ].map(([label, value, color]) => (
                      <div key={label} style={{ padding: 8, borderRadius: 12, background: `${color}12` }}>
                        <div style={{ color: String(color), fontWeight: 900, fontSize: 18 }}>{String(value)}</div>
                        <div style={{ ...mutedTextStyle, fontSize: 12 }}>{label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
                    {Array.from({ length: monthRange(selectedMonth).end.getDate() }, (_, index) => {
                      const date = `${selectedMonth}-${String(index + 1).padStart(2, '0')}`;
                      const dayLessons = monthLessons.filter((lesson) => lessonDate(lesson) === date);
                      const conducted = dayLessons.some((lesson) => lesson.conduct_status === 'conducted');
                      const cancelled = dayLessons.some((lesson) => lesson.conduct_status === 'cancelled');
                      const scheduled = dayLessons.some((lesson) => lesson.conduct_status === 'scheduled');
                      const color = conducted
                        ? '#4CAF50'
                        : cancelled
                          ? '#F44336'
                          : scheduled
                            ? '#2AABEE'
                            : 'rgba(23,32,51,0.08)';

                      return (
                        <span
                          key={date}
                          title={`${index + 1}: ${dayLessons.length} занятий`}
                          style={{
                            height: 24,
                            borderRadius: 8,
                            background: color,
                            color: conducted || cancelled || scheduled ? '#fff' : '#687486',
                            display: 'grid',
                            placeItems: 'center',
                            fontSize: 10,
                            fontWeight: 800,
                          }}
                        >
                          {index + 1}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
