import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAssignments, type Assignment } from '../api/assignments';
import { getLessons, type Lesson } from '../api/lessons';
import { getMaterials, type Material } from '../api/materials';
import { getStudents, type Student } from '../api/students';
import { getSubjects, type Subject } from '../api/subjects';
import { getTopics, type TheoryTopic } from '../api/topics';
import { getTutorStudents, type TutorStudent } from '../api/tutorStudents';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { lessonDate, lessonStartTime } from '../utils/lessonTime';

const panelStyle = {
  background: 'rgba(255,255,255,0.9)',
  padding: 18,
  borderRadius: 22,
  border: '1px solid rgba(24,33,47,0.08)',
  boxShadow: 'var(--shadow-card)',
} as const;

const mutedTextStyle = {
  color: '#687486',
  fontSize: 14,
} as const;

const moduleAccent = {
  schedule: '#2AABEE',
  assignments: '#4CAF50',
  materials: '#2AABEE',
  finance: '#172033',
  portfolio: '#9C27B0',
  notifications: '#d9a132',
} as const;

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfWeek(date: Date) {
  const copy = startOfWeek(date);
  copy.setDate(copy.getDate() + 6);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value);
}

function parseSafeDate(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.includes('T') ? value : `${value}T00:00:00`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatShortDate(value: string) {
  const date = parseSafeDate(value);
  if (!date) return 'Без даты';

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

function formatTime(value: string) {
  return value.slice(0, 5);
}

function lessonCost(lesson: Lesson) {
  const value = Number(lesson.cost ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function isActiveLesson(lesson: Lesson) {
  return (
    lesson.tutor_student_id !== null &&
    !['cancelled', 'rescheduled', 'booking_rejected', 'reschedule_rejected'].includes(
      lesson.conduct_status
    )
  );
}

function getSettledArray<T>(result: PromiseSettledResult<T[]>) {
  return result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : [];
}

function getAssignmentLabel(assignment: Assignment) {
  const title = assignment.title?.trim();
  if (title) return title;

  const description = typeof assignment.description === 'string' ? assignment.description.trim() : '';
  return description ? description.slice(0, 48) : 'Домашнее задание';
}

function getAssignmentDeadline(assignment: Assignment) {
  return typeof assignment.deadline === 'string' && parseSafeDate(assignment.deadline)
    ? assignment.deadline
    : '';
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        padding: '9px 10px',
        borderRadius: 14,
        background: 'rgba(23,32,51,0.04)',
        border: '1px solid rgba(24,33,47,0.06)',
      }}
    >
      <div style={{ ...mutedTextStyle, fontSize: 12, marginBottom: 3 }}>{label}</div>
      <div style={{ color: '#1f2a3b', fontWeight: 900, fontSize: 18 }}>{value}</div>
    </div>
  );
}

function ModuleCard({
  title,
  accent,
  children,
  action,
  onAction,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <article style={{ ...panelStyle, minHeight: 230, display: 'grid', alignContent: 'start', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: 12,
              background: `${accent}16`,
              border: `1px solid ${accent}26`,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <span style={{ width: 12, height: 12, borderRadius: 4, background: accent }} />
          </span>
          <h3 style={{ fontSize: 18, marginBottom: 0 }}>{title}</h3>
        </div>
        {action && onAction ? (
          <button
            type="button"
            onClick={onAction}
            style={{
              padding: '8px 10px',
              borderRadius: 12,
              background: 'rgba(23,32,51,0.06)',
              color: '#243041',
              boxShadow: 'none',
              fontSize: 12,
            }}
          >
            {action}
          </button>
        ) : null}
      </div>
      {children}
    </article>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const isTablet = useMediaQuery('(max-width: 1100px)');

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tutorStudents, setTutorStudents] = useState<TutorStudent[]>([]);
  const [topics, setTopics] = useState<TheoryTopic[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadWarning, setLoadWarning] = useState(false);

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      setLoadWarning(false);

      const results = await Promise.allSettled([
        getLessons(),
        getAssignments(),
        getStudents(),
        getSubjects(),
        getTutorStudents(),
        getTopics(),
        getMaterials(),
      ] as const);

      const lessonData = getSettledArray(results[0]);
      const assignmentData = getSettledArray(results[1]);
      const studentData = getSettledArray(results[2]);
      const subjectData = getSettledArray(results[3]);
      const relationData = getSettledArray(results[4]);
      const topicData = getSettledArray(results[5]);
      const materialData = getSettledArray(results[6]);

      setLessons(lessonData);
      setAssignments(assignmentData);
      setStudents(studentData);
      setSubjects(subjectData);
      setTutorStudents(relationData);
      setTopics(topicData);
      setMaterials(materialData);
      setLoadWarning(results.some((result) => result.status === 'rejected'));
      setLoading(false);
    };

    void loadDashboard();
  }, []);

  const now = new Date();
  const today = formatDate(now);
  const weekStart = startOfWeek(now);
  const weekEnd = endOfWeek(now);

  const relationMap = useMemo(
    () => new Map(tutorStudents.map((item) => [item.id, item])),
    [tutorStudents]
  );
  const studentMap = useMemo(() => new Map(students.map((item) => [item.id, item])), [students]);
  const subjectMap = useMemo(() => new Map(subjects.map((item) => [item.id, item])), [subjects]);
  const topicMap = useMemo(() => new Map(topics.map((item) => [item.id, item])), [topics]);

  const activeLessons = useMemo(() => lessons.filter(isActiveLesson), [lessons]);

  const todayLessons = activeLessons
    .filter(
      (lesson) =>
        lessonDate(lesson) === today && ['scheduled', 'conducted'].includes(lesson.conduct_status)
    )
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .map((lesson) => {
      const relation = lesson.tutor_student_id ? relationMap.get(lesson.tutor_student_id) : undefined;
      return {
        lesson,
        relation,
        student: relation ? studentMap.get(relation.student_id) : undefined,
        subject: relation ? subjectMap.get(relation.subject_id) : undefined,
      };
    });

  const weekLessons = activeLessons.filter((lesson) => {
    const time = new Date(lesson.starts_at).getTime();
    return time >= weekStart.getTime() && time <= weekEnd.getTime();
  });

  const weekPaid = weekLessons
    .filter((lesson) => lesson.conduct_status === 'conducted' && lesson.payment_status === 'paid')
    .reduce((sum, lesson) => sum + lessonCost(lesson), 0);
  const todayPaid = todayLessons
    .filter(({ lesson }) => lesson.conduct_status === 'conducted' && lesson.payment_status === 'paid')
    .reduce((sum, { lesson }) => sum + lessonCost(lesson), 0);
  const todayForecast = todayLessons.reduce((sum, { lesson }) => sum + lessonCost(lesson), 0);
  const weekForecast = weekLessons.reduce((sum, lesson) => sum + lessonCost(lesson), 0);

  const weekIncomeRows = Array.from({ length: 7 }, (_, index) => {
    const date = formatDate(
      new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index)
    );
    const value = weekLessons
      .filter(
        (lesson) =>
          lessonDate(lesson) === date &&
          lesson.conduct_status === 'conducted' &&
          lesson.payment_status === 'paid'
      )
      .reduce((sum, lesson) => sum + lessonCost(lesson), 0);

    return {
      key: date,
      label: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][index],
      value,
    };
  });
  const maxWeekIncome = Math.max(...weekIncomeRows.map((row) => row.value), 1);

  const pendingRequests = lessons.filter(
    (lesson) =>
      lesson.conduct_status === 'booking_pending' ||
      lesson.conduct_status === 'reschedule_pending' ||
      lesson.payment_status === 'payment_pending'
  );
  const pendingPayments = lessons.filter((lesson) => lesson.payment_status === 'payment_pending');

  const overdueAssignments = assignments.filter((assignment) => {
    if (assignment.completion_status === 'completed') return false;
    const deadline = getAssignmentDeadline(assignment);
    return assignment.completion_status === 'overdue' || Boolean(deadline && deadline < today);
  });

  const checkAssignments = assignments.filter(
    (assignment) => assignment.completion_status === 'completed' && assignment.grade === null
  );

  const upcomingDeadlines = assignments
    .filter((assignment) => {
      const deadline = getAssignmentDeadline(assignment);
      return assignment.completion_status !== 'completed' && Boolean(deadline && deadline >= today);
    })
    .sort((a, b) => getAssignmentDeadline(a).localeCompare(getAssignmentDeadline(b)))
    .slice(0, 4)
    .map((assignment) => {
      const relation = relationMap.get(assignment.tutor_student_id);
      return {
        assignment,
        student: relation ? studentMap.get(relation.student_id) : undefined,
        subject: relation ? subjectMap.get(relation.subject_id) : undefined,
      };
    });

  const recentMaterials = materials
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map((material) => ({ material, topic: topicMap.get(material.topic_id) }));

  const openMaterialTopic = (topic: TheoryTopic | undefined) => {
    if (!topic) {
      navigate('/materials');
      return;
    }

    navigate(`/materials?subject_id=${topic.subject_id}&topic_id=${topic.id}`);
  };

  const selectedPortfolioStudent = useMemo(() => {
    const activity = new Map<number, { lessons: Lesson[]; assignments: Assignment[] }>();

    tutorStudents.forEach((relation) => {
      activity.set(relation.student_id, { lessons: [], assignments: [] });
    });

    lessons.forEach((lesson) => {
      if (!lesson.tutor_student_id) return;
      const relation = relationMap.get(lesson.tutor_student_id);
      if (!relation) return;
      activity.get(relation.student_id)?.lessons.push(lesson);
    });

    assignments.forEach((assignment) => {
      const relation = relationMap.get(assignment.tutor_student_id);
      if (!relation) return;
      activity.get(relation.student_id)?.assignments.push(assignment);
    });

    return [...activity.entries()]
      .map(([studentId, data]) => {
        const student = studentMap.get(studentId);
        const conducted = data.lessons.filter((lesson) => lesson.conduct_status === 'conducted');
        const lessonGrades = conducted.map((lesson) => lesson.grade).filter((grade): grade is number => grade !== null);
        const assignmentGrades = data.assignments
          .map((assignment) => assignment.grade)
          .filter((grade): grade is number => grade !== null);
        const completedAssignments = data.assignments.filter(
          (assignment) => assignment.completion_status === 'completed'
        );
        const lessonAverage = lessonGrades.length
          ? lessonGrades.reduce((sum, grade) => sum + grade, 0) / lessonGrades.length
          : null;
        const assignmentAverage = assignmentGrades.length
          ? assignmentGrades.reduce((sum, grade) => sum + grade, 0) / assignmentGrades.length
          : null;
        const homeworkPercent = data.assignments.length
          ? (completedAssignments.length / data.assignments.length) * 100
          : 0;
        const gradePercent =
          lessonAverage !== null || assignmentAverage !== null
            ? (((lessonAverage ?? 0) + (assignmentAverage ?? 0)) / (lessonAverage !== null && assignmentAverage !== null ? 10 : 5)) *
              100
            : 0;

        return {
          student,
          studentId,
          progress: Math.round(Math.min(100, homeworkPercent * 0.45 + gradePercent * 0.55)),
          lessonAverage,
          assignmentAverage,
        };
      })
      .filter((item) => item.student)
      .sort((a, b) => b.progress - a.progress)[0];
  }, [assignments, lessons, relationMap, studentMap, tutorStudents]);

  return (
    <div style={{ display: 'grid', gap: 16, height: '100%', minHeight: 0, overflowY: 'auto', alignContent: 'start', scrollbarWidth: 'thin' }}>
      {loadWarning ? (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 16,
            background: 'rgba(42,171,238,0.09)',
            border: '1px solid rgba(42,171,238,0.16)',
            color: '#9f4f1f',
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          Часть данных не загрузилась. Главная показывает доступную информацию.
        </div>
      ) : null}

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: isTablet ? '1fr' : '1fr 1fr 1fr',
          gap: 16,
        }}
      >
        <ModuleCard
          title="Расписание"
          accent={moduleAccent.schedule}
          action="Открыть"
          onAction={() => navigate('/schedule')}
        >
          <div style={{ display: 'grid', gap: 9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <strong style={{ color: '#1f2a3b' }}>Сегодня</strong>
              <span style={mutedTextStyle}>
                {new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(now)}
              </span>
            </div>
            {loading ? (
              <p style={{ ...mutedTextStyle, marginBottom: 0 }}>Загрузка...</p>
            ) : todayLessons.length === 0 ? (
              <p style={{ ...mutedTextStyle, marginBottom: 0 }}>На сегодня занятий нет.</p>
            ) : (
              todayLessons.slice(0, 4).map(({ lesson, student, subject }) => (
                <button
                  key={lesson.id}
                  type="button"
                  onClick={() => navigate('/schedule')}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '58px minmax(0, 1fr)',
                    gap: 10,
                    textAlign: 'left',
                    padding: 10,
                    borderRadius: 14,
                    background: 'rgba(23,32,51,0.04)',
                    color: '#1f2a3b',
                    boxShadow: 'none',
                  }}
                >
                  <strong>{formatTime(lessonStartTime(lesson))}</strong>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {student?.full_name ?? 'Ученик'}
                    </span>
                    <span style={{ ...mutedTextStyle, display: 'block', fontSize: 12 }}>
                      {subject?.name ?? lesson.subject_name ?? 'Без предмета'}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </ModuleCard>

        <ModuleCard
          title="Домашние задания"
          accent={moduleAccent.assignments}
          action="Все ДЗ"
          onAction={() => navigate('/assignments')}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <MiniMetric label="Проверить" value={checkAssignments.length} />
            <MiniMetric label="Просрочено" value={overdueAssignments.length} />
            <MiniMetric label="Дедлайны" value={upcomingDeadlines.length} />
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {upcomingDeadlines.length === 0 ? (
              <p style={{ ...mutedTextStyle, marginBottom: 0 }}>Ближайших дедлайнов нет.</p>
            ) : (
              upcomingDeadlines.map(({ assignment, student, subject }) => (
                <div key={assignment.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: '#1f2a3b' }}>
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {getAssignmentLabel(assignment)}
                    </strong>
                    <span style={{ ...mutedTextStyle, fontSize: 12 }}>
                      {student?.full_name ?? 'Ученик'} • {subject?.name ?? 'Без предмета'}
                    </span>
                  </span>
                  <strong style={{ whiteSpace: 'nowrap' }}>{formatShortDate(assignment.deadline)}</strong>
                </div>
              ))
            )}
          </div>
        </ModuleCard>

        <ModuleCard
          title="Материалы"
          accent={moduleAccent.materials}
          action="Открыть"
          onAction={() => navigate('/materials')}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <MiniMetric label="Предметы" value={subjects.length} />
            <MiniMetric label="Темы" value={topics.length} />
            <MiniMetric label="Материалы" value={materials.length} />
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {recentMaterials.length === 0 ? (
              <p style={{ ...mutedTextStyle, marginBottom: 0 }}>Материалы пока не добавлены.</p>
            ) : (
              recentMaterials.map(({ material, topic }) => (
                <button
                  key={material.id}
                  type="button"
                  onClick={() => openMaterialTopic(topic)}
                  title={topic ? `Открыть тему «${topic.title}»` : 'Открыть материалы'}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    color: '#1f2a3b',
                    background: 'rgba(23,32,51,0.04)',
                    border: '1px solid rgba(24,33,47,0.06)',
                    borderRadius: 12,
                    boxShadow: 'none',
                    padding: '8px 10px',
                    textAlign: 'left',
                    minWidth: 0,
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: moduleAccent.materials }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {topic?.title ?? material.content_text ?? material.content_url ?? 'Материал'}
                  </span>
                </button>
              ))
            )}
          </div>
        </ModuleCard>

        <ModuleCard
          title="Финансы"
          accent={moduleAccent.finance}
          action="Подробнее"
          onAction={() => navigate('/finance')}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            <MiniMetric label="Сегодня" value={formatCurrency(todayPaid)} />
            <MiniMetric label="Прогноз дня" value={formatCurrency(todayForecast)} />
            <MiniMetric label="Неделя" value={formatCurrency(weekPaid)} />
            <MiniMetric label="Прогноз недели" value={formatCurrency(weekForecast)} />
            <MiniMetric label="Подтвердить" value={pendingPayments.length} />
          </div>
        </ModuleCard>

        <ModuleCard
          title="Портфолио прогресса"
          accent={moduleAccent.portfolio}
          action="Портфолио"
          onAction={() =>
            navigate(
              selectedPortfolioStudent?.studentId
                ? `/portfolio?student_id=${selectedPortfolioStudent.studentId}`
                : '/students'
            )
          }
        >
          {selectedPortfolioStudent?.student ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <strong style={{ color: '#1f2a3b', fontSize: 17 }}>{selectedPortfolioStudent.student.full_name}</strong>
                <div style={mutedTextStyle}>Лучший заполненный профиль прогресса</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 92px', gap: 12, alignItems: 'center' }}>
                <div style={{ height: 10, borderRadius: 999, background: 'rgba(23,32,51,0.08)', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${selectedPortfolioStudent.progress}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: moduleAccent.portfolio,
                    }}
                  />
                </div>
                <strong style={{ color: moduleAccent.portfolio, fontSize: 26, textAlign: 'right' }}>
                  {selectedPortfolioStudent.progress}%
                </strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <MiniMetric
                  label="Занятия"
                  value={selectedPortfolioStudent.lessonAverage?.toFixed(1) ?? '—'}
                />
                <MiniMetric
                  label="ДЗ"
                  value={selectedPortfolioStudent.assignmentAverage?.toFixed(1) ?? '—'}
                />
              </div>
            </div>
          ) : (
            <p style={{ ...mutedTextStyle, marginBottom: 0 }}>Данных для портфолио пока нет.</p>
          )}
        </ModuleCard>

        <ModuleCard
          title="Уведомления"
          accent={moduleAccent.notifications}
          action="Все"
          onAction={() => navigate('/requests')}
        >
          <div style={{ display: 'grid', gap: 10 }}>
            {[
              { label: 'Запросы на запись и перенос', value: pendingRequests.length },
              { label: 'Оплаты ждут подтверждения', value: pendingPayments.length },
              { label: 'Просроченные задания', value: overdueAssignments.length },
              { label: 'Занятия сегодня', value: todayLessons.length },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => navigate(item.label.includes('задания') ? '/assignments' : item.label.includes('Занятия') ? '/schedule' : '/requests')}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: 10,
                  textAlign: 'left',
                  padding: 11,
                  borderRadius: 14,
                  background: item.value > 0 ? 'rgba(42,171,238,0.08)' : 'rgba(23,32,51,0.04)',
                  color: '#1f2a3b',
                  boxShadow: 'none',
                }}
              >
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </button>
            ))}
          </div>
        </ModuleCard>
      </section>

      <article style={{ ...panelStyle, padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 18, marginBottom: 0 }}>Динамика дохода за неделю</h3>
          <strong>{formatCurrency(weekPaid)}</strong>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(18px, 1fr))', gap: 8, alignItems: 'end', minHeight: 92 }}>
          {weekIncomeRows.map((row) => (
            <div key={row.key} title={`${row.label}: ${formatCurrency(row.value)}`} style={{ display: 'grid', gap: 6 }}>
              <div
                style={{
                  height: `${Math.max(8, (row.value / maxWeekIncome) * 74)}px`,
                  borderRadius: '12px 12px 6px 6px',
                  background: row.value > 0 ? 'linear-gradient(180deg, #2AABEE 0%, #229ED9 100%)' : 'rgba(23,32,51,0.08)',
                }}
              />
              <div style={{ color: '#687486', fontSize: 12, textAlign: 'center' }}>{row.label}</div>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
