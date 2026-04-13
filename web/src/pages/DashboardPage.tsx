import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAssignments, type Assignment } from '../api/assignments';
import { getLessons, type Lesson } from '../api/lessons';
import { getStudents, type Student } from '../api/students';
import { getSubjects, type Subject } from '../api/subjects';
import { getTopics, type TheoryTopic } from '../api/topics';
import { getTutorStudents, type TutorStudent } from '../api/tutorStudents';
import { useMediaQuery } from '../hooks/useMediaQuery';

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

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toDateTime(lesson: Lesson) {
  return new Date(`${lesson.lesson_date}T${lesson.start_time}`);
}

function toTime(value: string) {
  return value.slice(0, 5);
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

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${date}T00:00:00`));
}

function lessonCost(lesson: Lesson) {
  const value = Number(lesson.cost ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function isRealLesson(lesson: Lesson) {
  return lesson.tutor_student_id !== null;
}

function isActiveFinancialLesson(lesson: Lesson) {
  return (
    isRealLesson(lesson) &&
    !['cancelled', 'rescheduled', 'booking_rejected', 'reschedule_rejected'].includes(
      lesson.conduct_status
    )
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const isTablet = useMediaQuery('(max-width: 1100px)');
  const isMobile = useMediaQuery('(max-width: 720px)');

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tutorStudents, setTutorStudents] = useState<TutorStudent[]>([]);
  const [topics, setTopics] = useState<TheoryTopic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setLoading(true);
        const [lessonData, assignmentData, studentData, subjectData, relationData, topicData] =
          await Promise.all([
            getLessons(),
            getAssignments(),
            getStudents(),
            getSubjects(),
            getTutorStudents(),
            getTopics(),
          ]);

        setLessons(lessonData);
        setAssignments(assignmentData);
        setStudents(studentData);
        setSubjects(subjectData);
        setTutorStudents(relationData);
        setTopics(topicData);
      } catch (error) {
        console.error('Ошибка загрузки главной страницы:', error);
        alert('Не удалось загрузить главную страницу');
      } finally {
        setLoading(false);
      }
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

  const enrichLesson = (lesson: Lesson) => {
    const relation = lesson.tutor_student_id ? relationMap.get(lesson.tutor_student_id) : undefined;
    const student = relation ? studentMap.get(relation.student_id) : undefined;
    const subject = relation ? subjectMap.get(relation.subject_id) : undefined;
    const topic = lesson.topic_id ? topicMap.get(lesson.topic_id) : undefined;
    return { lesson, student, subject, topic };
  };

  const activeLessons = useMemo(() => lessons.filter(isActiveFinancialLesson), [lessons]);

  const todayLessons = useMemo(
    () =>
      activeLessons
        .filter(
          (lesson) =>
            lesson.lesson_date === today && ['scheduled', 'conducted'].includes(lesson.conduct_status)
        )
        .sort((a, b) => toDateTime(a).getTime() - toDateTime(b).getTime())
        .map(enrichLesson),
    [activeLessons, relationMap, studentMap, subjectMap, topicMap, today]
  );

  const nextLesson = useMemo(
    () =>
      activeLessons
        .filter((lesson) => lesson.conduct_status === 'scheduled' && toDateTime(lesson).getTime() >= now.getTime())
        .sort((a, b) => toDateTime(a).getTime() - toDateTime(b).getTime())
        .map(enrichLesson)[0] ?? null,
    [activeLessons, relationMap, studentMap, subjectMap, topicMap]
  );

  const weekLessons = useMemo(
    () =>
      activeLessons.filter((lesson) => {
        const time = toDateTime(lesson).getTime();
        return time >= weekStart.getTime() && time <= weekEnd.getTime();
      }),
    [activeLessons, weekEnd, weekStart]
  );

  const todayPaid = todayLessons
    .filter(({ lesson }) => lesson.conduct_status === 'conducted' && lesson.payment_status === 'paid')
    .reduce((sum, { lesson }) => sum + lessonCost(lesson), 0);
  const todayForecast = todayLessons.reduce((sum, { lesson }) => sum + lessonCost(lesson), 0);
  const weekForecast = weekLessons.reduce((sum, lesson) => sum + lessonCost(lesson), 0);
  const weekIncomeRows = Array.from({ length: 7 }, (_, index) => {
    const date = formatDate(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index));
    const dayLessons = weekLessons.filter(
      (lesson) =>
        lesson.lesson_date === date &&
        lesson.conduct_status === 'conducted' &&
        lesson.payment_status === 'paid'
    );

    return {
      key: date,
      label: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][index],
      value: dayLessons.reduce((sum, lesson) => sum + lessonCost(lesson), 0),
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
    return assignment.completion_status === 'overdue' || assignment.deadline < today;
  });

  const upcomingDeadlines = assignments
    .filter((assignment) => assignment.completion_status !== 'completed' && assignment.deadline >= today)
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .slice(0, 5)
    .map((assignment) => {
      const relation = relationMap.get(assignment.tutor_student_id);
      const student = relation ? studentMap.get(relation.student_id) : undefined;
      const subject = relation ? subjectMap.get(relation.subject_id) : undefined;
      return { assignment, student, subject };
    });

  const lessonsWithoutTopic = activeLessons.filter(
    (lesson) =>
      lesson.conduct_status === 'scheduled' &&
      lesson.lesson_date === today &&
      !lesson.topic_id
  );

  const checklistItems = [
    {
      title: 'Провести занятия',
      value: todayLessons.filter(({ lesson }) => lesson.conduct_status === 'scheduled').length,
      route: '/schedule',
      muted: 'на сегодня',
    },
    {
      title: 'Проверить запросы',
      value: pendingRequests.length,
      route: '/requests',
      muted: 'записи, переносы, оплаты',
    },
    {
      title: 'Просроченные ДЗ',
      value: overdueAssignments.length,
      route: '/assignments',
      muted: 'требуют реакции',
    },
    {
      title: 'Подтвердить оплаты',
      value: pendingPayments.length,
      route: '/finance',
      muted: 'финансы',
    },
    {
      title: 'Заполнить темы',
      value: lessonsWithoutTopic.length,
      route: '/schedule',
      muted: 'для портфолио',
    },
  ];

  const financeCards = [
    { title: 'Заработано сегодня', value: formatCurrency(todayPaid) },
    { title: 'Прогноз сегодня', value: formatCurrency(todayForecast) },
    { title: 'Прогноз недели', value: formatCurrency(weekForecast) },
  ];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section
        style={{
          ...panelStyle,
          padding: isMobile ? 16 : 20,
          background:
            'linear-gradient(140deg, rgba(255,249,242,0.98) 0%, rgba(255,255,255,0.9) 100%)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isTablet ? '1fr' : 'minmax(0, 0.85fr) minmax(300px, 1.15fr)',
            gap: 16,
            alignItems: 'stretch',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 'clamp(1.8rem, 3.2vw, 2.45rem)',
                lineHeight: 0.98,
                letterSpacing: '-0.04em',
                marginBottom: 8,
              }}
            >
              Главная
            </h1>
            <p style={{ color: '#5e6a7b', maxWidth: 560, fontSize: 14, marginBottom: 0 }}>
              Короткий ежедневник: ближайшее занятие, деньги дня и задачи, которые нельзя забыть.
            </p>
          </div>

          <article
            style={{
              borderRadius: 24,
              padding: 16,
              background: '#172033',
              color: '#fff',
              minHeight: 170,
              display: 'grid',
              alignContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <div style={{ color: 'rgba(255,255,255,0.64)', fontSize: 13, marginBottom: 8 }}>
                Ближайшее занятие
              </div>
              {nextLesson ? (
                <>
                  <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.02, marginBottom: 8 }}>
                    {nextLesson.student?.full_name ?? 'Ученик'}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 14, display: 'grid', gap: 6 }}>
                    <span>{nextLesson.subject?.name ?? 'Без предмета'}</span>
                    <span>
                      {nextLesson.lesson.lesson_date} • {toTime(nextLesson.lesson.start_time)} -{' '}
                      {toTime(nextLesson.lesson.end_time)}
                    </span>
                    <span>Тема: {nextLesson.topic?.title ?? 'не указана'}</span>
                  </div>
                </>
              ) : (
                <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 14 }}>
                  Ближайших подтверждённых занятий пока нет.
                </div>
              )}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
                {todayLessons.length} зан. сегодня
              </span>
              <button
                type="button"
                onClick={() => navigate('/schedule')}
                style={{ background: 'rgba(255,255,255,0.1)', boxShadow: 'none' }}
              >
                К календарю
              </button>
            </div>
          </article>
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: isTablet ? '1fr' : '0.95fr 1.05fr',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
            gap: 12,
          }}
        >
          {financeCards.map((card) => (
            <article key={card.title} style={{ ...panelStyle, padding: 16 }}>
              <div style={{ ...mutedTextStyle, marginBottom: 8 }}>{card.title}</div>
              <div style={{ color: '#1f2a3b', fontSize: 24, fontWeight: 900 }}>{card.value}</div>
            </article>
          ))}
        </div>

        <article style={{ ...panelStyle, padding: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <div>
              <h3 style={{ fontSize: 18, marginBottom: 4 }}>Заработок за неделю</h3>
              <div style={{ ...mutedTextStyle, fontSize: 13 }}>Факт по оплаченным занятиям, Пн-Вс.</div>
            </div>
            <strong style={{ color: '#1f2a3b' }}>{formatCurrency(todayPaid)}</strong>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(18px, 1fr))',
              gap: 8,
              alignItems: 'end',
              minHeight: 110,
            }}
          >
            {weekIncomeRows.map((row) => (
              <div key={row.key} title={`${row.label}: ${formatCurrency(row.value)}`} style={{ display: 'grid', gap: 6 }}>
                <div
                  style={{
                    height: `${Math.max(8, (row.value / maxWeekIncome) * 88)}px`,
                    borderRadius: '12px 12px 6px 6px',
                    background:
                      row.value > 0
                        ? 'linear-gradient(180deg, #d96f32 0%, #f0a45f 100%)'
                        : 'rgba(23,32,51,0.08)',
                  }}
                />
                <div style={{ color: '#687486', fontSize: 12, textAlign: 'center' }}>{row.label}</div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: isTablet ? '1fr' : 'minmax(0, 1.15fr) minmax(300px, 0.85fr)',
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'grid', gap: 16 }}>
        <article style={panelStyle}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            <div>
              <h3 style={{ fontSize: 20, marginBottom: 6 }}>Сегодня</h3>
              <div style={mutedTextStyle}>Только подтверждённые занятия на день.</div>
            </div>
          </div>

          {loading ? (
            <p style={{ ...mutedTextStyle, marginBottom: 0 }}>Загрузка...</p>
          ) : todayLessons.length === 0 ? (
            <p style={{ ...mutedTextStyle, marginBottom: 0 }}>На сегодня подтверждённых занятий нет.</p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {todayLessons.map(({ lesson, student, subject }) => (
                <div
                  key={lesson.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : '76px minmax(0, 1fr) auto',
                    gap: 12,
                    alignItems: 'center',
                    padding: 12,
                    borderRadius: 16,
                    background: 'rgba(23,32,51,0.03)',
                    border: '1px solid rgba(24,33,47,0.06)',
                  }}
                >
                  <div style={{ fontWeight: 900, color: '#1f2a3b' }}>{toTime(lesson.start_time)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, color: '#1f2a3b', marginBottom: 4 }}>
                      {student?.full_name ?? 'Ученик'}
                    </div>
                    <div style={{ color: '#687486', fontSize: 14 }}>
                      {subject?.name ?? 'Без предмета'} •{' '}
                      {lesson.payment_status === 'paid' ? 'оплачено' : 'не оплачено'}
                    </div>
                  </div>
                  <div style={{ fontWeight: 900, color: '#1f2a3b' }}>
                    {formatCurrency(lessonCost(lesson))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article style={panelStyle}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            <div>
              <h3 style={{ fontSize: 20, marginBottom: 6 }}>Ближайшие дедлайны</h3>
              <div style={mutedTextStyle}>До пяти заданий, которые скоро нужно проверить.</div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/assignments')}
              style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}
            >
              Все ДЗ
            </button>
          </div>

          {loading ? (
            <p style={{ ...mutedTextStyle, marginBottom: 0 }}>Загрузка дедлайнов...</p>
          ) : upcomingDeadlines.length === 0 ? (
            <p style={{ ...mutedTextStyle, marginBottom: 0 }}>Ближайших дедлайнов нет.</p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {upcomingDeadlines.map(({ assignment, student, subject }) => (
                <button
                  key={assignment.id}
                  type="button"
                  onClick={() => navigate('/assignments')}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) auto',
                    gap: 12,
                    alignItems: 'center',
                    textAlign: 'left',
                    padding: 12,
                    borderRadius: 16,
                    background: 'rgba(23,32,51,0.03)',
                    color: '#1f2a3b',
                    border: '1px solid rgba(24,33,47,0.07)',
                    boxShadow: 'none',
                  }}
                >
                  <span>
                    <span style={{ display: 'block', fontWeight: 800, marginBottom: 4 }}>
                      {assignment.title || assignment.description.slice(0, 48)}
                    </span>
                    <span style={{ ...mutedTextStyle, display: 'block' }}>
                      {student?.full_name ?? 'Ученик'} • {subject?.name ?? 'Без предмета'}
                    </span>
                  </span>
                  <strong>{formatShortDate(assignment.deadline)}</strong>
                </button>
              ))}
            </div>
          )}
        </article>
        </div>

        <article style={panelStyle}>
          <div style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 20, marginBottom: 6 }}>Что нужно сделать</h3>
            <div style={mutedTextStyle}>Короткий чек-лист дня без лишних деталей.</div>
          </div>

          <div style={{ display: 'grid', gap: 9 }}>
            {checklistItems.map((item) => {
              const urgent = typeof item.value === 'number' && item.value > 0;

              return (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => navigate(item.route)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '24px minmax(0, 1fr) auto',
                    gap: 10,
                    alignItems: 'center',
                    textAlign: 'left',
                    padding: 12,
                    borderRadius: 16,
                    background: urgent ? 'rgba(217,111,50,0.08)' : 'rgba(23,32,51,0.03)',
                    color: '#1f2a3b',
                    border: urgent
                      ? '1px solid rgba(217,111,50,0.18)'
                      : '1px solid rgba(24,33,47,0.07)',
                    boxShadow: 'none',
                  }}
                >
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      border: urgent ? '5px solid #d96f32' : '2px solid rgba(23,32,51,0.18)',
                      background: '#fff',
                    }}
                  />
                  <span>
                    <span style={{ display: 'block', fontWeight: 800, marginBottom: 3 }}>{item.title}</span>
                    <span style={{ ...mutedTextStyle, display: 'block', fontSize: 13 }}>{item.muted}</span>
                  </span>
                  <span style={{ fontSize: 20, fontWeight: 900 }}>{item.value}</span>
                </button>
              );
            })}
          </div>
        </article>
      </section>

    </div>
  );
}
