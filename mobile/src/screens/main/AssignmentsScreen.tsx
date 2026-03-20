import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Assignment, getAssignments } from '../../api/assignments';
import { AssignmentsStackParamList } from '../../navigation/AppNavigator';

const STATUS_LABEL: Record<Assignment['completion_status'], string> = {
  assigned: 'Назначено',
  in_progress: 'В работе',
  completed: 'Выполнено',
  overdue: 'Просрочено',
};

const STATUS_COLOR: Record<Assignment['completion_status'], string> = {
  assigned: '#2AABEE',
  in_progress: '#FF9800',
  completed: '#4CAF50',
  overdue: '#F44336',
};

type Props = NativeStackScreenProps<AssignmentsStackParamList, 'AssignmentsList'>;

function AssignmentCard({
  item,
  onPress,
}: {
  item: Assignment;
  onPress: () => void;
}) {
  const deadline = new Date(item.deadline);
  const isOverdue = deadline < new Date() && item.completion_status !== 'completed';
  const hasResponse = !!item.student_comment || (item.student_files && item.student_files.length > 0);

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title ?? 'Без названия'}
        </Text>
        <View style={[styles.badge, { backgroundColor: STATUS_COLOR[item.completion_status] }]}>
          <Text style={styles.badgeText}>{STATUS_LABEL[item.completion_status]}</Text>
        </View>
      </View>
      <Text style={styles.description} numberOfLines={2}>
        {item.description}
      </Text>
      <View style={styles.footer}>
        <Text style={[styles.deadline, isOverdue && { color: '#F44336' }]}>
          Дедлайн: {deadline.toLocaleDateString('ru-RU')}
        </Text>
        {hasResponse && <Text style={styles.responseHint}>✏️ Есть ответ</Text>}
      </View>
      {item.grade != null && (
        <View style={styles.gradeRow}>
          <Text style={styles.gradeLabel}>Оценка:</Text>
          <View style={styles.gradeBadge}>
            <Text style={styles.gradeText}>{item.grade}</Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function AssignmentsScreen({ navigation }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getAssignments();
      setAssignments(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const insets = useSafeAreaInsets();
  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;

  return (
    <FlatList
      style={{ paddingTop: insets.top }}
      data={assignments}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <AssignmentCard
          item={item}
          onPress={() => navigation.push('AssignmentDetail', { assignment: item })}
        />
      )}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={styles.empty}>Заданий нет</Text>}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingTop: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    gap: 8,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '600', flex: 1, marginRight: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  description: { fontSize: 14, color: '#555', lineHeight: 20 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  deadline: { fontSize: 13, color: '#888' },
  responseHint: { fontSize: 12, color: '#4CAF50' },
  gradeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gradeLabel: { fontSize: 13, color: '#888' },
  gradeBadge: {
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#FFD54F',
  },
  gradeText: { fontSize: 14, fontWeight: '700', color: '#F57F17' },
  empty: { textAlign: 'center', color: '#999', marginTop: 60 },
});
