import { useEffect, useMemo, useState } from 'react';
import { confirmPayment, getLessons, updateLesson, type Lesson } from '../api/lessons';
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
  padding: '16px',
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatSignedCurrency(value: number) {
  if (value === 0) return 'Без изменений';
  const prefix = value > 0 ? '+' : '−';
  return `${prefix}${formatCurrency(Math.abs(value))}`;
}

function formatSignedNumber(value: number, unit: string) {
  if (value === 0) return 'Без изменений';
  const prefix = value > 0 ? '+' : '−';
  return `${prefix}${Math.abs(value)} ${unit}`;
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
  const explicitCost = lessonCost(lesson);
  if (explicitCost > 0) {
    return explicitCost;
  }

  const rate = Number(hourlyRate ?? 0);
  if (Number.isFinite(rate) && rate > 0) {
    return Math.round(rate * getLessonDurationHours(lesson));
  }
  return explicitCost;
}

function getCurrentRange(range: ForecastRange | ChartRange, anchorDate = new Date()) {
  const today = new Date(anchorDate);

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

function shiftFinancePeriod(anchorDate: Date, range: ForecastRange, direction: -1 | 1) {
  const copy = new Date(anchorDate);
  if (range === 'week') {
    copy.setDate(copy.getDate() + direction * 7);
  } else {
    copy.setMonth(copy.getMonth() + direction);
  }
  return copy;
}

function formatFinancePeriodLabel(from: string, to: string) {
  return `${formatReadableDate(from)} - ${formatReadableDate(to)}`;
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

function formatWeekdayLabel(date: string) {
  const value = new Date(`${date}T00:00:00`);
  const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(value);
  return `${weekday}\n${formatReadableDate(date)}`;
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
  const [financePeriod, setFinancePeriod] = useState<ForecastRange>('week');
  const [financeAnchorDate, setFinanceAnchorDate] = useState(() => new Date());
  const [chartRange, setChartRange] = useState<ChartRange>('week');
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

  const selectedDateRange = useMemo(
    () => getCurrentRange(financePeriod, financeAnchorDate),
    [financeAnchorDate, financePeriod]
  );
  const dateFrom = selectedDateRange.from;
  const dateTo = selectedDateRange.to;

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

  const forecastDateRange = useMemo(
    () => getCurrentRange(financePeriod, financeAnchorDate),
    [financeAnchorDate, financePeriod]
  );
  const chartDateRange = useMemo(
    () => getCurrentRange(chartRange, financeAnchorDate),
    [chartRange, financeAnchorDate]
  );
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

  // Занятие покрыто абонементом, если у его связки задан subscription_hours.
  // Такие занятия не проходят наличный flow — их нельзя «отметить оплаченным».
  const isSubscriptionCovered = (lesson: Lesson) => {
    const relation = lesson.tutor_student_id ? relationMap.get(lesson.tutor_student_id) : null;
    const hours = relation?.subscription_hours;
    return hours != null && Number(hours) > 0;
  };

  const currentFinancialLessons = filteredLessons.filter(isRealFinancialLesson);
  const forecastFinancialLessons = forecastLessons.filter(isRealFinancialLesson);
  const chartFinancialLessons = chartLessons.filter(isRealFinancialLesson);
  const currentConducted = currentFinancialLessons.filter((lesson) => lesson.conduct_status === 'conducted');
  const forecastConducted = forecastFinancialLessons.filter((lesson) => lesson.conduct_status === 'conducted');
  const forecastPaidLessons = forecastConducted.filter((lesson) => lesson.payment_status === 'paid');
  const paymentPendingLessons = currentConducted.filter(
    (lesson) => lesson.payment_status === 'payment_pending'
  );
  const unpaidLessons = currentConducted.filter(
    (lesson) => lesson.payment_status === 'unpaid' && !isSubscriptionCovered(lesson)
  );
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
  const forecastPlannedIncome = forecastFutureScheduledLessons.reduce(
    (sum, lesson) => sum + calculateLessonCostByRate(lesson, lesson.tutor_student_id ? relationMap.get(lesson.tutor_student_id)?.hourly_rate : null),
    0
  );
  const visiblePendingConfirmation = pendingConfirmation;
  const forecastIncome = forecastPaidIncome + visiblePendingConfirmation + forecastPlannedIncome;
  const forecastFactIncome = forecastPaidIncome + visiblePendingConfirmation;

  const previousFinanceRange = useMemo(
    () => getCurrentRange(financePeriod, shiftFinancePeriod(financeAnchorDate, financePeriod, -1)),
    [financeAnchorDate, financePeriod]
  );
  const previousFinancialLessons = useMemo(
    () =>
      filterLessonsByRange(lessons, previousFinanceRange.from, previousFinanceRange.to).filter(
        isRealFinancialLesson
      ),
    [lessons, previousFinanceRange.from, previousFinanceRange.to]
  );
  const previousConducted = previousFinancialLessons.filter(
    (lesson) => lesson.conduct_status === 'conducted'
  );
  const previousPaidIncome = previousConducted
    .filter((lesson) => lesson.payment_status === 'paid')
    .reduce(
      (sum, lesson) =>
        sum +
        calculateLessonCostByRate(
          lesson,
          lesson.tutor_student_id ? relationMap.get(lesson.tutor_student_id)?.hourly_rate : null
        ),
      0
    );
  const previousPendingIncome = previousConducted
    .filter((lesson) => lesson.payment_status === 'payment_pending')
    .reduce(
      (sum, lesson) =>
        sum +
        calculateLessonCostByRate(
          lesson,
          lesson.tutor_student_id ? relationMap.get(lesson.tutor_student_id)?.hourly_rate : null
        ),
      0
    );
  const previousPlannedIncome = previousFinancialLessons
    .filter((lesson) => lesson.conduct_status === 'scheduled')
    .reduce(
      (sum, lesson) =>
        sum +
        calculateLessonCostByRate(
          lesson,
          lesson.tutor_student_id ? relationMap.get(lesson.tutor_student_id)?.hourly_rate : null
        ),
      0
    );
  const previousExpectedIncome =
    previousPaidIncome + previousPendingIncome + previousPlannedIncome;
  const previousScheduledCount = previousFinancialLessons.filter(
    (lesson) => lesson.conduct_status === 'scheduled'
  ).length;

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

  const allPaymentPendingLessons = lessons
    .filter(isRealFinancialLesson)
    .filter(
      (lesson) =>
        lesson.conduct_status === 'conducted' && lesson.payment_status === 'payment_pending'
    );

  const receivableLessons = [...unpaidLessons, ...allPaymentPendingLessons];

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
    const emptyRow = (label: string, fullLabel: string) => ({
      label,
      fullLabel,
      value: 0,
      paid: 0,
      pending: 0,
      expected: 0,
      lessons: 0,
    });
    const amount = (lesson: Lesson) =>
      calculateLessonCostByRate(
        lesson,
        lesson.tutor_student_id ? relationMap.get(lesson.tutor_student_id)?.hourly_rate : null
      );
    const grouped = new Map<
      string,
      {
        label: string;
        fullLabel: string;
        value: number;
        paid: number;
        pending: number;
        expected: number;
        lessons: number;
      }
    >();

    if (chartRange === 'week') {
      const rows: {
        key: string;
        label: string;
        fullLabel: string;
        value: number;
        paid: number;
        pending: number;
        expected: number;
        lessons: number;
      }[] = [];
      const start = startOfDay(new Date(`${chartDateRange.from}T00:00:00`));
      const daysCount = getDateRangeLength(chartDateRange.from, chartDateRange.to);

      for (let index = 0; index < daysCount; index += 1) {
        const date = formatDate(addDays(start, index));
        const dayLessons = chartFinancialLessons.filter((lesson) => lessonDate(lesson) === date);
        const paid = dayLessons
          .filter((lesson) => lesson.conduct_status === 'conducted' && lesson.payment_status === 'paid')
          .reduce((sum, lesson) => sum + amount(lesson), 0);
        const pending = dayLessons
          .filter(
            (lesson) =>
              lesson.conduct_status === 'conducted' && lesson.payment_status === 'payment_pending'
          )
          .reduce((sum, lesson) => sum + amount(lesson), 0);
        const expected = dayLessons
          .filter((lesson) => lesson.conduct_status === 'scheduled')
          .reduce((sum, lesson) => sum + amount(lesson), 0);
        rows.push({
          key: date,
          label: formatWeekdayLabel(date),
          fullLabel: new Intl.DateTimeFormat('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }).format(new Date(`${date}T00:00:00`)),
          value: paid + pending + expected,
          paid,
          pending,
          expected,
          lessons: dayLessons.length,
        });
      }

      return rows;
    }

    chartFinancialLessons.forEach((lesson) => {
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
      const current = grouped.get(key) ?? emptyRow(label, fullLabel);
      const lessonAmount = amount(lesson);
      const paid =
        lesson.conduct_status === 'conducted' && lesson.payment_status === 'paid'
          ? lessonAmount
          : 0;
      const pending =
        lesson.conduct_status === 'conducted' && lesson.payment_status === 'payment_pending'
          ? lessonAmount
          : 0;
      const expected = lesson.conduct_status === 'scheduled' ? lessonAmount : 0;
      grouped.set(key, {
        label,
        value: current.value + paid + pending + expected,
        paid: current.paid + paid,
        pending: current.pending + pending,
        expected: current.expected + expected,
        lessons: current.lessons + 1,
        fullLabel,
      });
    });

    return Array.from(grouped, ([key, row]) => ({
      key,
      label: row.label,
      fullLabel: row.fullLabel,
      value: row.value,
      paid: row.paid,
      pending: row.pending,
      expected: row.expected,
      lessons: row.lessons,
    }));
  }, [chartDateRange.from, chartDateRange.to, chartFinancialLessons, chartRange, relationMap]);

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
  }, [lessons, relationMap]);

  const maxDailyIncome = Math.max(...dailyIncomeRows.map((row) => row.value), 1);
  const maxAverageWeekIncome = Math.max(...averageWeekRows.map((row) => row.value), 1);
  const lastAverageWeek = averageWeekRows[averageWeekRows.length - 1] ?? null;
  const previousAverageWeek =
    averageWeekRows.length > 1 ? averageWeekRows[averageWeekRows.length - 2] : null;
  const averageWeekDelta =
    lastAverageWeek && previousAverageWeek ? lastAverageWeek.value - previousAverageWeek.value : 0;
  const scheduledLessonCount = forecastFutureScheduledLessons.length;
  const paidPercent = forecastIncome > 0 ? clampPercent((forecastPaidIncome / forecastIncome) * 100) : 0;
  const expectedDelta = forecastIncome - previousExpectedIncome;
  const paidDelta = forecastPaidIncome - previousPaidIncome;
  const scheduledDelta = scheduledLessonCount - previousScheduledCount;
  const periodLabelShort = financePeriod === 'week' ? 'прошлой неделе' : 'прошлому месяцу';
  const forecastParts = [
    { label: 'Оплачено', value: forecastPaidIncome, color: '#4CAF50' },
    { label: 'На проверке', value: visiblePendingConfirmation, color: '#FF9800' },
    { label: 'Запланировано', value: forecastPlannedIncome, color: '#2AABEE' },
  ];
  const forecastRangeLabel = financePeriod === 'week' ? 'выбранную неделю' : 'выбранный месяц';
  const chartRangeLabel = {
    week: 'по дням выбранной недели',
    month: 'по неделям выбранного месяца',
    year: 'по месяцам выбранного года',
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

  const handleMarkLessonPaid = async (lessonId: number) => {
    try {
      setProcessingPaymentId(lessonId);
      const updated = await updateLesson(lessonId, { payment_status: 'paid' });
      setLessons((prev) => prev.map((lesson) => (lesson.id === updated.id ? updated : lesson)));
    } catch (error) {
      console.error('Ошибка отметки оплаты:', error);
      alert(getApiErrorMessage(error, 'Не удалось отметить занятие оплаченным.'));
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
    <div style={{ display: 'grid', gap: 12, height: isMobile ? 'auto' : '100%', minHeight: 0, overflowY: isMobile ? 'visible' : 'auto', alignContent: 'start', scrollbarWidth: 'thin' }}>
      <h1 className="page-heading">Финансы</h1>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
                borderColor: 'rgba(31,42,59,0.08)',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {activeTab === 'income' && (
        <>
      <section
        className="mentor-panel"
        style={{
          padding: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'nowrap',
            minHeight: 42,
          }}
        >
          <button
            type="button"
            title="Предыдущий период"
            onClick={() =>
              setFinanceAnchorDate((current) => shiftFinancePeriod(current, financePeriod, -1))
            }
            className="icon-button icon-button-ghost"
          >
            ‹
          </button>
          <button
            type="button"
            title="Следующий период"
            onClick={() =>
              setFinanceAnchorDate((current) => shiftFinancePeriod(current, financePeriod, 1))
            }
            className="icon-button icon-button-ghost"
          >
            ›
          </button>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 9,
              minHeight: 42,
              padding: '0 16px',
              borderRadius: 14,
              background: '#fff',
              border: '1px solid rgba(31,42,59,0.08)',
              color: '#1f2a3b',
              fontWeight: 900,
            }}
          >
            <span aria-hidden="true">▣</span>
            {formatFinancePeriodLabel(dateFrom, dateTo)}
          </div>
        </div>
        <div style={{ width: isMobile ? '100%' : 150 }}>
          <select
            value={financePeriod}
            onChange={(event) => {
              const next = event.target.value as ForecastRange;
              setFinancePeriod(next);
              if (chartRange !== 'year') {
                setChartRange(next);
              }
            }}
            style={{
              height: 42,
              borderRadius: 14,
              border: '1px solid rgba(24,33,47,0.12)',
              padding: '0 12px',
              background: '#fff',
              color: '#1f2a3b',
              fontWeight: 700,
              display: 'block',
            }}
          >
            <option value="week">Неделя</option>
            <option value="month">Месяц</option>
          </select>
        </div>
      </section>

      <section className="metric-grid" style={{ gridTemplateColumns: isTablet ? undefined : 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
        <article className="metric-card" style={{ minHeight: 84, padding: '14px 16px', borderColor: 'rgba(42,171,238,0.16)', background: 'linear-gradient(135deg, rgba(42,171,238,0.08), rgba(255,255,255,0.92))' }}>
          <span className="metric-icon" style={{ background: 'rgba(42,171,238,0.12)', color: '#2AABEE' }}>▣</span>
          <div>
            <div className="metric-label">Ожидаемый доход</div>
            <div className="metric-value">{loading ? '—' : formatCurrency(forecastIncome)}</div>
            <div style={{ marginTop: 8, color: expectedDelta >= 0 ? '#4CAF50' : '#F44336', fontSize: 13, fontWeight: 800 }}>
              {formatSignedCurrency(expectedDelta)} к {periodLabelShort}
            </div>
          </div>
        </article>
        <article className="metric-card" style={{ minHeight: 84, padding: '14px 16px', borderColor: 'rgba(47,125,90,0.16)', background: 'linear-gradient(135deg, rgba(47,125,90,0.08), rgba(255,255,255,0.92))' }}>
          <span className="metric-icon" style={{ background: 'rgba(47,125,90,0.12)', color: '#4CAF50' }}>✓</span>
          <div>
            <div className="metric-label">Оплачено</div>
            <div className="metric-value">{loading ? '—' : formatCurrency(forecastPaidIncome)}</div>
            <div style={{ marginTop: 8, color: paidDelta >= 0 ? '#4CAF50' : '#F44336', fontSize: 13, fontWeight: 800 }}>
              {Math.round(paidPercent)}% · {formatSignedCurrency(paidDelta)}
            </div>
          </div>
        </article>
        <article className="metric-card" style={{ minHeight: 84, padding: '14px 16px', borderColor: 'rgba(240,138,36,0.18)', background: 'linear-gradient(135deg, rgba(240,138,36,0.1), rgba(255,255,255,0.92))' }}>
          <span className="metric-icon" style={{ background: 'rgba(255,152,0,0.14)', color: '#FF9800' }}>◷</span>
          <div>
            <div className="metric-label">На проверке</div>
            <div className="metric-value">{loading ? '—' : formatCurrency(visiblePendingConfirmation)}</div>
            <div style={{ marginTop: 8, color: '#FF9800', fontSize: 13, fontWeight: 800 }}>
              Ожидает подтверждения
            </div>
          </div>
        </article>
        <article className="metric-card" style={{ minHeight: 84, padding: '14px 16px', borderColor: 'rgba(42,171,238,0.16)', background: 'linear-gradient(135deg, rgba(42,171,238,0.08), rgba(255,255,255,0.92))' }}>
          <span className="metric-icon" style={{ background: 'rgba(42,171,238,0.12)', color: '#2AABEE' }}>□</span>
          <div>
            <div className="metric-label">Запланировано</div>
            <div className="metric-value">{loading ? '—' : formatCurrency(forecastPlannedIncome)}</div>
            <div style={{ marginTop: 8, color: scheduledDelta >= 0 ? '#2AABEE' : '#F44336', fontSize: 13, fontWeight: 800 }}>
              {formatSignedNumber(scheduledDelta, 'зан.')} к {periodLabelShort}
            </div>
          </div>
        </article>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: isTablet ? '1fr' : '0.9fr 1.4fr',
          gap: 12,
          alignItems: 'stretch',
        }}
      >
        <article style={panelStyle}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              marginBottom: 12,
            }}
          >
            <div>
              <h3 style={{ fontSize: 19, marginBottom: 4 }}>Прогноз дохода</h3>
              <div style={{ color: '#687486', fontSize: 14 }}>
                Ожидаемый доход за {forecastRangeLabel}
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gap: 10,
                justifyItems: isMobile ? 'start' : 'end',
              }}
            >
              <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                <div style={{ color: '#687486', fontSize: 13 }}>
                  {forecastDateRange.from} - {forecastDateRange.to}
                </div>
                <div style={{ color: '#1f2a3b', fontSize: 24, fontWeight: 900 }}>
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
              height: 12,
              borderRadius: 999,
              background: 'rgba(23,32,51,0.08)',
              overflow: 'hidden',
              marginBottom: 12,
              display: 'flex',
              gap: 0,
            }}
          >
            {forecastParts.map((part) => {
              const width = forecastIncome > 0 ? clampPercent((part.value / forecastIncome) * 100) : 0;
              if (width <= 0) return null;

              return (
                <span
                  key={part.label}
                  title={`${part.label}: ${formatCurrency(part.value)}`}
                  style={{
                    width: `${width}%`,
                    height: '100%',
                    background:
                      part.label === 'На проверке'
                        ? 'repeating-linear-gradient(135deg, rgba(255,152,0,0.55) 0 3px, rgba(255,152,0,0.18) 3px 6px)'
                        : part.color,
                    transition: 'width 260ms ease',
                  }}
                />
              );
            })}
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
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                gap: 10,
              }}
            >
              {forecastParts.map((part) => (
                <div
                  key={part.label}
                  style={{
                    padding: 10,
                    borderRadius: 14,
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
              marginTop: 12,
              padding: '10px 12px',
              borderRadius: 14,
              background: 'rgba(47,125,90,0.08)',
              color: '#4CAF50',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            Если неделя/месяц закончится по расписанию, ожидаемый доход составит{' '}
            {loading ? '—' : formatCurrency(forecastIncome)}.
          </div>
        </article>

        <article style={{ ...panelStyle, position: 'relative', overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              marginBottom: 10,
            }}
          >
            <div>
              <h3 style={{ fontSize: 19, marginBottom: 4 }}>Динамика дохода</h3>
              <div style={{ color: '#687486', fontSize: 14 }}>{chartRangeLabel}</div>
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
                      padding: '8px 13px',
                      borderRadius: 12,
                      background: active ? '#172033' : 'rgba(23,32,51,0.07)',
                      color: active ? '#fff' : '#243041',
                      borderColor: 'rgba(31,42,59,0.08)',
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
              {dailyTooltip?.title ?? 'Период'}
            </div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>{dailyTooltip?.value ?? formatCurrency(0)}</div>
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, marginTop: 3 }}>
              {dailyTooltip?.note ?? 'Оплачено, на проверке и ожидается'}
            </div>
          </div>

          {loading ? (
            <p style={{ color: '#687486', marginBottom: 0 }}>Ждём данные для графика.</p>
          ) : dailyIncomeRows.every((row) => row.value === 0) ? (
            <p style={{ color: '#687486', marginBottom: 0 }}>
              В выбранном периоде пока нет финансовых данных.
            </p>
          ) : (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${Math.max(dailyIncomeRows.length, 1)}, minmax(18px, 1fr))`,
                  gap: 10,
                  alignItems: 'end',
                  minHeight: 150,
                  paddingTop: 6,
                }}
              >
                {dailyIncomeRows.map((row) => {
                  const paidHeight = row.value > 0 ? Math.max(0, (row.paid / maxDailyIncome) * 118) : 0;
                  const pendingHeight =
                    row.value > 0 ? Math.max(0, (row.pending / maxDailyIncome) * 118) : 0;
                  const expectedHeight =
                    row.value > 0 ? Math.max(0, (row.expected / maxDailyIncome) * 118) : 0;

                  return (
                    <div
                      key={row.key}
                      onMouseEnter={() =>
                        setDailyTooltip({
                          key: row.key,
                          title: row.fullLabel,
                          value: formatCurrency(row.value),
                          note: `Оплачено ${formatCurrency(row.paid)} · Проверка ${formatCurrency(row.pending)} · Ожидается ${formatCurrency(row.expected)}`,
                        })
                      }
                      onMouseLeave={() => setDailyTooltip(null)}
                      onFocus={() =>
                        setDailyTooltip({
                          key: row.key,
                          title: row.fullLabel,
                          value: formatCurrency(row.value),
                          note: `Оплачено ${formatCurrency(row.paid)} · Проверка ${formatCurrency(row.pending)} · Ожидается ${formatCurrency(row.expected)}`,
                        })
                      }
                      onBlur={() => setDailyTooltip(null)}
                      tabIndex={0}
                      style={{ display: 'grid', gap: 8, alignItems: 'end' }}
                    >
                      <div style={{ height: 128, display: 'flex', alignItems: 'end', justifyContent: 'center' }}>
                        <div
                          style={{
                            width: 'min(48px, 78%)',
                            minHeight: row.value > 0 ? 8 : 4,
                            height: Math.max(6, paidHeight + pendingHeight + expectedHeight),
                            display: 'flex',
                            flexDirection: 'column-reverse',
                            overflow: 'hidden',
                            borderRadius: '10px 10px 5px 5px',
                            background: row.value > 0 ? '#dbeafe' : 'rgba(23,32,51,0.08)',
                            outline:
                              dailyTooltip?.key === row.key
                                ? '3px solid rgba(42,171,238,0.18)'
                                : '1px solid rgba(42,171,238,0.12)',
                            transform: dailyTooltip?.key === row.key ? 'translateY(-2px)' : 'translateY(0)',
                            transition: 'transform 180ms ease, outline-color 180ms ease',
                          }}
                        >
                          {row.paid > 0 && (
                            <span style={{ height: paidHeight, background: 'linear-gradient(180deg, #4CAF50, #4CAF50)' }} />
                          )}
                          {row.pending > 0 && (
                            <span
                              style={{
                                height: pendingHeight,
                                background:
                                  'repeating-linear-gradient(135deg, rgba(255,152,0,0.62) 0 3px, rgba(255,152,0,0.22) 3px 6px)',
                              }}
                            />
                          )}
                          {row.expected > 0 && (
                            <span style={{ height: expectedHeight, background: 'rgba(42,171,238,0.22)' }} />
                          )}
                        </div>
                      </div>
                      <div style={{ color: '#687486', fontSize: 11, textAlign: 'center', lineHeight: 1.25 }}>
                        {row.label.split('\n').map((line) => (
                          <span key={line} style={{ display: 'block' }}>
                            {line}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 18,
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                  color: '#536177',
                  fontSize: 13,
                  marginTop: 8,
                }}
              >
                <span><b style={{ color: '#4CAF50' }}>■</b> Оплачено</span>
                <span><b style={{ color: '#FF9800' }}>▨</b> На проверке</span>
                <span><b style={{ color: '#2AABEE' }}>■</b> Ожидается</span>
              </div>
            </>
          )}
        </article>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: isTablet ? '1fr' : '1fr 1fr',
          gap: 12,
          alignItems: 'stretch',
          marginBottom: 12,
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
              marginBottom: 10,
            }}
          >
            <div>
              <h3 style={{ fontSize: 19, marginBottom: 4 }}>Оплаты под контролем</h3>
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
            <p style={{ color: '#F44336', marginBottom: 0 }}>
              Исправь диапазон дат, чтобы увидеть оплаты.
            </p>
          ) : debtRows.length === 0 ? (
            <p style={{ color: '#687486', marginBottom: 0 }}>
              За выбранный период неоплаченных и ожидающих подтверждения занятий нет.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <div
                style={{
                  minWidth: isMobile ? 640 : 0,
                  display: 'grid',
                  border: '1px solid rgba(31,42,59,0.08)',
                  borderRadius: 16,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '0.95fr 1fr 0.9fr 0.8fr auto',
                    gap: 12,
                    padding: '10px 12px',
                    background: 'rgba(21,32,51,0.035)',
                    color: '#687486',
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  <span>Дата и время</span>
                  <span>Ученик</span>
                  <span>Урок</span>
                  <span>Статус</span>
                  <span style={{ textAlign: 'right' }}>Сумма</span>
                </div>
                {debtRows.map((row) => (
                  <div
                    key={row.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '0.95fr 1fr 0.9fr 0.8fr auto',
                      gap: 12,
                      alignItems: 'center',
                      padding: '11px 12px',
                      borderTop: '1px solid rgba(31,42,59,0.07)',
                      color: '#243041',
                      fontSize: 14,
                    }}
                  >
                    <span>{formatReadableDate(row.lessonDate)}</span>
                    <strong>{row.studentName}</strong>
                    <span>{row.subjectName}</span>
                    <span
                      style={{
                        width: 'fit-content',
                        padding: '5px 9px',
                        borderRadius: 999,
                        background:
                          row.paymentStatus === 'payment_pending'
                            ? 'rgba(240,138,36,0.14)'
                            : 'rgba(42,171,238,0.1)',
                        color: row.paymentStatus === 'payment_pending' ? '#FF9800' : '#2AABEE',
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      {row.status}
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: 8,
                        whiteSpace: 'nowrap',
                        fontWeight: 900,
                      }}
                    >
                      {formatCurrency(row.cost)}
                      {row.paymentStatus === 'unpaid' && (
                        <button
                          type="button"
                          title="Отметить оплаченным"
                          onClick={() => handleMarkLessonPaid(row.id)}
                          disabled={processingPaymentId === row.id}
                          style={{
                            minWidth: 30,
                            width: 30,
                            height: 30,
                            padding: 0,
                            borderRadius: 10,
                            background: '#4CAF50',
                            boxShadow: 'none',
                            fontSize: 14,
                          }}
                        >
                          ₽
                        </button>
                      )}
                      {row.paymentStatus === 'payment_pending' && (
                        <>
                          <button
                            type="button"
                            title="Подтвердить оплату"
                            onClick={() => handlePaymentDecision(row.id, true)}
                            disabled={processingPaymentId === row.id}
                            className="icon-button icon-button-compact icon-button-success"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            title="Отклонить оплату"
                            onClick={() => handlePaymentDecision(row.id, false)}
                            disabled={processingPaymentId === row.id}
                            className="icon-button icon-button-compact icon-button-danger"
                          >
                            ×
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </article>

        <article style={{ ...panelStyle, position: 'relative', overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              marginBottom: 10,
            }}
          >
            <div>
              <h3 style={{ fontSize: 19, marginBottom: 4 }}>Средняя неделя по месяцам</h3>
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
            <>
              <div style={{ position: 'relative', height: 184, padding: '6px 4px 0 0' }}>
                <div
                  style={{
                    position: 'absolute',
                    inset: '6px 0 34px 0',
                    display: 'grid',
                    gridTemplateRows: 'repeat(4, 1fr)',
                  }}
                >
                  {[1, 2, 3, 4].map((line) => (
                    <span
                      key={line}
                      style={{
                        borderTop: '1px solid rgba(31,42,59,0.08)',
                        color: '#8a95a8',
                        fontSize: 11,
                      }}
                    />
                  ))}
                </div>
                <svg
                  viewBox="0 0 560 150"
                  preserveAspectRatio="none"
                  style={{ position: 'relative', width: '100%', height: 150, overflow: 'visible' }}
                >
                  <defs>
                    <linearGradient id="finance-average-fill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="rgba(42,171,238,0.22)" />
                      <stop offset="100%" stopColor="rgba(42,171,238,0.03)" />
                    </linearGradient>
                  </defs>
                  {(() => {
                    const width = 560;
                    const height = 132;
                    const top = 12;
                    const left = 18;
                    const right = 18;
                    const usableWidth = width - left - right;
                    const points = averageWeekRows.map((row, index) => {
                      const x =
                        averageWeekRows.length === 1
                          ? width / 2
                          : left + (index / (averageWeekRows.length - 1)) * usableWidth;
                      const y = top + height - (row.value / maxAverageWeekIncome) * 104;
                      return { ...row, x, y };
                    });
                    const line = points.map((point) => `${point.x},${point.y}`).join(' ');
                    const area = `${left},${top + height} ${line} ${width - right},${top + height}`;

                    return (
                      <>
                        <polygon points={area} fill="url(#finance-average-fill)" />
                        <polyline
                          points={line}
                          fill="none"
                          stroke="#2AABEE"
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        {points.map((point) => (
                          <g key={point.key}>
                            <circle
                              cx={point.x}
                              cy={point.y}
                              r={7}
                              fill="#2AABEE"
                              stroke="#fff"
                              strokeWidth="3"
                              style={{ cursor: 'pointer' }}
                              onMouseEnter={() =>
                                setSubjectTooltip({
                                  key: point.key,
                                  title: point.fullLabel,
                                  value: formatCurrency(point.value),
                                  note: `Всего за месяц: ${formatCurrency(point.total)}`,
                                })
                              }
                              onMouseLeave={() => setSubjectTooltip(null)}
                            />
                            <text
                              x={point.x}
                              y={Math.max(12, point.y - 14)}
                              textAnchor="middle"
                              fontSize="13"
                              fontWeight="800"
                              fill="#1f2a3b"
                            >
                              {formatCurrency(point.value)}
                            </text>
                          </g>
                        ))}
                      </>
                    );
                  })()}
                </svg>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${averageWeekRows.length}, minmax(0, 1fr))`,
                    gap: 4,
                    color: '#687486',
                    fontSize: 12,
                    textAlign: 'center',
                    marginTop: 4,
                  }}
                >
                  {averageWeekRows.map((row) => (
                    <span key={row.key}>{row.label}</span>
                  ))}
                </div>
              </div>
              {lastAverageWeek && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '12px 14px',
                    borderRadius: 16,
                    background: averageWeekDelta >= 0 ? 'rgba(47,125,90,0.1)' : 'rgba(244,67,54,0.1)',
                    color: averageWeekDelta >= 0 ? '#4CAF50' : '#F44336',
                    fontSize: 14,
                    fontWeight: 800,
                  }}
                >
                  {averageWeekDelta >= 0 ? '↗' : '↘'} В {lastAverageWeek.fullLabel} средняя неделя{' '}
                  {averageWeekDelta >= 0 ? 'выше' : 'ниже'} предыдущего месяца на{' '}
                  {formatCurrency(Math.abs(averageWeekDelta))}.
                </div>
              )}
            </>
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
                    className="add-trigger"
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
                          background: active ? 'rgba(42,171,238,0.1)' : 'rgba(23,32,51,0.03)',
                          color: '#1f2a3b',
                          border: active
                            ? '1px solid rgba(42,171,238,0.28)'
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
                              background: 'linear-gradient(90deg, #2AABEE 0%, #2AABEE 100%)',
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
          className="modal-overlay"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="app-modal"
          >
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Создать абонемент</h3>
              </div>
              <button
                type="button"
                title="Закрыть"
                onClick={() => setCreateModalOpen(false)}
                className="modal-close"
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

            <div className="modal-actions">
              <button type="button" onClick={handleSubmitCreateAbonement} disabled={savingAbonement} className="modal-primary">
                {savingAbonement ? 'Сохраняем...' : 'Создать абонемент'}
              </button>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="modal-secondary"
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
          className="modal-overlay"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="app-modal"
          >
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{selectedRelation.studentName}</h3>
                <div className="modal-subtitle">{selectedRelation.subjectName}</div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  title={editingAbonement ? 'Скрыть редактирование' : 'Редактировать абонемент'}
                  onClick={() => setEditingAbonement((current) => !current)}
                  className="icon-button icon-button-primary"
                >
                  ✎
                </button>
                <button
                  type="button"
                  title="Удалить абонемент"
                  onClick={handleDeleteAbonement}
                  className="icon-button icon-button-danger"
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
                  className="modal-close"
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
                  background: 'linear-gradient(90deg, #2AABEE 0%, #2AABEE 100%)',
                  borderRadius: 999,
                }}
              />
            </div>

            <div style={{ color: '#435066', fontSize: 14 }}>
              Осталось часов: <strong>{selectedRelation.remaining}</strong>
            </div>

            {editingAbonement && (
              <div className="modal-actions">
                <button type="button" onClick={handleSaveAbonementDetails} disabled={savingAbonement} className="modal-primary">
                  {savingAbonement ? 'Сохраняем...' : 'Сохранить изменения'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingAbonement(false);
                    setEditLessons(String(selectedRelation.total));
                    setEditRate(String(selectedRelation.rate));
                  }}
                  className="modal-secondary"
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

