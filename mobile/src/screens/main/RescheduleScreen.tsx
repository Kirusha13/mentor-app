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
import { AvailableSlot, getAvailableWindows, requestReschedule } from '../../api/lessons';
import { getTutors } from '../../api/student';
import { lessonDate, lessonStartTime, lessonEndTime, buildLocalIso } from '../../utils/lessonTime';

// ─── Вспомогательные функции ─────────────────────────────────────────────────

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
  lessonId: number;
  tutorStudentId: number | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RescheduleScreen({ lessonId, tutorStudentId, onClose, onSuccess }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [windows, setWindows] = useState<AvailableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);

  const todayStr = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    (async () => {
      try {
        const [slots, tutorStudents] = await Promise.all([getAvailableWindows(), getTutors()]);
        const futureSlots = slots.filter(s => lessonDate(s) >= todayStr);

        if (tutorStudentId !== null) {
          const ts = tutorStudents.find(t => t.id === tutorStudentId);
          const tutorId = ts?.tutor_id;
          setWindows(tutorId ? futureSlots.filter(s => s.tutor_id === tutorId) : futureSlots);
        } else {
          setWindows(futureSlots);
        }
      } catch {
        Alert.alert('Ошибка', 'Не удалось загрузить доступные окна');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  type StartOption = { time: string; slotEnd: string };

  function getSlotsForDate(date: string): AvailableSlot[] {
    return windows.filter(w => lessonDate(w) === date);
  }

  function getStartOptionsForSlots(slots: AvailableSlot[]): StartOption[] {
    return slots.flatMap(slot => {
      const slotEnd = lessonEndTime(slot);
      return getStartOptions(lessonStartTime(slot), slotEnd).map(t => ({ time: t, slotEnd }));
    });
  }

  const availableDates = [...new Set(windows.map(w => lessonDate(w)))].sort().filter(date => {
    return getStartOptionsForSlots(getSlotsForDate(date)).length > 0;
  });

  const dateSlots = selectedDate ? getSlotsForDate(selectedDate) : [];
  const startOptions: StartOption[] = getStartOptionsForSlots(dateSlots);

  const activeSlotEnd = selectedStart
    ? startOptions.find(o => o.time === selectedStart)?.slotEnd ?? null
    : null;

  const validDurations = selectedStart && activeSlotEnd
    ? DURATIONS.filter(d => toMinutes(selectedStart) + d.minutes <= toMinutes(activeSlotEnd))
    : [];

  const endTime = selectedStart && selectedDuration
    ? fromMinutes(toMinutes(selectedStart) + selectedDuration)
    : null;

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

  const handleSubmit = async () => {
    if (!selectedDate || !selectedStart || !endTime) return;
    Alert.alert(
      'Запрос на перенос?',
      `${formatDateFull(selectedDate)}, ${fmt(selectedStart)} – ${fmt(endTime)}\n\nРепетитор рассмотрит ваш запрос.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Отправить',
          onPress: async () => {
            setSubmitting(true);
            try {
              await requestReschedule(lessonId, {
                starts_at: buildLocalIso(selectedDate, selectedStart),
                ends_at: buildLocalIso(selectedDate, endTime),
              });
              Alert.alert('Запрос отправлен', 'Репетитор рассмотрит ваш запрос на перенос.', [
                { text: 'OK', onPress: onSuccess },
              ]);
            } catch (e: any) {
              const msg = e?.response?.data?.detail ?? 'Не удалось отправить запрос';
              Alert.alert('Ошибка', msg);
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={s.container}>
      {/* Шапка */}
      <View style={s.header}>
        <TouchableOpacity onPress={onClose} style={s.closeBtn}>
          <Text style={s.closeText}>✕</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Перенос занятия</Text>
        <View style={s.closeBtn} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color="#2AABEE" />
      ) : availableDates.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>Нет доступных окон для переноса</Text>
          <Text style={s.emptyHint}>Репетитор ещё не добавил свободное время</Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── 1. Дата ── */}
          <Section label="Дата">
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
          </Section>

          {/* Бейджи окон */}
          {selectedDate && dateSlots.length > 0 && (
            <View style={s.windowsBadgeRow}>
              {dateSlots.map((slot, i) => (
                <View key={i} style={s.windowBadge}>
                  <Text style={s.windowBadgeText}>
                    🕐 {lessonStartTime(slot)} – {lessonEndTime(slot)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* ── 2. Время начала ── */}
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

          {/* ── 3. Длительность ── */}
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
          {selectedStart && selectedDuration && endTime && (
            <View style={s.summary}>
              <SummaryRow label="Дата" value={formatDateFull(selectedDate!)} />
              <SummaryRow label="Время" value={`${fmt(selectedStart)} – ${fmt(endTime)}`} last />
            </View>
          )}

          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* Фиксированная кнопка */}
      {selectedDate && selectedStart && selectedDuration && (
        <View style={s.footer}>
          <TouchableOpacity
            style={[s.submitBtn, submitting && s.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.submitBtnText}>Отправить запрос на перенос</Text>
            }
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function SummaryRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[sr.row, last && { borderBottomWidth: 0 }]}>
      <Text style={sr.label}>{label}</Text>
      <Text style={sr.value}>{value}</Text>
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

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#333', textAlign: 'center' },
  emptyHint: { fontSize: 13, color: '#999', textAlign: 'center' },

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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  durationChip: {
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 10, backgroundColor: '#f5f5f5',
    borderWidth: 1, borderColor: '#eee',
  },
  durationChipSelected: { backgroundColor: '#1a1a1a', borderColor: '#1a1a1a' },
  durationChipText: { fontSize: 14, fontWeight: '500', color: '#333' },
  durationChipTextSelected: { color: '#fff' },

  // Итог
  summary: {
    backgroundColor: '#fafafa', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 4,
    marginTop: 4,
  },

  // Кнопка
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  submitBtn: { backgroundColor: '#2AABEE', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

const sr = StyleSheet.create({
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  label: { fontSize: 14, color: '#888' },
  value: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
});
