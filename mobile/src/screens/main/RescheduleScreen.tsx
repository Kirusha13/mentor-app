import React, { useEffect, useState } from 'react';
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

const MONTHS_RU = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(d)} ${MONTHS_RU[parseInt(m) - 1]} ${y}`;
}

interface Props {
  lessonId: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RescheduleScreen({ lessonId, onClose, onSuccess }: Props) {
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<AvailableSlot | null>(null);

  useEffect(() => {
    getAvailableWindows()
      .then(setSlots)
      .catch((e) => Alert.alert('Ошибка', JSON.stringify(e?.response?.data) ?? e?.message ?? 'Не удалось загрузить окна'))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await requestReschedule(lessonId, {
        lesson_date: selected.lesson_date,
        start_time: selected.start_time,
        end_time: selected.end_time,
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
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Выберите время</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color="#2AABEE" />
      ) : slots.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Нет доступных окон для переноса</Text>
          <Text style={styles.emptySubtext}>Репетитор ещё не добавил свободное время</Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.list}>
            {slots.map((slot, i) => {
              const isSelected =
                selected?.lesson_date === slot.lesson_date &&
                selected?.start_time === slot.start_time;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.slot, isSelected && styles.slotSelected]}
                  onPress={() => setSelected(slot)}
                  activeOpacity={0.8}
                >
                  <View style={styles.slotLeft}>
                    <Text style={[styles.slotDate, isSelected && styles.slotTextSelected]}>
                      {formatDate(slot.lesson_date)}
                    </Text>
                    <Text style={[styles.slotTime, isSelected && styles.slotTextSelected]}>
                      {slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}
                    </Text>
                    {slot.tutor_name ? (
                      <Text style={[styles.slotTutor, isSelected && styles.slotTextSelected]}>
                        {slot.tutor_name}
                      </Text>
                    ) : null}
                  </View>
                  {isSelected && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.submitBtn, (!selected || submitting) && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!selected || submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Отправить запрос</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: { fontSize: 17, fontWeight: '600' },
  closeBtn: { padding: 4 },
  closeBtnText: { fontSize: 18, color: '#999' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#333', textAlign: 'center' },
  emptySubtext: { fontSize: 13, color: '#999', textAlign: 'center' },
  list: { padding: 16, gap: 10 },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f9f9f9',
    borderWidth: 1.5,
    borderColor: '#f0f0f0',
  },
  slotSelected: {
    backgroundColor: '#EFF9FF',
    borderColor: '#2AABEE',
  },
  slotLeft: { gap: 2 },
  slotDate: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  slotTime: { fontSize: 15, fontWeight: '700', color: '#333' },
  slotTutor: { fontSize: 12, color: '#888', marginTop: 2 },
  slotTextSelected: { color: '#1a7bbf' },
  checkmark: { fontSize: 18, color: '#2AABEE', fontWeight: '700' },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  submitBtn: {
    backgroundColor: '#2AABEE',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: '#b0d8f5' },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
