import { useEffect, useMemo, useState } from 'react';
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

function scoreToPercent(score: number | null, maxScore = 5) {
  if (score === null) return 0;
  return clampPercent((score / maxScore) * 100);
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatAverage(value: number | null) {
  return value === null ? '—' : value.toFixed(1);
}

function relationLabel(
  relation: TutorStudent,
  studentMap: Map<number, Student>,
  subjectMap: Map<number, Subject>
) {
  const student = studentMap.get(relation.student_id);
  const subject = subjectMap.get(relation.subject_id);
  return `${student?.full_name ?? `Ученик #${relation.student_id}`} • ${
    relation.subject_name ?? subject?.name ?? `Предмет #${relation.subject_id}`
  }`;
}

function infoBadge(text: string) {
  return (
    <span
      title={text}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 18,
        height: 18,
        borderRadius: 999,
        background: 'rgba(23,32,51,0.08)',
        color: '#556173',
        fontSize: 12,
        fontWeight: 800,
        cursor: 'help',
      }}
    >
      ?
    </span>
  );
}

export default function PortfolioPage() {
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
  const [loading, setLoading] = useState(true);

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

    loadData();
  }, []);

  const studentMap = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students]
  );

  const subjectMap = useMemo(
    () => new Map(subjects.map((subject) => [subject.id, subject])),
    [subjects]
  );

  const activeStudents = useMemo(() => {
    const studentIds = new Set(
      tutorStudents
        .filter((relation) => relation.status !== 'completed')
        .map((relation) => relation.student_id)
    );

    return students
      .filter((student) => studentIds.has(student.id))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru-RU'));
  }, [students, tutorStudents]);

  useEffect(() => {
    if (!activeStudents.length) {
      setSelectedStudentId('');
      return;
    }

    setSelectedStudentId((current) =>
      current && activeStudents.some((student) => String(student.id) === current)
        ? current
        : String(activeStudents[0].id)
    );
  }, [activeStudents]);

  const selectedStudent = useMemo(
    () => activeStudents.find((student) => String(student.id) === selectedStudentId) ?? null,
    [activeStudents, selectedStudentId]
  );

  const studentRelations = useMemo(
    () =>
      selectedStudent
        ? tutorStudents.filter((relation) => relation.student_id === selectedStudent.id)
        : [],
    [selectedStudent, tutorStudents]
  );

  useEffect(() => {
    const availableSubjectIds = new Set(studentRelations.map((relation) => String(relation.subject_id)));
    setSelectedSubjectFilter((current) =>
      current === 'all' || availableSubjectIds.has(current) ? current : 'all'
    );
  }, [studentRelations]);

  const filteredRelations = useMemo(
    () =>
      selectedSubjectFilter === 'all'
        ? studentRelations
        : studentRelations.filter((relation) => String(relation.subject_id) === selectedSubjectFilter),
    [selectedSubjectFilter, studentRelations]
  );

  const relationIds = useMemo(
    () => new Set(filteredRelations.map((relation) => relation.id)),
    [filteredRelations]
  );

  const studentLessons = useMemo(
    () =>
      lessons.filter(
        (lesson) =>
          lesson.tutor_student_id !== null && relationIds.has(lesson.tutor_student_id)
      ),
    [lessons, relationIds]
  );

  const studentAssignments = useMemo(
    () => assignments.filter((assignment) => relationIds.has(assignment.tutor_student_id)),
    [assignments, relationIds]
  );

  const conductedLessons = useMemo(
    () => studentLessons.filter((lesson) => lesson.conduct_status === 'conducted'),
    [studentLessons]
  );

  const completedAssignments = useMemo(
    () => studentAssignments.filter((assignment) => assignment.completion_status === 'completed'),
    [studentAssignments]
  );

  const overdueAssignments = useMemo(
    () => studentAssignments.filter((assignment) => assignment.completion_status === 'overdue'),
    [studentAssignments]
  );

  const lessonGrades = useMemo(
    () => conductedLessons.map((lesson) => lesson.grade).filter((grade): grade is number => grade !== null),
    [conductedLessons]
  );

  const assignmentGrades = useMemo(
    () =>
      studentAssignments
        .map((assignment) => assignment.grade)
        .filter((grade): grade is number => grade !== null),
    [studentAssignments]
  );

  const averageLessonGrade = average(lessonGrades);
  const averageAssignmentGrade = average(assignmentGrades);

  const lessonsProgress = clampPercent(
    conductedLessons.length === 0
      ? 0
      : scoreToPercent(averageLessonGrade) * 0.6 +
          Math.min(conductedLessons.length / 12, 1) * 100 * 0.4
  );

  const assignmentsProgress = clampPercent(
    studentAssignments.length === 0
      ? 0
      : ((completedAssignments.length / studentAssignments.length) * 100) * 0.6 +
          scoreToPercent(averageAssignmentGrade) * 0.4
  );

  const overallProgress = clampPercent(
    lessonsProgress * 0.45 + assignmentsProgress * 0.45 + (overdueAssignments.length ? 0 : 10)
  );

  const activeTopicIds = useMemo(
    () =>
      new Set(
        [
          ...studentLessons.map((lesson) => lesson.topic_id).filter((topicId): topicId is number => topicId !== null),
          ...studentAssignments
            .map((assignment) => assignment.topic_id)
            .filter((topicId): topicId is number => topicId !== null),
        ]
      ),
    [studentAssignments, studentLessons]
  );

  const studentTopics = useMemo(() => {
    const subjectIds = new Set(filteredRelations.map((relation) => relation.subject_id));
    return topics.filter((topic) => {
      if (!subjectIds.has(topic.subject_id)) return false;
      return activeTopicIds.has(topic.id);
    });
  }, [activeTopicIds, filteredRelations, topics]);

  const topicProgressRows = useMemo<TopicProgress[]>(() => {
    return studentTopics
      .map((topic) => {
        const topicLessons = conductedLessons.filter((lesson) => lesson.topic_id === topic.id);
        const topicAssignments = studentAssignments.filter((assignment) => assignment.topic_id === topic.id);
        const topicCompletedAssignments = topicAssignments.filter(
          (assignment) => assignment.completion_status === 'completed'
        );
        const topicGrades = [
          ...topicLessons.map((lesson) => lesson.grade).filter((grade): grade is number => grade !== null),
          ...topicAssignments
            .map((assignment) => assignment.grade)
            .filter((grade): grade is number => grade !== null),
        ];

        const avg = average(topicGrades);
        const activityScore = Math.min(topicLessons.length + topicAssignments.length, 4) / 4;
        const completionScore =
          topicAssignments.length > 0 ? topicCompletedAssignments.length / topicAssignments.length : 0;
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
  }, [conductedLessons, studentAssignments, studentTopics]);

  const relationBreakdown = useMemo(() => {
    const onlyOneRelation = studentRelations.length === 1;

    return studentRelations.map((relation) => {
      const relationLessons = conductedLessons.filter((lesson) => lesson.tutor_student_id === relation.id);
      const relationAssignments = studentAssignments.filter(
        (assignment) => assignment.tutor_student_id === relation.id
      );
      const relationAssignmentDone = relationAssignments.filter(
        (assignment) => assignment.completion_status === 'completed'
      ).length;
      const relationAverageGrade = average([
        ...relationLessons.map((lesson) => lesson.grade).filter((grade): grade is number => grade !== null),
        ...relationAssignments
          .map((assignment) => assignment.grade)
          .filter((grade): grade is number => grade !== null),
      ]);

      return {
        relation,
        conductedCount: relationLessons.length,
        assignmentCount: relationAssignments.length,
        completedAssignmentCount: relationAssignmentDone,
        averageGrade: relationAverageGrade,
        progressPercent: onlyOneRelation
          ? overallProgress
          : clampPercent(
              scoreToPercent(relationAverageGrade) * 0.55 +
                (relationAssignments.length > 0
                  ? (relationAssignmentDone / relationAssignments.length) * 100
                  : 0) *
                  0.45
            ),
      };
    });
  }, [conductedLessons, overallProgress, studentAssignments, studentRelations]);

  const recommendations = useMemo(() => {
    const items: string[] = [];

    if (overdueAssignments.length > 0) {
      items.push(`Есть ${overdueAssignments.length} просроченных задания — стоит усилить контроль дедлайнов.`);
    }

    if (averageAssignmentGrade !== null && averageAssignmentGrade < 4) {
      items.push('По домашним заданиям средняя оценка ниже 4. Нужен дополнительный разбор ошибок.');
    }

    if (averageLessonGrade !== null && averageLessonGrade < 4) {
      items.push('Оценки за занятия просели. Полезно повторить базовые темы и закрепить практикой.');
    }

    const weakTopics = topicProgressRows
      .filter((row) => row.progressPercent < 55)
      .slice(0, 3)
      .map((row) => row.topic.title);

    if (weakTopics.length > 0) {
      items.push(`Слабые темы на текущий момент: ${weakTopics.join(', ')}.`);
    }

    if (items.length === 0 && selectedStudent) {
      items.push('Динамика ровная: можно усиливать сложные задачи и постепенно повышать уровень нагрузки.');
    }

    return items;
  }, [averageAssignmentGrade, averageLessonGrade, overdueAssignments.length, selectedStudent, topicProgressRows]);

  void recommendations;

  const strengths = useMemo(() => {
    const items: string[] = [];

    const strongTopics = topicProgressRows
      .filter((row) => row.progressPercent >= 70)
      .slice(0, 3)
      .map((row) => row.topic.title);

    if (strongTopics.length > 0) {
      items.push(`Уверенно идут темы: ${strongTopics.join(', ')}.`);
    }

    if (averageLessonGrade !== null && averageLessonGrade >= 4.5) {
      items.push('Высокая средняя оценка за занятия: ученик стабильно справляется на уроках.');
    }

    if (averageAssignmentGrade !== null && averageAssignmentGrade >= 4.5) {
      items.push('Домашние задания выполняются качественно: средняя оценка за ДЗ держится на высоком уровне.');
    }

    if (studentAssignments.length > 0 && completedAssignments.length / studentAssignments.length >= 0.8) {
      items.push('Хорошая учебная дисциплина: большая часть домашних заданий выполняется вовремя.');
    }

    if (items.length === 0) {
      items.push('Сильные стороны ещё только формируются: нужно накопить больше занятий и выполненных заданий.');
    }

    return items;
  }, [
    averageAssignmentGrade,
    averageLessonGrade,
    completedAssignments.length,
    studentAssignments.length,
    topicProgressRows,
  ]);

  const weaknesses = useMemo(() => {
    const items: string[] = [];

    const weakTopics = topicProgressRows
      .filter((row) => row.progressPercent < 55)
      .slice(0, 3)
      .map((row) => row.topic.title);

    if (weakTopics.length > 0) {
      items.push(`Требуют дополнительной проработки темы: ${weakTopics.join(', ')}.`);
    }

    if (overdueAssignments.length > 0) {
      items.push(`Есть просроченные задания: ${overdueAssignments.length}. Стоит усилить контроль дедлайнов.`);
    }

    if (averageLessonGrade !== null && averageLessonGrade < 4) {
      items.push('Средняя оценка за занятия ниже 4: полезно повторить базовые темы и добавить больше практики.');
    }

    if (averageAssignmentGrade !== null && averageAssignmentGrade < 4) {
      items.push('Средняя оценка за домашние задания ниже 4: нужен дополнительный разбор ошибок.');
    }

    if (items.length === 0) {
      items.push('Явных слабых сторон по текущим данным не видно.');
    }

    return items;
  }, [averageAssignmentGrade, averageLessonGrade, overdueAssignments.length, topicProgressRows]);

  const studentSummary = useMemo(
    () => [
      ['Класс', selectedStudent?.grade ? `${selectedStudent.grade} класс` : 'Не указан'],
      ['Активных предметов', String(studentRelations.length)],
      ['Проведено занятий', String(conductedLessons.length)],
      ['Выполнено ДЗ', String(completedAssignments.length)],
      ['Тем в работе', String(topicProgressRows.length)],
    ],
    [completedAssignments.length, conductedLessons.length, selectedStudent, studentRelations.length, topicProgressRows.length]
  );

  if (loading) {
    return <div style={panelStyle}>Загружаем портфолио...</div>;
  }

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

  return (
    <div>
      <section
        style={{
          ...panelStyle,
          padding: isMobile ? 18 : 24,
          marginBottom: 16,
          background:
            'linear-gradient(140deg, rgba(255,249,242,0.98) 0%, rgba(255,255,255,0.9) 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            alignItems: 'flex-start',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 'clamp(2rem, 4vw, 3rem)',
                lineHeight: 0.98,
                letterSpacing: '-0.04em',
                marginBottom: 10,
              }}
            >
              Портфолио и аналитика
            </h1>
            <div style={{ ...mutedTextStyle, maxWidth: 760 }}>
              Реальная динамика ученика по занятиям, заданиям и темам.
            </div>
          </div>

          <label style={{ display: 'grid', gap: 6, minWidth: isMobile ? '100%' : 320 }}>
            <span style={{ ...mutedTextStyle, fontSize: 14 }}>Ученик</span>
            <select
              value={selectedStudentId}
              onChange={(event) => setSelectedStudentId(event.target.value)}
            >
              {activeStudents.map((student) => (
                <option key={student.id} value={String(student.id)}>
                  {student.full_name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6, minWidth: isMobile ? '100%' : 260 }}>
            <span style={{ ...mutedTextStyle, fontSize: 14 }}>Предмет</span>
            <select
              value={selectedSubjectFilter}
              onChange={(event) => setSelectedSubjectFilter(event.target.value)}
            >
              <option value="all">Все предметы</option>
              {studentRelations.map((relation) => {
                const subject = subjectMap.get(relation.subject_id);
                return (
                  <option key={relation.id} value={String(relation.subject_id)}>
                    {relation.subject_name ?? subject?.name ?? `Предмет #${relation.subject_id}`}
                  </option>
                );
              })}
            </select>
          </label>
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: isTablet ? '1fr' : 'repeat(4, minmax(0, 1fr))',
          gap: 16,
          marginBottom: 16,
        }}
      >
        {[
          {
            title: 'Общий прогресс',
            value: formatPercent(overallProgress),
            note: 'Сводная оценка по занятиям, ДЗ и темам',
          },
          {
            title: 'Средняя оценка за занятия',
            value: formatAverage(averageLessonGrade),
            note: `${conductedLessons.length} проведённых занятий`,
          },
          {
            title: 'Средняя оценка за ДЗ',
            value: formatAverage(averageAssignmentGrade),
            note: `${studentAssignments.length} заданий в работе`,
          },
          {
            title: 'Просроченные задания',
            value: String(overdueAssignments.length),
            note: overdueAssignments.length > 0 ? 'Нужно внимание репетитора' : 'Сейчас просрочек нет',
          },
        ].map((card) => (
          <article key={card.title} style={panelStyle}>
            <div
              style={{
                color: '#6a7586',
                fontSize: 14,
                marginBottom: 10,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <span>{card.title}</span>
              {card.title === 'Общий прогресс' ? infoBadge(card.note) : null}
            </div>
            <div
              style={{
                fontSize: 'clamp(1.8rem, 3vw, 2.5rem)',
                fontWeight: 800,
                color: '#1f2a3b',
                marginBottom: 0,
              }}
            >
              {card.value}
            </div>
          </article>
        ))}
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: isTablet ? '1fr' : '1.05fr 0.95fr',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <article style={panelStyle}>
          <div style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 20, marginBottom: 6 }}>Прогресс по предметам</h3>
            <div style={mutedTextStyle}>
              Сводка по каждой активной связке ученик-предмет.
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {relationBreakdown.map((item) => (
              <div
                key={item.relation.id}
                style={{
                  padding: 14,
                  borderRadius: 18,
                  border: '1px solid rgba(24,33,47,0.08)',
                  background: 'rgba(23,32,51,0.03)',
                  display: 'grid',
                  gap: 10,
                }}
              >
                <div style={{ fontWeight: 700, color: '#1f2a3b' }}>
                  {relationLabel(item.relation, studentMap, subjectMap)}
                </div>

                <div
                  style={{
                    height: 10,
                    borderRadius: 999,
                    background: 'rgba(23,32,51,0.08)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${item.progressPercent}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: 'linear-gradient(90deg, #2a6fdb 0%, #5d93ea 100%)',
                    }}
                  />
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))',
                    gap: 8,
                    color: '#435066',
                    fontSize: 13,
                  }}
                >
                  <span>Прогресс: {formatPercent(item.progressPercent)}</span>
                  <span>Занятий: {item.conductedCount}</span>
                  <span>ДЗ: {item.completedAssignmentCount}/{item.assignmentCount}</span>
                  <span>Средняя: {formatAverage(item.averageGrade)}</span>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article style={{ ...panelStyle, display: 'grid', gap: 16 }}>
          <div style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 20, marginBottom: 6 }}>Сводка по ученику</h3>
            <div style={mutedTextStyle}>
              Ключевая информация и рекомендации по дальнейшей работе.
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
              gap: 10,
            }}
          >
            {studentSummary.map(([label, value]) => (
              <div
                key={label}
                style={{
                  padding: 14,
                  borderRadius: 16,
                  background: 'rgba(23,32,51,0.03)',
                  border: '1px solid rgba(24,33,47,0.08)',
                }}
              >
                <div style={{ ...mutedTextStyle, fontSize: 13, marginBottom: 6 }}>{label}</div>
                <div style={{ color: '#1f2a3b', fontWeight: 700 }}>{value}</div>
              </div>
            ))}
          </div>

          <div
            style={{
              padding: 14,
              borderRadius: 18,
              border: '1px solid rgba(24,33,47,0.08)',
              background: 'rgba(23,32,51,0.03)',
              display: 'grid',
              gap: 10,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                gap: 10,
              }}
            >
              <div>
                <div style={{ ...mutedTextStyle, fontSize: 13, marginBottom: 4 }}>Проведено занятий</div>
                <div style={{ fontWeight: 800, fontSize: 20, color: '#1f2a3b' }}>
                  {conductedLessons.length}
                </div>
              </div>
              <div>
                <div style={{ ...mutedTextStyle, fontSize: 13, marginBottom: 4 }}>Выполнено ДЗ</div>
                <div style={{ fontWeight: 800, fontSize: 20, color: '#1f2a3b' }}>
                  {completedAssignments.length}
                </div>
              </div>
              <div>
                <div style={{ ...mutedTextStyle, fontSize: 13, marginBottom: 4 }}>Тем в работе</div>
                <div style={{ fontWeight: 800, fontSize: 20, color: '#1f2a3b' }}>
                  {topicProgressRows.length}
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: 18, marginBottom: 10 }}>Индивидуальный план развития</h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                gap: 12,
              }}
            >
              {[
                { title: 'Сильные стороны', accent: '#2f7d63', items: strengths },
                { title: 'Слабые стороны', accent: '#a63f3b', items: weaknesses },
              ].map((section) => (
                <div
                  key={section.title}
                  style={{
                    padding: 14,
                    borderRadius: 18,
                    background: 'rgba(23,32,51,0.03)',
                    border: '1px solid rgba(24,33,47,0.08)',
                  }}
                >
                  <div
                    style={{
                      display: 'inline-flex',
                      padding: '6px 10px',
                      borderRadius: 999,
                      background: `${section.accent}12`,
                      color: section.accent,
                      fontWeight: 700,
                      fontSize: 13,
                      marginBottom: 12,
                    }}
                  >
                    {section.title}
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {section.items.map((item) => (
                      <div
                        key={item}
                        style={{
                          padding: 12,
                          borderRadius: 14,
                          background: '#fff',
                          border: '1px solid rgba(24,33,47,0.06)',
                          color: '#243041',
                          lineHeight: 1.5,
                        }}
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </article>
      </section>

      <section style={{ ...panelStyle, marginBottom: 16 }}>
        <div style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 20, marginBottom: 6 }}>Освоение тем</h3>
          <div style={mutedTextStyle}>
            Сколько ученик успел пройти по каждой теме, насколько стабильно выполняет задания и
            как выглядит средняя оценка.
          </div>
        </div>

        {topicProgressRows.length === 0 ? (
          <p style={{ ...mutedTextStyle, marginBottom: 0 }}>
            Для этого ученика пока нет тем с данными по занятиям или заданиям.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {topicProgressRows.map((row) => (
              <div
                key={row.topic.id}
                style={{
                  padding: 14,
                  borderRadius: 18,
                  border: '1px solid rgba(24,33,47,0.08)',
                  background: 'rgba(23,32,51,0.03)',
                  display: 'grid',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: '#1f2a3b' }}>{row.topic.title}</div>
                    <div style={{ ...mutedTextStyle, marginTop: 4 }}>
                      {row.topic.description || 'Описание темы не заполнено'}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '6px 10px',
                      borderRadius: 999,
                      background: 'rgba(42,111,219,0.1)',
                      color: '#2a6fdb',
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    {formatPercent(row.progressPercent)}
                  </div>
                </div>

                <div
                  style={{
                    height: 10,
                    borderRadius: 999,
                    background: 'rgba(23,32,51,0.08)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${row.progressPercent}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: 'linear-gradient(90deg, #2f7d63 0%, #58a889 100%)',
                    }}
                  />
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))',
                    gap: 8,
                    color: '#435066',
                    fontSize: 13,
                  }}
                >
                  <span>Занятий: {row.lessonCount}</span>
                  <span>ДЗ: {row.completedAssignments}/{row.assignmentCount}</span>
                  <span>Средняя: {formatAverage(row.averageGrade)}</span>
                  <span>Уровни: {row.topic.study_level?.join(', ') || 'не указаны'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
