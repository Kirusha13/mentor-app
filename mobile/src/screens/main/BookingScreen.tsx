import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AvailableSlot, bookLesson, getAvailableWindows } from '../../api/lessons';
import { getTutors, TutorStudent } from '../../api/student';

// ─── Вспомогательные функции ──────────────────────────────────────────────────

const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_FULL_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const DAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const DURATIONS = [
  { label: '45 мин', minutes: 45 },
  { label: '1 ч', minutes: 60 },
  { label: '1.5 ч', minutes: 90 },
  { label: '2 ч', minutes: 120 },
  { label: '2.5 ч', minutes: 150 },
  { label: '3 ч', minutes: 180 },
];

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function fromMinutes(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}
function fmt(t: string): string { return t.slice(0, 5); }
function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${MONTHS_FULL_RU[d.getMonth()]}`;
}
function getStartOptions(slotStart: string, slotEnd: string): string[] {
  const options: string[] = [];
  const end = toMinutes(slotEnd) - 45;
  let cur = toMinutes(slotStart);
  while (cur <= end) { options.push(fromMinutes(cur)); cur += 30; }
  return options;
}

// ─── Секция формы ─────────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

// ─── Компонент ────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function BookingScreen({ onClose, onSuccess }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [tutors, setTutors] = useState<TutorStudent[]>([]);
  const [windows, setWindows] = useState<AvailableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);

  // Состояние формы
  const [selectedTutorId, setSelectedTutorId] = useState<number | null>(null);
  const [selectedTS, setSelectedTS] = useState<TutorStudent | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [ts, slots] = await Promise.all([getTutors(), getAvailableWindows()]);
        setTutors(ts.filter(t => t.status === 'active'));
        setWindows(slots);
      } catch {
        Alert.alert('Ошибка', 'Не удалось загрузить данные');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Уникальные репетиторы
  const uniqueTutors = tutors.filter(
    (ts, idx, arr) => arr.findIndex(t => t.tutor_id === ts.tutor_id) === idx
  );

  // Предметы для выбранного репетитора
  const subjectsForTutor = selectedTutorId
    ? tutors.filter(ts => ts.tutor_id === selectedTutorId)
    : [];

  // Доступные даты для выбранного tutor_student (только сегодня и будущее, только если есть хотя бы одна рабочая позиция)
  const todayStr = new Date().toISOString().slice(0, 10);

  type StartOption = { time: string; slotEnd: string };

  function getSlotsForDate(date: string): AvailableSlot[] {
    return selectedTS
      ? windows.filter(w => w.tutor_id === selectedTS.tutor_id && w.lesson_date === date)
      : [];
  }

  function getStartOptionsForSlots(slots: AvailableSlot[]): StartOption[] {
    return slots.flatMap(slot =>
      getStartOptions(slot.start_time, slot.end_time).map(t => ({ time: t, slotEnd: slot.end_time }))
    );
  }

  const availableDates = selectedTS
    ? [...new Set(
        windows
          .filter(w => w.tutor_id === selectedTS.tutor_id && w.lesson_date >= todayStr)
          .map(w => w.lesson_date)
      )]
        .sort()
        .filter(date => getStartOptionsForSlots(getSlotsForDate(date)).length > 0)
    : [];

  // Слоты на выбранную дату
  const dateSlots = selectedDate ? getSlotsForDate(selectedDate) : [];

  // Варианты начала
  const startOptions: StartOption[] = getStartOptionsForSlots(dateSlots);

  const activeSlotEnd = selectedStart
    ? startOptions.find(o => o.time === selectedStart)?.slotEnd ?? null
    : null;

  const validDurations = selectedStart && activeSlotEnd
    ? DURATIONS.filter(d => toMinutes(selectedStart) + d.minutes <= toMinutes(activeSlotEnd))
    : [];

  const endTime = selectedStart && selectedDuration ? fromMinutes(toMinutes(selectedStart) + selectedDuration) : null;
  const cost = selectedDuration && selectedTS ? Math.round((selectedDuration / 60) * Number(selectedTS.hourly_rate)) : null;

  // Сбросы при смене шагов
  function selectTutor(tutorId: number) {
    setSelectedTutorId(tutorId);
    setSelectedTS(null);
    setSelectedDate(null);
    setSelectedStart(null);
    setSelectedDuration(null);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
  }
  function selectSubject(ts: TutorStudent) {
    setSelectedTS(ts);
    setSelectedDate(null);
    setSelectedStart(null);
    setSelectedDuration(null);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
  }
  function selectDate(date: string) {
    setSelectedDate(date);
    setSelectedStart(null);
    setSelectedDuration(null);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
  }
  function selectStart(time: string) {
    setSelectedStart(time);
    setSelectedDuration(null);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
  }

  const handleBook = () => {
    if (!selectedTS || !selectedDate || !selectedStart || !endTime) return;
    Alert.alert(
      'Подтверждение',
      `${formatDateFull(selectedDate)}, ${fmt(selectedStart)} – ${fmt(endTime)}\n${selectedTS.subject_name} · ${cost} ₽`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Записаться',
          onPress: async () => {
            setBooking(true);
            try {
              await bookLesson({
                tutor_student_id: selectedTS.id,
                lesson_date: selectedDate,
                start_time: selectedStart + ':00',
                end_time: endTime + ':00',
              });
              Alert.alert('Готово!', 'Занятие успешно записано', [{ text: 'OK', onPress: onSuccess }]);
            } catch (e: any) {
              Alert.alert('Ошибка', e?.response?.data?.detail ?? 'Не удалось записаться');
            } finally {
              setBooking(false);
            }
          },
        },
      ]
    );
  };

  // ─── Рендер ─────────────────────────────────────────────────────────────────

  return (
    <View style={s.container}>
      {/* Шапка */}
      <View style={s.header}>
        <TouchableOpacity onPress={onClose} style={s.closeBtn}>
          <Text style={s.closeText}>✕</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Запись на занятие</Text>
        <View style={s.closeBtn} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color="#2AABEE" />
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── 1. Репетитор ── */}
          <Section label="Репетитор">
            {uniqueTutors.length === 0
              ? <Text style={s.emptyText}>Нет активных репетиторов</Text>
              : uniqueTutors.map(ts => {
                const isSelected = ts.tutor_id === selectedTutorId;
                return (
                  <TouchableOpacity
                    key={ts.tutor_id}
                    style={[s.tutorCard, isSelected && s.tutorCardSelected]}
                    activeOpacity={0.8}
                    onPress={() => selectTutor(ts.tutor_id)}
                  >
                    <View style={[s.avatar, isSelected && s.avatarSelected]}>
                      <Text style={s.avatarText}>{ts.tutor_name?.[0] ?? '?'}</Text>
                    </View>
                    <Text style={[s.tutorName, isSelected && s.tutorNameSelected]}>
                      {ts.tutor_name ?? 'Репетитор'}
                    </Text>
                    {isSelected && <Text style={s.checkmark}>✓</Text>}
                  </TouchableOpacity>
                );
              })
            }
          </Section>

          {/* ── 2. Предмет ── */}
          {selectedTutorId && (
            <Section label="Предмет">
              <View style={s.chipRow}>
                {subjectsForTutor.map(ts => {
                  const isSelected = selectedTS?.id === ts.id;
                  return (
                    <TouchableOpacity
                      key={ts.id}
                      style={[s.subjectChip, isSelected && s.subjectChipSelected]}
                      onPress={() => selectSubject(ts)}
                    >
                      <Text style={[s.subjectChipText, isSelected && s.subjectChipTextSelected]}>
                        {ts.subject_name ?? 'Предмет'}
                      </Text>
                      <Text style={[s.subjectRate, isSelected && s.subjectRateSelected]}>
                        {ts.hourly_rate} ₽/ч
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Section>
          )}

          {/* ── 3. Дата ── */}
          {selectedTS && (
            <Section label="Дата">
              {availableDates.length === 0 ? (
                <View style={s.emptySlots}>
                  <Text style={s.emptySlotsIcon}>📅</Text>
                  <Text style={s.emptySlotsTitle}>Нет свободных окон</Text>
                  <Text style={s.emptySlotsHint}>Репетитор ещё не добавил доступное время</Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {availableDates.map(date => {
                    const d = new Date(date + 'T00:00:00');
                    const isSelected = date === selectedDate;
                    return (
                      <TouchableOpacity
                        key={date}
                        style={[s.dateChip, isSelected && s.dateChipSelected]}
                        onPress={() => selectDate(date)}
                      >
                        <Text style={[s.dateChipDay, isSelected && s.dateChipTextSelected]}>
                          {DAYS_SHORT[d.getDay()]}
                        </Text>
                        <Text style={[s.dateChipNum, isSelected && s.dateChipTextSelected]}>
                          {d.getDate()}
                        </Text>
                        <Text style={[s.dateChipMonth, isSelected && s.dateChipTextSelected]}>
                          {MONTHS_RU[d.getMonth()]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </Section>
          )}

          {/* Бейджи окон */}
          {selectedDate && dateSlots.length > 0 && (
            <View style={s.windowsBadgeRow}>
              {dateSlots.map((slot, i) => (
                <View key={i} style={s.windowBadge}>
                  <Text style={s.windowBadgeText}>
                    🕐 {fmt(slot.start_time)} – {fmt(slot.end_time)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* ── 4. Время начала ── */}
          {selectedDate && startOptions.length > 0 && (
            <Section label="Время начала">
              <View style={s.chipGrid}>
                {startOptions.map(({ time }) => {
                  const isSelected = time === selectedStart;
                  return (
                    <TouchableOpacity
                      key={time}
                      style={[s.timeChip, isSelected && s.timeChipSelected]}
                      onPress={() => selectStart(time)}
                    >
                      <Text style={[s.timeChipText, isSelected && s.timeChipTextSelected]}>
                        {fmt(time)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Section>
          )}

          {/* ── 5. Длительность ── */}
          {selectedStart && validDurations.length > 0 && (
            <Section label="Длительность">
              <View style={s.chipRow}>
                {validDurations.map(d => {
                  const isSelected = d.minutes === selectedDuration;
                  return (
                    <TouchableOpacity
                      key={d.minutes}
                      style={[s.durationChip, isSelected && s.durationChipSelected]}
                      onPress={() => setSelectedDuration(d.minutes)}
                    >
                      <Text style={[s.durationChipText, isSelected && s.durationChipTextSelected]}>
                        {d.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Section>
          )}

          {/* ── Итог ── */}
          {selectedStart && selectedDuration && endTime && cost !== null && (
            <View style={s.summary}>
              <SummaryRow label="Репетитор" value={selectedTS?.tutor_name ?? ''} />
              <SummaryRow label="Предмет" value={selectedTS?.subject_name ?? ''} />
              <SummaryRow label="Дата" value={formatDateFull(selectedDate!)} />
              <SummaryRow label="Время" value={`${fmt(selectedStart)} – ${fmt(endTime)}`} />
              <SummaryRow label="Стоимость" value={`${cost} ₽`} highlight last />
            </View>
          )}

          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* Фиксированная кнопка */}
      {selectedTS && selectedDate && selectedStart && selectedDuration && (
        <View style={s.footer}>
          <TouchableOpacity
            style={[s.bookBtn, booking && s.bookBtnDisabled]}
            onPress={handleBook}
            disabled={booking}
          >
            {booking
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.bookBtnText}>Записаться · {cost} ₽</Text>
            }
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function SummaryRow({ label, value, highlight, last }: {
  label: string; value: string; highlight?: boolean; last?: boolean;
}) {
  return (
    <View style={[sr.row, last && { borderBottomWidth: 0 }]}>
      <Text style={sr.label}>{label}</Text>
      <Text style={[sr.value, highlight && sr.highlight]}>{value}</Text>
    </View>
  );
}

// ─── Стили ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 18, color: '#999' },

  body: { padding: 16, gap: 4 },

  section: { gap: 10, marginBottom: 20 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.6 },

  emptyText: { fontSize: 14, color: '#aaa' },

  // Репетиторы
  tutorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#f0f0f0',
    backgroundColor: '#fafafa',
  },
  tutorCardSelected: { borderColor: '#2AABEE', backgroundColor: '#EFF9FF' },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#ddd', alignItems: 'center', justifyContent: 'center',
  },
  avatarSelected: { backgroundColor: '#2AABEE' },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  tutorName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#333' },
  tutorNameSelected: { color: '#2AABEE' },
  checkmark: { fontSize: 16, color: '#2AABEE', fontWeight: '700' },

  // Предметы
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  subjectChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#eee',
    backgroundColor: '#fafafa',
    alignItems: 'center',
  },
  subjectChipSelected: { borderColor: '#2AABEE', backgroundColor: '#EFF9FF' },
  subjectChipText: { fontSize: 14, fontWeight: '600', color: '#333' },
  subjectChipTextSelected: { color: '#2AABEE' },
  subjectRate: { fontSize: 11, color: '#aaa', marginTop: 2 },
  subjectRateSelected: { color: '#2AABEE' },

  // Даты
  dateChip: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginRight: 8,
    backgroundColor: '#f5f5f5',
    minWidth: 54,
  },
  dateChipSelected: { backgroundColor: '#2AABEE' },
  dateChipDay: { fontSize: 11, color: '#999', fontWeight: '500' },
  dateChipNum: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', lineHeight: 26 },
  dateChipMonth: { fontSize: 11, color: '#999' },
  dateChipTextSelected: { color: '#fff' },

  // Окна
  windowsBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12, marginTop: -8 },
  windowBadge: { backgroundColor: '#F1FBF2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  windowBadgeText: { fontSize: 13, color: '#4CAF50', fontWeight: '500' },

  // Время начала
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: {
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 10, backgroundColor: '#f5f5f5',
    borderWidth: 1, borderColor: '#eee',
  },
  timeChipSelected: { backgroundColor: '#2AABEE', borderColor: '#2AABEE' },
  timeChipText: { fontSize: 14, fontWeight: '500', color: '#333' },
  timeChipTextSelected: { color: '#fff' },

  // Длительность
  durationChip: {
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 10, backgroundColor: '#f5f5f5',
    borderWidth: 1, borderColor: '#eee',
  },
  durationChipSelected: { backgroundColor: '#1a1a1a', borderColor: '#1a1a1a' },
  durationChipText: { fontSize: 14, fontWeight: '500', color: '#333' },
  durationChipTextSelected: { color: '#fff' },

  // Нет слотов
  emptySlots: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  emptySlotsIcon: { fontSize: 36 },
  emptySlotsTitle: { fontSize: 15, fontWeight: '600', color: '#333' },
  emptySlotsHint: { fontSize: 13, color: '#aaa', textAlign: 'center' },

  // Итог
  summary: {
    backgroundColor: '#fafafa', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 4,
    marginTop: 4,
  },

  // Кнопка
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  bookBtn: { backgroundColor: '#2AABEE', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  bookBtnDisabled: { opacity: 0.6 },
  bookBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

const sr = StyleSheet.create({
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  label: { fontSize: 14, color: '#888' },
  value: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  highlight: { color: '#2AABEE', fontSize: 16 },
});
