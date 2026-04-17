import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getLessons, reportPayment, updateLessonNote, Lesson } from '../../api/lessons';
import { getTopicContext, TheoryTopic } from '../../api/materials';
import TopicModal from '../../components/TopicModal';
import RescheduleScreen from './RescheduleScreen';
import BookingScreen from './BookingScreen';

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
  reschedule_pending: 'Ожидает переноса',
  reschedule_rejected: 'Перенос отклонён',
  booking_pending: 'Ожидает подтверждения',
  booking_rejected: 'Запрос отклонён',
};
const STATUS_COLOR: Record<Lesson['conduct_status'], string> = {
  scheduled: '#2AABEE',
  conducted: '#4CAF50',
  cancelled: '#F44336',
  rescheduled: '#FF9800',
  reschedule_pending: '#9C27B0',
  reschedule_rejected: '#F44336',
  booking_pending: '#9C27B0',
  booking_rejected: '#F44336',
};
const STATUS_BG: Record<Lesson['conduct_status'], string> = {
  scheduled: '#EFF9FF',
  conducted: '#F1FBF2',
  cancelled: '#FFF2F1',
  rescheduled: '#FFF8EE',
  reschedule_pending: '#F9F0FF',
  reschedule_rejected: '#FFF2F1',
  booking_pending: '#F9F0FF',
  booking_rejected: '#FFF2F1',
};
const PAYMENT_LABEL: Record<Lesson['payment_status'], string> = {
  unpaid: 'Не оплачено',
  payment_pending: 'Ожидает подтверждения',
  paid: 'Оплачено',
};

const PAYMENT_DOT_COLOR: Record<Lesson['payment_status'], string> = {
  unpaid: '#F44336',
  payment_pending: '#FF9800',
  paid: '#4CAF50',
};

function getPaymentIcon(
  paymentStatus: Lesson['payment_status'],
  conductStatus: Lesson['conduct_status'],
): string {
  if (paymentStatus === 'paid') return 'checkmark-outline';
  if (paymentStatus === 'payment_pending') return 'time-outline';
  if (conductStatus === 'conducted') return 'alert-outline';
  return 'wallet-outline';
}

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
function pluralLesson(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'занятие';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'занятия';
  return 'занятий';
}

// ─── Модальное окно ────────────────────────────────────────────────────────────

function LessonModal({ lesson, onClose, onRefresh }: { lesson: Lesson; onClose: () => void; onRefresh: () => void }) {
  const { top: topInset } = useSafeAreaInsets();
  const [localLesson, setLocalLesson] = useState(lesson);
  const color = STATUS_COLOR[localLesson.conduct_status];
  const bg = STATUS_BG[localLesson.conduct_status];
  const [showReschedule, setShowReschedule] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [topicModalVisible, setTopicModalVisible] = useState(false);
  const [topicContext, setTopicContext] = useState<{ topic: TheoryTopic; allTopics: TheoryTopic[] } | null>(null);
  const [topicLoading, setTopicLoading] = useState(false);
  const [note, setNote] = useState(lesson.student_note ?? '');
  const [savingNote, setSavingNote] = useState(false);
  const noteDirty = note !== (localLesson.student_note ?? '');
  const scrollRef = useRef<ScrollView>(null);

  const handleOpenTopic = async () => {
    if (!localLesson.topic_id) return;
    setTopicLoading(true);
    setTopicModalVisible(true);
    try {
      const ctx = await getTopicContext(localLesson.topic_id);
      setTopicContext(ctx);
    } catch {
      setTopicModalVisible(false);
    } finally {
      setTopicLoading(false);
    }
  };

  const handleSaveNote = async () => {
    setSavingNote(true);
    try {
      const updated = await updateLessonNote(localLesson.id, note.trim() || null);
      setLocalLesson(updated);
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить заметку');
    } finally {
      setSavingNote(false);
    }
  };

  const handleReportPayment = async () => {
    Alert.alert(
      'Подтвердить оплату',
      `Вы сообщаете репетитору об оплате ${localLesson.cost} ₽?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Подтвердить',
          onPress: async () => {
            setReporting(true);
            try {
              const updated = await reportPayment(localLesson.id);
              setLocalLesson(updated);
              onRefresh();
            } catch {
              Alert.alert('Ошибка', 'Не удалось отправить запрос. Попробуйте ещё раз.');
            } finally {
              setReporting(false);
            }
          },
        },
      ]
    );
  };

  if (showReschedule) {
    return (
      <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowReschedule(false)}>
        <RescheduleScreen
          lessonId={localLesson.id}
          tutorStudentId={localLesson.tutor_student_id}
          onClose={() => setShowReschedule(false)}
          onSuccess={() => { setShowReschedule(false); onClose(); onRefresh(); }}
        />
      </Modal>
    );
  }

  const canReschedule = localLesson.conduct_status === 'scheduled';
  const canReportPayment =
    localLesson.payment_status !== 'paid' &&
    !['cancelled', 'rescheduled', 'booking_rejected', 'reschedule_rejected'].includes(localLesson.conduct_status);

  return (
    <KeyboardAvoidingView
      style={modal.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? topInset : 0}
    >
      <View style={modal.header}>
        <TouchableOpacity onPress={onClose} style={modal.closeBtn}>
          <Text style={modal.closeBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={modal.headerTitle}>Занятие</Text>
        <View style={modal.closeBtn} />
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={modal.body}>
        <View style={[modal.statusBadge, { backgroundColor: bg, borderLeftColor: color }]}>
          <Text style={[modal.statusText, { color }]}>{STATUS_LABEL[localLesson.conduct_status]}</Text>
        </View>

        <View style={modal.section}>
          <Row label="Дата" value={formatDate(String(localLesson.lesson_date))} />
          <Row label="Время" value={`${localLesson.start_time.slice(0, 5)} – ${localLesson.end_time.slice(0, 5)}`} />
          {localLesson.tutor_name ? <Row label="Репетитор" value={localLesson.tutor_name} /> : null}
          {localLesson.subject_name ? <Row label="Предмет" value={localLesson.subject_name} /> : null}
          {localLesson.topic_title ? (
            <TouchableOpacity style={[modal.row, { borderBottomWidth: 0 }]} onPress={handleOpenTopic} activeOpacity={0.7}>
              <Text style={modal.rowLabel}>Тема</Text>
              <View style={modal.topicValueWrap}>
                <Text style={modal.topicValueText} numberOfLines={1}>{localLesson.topic_title}</Text>
                <Ionicons name="chevron-forward" size={14} color="#2AABEE" />
              </View>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={modal.section}>
          <Row label="Стоимость" value={`${localLesson.cost} ₽`} bold />
          <Row
            label="Оплата"
            value={PAYMENT_LABEL[localLesson.payment_status]}
            valueColor={
              localLesson.payment_status === 'paid' ? '#4CAF50'
              : localLesson.payment_status === 'payment_pending' ? '#FF9800'
              : '#F44336'
            }
            last
          />
        </View>

        {localLesson.grade != null && (
          <View style={modal.section}>
            <Row label="Оценка" value={String(localLesson.grade)} bold last={!localLesson.grade_comment} />
            {localLesson.grade_comment ? (
              <View style={modal.gradeCommentWrap}>
                <Text style={modal.gradeCommentText}>{localLesson.grade_comment}</Text>
              </View>
            ) : null}
          </View>
        )}

        <View style={modal.section}>
          <Text style={modal.noteLabel}>Личная заметка</Text>
          <TextInput
            style={modal.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Только для себя..."
            placeholderTextColor="#bbb"
            multiline
            textAlignVertical="top"
            editable={!savingNote}
            onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150)}
          />
        </View>

        {canReschedule && (
          <TouchableOpacity style={modal.rescheduleBtn} onPress={() => setShowReschedule(true)}>
            <Text style={modal.rescheduleBtnText}>Перенести занятие</Text>
          </TouchableOpacity>
        )}

        {canReportPayment && (
          <TouchableOpacity
            style={[modal.paymentBtn, localLesson.payment_status === 'payment_pending' && modal.paymentBtnDisabled]}
            onPress={localLesson.payment_status === 'unpaid' && !reporting ? handleReportPayment : undefined}
            activeOpacity={localLesson.payment_status === 'unpaid' ? 0.85 : 1}
          >
            <Text style={[modal.paymentBtnText, localLesson.payment_status === 'payment_pending' && modal.paymentBtnTextDisabled]}>
              {localLesson.payment_status === 'payment_pending' ? 'Ожидает подтверждения' : 'Сообщить об оплате'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {noteDirty && (
        <View style={modal.saveNoteContainer}>
          <TouchableOpacity
            style={[modal.saveNoteBtn, savingNote && { opacity: 0.6 }]}
            onPress={handleSaveNote}
            disabled={savingNote}
          >
            {savingNote
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={modal.saveNoteBtnText}>Сохранить заметку</Text>
            }
          </TouchableOpacity>
        </View>
      )}

      <TopicModal
        visible={topicModalVisible}
        topic={topicContext?.topic ?? null}
        allTopics={topicContext?.allTopics ?? []}
        loading={topicLoading}
        onClose={() => setTopicModalVisible(false)}
      />
    </KeyboardAvoidingView>
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
  const insets = useSafeAreaInsets();
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [selectedDay, setSelectedDay] = useState(getTodayDayIndex);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Lesson | null>(null);
  const [showBooking, setShowBooking] = useState(false);
  const [unpaidInfo, setUnpaidInfo] = useState<{ count: number; total: number; nearestDate: string } | null>(null);
  const weekEnd = addDays(weekStart, 6);

  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const data = await getLessons({
        date_from: toISODate(weekStart),
        date_to: toISODate(addDays(weekStart, 6)),
      });
      setLessons(data);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [weekStart]);

  const loadUnpaid = useCallback(async () => {
    const all = await getLessons();
    const unpaid = all.filter(l => l.conduct_status === 'conducted' && l.payment_status === 'unpaid');
    if (unpaid.length === 0) {
      setUnpaidInfo(null);
    } else {
      unpaid.sort((a, b) => String(a.lesson_date).localeCompare(String(b.lesson_date)));
      const total = unpaid.reduce((sum, l) => sum + Number(l.cost ?? 0), 0);
      setUnpaidInfo({ count: unpaid.length, total, nearestDate: String(unpaid[0].lesson_date) });
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([load(false), loadUnpaid()]);
    setRefreshing(false);
  }, [load, loadUnpaid]);

  useFocusEffect(useCallback(() => { load(); loadUnpaid(); }, [load, loadUnpaid]));

  const todayStr = toISODate(new Date());
  const selectedDate = toISODate(addDays(weekStart, selectedDay));
  const dayLessons = lessons.filter((l) => String(l.lesson_date).slice(0, 10) === selectedDate);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
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
      ) : (
        <ScrollView
          contentContainerStyle={dayLessons.length === 0 ? styles.emptyDay : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#2AABEE" colors={['#2AABEE']} />}
        >
          {dayLessons.length === 0 ? (
            <Text style={styles.emptyDayText}>Занятий нет</Text>
          ) : dayLessons.map((lesson) => {
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
                <View style={styles.cardBottom}>
                  <Text style={styles.cardCost}>{lesson.cost} ₽</Text>
                  <View style={[styles.paymentIconWrap, { borderColor: PAYMENT_DOT_COLOR[lesson.payment_status] }]}>
                    <Ionicons
                      name={getPaymentIcon(lesson.payment_status, lesson.conduct_status) as any}
                      size={14}
                      color={PAYMENT_DOT_COLOR[lesson.payment_status]}
                    />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {selected && (
        <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
          <LessonModal lesson={selected} onClose={() => setSelected(null)} onRefresh={() => { load(); loadUnpaid(); }} />
        </Modal>
      )}

      <Modal visible={showBooking} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowBooking(false)}>
        <BookingScreen
          onClose={() => setShowBooking(false)}
          onSuccess={() => { setShowBooking(false); load(); }}
        />
      </Modal>

      {unpaidInfo && (
        <TouchableOpacity
          style={styles.unpaidBanner}
          activeOpacity={0.8}
          onPress={() => {
            const date = new Date(unpaidInfo.nearestDate + 'T00:00:00');
            setWeekStart(getWeekStart(date));
            const day = date.getDay();
            setSelectedDay(day === 0 ? 6 : day - 1);
          }}
        >
          <Ionicons name="wallet-outline" size={16} color="#E65100" />
          <Text style={styles.unpaidBannerText}>
            Не оплачено: {Math.round(unpaidInfo.total).toLocaleString('ru-RU')} ₽ ({unpaidInfo.count} {pluralLesson(unpaidInfo.count)})
          </Text>
          <Ionicons name="chevron-forward" size={14} color="#E65100" />
        </TouchableOpacity>
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowBooking(true)} activeOpacity={0.85}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  navBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#EFF9FF',
  },
  navArrow: { fontSize: 22, color: '#2AABEE', lineHeight: 26, fontWeight: '600' },
  weekLabel: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2AABEE',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2AABEE',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 32, fontWeight: '300' },
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
  dayNumWrapToday: { backgroundColor: '#2AABEE', borderRadius: 15 },
  dayNumWrapSelected: { backgroundColor: '#E3F2FD', borderRadius: 15 },
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
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  cardCost: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
  paymentIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unpaidBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#FFE0B2',
  },
  unpaidBannerText: { fontSize: 13, color: '#E65100', fontWeight: '500' },
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
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
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
  paymentBtn: {
    marginTop: 8,
    backgroundColor: '#2AABEE',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  paymentBtnDisabled: {
    backgroundColor: '#E0E0E0',
  },
  paymentBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  paymentBtnTextDisabled: {
    color: '#9E9E9E',
  },
  topicValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'flex-end' },
  topicValueText: { fontSize: 14, color: '#2AABEE', fontWeight: '500', flexShrink: 1 },
  gradeCommentWrap: { paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  gradeCommentText: { fontSize: 13, color: '#555', lineHeight: 19, fontStyle: 'italic' },
  noteLabel: { fontSize: 12, fontWeight: '600', color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  noteInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    color: '#1a1a1a',
    minHeight: 80,
    backgroundColor: '#fafafa',
  },
  saveNoteContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  saveNoteBtn: {
    backgroundColor: '#2AABEE',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveNoteBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
