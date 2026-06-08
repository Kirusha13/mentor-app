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
import { Ionicons } from '@expo/vector-icons';
import { AvailableSlot, bookLesson, getAvailableWindows } from '../../api/lessons';
import { getTutors, TutorStudent } from '../../api/student';
import { lessonDate, lessonStartTime, lessonEndTime } from '../../utils/lessonTime';

// ─── Вспомогательные функции ──────────────────────────────────────────────────

const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_FULL_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const DAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${MONTHS_FULL_RU[d.getMonth()]}`;
}

function slotDurationMinutes(slot: AvailableSlot): number {
  const [sh, sm] = slot.start_time.slice(0, 5).split(':').map(Number);
  const [eh, em] = slot.end_time.slice(0, 5).split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} мин`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h} ч`;
  return `${h}.${m === 30 ? '5' : String(Math.round(m * 10 / 60))} ч`;
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
  const [tutorDropdownOpen, setTutorDropdownOpen] = useState(false);

  // Состояние формы
  const [selectedTutorId, setSelectedTutorId] = useState<number | null>(null);
  const [selectedTS, setSelectedTS] = useState<TutorStudent | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);

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

  const todayStr = new Date().toISOString().slice(0, 10);

  function getSlotsForDate(date: string): AvailableSlot[] {
    return selectedTS
      ? windows.filter(w => w.tutor_id === selectedTS.tutor_id && lessonDate(w) === date)
      : [];
  }

  const availableDates = selectedTS
    ? [...new Set(
        windows
          .filter(w => w.tutor_id === selectedTS!.tutor_id)
          .map(w => lessonDate(w))
      )].sort()
    : [];

  const dateSlots = selectedDate ? getSlotsForDate(selectedDate) : [];

  const cost = selectedSlot && selectedTS
    ? Math.round(slotDurationMinutes(selectedSlot) / 60 * Number(selectedTS.hourly_rate))
    : null;

  // Сбросы при смене шагов
  function selectTutor(tutorId: number) {
    setSelectedTutorId(tutorId);
    setSelectedTS(null);
    setSelectedDate(null);
    setSelectedSlot(null);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
  }
  function selectSubject(ts: TutorStudent) {
    setSelectedTS(ts);
    setSelectedDate(null);
    setSelectedSlot(null);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
  }

  // Авто-выбор если репетитор или предмет один
  useEffect(() => {
    if (!loading && uniqueTutors.length === 1 && selectedTutorId === null) {
      selectTutor(uniqueTutors[0].tutor_id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    if (selectedTutorId !== null && subjectsForTutor.length === 1 && selectedTS === null) {
      selectSubject(subjectsForTutor[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTutorId]);

  function selectDate(date: string) {
    setSelectedDate(date);
    setSelectedSlot(null);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
  }

  const handleBook = () => {
    if (!selectedTS || !selectedDate || !selectedSlot) return;
    const start = lessonStartTime(selectedSlot);
    const end = lessonEndTime(selectedSlot);
    Alert.alert(
      'Отправить запрос?',
      `${formatDateFull(selectedDate)}, ${start} – ${end}\n${selectedTS.subject_name} · ${cost} ₽\n\nЗапрос будет отправлен репетитору. После одобрения занятие появится в расписании.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Отправить',
          onPress: async () => {
            setBooking(true);
            try {
              await bookLesson({
                tutor_student_id: selectedTS.id,
                lesson_date: selectedSlot.lesson_date,
                start_time: selectedSlot.start_time,
                end_time: selectedSlot.end_time,
              });
              Alert.alert('Запрос отправлен', 'Репетитор рассмотрит ваш запрос и подтвердит занятие.', [{ text: 'OK', onPress: onSuccess }]);
            } catch (e: any) {
              Alert.alert('Ошибка', e?.response?.data?.detail ?? 'Не удалось отправить запрос');
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
            {uniqueTutors.length === 0 ? (
              <Text style={s.emptyText}>Нет активных репетиторов</Text>
            ) : uniqueTutors.length === 1 ? (
              <View style={s.dropdownSelected}>
                <View style={s.avatar}>
                  <Text style={s.avatarText}>{uniqueTutors[0].tutor_name?.[0] ?? '?'}</Text>
                </View>
                <Text style={s.dropdownSelectedText}>{uniqueTutors[0].tutor_name ?? 'Репетитор'}</Text>
                <Text style={s.checkmark}>✓</Text>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={s.dropdownTrigger}
                  activeOpacity={0.8}
                  onPress={() => setTutorDropdownOpen(o => !o)}
                >
                  <Text style={selectedTutorId ? s.dropdownValueText : s.dropdownPlaceholder}>
                    {selectedTutorId
                      ? (uniqueTutors.find(t => t.tutor_id === selectedTutorId)?.tutor_name ?? 'Репетитор')
                      : 'Выберите репетитора'}
                  </Text>
                  <Text style={s.dropdownChevron}>{tutorDropdownOpen ? '˄' : '˅'}</Text>
                </TouchableOpacity>
                {tutorDropdownOpen && (
                  <View style={s.dropdownList}>
                    {uniqueTutors.map((ts, idx) => {
                      const isSelected = ts.tutor_id === selectedTutorId;
                      return (
                        <TouchableOpacity
                          key={ts.tutor_id}
                          style={[
                            s.dropdownItem,
                            isSelected && s.dropdownItemSelected,
                            idx === uniqueTutors.length - 1 && { borderBottomWidth: 0 },
                          ]}
                          onPress={() => { selectTutor(ts.tutor_id); setTutorDropdownOpen(false); }}
                        >
                          <View style={[s.avatar, isSelected && s.avatarSelected]}>
                            <Text style={s.avatarText}>{ts.tutor_name?.[0] ?? '?'}</Text>
                          </View>
                          <Text style={[s.dropdownItemText, isSelected && s.dropdownItemTextSelected]}>
                            {ts.tutor_name ?? 'Репетитор'}
                          </Text>
                          {isSelected && <Text style={s.checkmark}>✓</Text>}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </>
            )}
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
                  <View style={s.emptySlotsIconWrap}>
                    <Ionicons name="calendar-outline" size={32} color="#2AABEE" />
                  </View>
                  <Text style={s.emptySlotsTitle}>Свободных слотов пока нет</Text>
                  <Text style={s.emptySlotsHint}>Обратитесь к репетитору</Text>
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

          {/* ── 4. Слот ── */}
          {selectedDate && (
            <Section label="Слот">
              {dateSlots.length === 0 ? (
                <Text style={s.emptyText}>Нет доступных слотов на эту дату</Text>
              ) : (
                dateSlots.map((slot, i) => {
                  const isSelected = selectedSlot?.lesson_date === slot.lesson_date && selectedSlot?.start_time === slot.start_time;
                  const mins = slotDurationMinutes(slot);
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[s.slotCard, isSelected && s.slotCardSelected]}
                      onPress={() => {
                        setSelectedSlot(slot);
                        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
                      }}
                    >
                      <Text style={[s.slotCardTime, isSelected && s.slotCardTimeSelected]}>
                        {lessonStartTime(slot)} – {lessonEndTime(slot)}
                      </Text>
                      <View style={[s.slotDurationBadge, isSelected && s.slotDurationBadgeSelected]}>
                        <Text style={[s.slotDurationText, isSelected && s.slotDurationTextSelected]}>
                          {formatDuration(mins)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </Section>
          )}

          {/* ── Итог ── */}
          {selectedSlot && cost !== null && (
            <View style={s.summary}>
              <SummaryRow label="Дата" value={formatDateFull(selectedDate!)} />
              <SummaryRow
                label="Время"
                value={`${lessonStartTime(selectedSlot)} – ${lessonEndTime(selectedSlot)}`}
              />
              <SummaryRow label="Длительность" value={formatDuration(slotDurationMinutes(selectedSlot))} />
              <SummaryRow label="Стоимость" value={`${cost} ₽`} highlight last />
            </View>
          )}

          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* Фиксированная кнопка */}
      {selectedTS && selectedDate && selectedSlot && (
        <View style={s.footer}>
          <TouchableOpacity
            style={[s.bookBtn, booking && s.bookBtnDisabled]}
            onPress={handleBook}
            disabled={booking}
          >
            {booking
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.bookBtnText}>Отправить запрос · {cost} ₽</Text>
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

  // Репетитор — dropdown
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    backgroundColor: '#fafafa',
  },
  dropdownPlaceholder: { fontSize: 15, color: '#bbb', flex: 1 },
  dropdownValueText: { fontSize: 15, fontWeight: '600', color: '#1a1a1a', flex: 1 },
  dropdownChevron: { fontSize: 16, color: '#aaa', marginLeft: 8 },
  dropdownList: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
    marginTop: 4,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  dropdownItemSelected: { backgroundColor: '#EFF9FF' },
  dropdownItemText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#333' },
  dropdownItemTextSelected: { color: '#2AABEE' },
  dropdownSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#2AABEE',
    backgroundColor: '#EFF9FF',
  },
  dropdownSelectedText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#2AABEE' },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#2AABEE', alignItems: 'center', justifyContent: 'center',
  },
  avatarSelected: { backgroundColor: '#2AABEE' },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#fff' },
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

  // Слот-карточки
  slotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#eee',
    backgroundColor: '#fafafa',
    marginBottom: 8,
  },
  slotCardSelected: { borderColor: '#2AABEE', backgroundColor: '#EFF9FF' },
  slotCardTime: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  slotCardTimeSelected: { color: '#2AABEE' },
  slotDurationBadge: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  slotDurationBadgeSelected: { backgroundColor: '#d0edfc' },
  slotDurationText: { fontSize: 13, color: '#888', fontWeight: '500' },
  slotDurationTextSelected: { color: '#2AABEE' },

  // Нет слотов
  emptySlots: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  emptySlotsIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#EFF9FF',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
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
