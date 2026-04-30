import { useEffect, useMemo, useState } from 'react';
import { confirmPayment, getLessons, type Lesson } from '../api/lessons';
import { getStudents, type Student } from '../api/students';
import { getSubjects, type Subject } from '../api/subjects';
import {
  getTutorStudents,
  updateTutorStudent,
  type TutorStudent,
} from '../api/tutorStudents';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { getApiErrorMessage } from '../utils/apiError';
import { lessonDate } from '../utils/lessonTime';

const panelStyle = {
  background: 'rgba(255,255,255,0.88)',
  padding: '20px',
  borderRadius: '22px',
  border: '1px solid rgba(24,33,47,0.08)',
  boxShadow: 'var(--shadow-card)',
} as const;

type ForecastRange = 'week' | 'month';
type ChartRange = 'week' | 'month' | 'year';
type FinanceTab = 'income' | 'subscriptions';
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
type ChartTooltip = {
  key: string;
  title: string;
  value: string;
  note?: string;
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

function getDefaultHistoryRange() {
  const today = new Date();
  const end = endOfDay(today);

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
    const lessonTime = toLessonDate(lessonDate(lesson)).getTime();
    return lessonTime >= fromDate && lessonTime <= toDate;
  });
}

function lessonCost(lesson: Lesson) {
  const value = Number(lesson.cost ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function getLessonDurationHours(lesson: Lesson) {
  const start = new Date(lesson.starts_at);
  const end = new Date(lesson.ends_at);
  return Math.max(0, end.getTime() - start.getTime()) / 3_600_000;
}

function calculateLessonCostByRate(lesson: Lesson, hourlyRate: number | null | undefined) {
  const rate = Number(hourlyRate ?? 0);
  if (Number.isFinite(rate) && rate > 0) {
    return Math.round(rate * getLessonDurationHours(lesson));
  }
  return lessonCost(lesson);
}

function getCurrentRange(range: ForecastRange | ChartRange) {
  const today = new Date();

  if (range === 'week') {
    const day = today.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = addDays(startOfDay(today), mondayOffset);
    const sunday = addDays(monday, 6);

    return {
      from: formatDate(monday),
      to: formatDate(endOfDay(sunday)),
    };
  }

  if (range === 'year') {
    return {
      from: formatDate(new Date(today.getFullYear(), 0, 1)),
      to: formatDate(endOfDay(new Date(today.getFullYear(), 11, 31))),
    };
  }

  return {
    from: formatDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: formatDate(endOfDay(new Date(today.getFullYear(), today.getMonth() + 1, 0))),
  };
}

function isRealFinancialLesson(lesson: Lesson) {
  return (
    lesson.tutor_student_id !== null &&
    !['cancelled', 'rescheduled', 'booking_rejected', 'reschedule_rejected'].includes(
      lesson.conduct_status
    )
  );
}

function getLessonStartDateTime(lesson: Lesson) {
  return new Date(lesson.starts_at);
}

function formatReadableDate(date: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${date}T00:00:00`));
}

function getDaysSince(date: string) {
  const today = startOfDay(new Date()).getTime();
  const lessonDate = startOfDay(new Date(`${date}T00:00:00`)).getTime();
  return Math.max(0, Math.floor((today - lessonDate) / 86_400_000));
}

function getWeekOfMonth(date: Date) {
  return Math.ceil(date.getDate() / 7);
}

function getDateRangeLength(from: string, to: string) {
  const fromDate = startOfDay(new Date(`${from}T00:00:00`)).getTime();
  const toDate = startOfDay(new Date(`${to}T00:00:00`)).getTime();
  return Math.max(1, Math.floor((toDate - fromDate) / 86_400_000) + 1);
}

function chartTooltipStyle(visible: boolean) {
  return {
    position: 'absolute',
    top: 18,
    right: 18,
    padding: '10px 12px',
    borderRadius: 14,
    background: '#172033',
    color: '#fff',
    boxShadow: '0 16px 36px rgba(15,23,42,0.18)',
    minWidth: 170,
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0) scale(1)' : 'translateY(6px) scale(0.98)',
    pointerEvents: 'none',
    transition: 'opacity 220ms ease, transform 220ms ease',
    zIndex: 2,
  } as const;
}

export default function FinancePage() {
  const isTablet = useMediaQuery('(max-width: 1100px)');
  const isMobile = useMediaQuery('(max-width: 720px)');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [tutorStudents, setTutorStudents] = useState<TutorStudent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FinanceTab>('income');
  const [forecastRange, setForecastRange] = useState<ForecastRange>('week');
  const [chartRange, setChartRange] = useState<ChartRange>('week');
  const [dateFrom] = useState(() => getDefaultHistoryRange().from);
  const [dateTo] = useState(() => getDefaultHistoryRange().to);
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
  const [processingPaymentId, setProcessingPaymentId] = useState<number | null>(null);
  const [dailyTooltip, setDailyTooltip] = useState<ChartTooltip | null>(null);
  const [subjectTooltip, setSubjectTooltip] = useState<ChartTooltip | null>(null);

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

  const forecastDateRange = useMemo(() => getCurrentRange(forecastRange), [forecastRange]);
  const chartDateRange = useMemo(() => getCurrentRange(chartRange), [chartRange]);
  const forecastLessons = useMemo(
    () => filterLessonsByRange(lessons, forecastDateRange.from, forecastDateRange.to),
    [forecastDateRange.from, forecastDateRange.to, lessons]
  );
  const chartLessons = useMemo(
    () => filterLessonsByRange(lessons, chartDateRange.from, chartDateRange.to),
    [chartDateRange.from, chartDateRange.to, lessons]
  );

  const studentMap = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students]
  );

  const subjectMap = useMemo(
    () => new Map(subjects.map((subject) => [subject.id, subject])),
    [subjects]
  );

  const relationMap = useMemo(
    () => new Map(tutorStudents.map((relation) => [relation.id, relation])),
    [tutorStudents]
  );

  const currentFinancialLessons = filteredLessons.filter(isRealFinancialLesson);
  const forecastFinancialLessons = forecastLessons.filter(isRealFinancialLesson);
  const chartFinancialLessons = chartLessons.filter(isRealFinancialLesson);
  const currentConducted = currentFinancialLessons.filter((lesson) => lesson.conduct_status === 'conducted');
  const forecastConducted = forecastFinancialLessons.filter((lesson) => lesson.conduct_status === 'conducted');
  const chartConducted = chartFinancialLessons.filter((lesson) => lesson.conduct_status === 'conducted');
  const chartPaidLessons = chartConducted.filter((lesson) => lesson.payment_status === 'paid');
  const forecastPaidLessons = forecastConducted.filter((lesson) => lesson.payment_status === 'paid');
  const forecastPaymentPendingLessons = forecastConducted.filter(
    (lesson) => lesson.payment_status === 'payment_pending'
  );
  const forecastUnpaidLessons = forecastConducted.filter((lesson) => lesson.payment_status === 'unpaid');
  const paymentPendingLessons = currentConducted.filter(
    (lesson) => lesson.payment_status === 'payment_pending'
  );
  const unpaidLessons = currentConducted.filter((lesson) => lesson.payment_status === 'unpaid');
  const debt = unpaidLessons.reduce(
    (sum, lesson) => sum + calculateLessonCostByRate(lesson, lesson.tutor_student_id ? relationMap.get(lesson.tutor_student_id)?.hourly_rate : null),
    0
  );
  const pendingConfirmation = paymentPendingLessons.reduce(
    (sum, lesson) => sum + calculateLessonCostByRate(lesson, lesson.tutor_student_id ? relationMap.get(lesson.tutor_student_id)?.hourly_rate : null),
    0
  );
  const forecastFutureScheduledLessons = forecastFinancialLessons.filter(
    (lesson) =>
      lesson.conduct_status === 'scheduled' && getLessonStartDateTime(lesson).getTime() >= Date.now()
  );
  const forecastPaidIncome = forecastPaidLessons.reduce(
    (sum, lesson) => sum + calculateLessonCostByRate(lesson, lesson.tutor_student_id ? relationMap.get(lesson.tutor_student_id)?.hourly_rate : null),
    0
  );
  const forecastDebt = forecastUnpaidLessons.reduce(
    (sum, lesson) => sum + calculateLessonCostByRate(lesson, lesson.tutor_student_id ? relationMap.get(lesson.tutor_student_id)?.hourly_rate : null),
    0
  );
  const forecastPendingConfirmation = forecastPaymentPendingLessons.reduce(
    (sum, lesson) => sum + calculateLessonCostByRate(lesson, lesson.tutor_student_id ? relationMap.get(lesson.tutor_student_id)?.hourly_rate : null),
    0
  );
  const forecastPlannedIncome = forecastFutureScheduledLessons.reduce(
    (sum, lesson) => sum + calculateLessonCostByRate(lesson, lesson.tutor_student_id ? relationMap.get(lesson.tutor_student_id)?.hourly_rate : null),
    0
  );
  const forecastIncome =
    forecastPaidIncome + forecastDebt + forecastPendingConfirmation + forecastPlannedIncome;
  const forecastFactIncome = forecastPaidIncome + forecastPendingConfirmation + forecastDebt;
  const forecastProgress = forecastIncome > 0 ? clampPercent((forecastFactIncome / forecastIncome) * 100) : 0;

  const relationOptions = useMemo<RelationOption[]>(() => {
    return tutorStudents
      .map((relation) => {
        const student = studentMap.get(relation.student_id);
        const subject = subjectMap.get(relation.subject_id);
        const total = relation.subscription_hours ?? 0;
        const used = relation.used_hours ?? 0;

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

  const receivableLessons = [...unpaidLessons, ...paymentPendingLessons];

  const debtRows = receivableLessons
    .map((lesson) => {
      const relation = lesson.tutor_student_id ? relationMap.get(lesson.tutor_student_id) : null;
      const student = relation ? studentMap.get(relation.student_id) : null;
      const subject = relation ? subjectMap.get(relation.subject_id) : null;

      return {
        id: lesson.id,
        studentName: student?.full_name ?? 'Без ученика',
        subjectName: relation?.subject_name ?? lesson.subject_name ?? subject?.name ?? 'Без предмета',
        lessonDate: lessonDate(lesson),
        cost: calculateLessonCostByRate(lesson, relation?.hourly_rate),
        daysSince: getDaysSince(lessonDate(lesson)),
        paymentStatus: lesson.payment_status,
        status:
          lesson.payment_status === 'payment_pending'
            ? 'Ожидает подтверждения'
            : 'Не оплачено',
      };
    })
    .sort((a, b) => b.daysSince - a.daysSince);

  const dailyIncomeRows = useMemo(() => {
    const grouped = new Map<string, { label: string; fullLabel: string; value: number; lessons: number }>();

    if (chartRange === 'week') {
      const rows: { key: string; label: string; fullLabel: string; value: number; lessons: number }[] = [];
      const start = startOfDay(new Date(`${chartDateRange.from}T00:00:00`));
      const daysCount = getDateRangeLength(chartDateRange.from, chartDateRange.to);

      for (let index = 0; index < daysCount; index += 1) {
        const date = formatDate(addDays(start, index));
        const dayLessons = chartPaidLessons.filter((lesson) => lessonDate(lesson) === date);
        rows.push({
          key: date,
          label: formatReadableDate(date),
          fullLabel: new Intl.DateTimeFormat('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }).format(new Date(`${date}T00:00:00`)),
          value: dayLessons.reduce(
            (sum, lesson) =>
              sum +
              calculateLessonCostByRate(
                lesson,
                lesson.tutor_student_id ? relationMap.get(lesson.tutor_student_id)?.hourly_rate : null
              ),
            0
          ),
          lessons: dayLessons.length,
        });
      }

      return rows;
    }

    chartPaidLessons.forEach((lesson) => {
      const date = new Date(lesson.starts_at);
      const key =
        chartRange === 'month'
          ? `week-${getWeekOfMonth(date)}`
          : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label =
        chartRange === 'month'
          ? `${getWeekOfMonth(date)} нед.`
          : new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(date);
      const fullLabel =
        chartRange === 'month'
          ? `${getWeekOfMonth(date)} неделя месяца`
          : new Intl.DateTimeFormat('ru-RU', {
              month: 'long',
              year: 'numeric',
            }).format(date);
      const current = grouped.get(key) ?? { label, value: 0, lessons: 0, fullLabel };
      grouped.set(key, {
        label,
        value:
          current.value +
          calculateLessonCostByRate(
            lesson,
            lesson.tutor_student_id ? relationMap.get(lesson.tutor_student_id)?.hourly_rate : null
          ),
        lessons: current.lessons + 1,
        fullLabel,
      });
    });

    return Array.from(grouped, ([key, row]) => ({
      key,
      label: row.label,
      fullLabel: row.fullLabel,
      value: row.value,
      lessons: row.lessons,
    }));
  }, [chartDateRange.from, chartDateRange.to, chartPaidLessons, chartRange]);

  const averageWeekRows = useMemo(() => {
    const year = new Date().getFullYear();
    const currentMonthIndex = new Date().getMonth();
    const rows: { key: string; label: string; fullLabel: string; value: number; total: number }[] = [];

    for (let month = 0; month < 12; month += 1) {
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0);
      const monthLessons = lessons
        .filter(isRealFinancialLesson)
        .filter((lesson) => {
          const date = new Date(lesson.starts_at);
          return (
            date >= monthStart &&
            date <= monthEnd &&
            lesson.conduct_status === 'conducted' &&
            lesson.payment_status === 'paid'
          );
        });
      const total = monthLessons.reduce(
        (sum, lesson) =>
          sum +
          calculateLessonCostByRate(
            lesson,
            lesson.tutor_student_id ? relationMap.get(lesson.tutor_student_id)?.hourly_rate : null
          ),
        0
      );
      if (month > currentMonthIndex && total === 0) {
        continue;
      }

      const weeksInMonth = Math.ceil(monthEnd.getDate() / 7);

      rows.push({
        key: `${year}-${String(month + 1).padStart(2, '0')}`,
        label: new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(monthStart),
        fullLabel: new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(monthStart),
        total,
        value: total / weeksInMonth,
      });
    }

    return rows;
  }, [lessons]);

  const maxDailyIncome = Math.max(...dailyIncomeRows.map((row) => row.value), 1);
  const maxAverageWeekIncome = Math.max(...averageWeekRows.map((row) => row.value), 1);
  const forecastParts = [
    { label: 'Оплачено', value: forecastPaidIncome, color: '#d96f32' },
    { label: 'На проверке', value: forecastPendingConfirmation, color: '#2a6fdb' },
    { label: 'В расписании', value: forecastPlannedIncome, color: '#2f7d5a' },
  ];
  const forecastRangeLabel = forecastRange === 'week' ? 'текущую неделю' : 'текущий месяц';
  const chartRangeLabel = {
    week: 'по дням текущей недели',
    month: 'по неделям текущего месяца',
    year: 'по месяцам текущего года',
  }[chartRange];

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

  const handlePaymentDecision = async (lessonId: number, confirm: boolean) => {
    try {
      setProcessingPaymentId(lessonId);
      const updated = await confirmPayment(lessonId, { confirm });
      setLessons((prev) => prev.map((lesson) => (lesson.id === updated.id ? updated : lesson)));
    } catch (error) {
      console.error('Ошибка подтверждения оплаты:', error);
      alert(getApiErrorMessage(error, 'Не удалось обработать оплату.'));
    } finally {
      setProcessingPaymentId(null);
    }
  };

  const handleSubmitCreateAbonement = async () => {
    if (!createTutorStudentId) {
      alert('Сначала выбери связку ученик-предмет.');
      return;
    }

    const total = Number(createLessons);
    const used = Number(createUsedLessons || '0');

    if (!Number.isInteger(total) || total < 1) {
      alert('Количество часов в абонементе должно быть целым числом больше нуля.');
      return;
    }

    if (!Number.isInteger(used) || used < 0) {
      alert('Использованные занятия должны быть целым числом от 0.');
      return;
    }

    if (used > total) {
      alert('Использованные часы не могут превышать размер абонемента.');
      return;
    }

    try {
      setSavingAbonement(true);
      const updated = await updateTutorStudent(Number(createTutorStudentId), {
        subscription_hours: total,
        used_hours: used,
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
      alert('Количество часов должно быть целым числом больше нуля.');
      return;
    }

    if (!Number.isFinite(rate) || rate <= 0) {
      alert('Ставка должна быть числом больше нуля.');
      return;
    }

    if (selectedRelation.used > total) {
      alert('Нельзя поставить количество часов меньше уже использованных.');
      return;
    }

    try {
      setSavingAbonement(true);
      const updated = await updateTutorStudent(selectedRelation.id, {
        subscription_hours: total,
        used_hours: selectedRelation.used,
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

  const handleDeleteAbonement = async () => {
    if (!selectedRelation) {
      return;
    }

    if (!window.confirm(`Снять абонемент у ученика «${selectedRelation.studentName}»?`)) {
      return;
    }

    try {
      setSavingAbonement(true);
      const updated = await updateTutorStudent(selectedRelation.id, {
        subscription_hours: 0,
        used_hours: 0,
      });
      setTutorStudents((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setDetailsModalOpen(false);
      setEditingAbonement(false);
    } catch (error) {
      console.error('Ошибка удаления абонемента:', error);
      alert(getApiErrorMessage(error, 'Не удалось снять абонемент.'));
    } finally {
      setSavingAbonement(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        {[
          ['income', 'Доходы'],
          ['subscriptions', 'Абонементы'],
        ].map(([value, label]) => {
          const active = activeTab === value;

          return (
            <button
              key={value}
              type="button"
              onClick={() => setActiveTab(value as FinanceTab)}
              style={{
                background: active ? '#172033' : 'rgba(23,32,51,0.07)',
                color: active ? '#fff' : '#243041',
                boxShadow: 'none',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {activeTab === 'income' && (
        <>
      <section style={{ marginBottom: 16 }}>
        <article style={panelStyle}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              marginBottom: 16,
            }}
          >
            <div>
              <h3 style={{ fontSize: 20, marginBottom: 6 }}>Прогноз дохода</h3>
              <div style={{ color: '#687486', fontSize: 14 }}>
                Ожидаемый доход за {forecastRangeLabel} по ставке за час и длительности занятий.
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gap: 10,
                justifyItems: isMobile ? 'start' : 'end',
              }}
            >
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {[
                  ['week', 'Неделя'],
                  ['month', 'Месяц'],
                ].map(([value, label]) => {
                  const active = forecastRange === value;

                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForecastRange(value as ForecastRange)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 999,
                        background: active ? '#172033' : 'rgba(23,32,51,0.07)',
                        color: active ? '#fff' : '#243041',
                        boxShadow: 'none',
                        fontSize: 13,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                <div style={{ color: '#687486', fontSize: 13 }}>
                  {forecastDateRange.from} - {forecastDateRange.to}
                </div>
                <div style={{ color: '#1f2a3b', fontSize: 28, fontWeight: 900 }}>
                  {loading ? '—' : formatCurrency(forecastIncome)}
                </div>
                <div style={{ color: '#687486', fontSize: 13 }}>
                  факт: {loading ? '—' : formatCurrency(forecastFactIncome)}
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              height: 14,
              borderRadius: 999,
              background: 'rgba(23,32,51,0.08)',
              overflow: 'hidden',
              marginBottom: 14,
            }}
          >
            <div
              style={{
                width: `${forecastProgress}%`,
                height: '100%',
                borderRadius: 999,
                background: 'linear-gradient(90deg, #d96f32 0%, #2f7d5a 100%)',
                transition: 'width 260ms ease',
              }}
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: 14,
              alignItems: 'stretch',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))',
                gap: 10,
              }}
            >
              {forecastParts.map((part) => (
                <div
                  key={part.label}
                  style={{
                    padding: 12,
                    borderRadius: 16,
                    background: `${part.color}10`,
                    border: `1px solid ${part.color}22`,
                  }}
                >
                  <div style={{ color: '#687486', fontSize: 13, marginBottom: 6 }}>{part.label}</div>
                  <div style={{ color: '#1f2a3b', fontWeight: 900 }}>
                    {loading ? '—' : formatCurrency(part.value)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 16,
              background: 'rgba(47,125,90,0.08)',
              color: '#2f6f51',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            Если неделя/месяц закончится по расписанию, ожидаемый доход составит{' '}
            {loading ? '—' : formatCurrency(forecastIncome)}.
          </div>
        </article>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: isTablet ? '1fr' : '1.15fr 0.85fr',
          gap: 16,
          alignItems: 'start',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'grid', gap: 16 }}>
        <article style={{ ...panelStyle, position: 'relative', overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              marginBottom: 14,
            }}
          >
            <div>
              <h3 style={{ fontSize: 20, marginBottom: 6 }}>Динамика дохода</h3>
              <div style={{ color: '#687486', fontSize: 14 }}>
                {chartRangeLabel}. Наведи на столбец, чтобы увидеть сумму.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {[
                ['week', 'Неделя'],
                ['month', 'Месяц'],
                ['year', 'Год'],
              ].map(([value, label]) => {
                const active = chartRange === value;

                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setChartRange(value as ChartRange);
                      setDailyTooltip(null);
                      setSubjectTooltip(null);
                    }}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 999,
                      background: active ? '#172033' : 'rgba(23,32,51,0.07)',
                      color: active ? '#fff' : '#243041',
                      boxShadow: 'none',
                      fontSize: 13,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={chartTooltipStyle(Boolean(dailyTooltip))}>
            <div style={{ color: 'rgba(255,255,255,0.68)', fontSize: 12, marginBottom: 4 }}>
              {dailyTooltip?.title ?? 'Дата'}
            </div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>{dailyTooltip?.value ?? formatCurrency(0)}</div>
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, marginTop: 3 }}>
              {dailyTooltip?.note ?? 'Наведи на столбец'}
            </div>
          </div>

          {loading ? (
            <p style={{ color: '#687486', marginBottom: 0 }}>Ждём данные для графика.</p>
          ) : dailyIncomeRows.every((row) => row.value === 0) ? (
            <p style={{ color: '#687486', marginBottom: 0 }}>
              В выбранном периоде пока нет оплаченных занятий.
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.max(dailyIncomeRows.length, 1)}, minmax(18px, 1fr))`,
                gap: 8,
                alignItems: 'end',
                minHeight: 120,
                paddingTop: 4,
              }}
            >
              {dailyIncomeRows.map((row) => (
                <div
                  key={row.key}
                  onMouseEnter={() =>
                    setDailyTooltip({
                      key: row.key,
                      title: row.fullLabel,
                      value: formatCurrency(row.value),
                      note:
                        row.lessons > 0
                          ? `${row.lessons} оплач. зан.`
                          : 'Оплат в этот день не было',
                    })
                  }
                  onMouseLeave={() => setDailyTooltip(null)}
                  onFocus={() =>
                    setDailyTooltip({
                      key: row.key,
                      title: row.fullLabel,
                      value: formatCurrency(row.value),
                      note:
                        row.lessons > 0
                          ? `${row.lessons} оплач. зан.`
                          : 'Оплат в этот день не было',
                    })
                  }
                  onBlur={() => setDailyTooltip(null)}
                  tabIndex={0}
                  style={{ display: 'grid', gap: 8, alignItems: 'end' }}
                >
                  <div
                    style={{
                      height: `${Math.max(8, (row.value / maxDailyIncome) * 96)}px`,
                      borderRadius: '12px 12px 6px 6px',
                      outline:
                        dailyTooltip?.key === row.key
                          ? '3px solid rgba(217,111,50,0.22)'
                          : '1px solid transparent',
                      transform: dailyTooltip?.key === row.key ? 'translateY(-2px)' : 'translateY(0)',
                      transition: 'transform 220ms ease, outline-color 220ms ease, background 220ms ease',
                      background:
                        row.value > 0
                          ? 'linear-gradient(180deg, #d96f32 0%, #f0a45f 100%)'
                          : 'rgba(23,32,51,0.08)',
                    }}
                  />
                  <div
                    style={{
                      color: '#687486',
                      fontSize: 11,
                      textAlign: 'center',
                      writingMode: dailyIncomeRows.length > 14 ? 'vertical-rl' : 'horizontal-tb',
                    }}
                  >
                    {row.label}
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
              flexWrap: 'wrap',
              marginBottom: 14,
            }}
          >
            <div>
              <h3 style={{ fontSize: 20, marginBottom: 6 }}>Оплаты под контролем</h3>
              <div style={{ color: '#687486', fontSize: 14 }}>
                Проведённые уроки, по которым ещё нет подтверждённой оплаты.
              </div>
            </div>
            <div style={{ fontWeight: 800, color: '#1f2a3b' }}>
              {formatCurrency(debt + pendingConfirmation)}
            </div>
          </div>

          {loading ? (
            <p style={{ color: '#687486', marginBottom: 0 }}>Загрузка финансовых записей...</p>
          ) : rangeError ? (
            <p style={{ color: '#9f3f3c', marginBottom: 0 }}>
              Исправь диапазон дат, чтобы увидеть оплаты.
            </p>
          ) : debtRows.length === 0 ? (
            <p style={{ color: '#687486', marginBottom: 0 }}>
              За выбранный период неоплаченных и ожидающих подтверждения занятий нет.
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
                  <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                    <div style={{ fontWeight: 800, color: '#9f3f3c' }}>
                      {formatCurrency(row.cost)}
                    </div>
                    <div style={{ color: '#687486', fontSize: 12, marginTop: 3 }}>{row.status}</div>
                    {row.paymentStatus === 'payment_pending' && (
                      <div
                        style={{
                          display: 'flex',
                          gap: 8,
                          justifyContent: isMobile ? 'flex-start' : 'flex-end',
                          flexWrap: 'wrap',
                          marginTop: 8,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => handlePaymentDecision(row.id, true)}
                          disabled={processingPaymentId === row.id}
                          style={{
                            padding: '7px 10px',
                            borderRadius: 999,
                            background: '#2f7d5a',
                            boxShadow: 'none',
                            fontSize: 12,
                          }}
                        >
                          Подтвердить
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePaymentDecision(row.id, false)}
                          disabled={processingPaymentId === row.id}
                          style={{
                            padding: '7px 10px',
                            borderRadius: 999,
                            background: '#a63f3c',
                            boxShadow: 'none',
                            fontSize: 12,
                          }}
                        >
                          Отклонить
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
        </div>

        <article style={{ ...panelStyle, position: 'relative', overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              marginBottom: 14,
            }}
          >
            <div>
              <h3 style={{ fontSize: 20, marginBottom: 6 }}>Средняя неделя по месяцам</h3>
              <div style={{ color: '#687486', fontSize: 14 }}>
                Помогает сравнить месяцы между собой, как в недельной таблице.
              </div>
            </div>
          </div>

          <div style={chartTooltipStyle(Boolean(subjectTooltip))}>
            <div style={{ color: 'rgba(255,255,255,0.68)', fontSize: 12, marginBottom: 4 }}>
              {subjectTooltip?.title ?? 'Месяц'}
            </div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>
              {subjectTooltip?.value ?? formatCurrency(0)}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, marginTop: 3 }}>
              {subjectTooltip?.note ?? 'Наведи на строку'}
            </div>
          </div>

          {loading ? (
            <p style={{ color: '#687486', marginBottom: 0 }}>Ждём данные по месяцам.</p>
          ) : averageWeekRows.every((row) => row.value === 0) ? (
            <p style={{ color: '#687486', marginBottom: 0 }}>
              В этом году пока нет оплаченных занятий для сравнения.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {averageWeekRows.map((row) => (
                <div
                  key={row.key}
                  onMouseEnter={() =>
                    setSubjectTooltip({
                      key: row.key,
                      title: row.fullLabel,
                      value: formatCurrency(row.value),
                      note: `Всего за месяц: ${formatCurrency(row.total)}`,
                    })
                  }
                  onMouseLeave={() => setSubjectTooltip(null)}
                  onFocus={() =>
                    setSubjectTooltip({
                      key: row.key,
                      title: row.fullLabel,
                      value: formatCurrency(row.value),
                      note: `Всего за месяц: ${formatCurrency(row.total)}`,
                    })
                  }
                  onBlur={() => setSubjectTooltip(null)}
                  tabIndex={0}
                  style={{
                    padding: subjectTooltip?.key === row.key ? '10px' : 0,
                    margin: subjectTooltip?.key === row.key ? '-10px' : 0,
                    borderRadius: 16,
                    background:
                      subjectTooltip?.key === row.key ? 'rgba(42,111,219,0.06)' : 'transparent',
                    transition: 'background 220ms ease, padding 220ms ease, margin 220ms ease',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      color: '#435066',
                      fontSize: 14,
                      marginBottom: 7,
                    }}
                  >
                    <span>{row.label}</span>
                    <strong style={{ color: '#1f2a3b' }}>
                      {formatCurrency(row.value)}
                    </strong>
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
                        width: `${clampPercent((row.value / maxAverageWeekIncome) * 100)}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: 'linear-gradient(90deg, #2a6fdb 0%, #62a5ff 100%)',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

        </>
      )}

      {activeTab === 'subscriptions' && (
      <section>
        <article style={panelStyle}>
          <div style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 20, marginBottom: 0 }}>Абонементы</h3>
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
                  justifyContent: 'flex-end',
                  gap: 10,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                {availableForCreation.length > 0 && (
                  <button
                    type="button"
                    title="Создать абонемент"
                    onClick={handleCreateNewAbonement}
                    style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, background: '#d96f32', boxShadow: 'none', fontSize: 20, display: 'inline-grid', placeItems: 'center' }}
                  >
                    +
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
                  Абонементов пока нет.
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
                          <span>Всего часов: {option.total}</span>
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
      )}

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
              </div>
              <button
                type="button"
                title="Закрыть"
                onClick={() => setCreateModalOpen(false)}
                style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, background: 'rgba(23,32,51,0.92)', boxShadow: 'none', fontSize: 22 }}
              >
                ×
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
                Количество часов
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
                  title={editingAbonement ? 'Скрыть редактирование' : 'Редактировать абонемент'}
                  onClick={() => setEditingAbonement((current) => !current)}
                  style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, background: '#d96f32', boxShadow: 'none', fontSize: 18, display: 'inline-grid', placeItems: 'center' }}
                >
                  ✎
                </button>
                <button
                  type="button"
                  title="Удалить абонемент"
                  onClick={handleDeleteAbonement}
                  style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, background: 'rgba(166,63,59,0.92)', boxShadow: 'none', fontSize: 18, display: 'inline-grid', placeItems: 'center' }}
                >
                  🗑
                </button>
                <button
                  type="button"
                  title="Закрыть"
                  onClick={() => {
                    setDetailsModalOpen(false);
                    setEditingAbonement(false);
                  }}
                  style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, background: 'rgba(23,32,51,0.92)', boxShadow: 'none', fontSize: 22 }}
                >
                  ×
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
                <div style={{ color: '#687486', fontSize: 13, marginBottom: 6 }}>Всего часов</div>
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
              Осталось часов: <strong>{selectedRelation.remaining}</strong>
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

