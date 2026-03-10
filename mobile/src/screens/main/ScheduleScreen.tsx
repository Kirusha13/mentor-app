import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getLessons, Lesson } from '../../api/lessons';

const MONTHS_RU = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const STATUS_LABEL: Record<Lesson['conduct_status'], string> = {
  scheduled: 'Запланировано',
  conducted: 'Проведено',
  cancelled: 'Отменено',
  rescheduled: 'Перенесено',
};
const STATUS_COLOR: Record<Lesson['conduct_status'], string> = {
  scheduled: '#2AABEE',
  conducted: '#4CAF50',
  cancelled: '#F44336',
  rescheduled: '#FF9800',
};
const STATUS_BG: Record<Lesson['conduct_status'], string> = {
  scheduled: '#EFF9FF',
  conducted: '#F1FBF2',
  cancelled: '#FFF2F1',
  rescheduled: '#FFF8EE',
};
const PAYMENT_LABEL: Record<Lesson['payment_status'], string> = {
  unpaid: 'Не оплачено',
  paid: 'Оплачено',
};

function getWeekStart(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function formatWeekLabel(start: Date, end: Date): string {
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} – ${end.getDate()} ${MONTHS_RU[end.getMonth()]} ${end.getFullYear()}`;
  }
  return `${start.getDate()} ${MONTHS_RU[start.getMonth()]} – ${end.getDate()} ${MONTHS_RU[end.getMonth()]} ${end.getFullYear()}`;
}
function getTodayDayIndex(): number {
  const day = new Date().getDay();
  return day === 0 ? 6 : day - 1;
}
function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.slice(0, 10).split('-');
  return `${parseInt(d)} ${MONTHS_RU[parseInt(m) - 1]} ${y}`;
}

// ─── Модальное окно ────────────────────────────────────────────────────────────

function LessonModal({ lesson, onClose }: { lesson: Lesson; onClose: () => void }) {
  const color = STATUS_COLOR[lesson.conduct_status];
  const bg = STATUS_BG[lesson.conduct_status];

  const onReschedule = () => {
    Alert.alert('Перенос занятия', 'Функция будет доступна в ближайшем обновлении.', [{ text: 'Понятно' }]);
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={modal.container}>
        <View style={modal.header}>
          <Text style={modal.headerTitle}>Занятие</Text>
          <TouchableOpacity onPress={onClose} style={modal.closeBtn}>
            <Text style={modal.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={modal.body}>
          <View style={[modal.statusBadge, { backgroundColor: bg, borderLeftColor: color }]}>
            <Text style={[modal.statusText, { color }]}>{STATUS_LABEL[lesson.conduct_status]}</Text>
          </View>

          <View style={modal.section}>
            <Row label="Дата" value={formatDate(String(lesson.lesson_date))} />
            <Row label="Время" value={`${lesson.start_time.slice(0, 5)} – ${lesson.end_time.slice(0, 5)}`} />
            {lesson.tutor_name ? <Row label="Репетитор" value={lesson.tutor_name} /> : null}
            {lesson.subject_name ? <Row label="Предмет" value={lesson.subject_name} /> : null}
          </View>

          <View style={modal.section}>
            <Row label="Стоимость" value={`${lesson.cost} ₽`} bold />
            <Row
              label="Оплата"
              value={PAYMENT_LABEL[lesson.payment_status]}
              valueColor={lesson.payment_status === 'paid' ? '#4CAF50' : '#F44336'}
              last
            />
          </View>

          {lesson.grade != null && (
            <View style={modal.section}>
              <Row label="Оценка" value={String(lesson.grade)} bold last />
            </View>
          )}

          <TouchableOpacity style={modal.rescheduleBtn} onPress={onReschedule}>
            <Text style={modal.rescheduleBtnText}>Перенести занятие</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Row({ label, value, bold, valueColor, last }: {
  label: string; value: string; bold?: boolean; valueColor?: string; last?: boolean;
}) {
  return (
    <View style={[modal.row, last && { borderBottomWidth: 0 }]}>
      <Text style={modal.rowLabel}>{label}</Text>
      <Text style={[modal.rowValue, bold && { fontWeight: '600' }, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
    </View>
  );
}

// ─── Основной экран ────────────────────────────────────────────────────────────

export default function ScheduleScreen() {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [selectedDay, setSelectedDay] = useState(getTodayDayIndex);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Lesson | null>(null);
  const weekEnd = addDays(weekStart, 6);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLessons({
        date_from: toISODate(weekStart),
        date_to: toISODate(addDays(weekStart, 6)),
      });
      setLessons(data);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const todayStr = toISODate(new Date());
  const selectedDate = toISODate(addDays(weekStart, selectedDay));
  const dayLessons = lessons.filter((l) => String(l.lesson_date).slice(0, 10) === selectedDate);

  return (
    <View style={styles.container}>
      {/* Навигация по неделям */}
      <View style={styles.weekNav}>
        <TouchableOpacity onPress={() => setWeekStart((s) => addDays(s, -7))} style={styles.navBtn}>
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.weekLabel}>{formatWeekLabel(weekStart, weekEnd)}</Text>
        <TouchableOpacity onPress={() => setWeekStart((s) => addDays(s, 7))} style={styles.navBtn}>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Кнопки дней */}
      <View style={styles.dayTabs}>
        {DAYS_SHORT.map((label, i) => {
          const dayDate = addDays(weekStart, i);
          const isToday = toISODate(dayDate) === todayStr;
          const isSelected = selectedDay === i;
          return (
            <TouchableOpacity key={i} style={styles.dayTab} onPress={() => setSelectedDay(i)}>
              <Text style={[styles.dayLabel, isSelected && styles.dayLabelSelected]}>{label}</Text>
              <View style={[
                styles.dayNumWrap,
                isToday && styles.dayNumWrapToday,
                isSelected && !isToday && styles.dayNumWrapSelected,
              ]}>
                <Text style={[styles.dayNum, isToday && styles.dayNumWhite, isSelected && !isToday && styles.dayNumBlue]}>
                  {dayDate.getDate()}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Контент */}
      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color="#2AABEE" />
      ) : dayLessons.length === 0 ? (
        <View style={styles.emptyDay}>
          <Text style={styles.emptyDayText}>Занятий нет</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {dayLessons.map((lesson) => {
            const color = STATUS_COLOR[lesson.conduct_status];
            const bg = STATUS_BG[lesson.conduct_status];
            return (
              <TouchableOpacity
                key={lesson.id}
                activeOpacity={0.85}
                onPress={() => setSelected(lesson)}
                style={[styles.card, { borderLeftColor: color, backgroundColor: bg }]}
              >
                <View style={styles.cardTop}>
                  <Text style={[styles.cardStatus, { color }]}>{STATUS_LABEL[lesson.conduct_status]}</Text>
                  <Text style={styles.cardTime}>
                    {lesson.start_time.slice(0, 5)} – {lesson.end_time.slice(0, 5)}
                  </Text>
                </View>
                {lesson.tutor_name ? <Text style={styles.cardMeta}>{lesson.tutor_name}</Text> : null}
                {lesson.subject_name ? <Text style={styles.cardSubject}>{lesson.subject_name}</Text> : null}
                <Text style={styles.cardCost}>{lesson.cost} ₽</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {selected && <LessonModal lesson={selected} onClose={() => setSelected(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 6,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  navBtn: { padding: 8 },
  navArrow: { fontSize: 30, color: '#2AABEE', lineHeight: 34 },
  weekLabel: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  dayTabs: {
    flexDirection: 'row',
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  dayTab: { flex: 1, alignItems: 'center', gap: 4 },
  dayLabel: { fontSize: 11, color: '#aaa', fontWeight: '500' },
  dayLabelSelected: { color: '#2AABEE' },
  dayNumWrap: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dayNumWrapToday: { backgroundColor: '#2AABEE' },
  dayNumWrapSelected: { backgroundColor: '#E3F2FD' },
  dayNum: { fontSize: 14, color: '#333', fontWeight: '500' },
  dayNumWhite: { color: '#fff' },
  dayNumBlue: { color: '#2AABEE' },
  emptyDay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyDayText: { fontSize: 15, color: '#ccc' },
  list: { padding: 16, gap: 10 },
  card: {
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  cardStatus: { fontSize: 12, fontWeight: '700' },
  cardTime: { fontSize: 12, color: '#777' },
  cardMeta: { fontSize: 14, color: '#333', fontWeight: '500' },
  cardSubject: { fontSize: 13, color: '#666', marginTop: 2 },
  cardCost: { fontSize: 13, fontWeight: '600', color: '#1a1a1a', marginTop: 6 },
});

const modal = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  closeBtn: { padding: 4 },
  closeBtnText: { fontSize: 18, color: '#999' },
  body: { padding: 16, gap: 12 },
  statusBadge: { borderLeftWidth: 4, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  statusText: { fontSize: 14, fontWeight: '700' },
  section: { backgroundColor: '#fafafa', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rowLabel: { fontSize: 14, color: '#888' },
  rowValue: { fontSize: 14, color: '#1a1a1a' },
  rescheduleBtn: {
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: '#2AABEE',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  rescheduleBtnText: { color: '#2AABEE', fontSize: 15, fontWeight: '600' },
});
