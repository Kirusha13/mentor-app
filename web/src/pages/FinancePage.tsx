import { useEffect, useMemo, useState } from 'react';
import { getLessons, type Lesson } from '../api/lessons';
import { getStudents, type Student } from '../api/students';
import { getSubjects, type Subject } from '../api/subjects';
import {
  getTutorStudents,
  updateTutorStudent,
  type TutorStudent,
} from '../api/tutorStudents';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { getApiErrorMessage } from '../utils/apiError';

const panelStyle = {
  background: 'rgba(255,255,255,0.88)',
  padding: '20px',
  borderRadius: '22px',
  border: '1px solid rgba(24,33,47,0.08)',
  boxShadow: 'var(--shadow-card)',
} as const;

type PresetRange = 'month' | 'quarter' | 'year';
type RelationOption = {
  id: number;
  studentName: string;
  subjectName: string;
  label: string;
  total: number;
  used: number;
  remaining: number;
  status: TutorStudent['status'];
  rate: number;
};

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function getPresetDates(preset: PresetRange) {
  const today = new Date();
  const end = endOfDay(today);

  if (preset === 'quarter') {
    return {
      from: formatDate(addDays(startOfDay(today), -89)),
      to: formatDate(end),
    };
  }

  if (preset === 'year') {
    return {
      from: formatDate(addDays(startOfDay(today), -364)),
      to: formatDate(end),
    };
  }

  return {
    from: formatDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: formatDate(end),
  };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value);
}

function percentageDelta(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }

  return ((current - previous) / previous) * 100;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function toLessonDate(date: string) {
  return new Date(`${date}T00:00:00`);
}

function filterLessonsByRange(lessons: Lesson[], from: string, to: string) {
  const fromDate = startOfDay(new Date(`${from}T00:00:00`)).getTime();
  const toDate = endOfDay(new Date(`${to}T00:00:00`)).getTime();

  return lessons.filter((lesson) => {
    const lessonTime = toLessonDate(lesson.lesson_date).getTime();
    return lessonTime >= fromDate && lessonTime <= toDate;
  });
}

function lessonCost(lesson: Lesson) {
  const value = Number(lesson.cost ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function getPreviousRange(from: string, to: string) {
  const currentFrom = startOfDay(new Date(`${from}T00:00:00`));
  const currentTo = endOfDay(new Date(`${to}T00:00:00`));
  const diff = currentTo.getTime() - currentFrom.getTime();
  const prevTo = addDays(currentFrom, -1);
  const prevFrom = new Date(prevTo.getTime() - diff);

  return {
    from: formatDate(prevFrom),
    to: formatDate(prevTo),
  };
}

export default function FinancePage() {
  const isTablet = useMediaQuery('(max-width: 1100px)');
  const isMobile = useMediaQuery('(max-width: 720px)');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [tutorStudents, setTutorStudents] = useState<TutorStudent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<PresetRange>('month');
  const [dateFrom, setDateFrom] = useState(() => getPresetDates('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDates('month').to);
  const [selectedTutorStudentId, setSelectedTutorStudentId] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [savingAbonement, setSavingAbonement] = useState(false);
  const [createTutorStudentId, setCreateTutorStudentId] = useState('');
  const [createLessons, setCreateLessons] = useState('');
  const [createUsedLessons, setCreateUsedLessons] = useState('0');
  const [editingAbonement, setEditingAbonement] = useState(false);
  const [editLessons, setEditLessons] = useState('');
  const [editRate, setEditRate] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [lessonData, tutorStudentData, studentData, subjectData] = await Promise.all([
          getLessons(),
          getTutorStudents(),
          getStudents(),
          getSubjects(),
        ]);
        setLessons(lessonData);
        setTutorStudents(tutorStudentData);
        setStudents(studentData);
        setSubjects(subjectData);
      } catch (error) {
        console.error('Ошибка загрузки финансовых данных:', error);
        alert('Не удалось загрузить данные для раздела финансов');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const rangeError = useMemo(() => {
    if (!dateFrom || !dateTo) return 'Укажи обе даты периода.';
    if (new Date(`${dateFrom}T00:00:00`).getTime() > new Date(`${dateTo}T00:00:00`).getTime()) {
      return 'Дата начала не может быть позже даты окончания.';
    }
    return null;
  }, [dateFrom, dateTo]);

  const filteredLessons = useMemo(() => {
    if (rangeError) return [];
    return filterLessonsByRange(lessons, dateFrom, dateTo);
  }, [dateFrom, dateTo, lessons, rangeError]);

  const previousRange = useMemo(() => {
    if (rangeError) return null;
    return getPreviousRange(dateFrom, dateTo);
  }, [dateFrom, dateTo, rangeError]);

  const previousLessons = useMemo(() => {
    if (!previousRange) return [];
    return filterLessonsByRange(lessons, previousRange.from, previousRange.to);
  }, [lessons, previousRange]);

  const currentConducted = filteredLessons.filter((lesson) => lesson.conduct_status === 'conducted');
  const previousConducted = previousLessons.filter((lesson) => lesson.conduct_status === 'conducted');
  const paidLessons = currentConducted.filter((lesson) => lesson.payment_status === 'paid');
  const unpaidLessons = currentConducted.filter((lesson) => lesson.payment_status === 'unpaid');
  const income = paidLessons.reduce((sum, lesson) => sum + lessonCost(lesson), 0);
  const previousIncome = previousConducted
    .filter((lesson) => lesson.payment_status === 'paid')
    .reduce((sum, lesson) => sum + lessonCost(lesson), 0);
  const debt = unpaidLessons.reduce((sum, lesson) => sum + lessonCost(lesson), 0);
  const lessonsDelta = percentageDelta(currentConducted.length, previousConducted.length);
  const incomeDelta = percentageDelta(income, previousIncome);

  const studentMap = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students]
  );

  const subjectMap = useMemo(
    () => new Map(subjects.map((subject) => [subject.id, subject])),
    [subjects]
  );

  const relationOptions = useMemo<RelationOption[]>(() => {
    return tutorStudents
      .map((relation) => {
        const student = studentMap.get(relation.student_id);
        const subject = subjectMap.get(relation.subject_id);
        const total = relation.subscription_lessons ?? 0;
        const used = relation.used_lessons ?? 0;

        return {
          id: relation.id,
          studentName: student?.full_name ?? `Ученик #${relation.student_id}`,
          subjectName: relation.subject_name ?? subject?.name ?? `Предмет #${relation.subject_id}`,
          label: `${student?.full_name ?? `Ученик #${relation.student_id}`} • ${
            relation.subject_name ?? subject?.name ?? `Предмет #${relation.subject_id}`
          }`,
          total,
          used,
          remaining: Math.max(total - used, 0),
          status: relation.status,
          rate: Number(relation.hourly_rate ?? 0),
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'ru-RU'));
  }, [studentMap, subjectMap, tutorStudents]);

  const activeAbonements = useMemo(
    () => relationOptions.filter((option) => option.total > 0),
    [relationOptions]
  );

  const availableForCreation = useMemo(
    () => relationOptions.filter((option) => option.total === 0),
    [relationOptions]
  );

  const selectedRelation = useMemo(
    () => relationOptions.find((option) => String(option.id) === selectedTutorStudentId) ?? null,
    [relationOptions, selectedTutorStudentId]
  );

  useEffect(() => {
    if (!selectedRelation) {
      setEditingAbonement(false);
      setEditLessons('');
      setEditRate('');
      return;
    }

    setEditLessons(selectedRelation.total > 0 ? String(selectedRelation.total) : '');
    setEditRate(selectedRelation.rate > 0 ? String(selectedRelation.rate) : '');
  }, [selectedRelation]);

  useEffect(() => {
    if (!relationOptions.length) {
      setSelectedTutorStudentId('');
      return;
    }

    setSelectedTutorStudentId((current) => {
      if (current && relationOptions.some((option) => String(option.id) === current)) {
        return current;
      }

      const defaultRelation = activeAbonements[0] ?? null;
      return defaultRelation ? String(defaultRelation.id) : '';
    });
  }, [activeAbonements, relationOptions]);

  useEffect(() => {
    if (!selectedTutorStudentId) {
      return;
    }
  }, [relationOptions, selectedTutorStudentId]);

  const debtRows = unpaidLessons
    .map((lesson) => {
      const relation = tutorStudents.find((item) => item.id === lesson.tutor_student_id);
      const student = relation ? studentMap.get(relation.student_id) : null;
      const subject = relation ? subjectMap.get(relation.subject_id) : null;

      return {
        id: lesson.id,
        studentName: student?.full_name ?? 'Без ученика',
        subjectName: relation?.subject_name ?? lesson.subject_name ?? subject?.name ?? 'Без предмета',
        lessonDate: lesson.lesson_date,
        cost: lessonCost(lesson),
      };
    })
    .sort((a, b) => a.lessonDate.localeCompare(b.lessonDate));

  const metricCards = [
    {
      title: 'Оплачено за период',
      value: formatCurrency(income),
      note:
        previousIncome === 0 && income === 0
          ? 'В обоих периодах пока нет оплаченных проведённых занятий'
          : `${incomeDelta >= 0 ? '+' : ''}${incomeDelta.toFixed(0)}% к прошлому периоду`,
      accent: '#d96f32',
    },
    {
      title: 'Долги',
      value: formatCurrency(debt),
      note:
        unpaidLessons.length > 0
          ? `${unpaidLessons.length} неоплаченных проведённых занятий`
          : 'За выбранный период долгов нет',
      accent: '#a63f3c',
    },
    {
      title: 'Проведённые занятия',
      value: String(currentConducted.length),
      note:
        previousConducted.length === 0 && currentConducted.length === 0
          ? 'Сравнивать пока не с чем'
          : `${lessonsDelta >= 0 ? '+' : ''}${lessonsDelta.toFixed(0)}% к прошлому периоду`,
      accent: '#2a6fdb',
    },
  ];

  const applyPreset = (nextPreset: PresetRange) => {
    const nextRange = getPresetDates(nextPreset);
    setPreset(nextPreset);
    setDateFrom(nextRange.from);
    setDateTo(nextRange.to);
  };

  const handleCreateNewAbonement = () => {
    const nextRelation = availableForCreation[0] ?? null;
    if (!nextRelation) return;
    setCreateTutorStudentId(String(nextRelation.id));
    setCreateLessons('');
    setCreateUsedLessons('0');
    setCreateModalOpen(true);
  };

  const handleOpenAbonementDetails = (relationId: number) => {
    setSelectedTutorStudentId(String(relationId));
    setDetailsModalOpen(true);
  };

  const handleSubmitCreateAbonement = async () => {
    if (!createTutorStudentId) {
      alert('Сначала выбери связку ученик-предмет.');
      return;
    }

    const total = Number(createLessons);
    const used = Number(createUsedLessons || '0');

    if (!Number.isInteger(total) || total < 1) {
      alert('Количество занятий в абонементе должно быть целым числом больше нуля.');
      return;
    }

    if (!Number.isInteger(used) || used < 0) {
      alert('Использованные занятия должны быть целым числом от 0.');
      return;
    }

    if (used > total) {
      alert('Использованные занятия не могут превышать размер абонемента.');
      return;
    }

    try {
      setSavingAbonement(true);
      const updated = await updateTutorStudent(Number(createTutorStudentId), {
        subscription_lessons: total,
        used_lessons: used,
      });
      setTutorStudents((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedTutorStudentId(String(updated.id));
      setCreateModalOpen(false);
      alert('Абонемент создан.');
    } catch (error) {
      console.error('Ошибка создания абонемента:', error);
      alert(getApiErrorMessage(error, 'Не удалось создать абонемент.'));
    } finally {
      setSavingAbonement(false);
    }
  };

  const handleSaveAbonementDetails = async () => {
    if (!selectedRelation) {
      return;
    }

    const total = Number(editLessons);
    const rate = Number(editRate);

    if (!Number.isInteger(total) || total < 1) {
      alert('Количество занятий должно быть целым числом больше нуля.');
      return;
    }

    if (!Number.isFinite(rate) || rate <= 0) {
      alert('Ставка должна быть числом больше нуля.');
      return;
    }

    if (selectedRelation.used > total) {
      alert('Нельзя поставить количество занятий меньше уже использованных.');
      return;
    }

    try {
      setSavingAbonement(true);
      const updated = await updateTutorStudent(selectedRelation.id, {
        subscription_lessons: total,
        used_lessons: selectedRelation.used,
        hourly_rate: rate,
      });
      setTutorStudents((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setEditingAbonement(false);
      alert('Абонемент обновлён.');
    } catch (error) {
      console.error('Ошибка обновления абонемента:', error);
      alert(getApiErrorMessage(error, 'Не удалось обновить абонемент.'));
    } finally {
      setSavingAbonement(false);
    }
  };

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
              Финансы и абонементы
            </h1>
          </div>

          <div
            style={{
              minWidth: isMobile ? '100%' : 240,
              borderRadius: 18,
              padding: 14,
              background: '#172033',
              color: '#fff',
            }}
          >
            <div style={{ color: 'rgba(255,255,255,0.64)', fontSize: 12, marginBottom: 6 }}>
              Текущий период
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.1, marginBottom: 8 }}>
              {dateFrom} - {dateTo}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.74)', fontSize: 14 }}>
              Всего уроков в диапазоне: {filteredLessons.length}
            </div>
          </div>
        </div>
      </section>

      <section style={{ ...panelStyle, marginBottom: 16 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isTablet ? '1fr' : '1.2fr 1fr',
            gap: 16,
            alignItems: 'end',
          }}
        >
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#1f2a3b' }}>Период расчёта</div>
            <div style={{ color: '#687486', fontSize: 14 }}>
              Можно быстро выбрать типовой диапазон или задать даты вручную.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                ['month', 'Месяц'],
                ['quarter', '90 дней'],
                ['year', 'Год'],
              ].map(([value, label]) => {
                const active = preset === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => applyPreset(value as PresetRange)}
                    style={{
                      background: active ? '#d96f32' : 'rgba(23,32,51,0.92)',
                      boxShadow: 'none',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
              gap: 10,
            }}
          >
            <label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>
              С даты
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => {
                  setPreset('month');
                  setDateFrom(event.target.value);
                }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>
              По дату
              <input
                type="date"
                value={dateTo}
                onChange={(event) => {
                  setPreset('month');
                  setDateTo(event.target.value);
                }}
              />
            </label>
          </div>
        </div>

        {rangeError && (
          <div
            style={{
              marginTop: 14,
              padding: '12px 14px',
              borderRadius: 14,
              background: 'rgba(166,63,59,0.08)',
              color: '#9f3f3c',
              border: '1px solid rgba(166,63,59,0.12)',
            }}
          >
            {rangeError}
          </div>
        )}
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: isTablet ? '1fr' : 'repeat(3, minmax(0, 1fr))',
          gap: 16,
          marginBottom: 16,
        }}
      >
        {metricCards.map((card) => (
          <article key={card.title} style={panelStyle}>
            <div style={{ color: '#6a7586', fontSize: 14, marginBottom: 10 }}>{card.title}</div>
            <div
              style={{
                fontSize: 'clamp(1.8rem, 3vw, 2.5rem)',
                fontWeight: 800,
                color: '#1f2a3b',
                marginBottom: 10,
              }}
            >
              {loading || rangeError ? 'вЂ”' : card.value}
            </div>
            <div
              style={{
                display: 'inline-flex',
                padding: '7px 10px',
                borderRadius: 999,
                background: `${card.accent}14`,
                color: card.accent,
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              {loading || rangeError ? 'Ждём данные' : card.note}
            </div>
          </article>
        ))}
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: isTablet ? '1fr' : '1.1fr 0.9fr',
          gap: 16,
        }}
      >
        <article style={panelStyle}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'center',
              flexWrap: 'wrap',
              marginBottom: 14,
            }}
          >
            <div>
              <h3 style={{ fontSize: 20, marginBottom: 6 }}>Неоплаченные занятия</h3>
              <div style={{ color: '#687486', fontSize: 14 }}>
                Здесь видны проведённые, но ещё не оплаченные уроки за выбранный период.
              </div>
            </div>
            <div style={{ fontWeight: 800, color: '#1f2a3b' }}>{formatCurrency(debt)}</div>
          </div>

          {loading ? (
            <p style={{ color: '#687486', marginBottom: 0 }}>Загрузка финансовых записей...</p>
          ) : rangeError ? (
            <p style={{ color: '#9f3f3c', marginBottom: 0 }}>
              Исправь диапазон дат, чтобы увидеть долги.
            </p>
          ) : debtRows.length === 0 ? (
            <p style={{ color: '#687486', marginBottom: 0 }}>
              За выбранный период неоплаченных занятий нет.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {debtRows.map((row) => (
                <div
                  key={row.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr auto',
                    gap: 10,
                    alignItems: 'center',
                    padding: 14,
                    borderRadius: 16,
                    border: '1px solid rgba(24,33,47,0.08)',
                    background: 'rgba(23,32,51,0.03)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: '#243041', marginBottom: 4 }}>
                      {row.studentName}
                    </div>
                    <div style={{ color: '#687486', fontSize: 14 }}>{row.subjectName}</div>
                  </div>
                  <div style={{ color: '#435066', fontSize: 14 }}>{row.lessonDate}</div>
                  <div style={{ fontWeight: 800, color: '#9f3f3c' }}>{formatCurrency(row.cost)}</div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article style={panelStyle}>
          <div style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 20, marginBottom: 6 }}>Абонементы</h3>
            <div style={{ color: '#687486', fontSize: 14 }}>
              В списке показаны только уже созданные абонементы. Новый абонемент создаётся отдельно.
            </div>
          </div>

          {!relationOptions.length ? (
            <p style={{ color: '#687486', marginBottom: 0 }}>
              Пока нет связок учеников с предметами. Сначала создай их на странице «Ученики».
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ color: '#556173', fontSize: 14 }}>
                  В списке только активные абонементы. Новую связку можно настроить отдельно.
                </div>
                {availableForCreation.length > 0 && (
                  <button
                    type="button"
                    onClick={handleCreateNewAbonement}
                    style={{ background: '#d96f32', boxShadow: 'none' }}
                  >
                    Создать новый
                  </button>
                )}
              </div>

              {activeAbonements.length === 0 ? (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 16,
                    border: '1px solid rgba(24,33,47,0.08)',
                    background: 'rgba(23,32,51,0.03)',
                    color: '#556173',
                    fontSize: 14,
                  }}
                >
                  Активных абонементов пока нет.
                  {availableForCreation.length > 0 ? ' Нажми «Создать новый», чтобы завести первый.' : ''}
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {activeAbonements.map((option) => {
                    const active = String(option.id) === selectedTutorStudentId;
                    const progress =
                      option.total > 0 ? clampPercent((option.used / option.total) * 100) : 0;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => handleOpenAbonementDetails(option.id)}
                        style={{
                          display: 'grid',
                          gap: 10,
                          textAlign: 'left',
                          padding: 14,
                          borderRadius: 18,
                          background: active ? 'rgba(42,111,219,0.1)' : 'rgba(23,32,51,0.03)',
                          color: '#1f2a3b',
                          border: active
                            ? '1px solid rgba(42,111,219,0.28)'
                            : '1px solid rgba(24,33,47,0.08)',
                          boxShadow: 'none',
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
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>{option.studentName}</div>
                            <div style={{ color: '#687486', fontSize: 14 }}>{option.subjectName}</div>
                          </div>
                        </div>

                        <div
                          style={{
                            height: 8,
                            borderRadius: 999,
                            background: 'rgba(23,32,51,0.08)',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${progress}%`,
                              height: '100%',
                              borderRadius: 999,
                              background: 'linear-gradient(90deg, #2a6fdb 0%, #5d93ea 100%)',
                            }}
                          />
                        </div>

                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                            gap: 8,
                            color: '#435066',
                            fontSize: 13,
                          }}
                        >
                          <span>Всего: {option.total}</span>
                          <span>Использовано: {option.used}</span>
                          <span>Осталось: {option.remaining}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

            </div>
          )}
        </article>
      </section>

      {createModalOpen && (
        <div
          onClick={() => setCreateModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.48)',
            display: 'grid',
            placeItems: 'center',
            padding: 20,
            zIndex: 40,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(560px, 100%)',
              background: '#fff',
              borderRadius: 24,
              border: '1px solid rgba(24,33,47,0.08)',
              boxShadow: '0 30px 80px rgba(15,23,42,0.18)',
              padding: isMobile ? 18 : 24,
              display: 'grid',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: 22, marginBottom: 6 }}>Создать абонемент</h3>
                <div style={{ color: '#687486', fontSize: 14 }}>
                  Выбери связку ученик-предмет и задай параметры нового абонемента.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none', padding: '10px 14px' }}
              >
                Закрыть
              </button>
            </div>

            <label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>
              Связь ученик-предмет
              <select
                value={createTutorStudentId}
                onChange={(event) => setCreateTutorStudentId(event.target.value)}
              >
                {availableForCreation.map((option) => (
                  <option key={option.id} value={String(option.id)}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                gap: 10,
              }}
            >
              <label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>
                Количество занятий
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={createLessons}
                  onChange={(event) => setCreateLessons(event.target.value)}
                  placeholder="Например, 8"
                />
              </label>
              <label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>
                Уже использовано
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={createUsedLessons}
                  onChange={(event) => setCreateUsedLessons(event.target.value)}
                />
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={handleSubmitCreateAbonement} disabled={savingAbonement}>
                {savingAbonement ? 'Сохраняем...' : 'Создать абонемент'}
              </button>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {detailsModalOpen && selectedRelation && (
        <div
          onClick={() => setDetailsModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.48)',
            display: 'grid',
            placeItems: 'center',
            padding: 20,
            zIndex: 40,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(560px, 100%)',
              background: '#fff',
              borderRadius: 24,
              border: '1px solid rgba(24,33,47,0.08)',
              boxShadow: '0 30px 80px rgba(15,23,42,0.18)',
              padding: isMobile ? 18 : 24,
              display: 'grid',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: 22, marginBottom: 6 }}>{selectedRelation.studentName}</h3>
                <div style={{ color: '#687486', fontSize: 14 }}>{selectedRelation.subjectName}</div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setEditingAbonement((current) => !current)}
                  style={{ background: '#d96f32', boxShadow: 'none', padding: '10px 14px' }}
                >
                  {editingAbonement ? 'Скрыть редактирование' : 'Редактировать'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDetailsModalOpen(false);
                    setEditingAbonement(false);
                  }}
                  style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none', padding: '10px 14px' }}
                >
                  Закрыть
                </button>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                gap: 12,
              }}
            >
              <div style={{ padding: 14, borderRadius: 16, background: 'rgba(23,32,51,0.03)' }}>
                <div style={{ color: '#687486', fontSize: 13, marginBottom: 6 }}>Ставка</div>
                {editingAbonement ? (
                  <input
                    type="number"
                    min="1"
                    step="50"
                    value={editRate}
                    onChange={(event) => setEditRate(event.target.value)}
                  />
                ) : (
                  <div style={{ fontWeight: 700, color: '#1f2a3b' }}>
                    {formatCurrency(selectedRelation.rate)} в час
                  </div>
                )}
              </div>
              <div style={{ padding: 14, borderRadius: 16, background: 'rgba(23,32,51,0.03)' }}>
                <div style={{ color: '#687486', fontSize: 13, marginBottom: 6 }}>Всего занятий</div>
                {editingAbonement ? (
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={editLessons}
                    onChange={(event) => setEditLessons(event.target.value)}
                  />
                ) : (
                  <div style={{ fontWeight: 700, color: '#1f2a3b' }}>{selectedRelation.total}</div>
                )}
              </div>
              <div style={{ padding: 14, borderRadius: 16, background: 'rgba(23,32,51,0.03)' }}>
                <div style={{ color: '#687486', fontSize: 13, marginBottom: 6 }}>Использовано</div>
                <div style={{ fontWeight: 700, color: '#1f2a3b' }}>{selectedRelation.used}</div>
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
                  height: '100%',
                  width: `${selectedRelation.total > 0 ? clampPercent((selectedRelation.used / selectedRelation.total) * 100) : 0}%`,
                  background: 'linear-gradient(90deg, #2a6fdb 0%, #5d93ea 100%)',
                  borderRadius: 999,
                }}
              />
            </div>

            <div style={{ color: '#435066', fontSize: 14 }}>
              Осталось занятий: <strong>{selectedRelation.remaining}</strong>
            </div>

            {editingAbonement && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={handleSaveAbonementDetails} disabled={savingAbonement}>
                  {savingAbonement ? 'Сохраняем...' : 'Сохранить изменения'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingAbonement(false);
                    setEditLessons(String(selectedRelation.total));
                    setEditRate(String(selectedRelation.rate));
                  }}
                  style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}
                >
                  Отмена
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

