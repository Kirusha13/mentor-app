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
  padding: '20px',
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

function RadarChart({ values }: { values: Array<{ label: string; value: number }> }) {
  const size = 300;
  const center = size / 2;
  const radius = 82;
  const points = values.map((item, index) => {
    const angle = (Math.PI * 2 * index) / values.length - Math.PI / 2;
    const distance = radius * (item.value / 100);
    return {
      ...item,
      x: center + Math.cos(angle) * distance,
      y: center + Math.sin(angle) * distance,
      labelX: center + Math.cos(angle) * (radius + 54),
      labelY: center + Math.sin(angle) * (radius + 54),
    };
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxWidth: 360, overflow: 'visible' }}>
      {[0.33, 0.66, 1].map((scale) => (
        <circle key={scale} cx={center} cy={center} r={radius * scale} fill="none" stroke="rgba(23,32,51,0.12)" />
      ))}
      {points.map((point) => (
        <line key={point.label} x1={center} y1={center} x2={point.labelX} y2={point.labelY} stroke="rgba(23,32,51,0.1)" />
      ))}
      <polygon points={points.map((point) => `${point.x},${point.y}`).join(' ')} fill="rgba(42,111,219,0.2)" stroke="#2a6fdb" strokeWidth="3" />
      {points.map((point) => (
        <g key={point.label}>
          <circle cx={point.x} cy={point.y} r="4" fill="#2a6fdb" />
          <text
            x={point.labelX}
            y={point.labelY}
            textAnchor={point.labelX < center ? 'end' : point.labelX > center ? 'start' : 'middle'}
            dominantBaseline="middle"
            fontSize="11"
            fontWeight="700"
            fill="#435066"
          >
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
  const competencyRows = [
    { label: 'ДЗ', value: clampPercent(currentStats.homeworkPercent * 0.6 + (scoreToPercent(currentStats.averageAssignmentGrade) ?? 0) * 0.4) },
    { label: 'Самостоятельность', value: clampPercent(currentStats.homeworkPercent * 0.7 + (currentStats.overdueAssignments.length ? 0 : 30)) },
    { label: 'Скорость', value: clampPercent(currentStats.homeworkPercent * 0.55 + currentStats.attendancePercent * 0.45) },
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
      let remainingHeight = imageHeight;
      let position = 0;

      pdf.addImage(imageData, 'PNG', 0, position, pageWidth, imageHeight);
      remainingHeight -= pageHeight;

      while (remainingHeight > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imageData, 'PNG', 0, position, pageWidth, imageHeight);
        remainingHeight -= pageHeight;
      }

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
        style={{
          ...panelStyle,
          padding: isMobile ? 14 : 16,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : 'repeat(4, minmax(170px, 1fr))', gap: 14, alignItems: 'end' }}>
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
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : 'repeat(5, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          ['Общий прогресс', formatPercent(currentStats.overallProgress)],
          ['Оценка занятий', formatAverage(currentStats.averageLessonGrade)],
          ['Оценка ДЗ', formatAverage(currentStats.averageAssignmentGrade)],
          ['Выполнено ДЗ', `${currentStats.completedAssignments.length}/${currentStats.assignments.length}`],
          ['Посещаемость', formatPercent(currentStats.attendancePercent)],
        ].map(([label, value]) => (
          <article key={label} style={{ ...panelStyle, padding: 16 }}>
            <div style={{ ...mutedTextStyle, marginBottom: 8 }}>{label}</div>
            <div style={{ color: '#1f2a3b', fontSize: 28, fontWeight: 900 }}>{value}</div>
          </article>
        ))}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 0.9fr', gap: 16, marginBottom: 16 }}>
        <article style={panelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ fontSize: 20, marginBottom: 6 }}>Было / стало</h3>
              <div style={mutedTextStyle}>
                Сравнение {formatMonthLabel(previousMonthValue)} и {formatMonthLabel(selectedMonth)}.
              </div>
            </div>
            <button type="button" title="Сформировать отчёт" onClick={() => setReportOpen(true)} style={{ minWidth: 52, height: 42, padding: '0 14px', borderRadius: 999, background: '#d96f32', boxShadow: 'none' }}>
              PDF
            </button>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {comparisonRows.map((row) => (
              <div key={row.label} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 100px 100px 130px', gap: 10, alignItems: 'center', padding: 12, borderRadius: 16, background: 'rgba(23,32,51,0.03)', border: '1px solid rgba(24,33,47,0.06)' }}>
                <strong style={{ color: '#1f2a3b' }}>{row.label}</strong>
                <span style={mutedTextStyle}>{row.before}</span>
                <span style={{ color: '#1f2a3b', fontWeight: 800 }}>{row.after}</span>
                <span style={{ color: row.delta.startsWith('+') ? '#2f7d63' : '#687486', fontWeight: 800 }}>{row.delta}</span>
              </div>
            ))}
          </div>
        </article>

        <article style={{ ...panelStyle, display: 'grid', placeItems: 'center' }}>
          <div style={{ width: '100%', display: 'grid', justifyItems: 'center', gap: 8 }}>
            <h3 style={{ fontSize: 20, marginBottom: 0, justifySelf: 'start' }}>Роза компетенций</h3>
            <RadarChart values={competencyRows} />
            <div style={{ ...mutedTextStyle, textAlign: 'center' }}>
              ДЗ, самостоятельность, скорость и теория считаются по текущим учебным данным.
            </div>
          </div>
        </article>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '0.95fr 1.05fr', gap: 16, marginBottom: 16 }}>
        <article style={panelStyle}>
          <h3 style={{ fontSize: 20, marginBottom: 12 }}>Динамика оценок</h3>
          {gradeRows.length === 0 ? (
            <p style={{ ...mutedTextStyle, marginBottom: 0 }}>За выбранный месяц пока нет оценок за занятия.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gradeRows.length}, minmax(22px, 1fr))`, gap: 8, alignItems: 'end', minHeight: 140 }}>
              {gradeRows.map((row, index) => (
                <div key={`${row.label}-${index}`} title={`${row.label}: ${row.value}`} style={{ display: 'grid', gap: 6 }}>
                  <div style={{ height: `${Math.max(10, (row.value / 5) * 112)}px`, borderRadius: '12px 12px 6px 6px', background: 'linear-gradient(180deg, #2a6fdb 0%, #74a9ff 100%)' }} />
                  <div style={{ color: '#687486', fontSize: 11, textAlign: 'center' }}>{row.label}</div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article style={panelStyle}>
          <h3 style={{ fontSize: 20, marginBottom: 12 }}>Посещаемость</h3>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
            {[
              ['Проведено', currentStats.conductedLessons.length, '#2f7d63'],
              ['Запланировано', currentStats.lessons.filter((lesson) => lesson.conduct_status === 'scheduled').length, '#2a6fdb'],
              ['Отменено', currentStats.lessons.filter((lesson) => lesson.conduct_status === 'cancelled').length, '#a63f3b'],
            ].map(([label, value, color]) => (
              <div key={label} style={{ padding: 12, borderRadius: 16, background: `${color}12` }}>
                <div style={{ color: String(color), fontWeight: 900, fontSize: 22 }}>{String(value)}</div>
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
              const color = conducted ? '#2f7d63' : cancelled ? '#a63f3b' : scheduled ? '#2a6fdb' : 'rgba(23,32,51,0.08)';

              return (
                <span key={date} title={`${index + 1}: ${dayLessons.length} зан.`} style={{ height: 28, borderRadius: 9, background: color, color: conducted || cancelled || scheduled ? '#fff' : '#687486', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800 }}>
                  {index + 1}
                </span>
              );
            })}
          </div>
        </article>
      </section>

      <section style={{ ...panelStyle, marginBottom: 16 }}>
        <div style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 20, marginBottom: 6 }}>Освоение тем</h3>
          <div style={mutedTextStyle}>
            Показываются только темы, которые реально использовались в занятиях или ДЗ за выбранный месяц.
          </div>
        </div>

        {topicProgressRows.length === 0 ? (
          <p style={{ ...mutedTextStyle, marginBottom: 0 }}>За выбранный месяц пока нет тем с данными.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {topicProgressRows.map((row) => (
              <div key={row.topic.id} style={{ padding: 14, borderRadius: 18, border: '1px solid rgba(24,33,47,0.08)', background: 'rgba(23,32,51,0.03)', display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 800, color: '#1f2a3b' }}>{row.topic.title}</div>
                    <div style={{ ...mutedTextStyle, marginTop: 4 }}>{row.topic.description || 'Описание темы не заполнено'}</div>
                  </div>
                  <strong style={{ color: '#2a6fdb' }}>{formatPercent(row.progressPercent)}</strong>
                </div>
                <div style={{ height: 10, borderRadius: 999, background: 'rgba(23,32,51,0.08)', overflow: 'hidden' }}>
                  <div style={{ width: `${row.progressPercent}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, #2f7d63 0%, #58a889 100%)' }} />
                </div>
                <div style={{ color: '#435066', fontSize: 13 }}>
                  Занятий: {row.lessonCount} • ДЗ: {row.completedAssignments}/{row.assignmentCount} • Средняя: {formatAverage(row.averageGrade)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 1fr 1fr', gap: 16 }}>
        {[
          { title: 'Сильные стороны', items: strengths, accent: '#2f7d63' },
          { title: 'Зоны роста', items: weaknesses, accent: '#a63f3b' },
          { title: 'Следующие шаги', items: nextSteps, accent: '#d96f32' },
        ].map((section) => (
          <article key={section.title} style={panelStyle}>
            <h3 style={{ color: section.accent, fontSize: 20, marginBottom: 12 }}>{section.title}</h3>
            <div style={{ display: 'grid', gap: 10 }}>
              {section.items.map((item) => (
                <div key={item} style={{ color: '#435066', lineHeight: 1.45 }}>{item}</div>
              ))}
            </div>
          </article>
        ))}
      </section>

      {reportOpen && (
        <div onClick={() => setReportOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.46)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 50 }}>
          <div ref={reportRef} className="portfolio-print-area" onClick={(event) => event.stopPropagation()} style={{ width: 'min(860px, 100%)', maxHeight: '90vh', overflow: 'auto', background: '#fff', borderRadius: 28, padding: isMobile ? 18 : 26, boxShadow: '0 30px 80px rgba(15,23,42,0.22)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, marginBottom: 18 }}>
              <div>
                <h2 style={{ fontSize: 30, marginBottom: 6 }}>Отчёт для опекуна</h2>
                <div style={mutedTextStyle}>{selectedStudent.full_name} • {formatMonthLabel(selectedMonth)} • {goalType}</div>
              </div>
              <div className="portfolio-print-hidden portfolio-pdf-hidden" style={{ display: 'flex', gap: 8, alignItems: 'start' }}>
                <button type="button" title="Сохранить отчёт в PDF" onClick={handleSaveReportPdf} disabled={pdfSaving} style={{ minWidth: 52, height: 42, padding: '0 14px', borderRadius: 999, background: '#d96f32', boxShadow: 'none', alignSelf: 'start' }}>{pdfSaving ? '...' : 'PDF'}</button>
                <button type="button" title="Закрыть" onClick={() => setReportOpen(false)} style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, background: '#172033', boxShadow: 'none', alignSelf: 'start' }}>×</button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ ...panelStyle, boxShadow: 'none' }}>
                <h3 style={{ fontSize: 20, marginBottom: 10 }}>Краткая сводка</h3>
                <p style={{ color: '#435066', lineHeight: 1.55, marginBottom: 0 }}>
                  Общий прогресс: <strong>{formatPercent(currentStats.overallProgress)}</strong>. Средняя оценка за занятия: <strong>{formatAverage(currentStats.averageLessonGrade)}</strong>. Средняя оценка за ДЗ: <strong>{formatAverage(currentStats.averageAssignmentGrade)}</strong>. Посещаемость: <strong>{formatPercent(currentStats.attendancePercent)}</strong>.
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                <div style={{ ...panelStyle, boxShadow: 'none' }}>
                  <h3 style={{ fontSize: 18, marginBottom: 10 }}>Сильные стороны</h3>
                  {strengths.map((item) => <p key={item} style={{ color: '#435066', marginBottom: 8 }}>{item}</p>)}
                </div>
                <div style={{ ...panelStyle, boxShadow: 'none' }}>
                  <h3 style={{ fontSize: 18, marginBottom: 10 }}>Зоны роста</h3>
                  {weaknesses.map((item) => <p key={item} style={{ color: '#435066', marginBottom: 8 }}>{item}</p>)}
                </div>
              </div>
              <label className="portfolio-pdf-hidden" style={{ display: 'grid', gap: 8, color: '#556173', fontSize: 14 }}>
                Комментарий репетитора
                <textarea value={reportComment} onChange={(event) => setReportComment(event.target.value)} placeholder="Например: ученик стал увереннее решать квадратные уравнения, но стоит закрепить задачи на проценты." rows={4} />
              </label>
              {reportComment && (
                <div className="portfolio-pdf-only" style={{ ...panelStyle, boxShadow: 'none', background: 'rgba(217,111,50,0.08)' }}>
                  <h3 style={{ fontSize: 18, marginBottom: 10 }}>Комментарий</h3>
                  <p style={{ color: '#435066', lineHeight: 1.55, marginBottom: 0 }}>{reportComment}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
