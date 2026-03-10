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
import { Assignment, getAssignments, updateAssignmentStatus } from '../../api/assignments';

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

function AssignmentCard({
  item,
  onStatusChange,
}: {
  item: Assignment;
  onStatusChange: (id: number, status: Assignment['completion_status']) => void;
}) {
  const deadline = new Date(item.deadline);
  const isOverdue = deadline < new Date() && item.completion_status !== 'completed';

  return (
    <View style={styles.card}>
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
      <Text style={[styles.deadline, isOverdue && { color: '#F44336' }]}>
        Дедлайн: {deadline.toLocaleDateString('ru-RU')}
      </Text>
      {item.completion_status !== 'completed' && (
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() =>
            onStatusChange(
              item.id,
              item.completion_status === 'assigned' ? 'in_progress' : 'completed',
            )
          }
        >
          <Text style={styles.actionBtnText}>
            {item.completion_status === 'assigned' ? 'Взять в работу' : 'Отметить выполненным'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function AssignmentsScreen() {
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

  const handleStatusChange = async (id: number, status: Assignment['completion_status']) => {
    const updated = await updateAssignmentStatus(id, status);
    setAssignments((prev) => prev.map((a) => (a.id === id ? updated : a)));
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;

  return (
    <FlatList
      data={assignments}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <AssignmentCard item={item} onStatusChange={handleStatusChange} />
      )}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={styles.empty}>Заданий нет</Text>}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
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
  deadline: { fontSize: 13, color: '#888' },
  actionBtn: {
    backgroundColor: '#2AABEE',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnText: { color: '#fff', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#999', marginTop: 60 },
});
