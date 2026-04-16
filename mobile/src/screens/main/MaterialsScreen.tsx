import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTopics, TheoryTopic } from '../../api/materials';
import { getLevels, getTutors, TutorLevel, TutorStudent } from '../../api/student';
import { MaterialsStackParamList } from '../../navigation/AppNavigator';

type Props = {
  navigation: NativeStackNavigationProp<MaterialsStackParamList, 'TopicsList'>;
};

type ListItem =
  | { type: 'tutor'; tutorId: number; tutorName: string }
  | { type: 'subject'; subjectId: number; subjectName: string }
  | { type: 'topic'; topic: TheoryTopic; allTopics: TheoryTopic[]; depth: number };

// Тема видна если фильтр пустой, level_ids пустой, или есть пересечение
// Родительская тема видна если хотя бы одна дочерняя видна
function topicVisible(topic: TheoryTopic, allTopics: TheoryTopic[], filters: Set<number>): boolean {
  if (filters.size === 0) return true;
  if (topic.level_ids.length === 0) return true;
  if (topic.level_ids.some(id => filters.has(id))) return true;
  if (topic.parent_topic_id === null) {
    return allTopics
      .filter(t => t.parent_topic_id === topic.id)
      .some(child => topicVisible(child, allTopics, filters));
  }
  return false;
}

export default function MaterialsScreen({ navigation }: Props) {
  const [topics, setTopics] = useState<TheoryTopic[]>([]);
  const [tutorStudents, setTutorStudents] = useState<TutorStudent[]>([]);
  const [levels, setLevels] = useState<TutorLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<number>>(new Set());
  const [filterReady, setFilterReady] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const filterInitialized = useRef(false);

  const [expandedTutors, setExpandedTutors] = useState<Set<number>>(new Set());
  const [expandedSubjects, setExpandedSubjects] = useState<Set<number>>(new Set());
  const [expandedTopics, setExpandedTopics] = useState<Set<number>>(new Set());

  const toggleFilter = useCallback((id: number) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // Уровни — конфигурационные данные, грузим один раз при монтировании
  useEffect(() => {
    getLevels().then(setLevels);
  }, []);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const isFirstLoad = !filterInitialized.current;
      const [topicsData, tsData] = await Promise.all([getTopics(), getTutors()]);
      setTopics(topicsData);
      setTutorStudents(tsData);

      // При первом запуске активируем уровни, назначенные ученику
      if (isFirstLoad) {
        filterInitialized.current = true;
        const myLevelIds = new Set(tsData.flatMap((ts: TutorStudent) => ts.level_ids));
        setActiveFilters(myLevelIds);
        setFilterReady(true);
      }

      // Авто-раскрытие если репетитор и предмет один
      const uniqueTutorIds = [...new Set(tsData.map((t: TutorStudent) => t.tutor_id))];
      if (uniqueTutorIds.length === 1) {
        setExpandedTutors(new Set<number>([uniqueTutorIds[0]]));
        const subjects = tsData.filter((t: TutorStudent) => t.tutor_id === uniqueTutorIds[0]);
        if (subjects.length === 1) {
          setExpandedSubjects(new Set<number>([subjects[0].subject_id]));
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(false);
    setRefreshing(false);
  }, [load]);

  const insets = useSafeAreaInsets();

  const toggleTutor = (id: number) => setExpandedTutors(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleSubject = (id: number) => setExpandedSubjects(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleTopic = (id: number) => setExpandedTopics(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // Только уровни, встречающиеся хотя бы в одной теме
  const usedLevelIds = new Set(topics.flatMap(t => t.level_ids));
  const filterOptions = levels.filter(l => usedLevelIds.has(l.id));

  // Build flat list с учётом фильтра
  const uniqueTutors = [...new Map(tutorStudents.map(t => [t.tutor_id, t])).values()];
  const listData: ListItem[] = [];

  for (const tutor of uniqueTutors) {
    listData.push({ type: 'tutor', tutorId: tutor.tutor_id, tutorName: tutor.tutor_name ?? 'Репетитор' });
    if (!expandedTutors.has(tutor.tutor_id)) continue;

    const subjects = tutorStudents.filter(ts => ts.tutor_id === tutor.tutor_id);
    for (const sub of subjects) {
      const subjectTopics = topics.filter(t => t.subject_id === sub.subject_id);
      const hasVisibleTopics = subjectTopics.some(t => topicVisible(t, subjectTopics, activeFilters));
      if (!hasVisibleTopics) continue;
      listData.push({ type: 'subject', subjectId: sub.subject_id, subjectName: sub.subject_name ?? 'Предмет' });
      if (!expandedSubjects.has(sub.subject_id)) continue;

      const rootTopics = subjectTopics
        .filter(t => t.parent_topic_id === null)
        .filter(t => topicVisible(t, subjectTopics, activeFilters));

      for (const topic of rootTopics) {
        const children = subjectTopics
          .filter(t => t.parent_topic_id === topic.id)
          .filter(t => topicVisible(t, subjectTopics, activeFilters));

        listData.push({ type: 'topic', topic, allTopics: subjectTopics, depth: 0 });
        if (expandedTopics.has(topic.id)) {
          for (const child of children) {
            listData.push({ type: 'topic', topic: child, allTopics: subjectTopics, depth: 1 });
          }
        }
      }
    }
  }

  if (loading || !filterReady) return <ActivityIndicator style={{ flex: 1 }} />;

  const isFiltered = activeFilters.size > 0;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        style={{ paddingTop: insets.top, backgroundColor: '#f5f5f5' }}
        data={listData}
        keyExtractor={(item) =>
          item.type === 'tutor' ? `tutor-${item.tutorId}` :
          item.type === 'subject' ? `subject-${item.subjectId}` :
          `topic-${item.topic.id}-d${item.depth}`
        }
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#2AABEE" />}
        ListEmptyComponent={<Text style={styles.emptyText}>Нет репетиторов</Text>}
        renderItem={({ item }) => {
          if (item.type === 'tutor') {
            const isOpen = expandedTutors.has(item.tutorId);
            return (
              <TouchableOpacity
                style={[styles.tutorHeader, isOpen && styles.tutorHeaderOpen]}
                onPress={() => toggleTutor(item.tutorId)}
                activeOpacity={0.75}
              >
                <View style={styles.tutorAvatar}>
                  <Text style={styles.tutorAvatarText}>{item.tutorName[0]?.toUpperCase() ?? '?'}</Text>
                </View>
                <Text style={styles.tutorName}>{item.tutorName}</Text>
                <Text style={styles.chevron}>{isOpen ? '˅' : '›'}</Text>
              </TouchableOpacity>
            );
          }

          if (item.type === 'subject') {
            const isOpen = expandedSubjects.has(item.subjectId);
            return (
              <TouchableOpacity
                style={[styles.subjectHeader, isOpen && styles.subjectHeaderOpen]}
                onPress={() => toggleSubject(item.subjectId)}
                activeOpacity={0.75}
              >
                <Text style={styles.subjectName}>{item.subjectName}</Text>
                <Text style={styles.chevronSmall}>{isOpen ? '˅' : '›'}</Text>
              </TouchableOpacity>
            );
          }

          const { topic, allTopics, depth } = item;
          const children = allTopics
            .filter(t => t.parent_topic_id === topic.id)
            .filter(t => topicVisible(t, allTopics, activeFilters));
          const hasChildren = children.length > 0;
          const isOpen = expandedTopics.has(topic.id);

          return (
            <TouchableOpacity
              style={[styles.topicRow, depth === 1 && styles.topicRowIndented]}
              activeOpacity={0.8}
              onPress={() => {
                if (hasChildren) {
                  toggleTopic(topic.id);
                } else {
                  navigation.navigate('TopicDetail', { topic, allTopics });
                }
              }}
            >
              {depth === 1 && <View style={styles.subtopicLine} />}
              <View style={styles.topicContent}>
                <Text style={styles.topicTitle}>{topic.title}</Text>
                {topic.description ? (
                  <Text style={styles.topicDesc} numberOfLines={1}>{topic.description}</Text>
                ) : null}
              </View>
              {hasChildren && (
                <View style={styles.topicRight}>
                  <View style={styles.childBadge}>
                    <Text style={styles.childBadgeText}>{children.length}</Text>
                  </View>
                  <Text style={styles.topicChevron}>{isOpen ? '˅' : '›'}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />

      {/* Кнопка фильтра — FAB внизу справа */}
      <TouchableOpacity
        style={[styles.filterFab, isFiltered && styles.filterFabActive]}
        onPress={() => setFilterModalVisible(true)}
        activeOpacity={0.75}
      >
        <Ionicons name="options-outline" size={24} color={isFiltered ? '#2AABEE' : '#888'} />
      </TouchableOpacity>

      {/* Модальное окно фильтра */}
      <Modal
        visible={filterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setFilterModalVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.filterPanel}>
            <Text style={styles.filterPanelTitle}>Уровень</Text>

            {filterOptions.length === 0 ? (
              <Text style={styles.filterEmpty}>У репетитора пока не указаны уровни для тем</Text>
            ) : (
              <View style={styles.chipsRow}>
                {/* Чип "Все" — сбросить фильтры */}
                <TouchableOpacity
                  style={[styles.chip, !isFiltered && styles.chipActive]}
                  onPress={() => setActiveFilters(new Set())}
                >
                  <Text style={[styles.chipText, !isFiltered && styles.chipTextActive]}>Все</Text>
                </TouchableOpacity>

                {filterOptions.map(level => {
                  const isActive = activeFilters.has(level.id);
                  return (
                    <TouchableOpacity
                      key={level.id}
                      style={[styles.chip, isActive && styles.chipActive]}
                      onPress={() => toggleFilter(level.id)}
                    >
                      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{level.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingTop: 8, gap: 0 },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 60 },

  // Кнопка фильтра
  filterFab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  filterFabActive: {
    backgroundColor: '#EFF9FF',
    shadowColor: '#2AABEE',
    shadowOpacity: 0.2,
  },

  // Репетитор
  tutorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginTop: 12,
    marginBottom: 2,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2AABEE',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tutorHeaderOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    marginBottom: 0,
  },
  tutorAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#2AABEE',
    alignItems: 'center', justifyContent: 'center',
  },
  tutorAvatarText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  tutorName: { flex: 1, fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  chevron: { fontSize: 20, color: '#2AABEE', fontWeight: '600' },

  // Предмет
  subjectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 14,
    paddingLeft: 20,
    backgroundColor: '#EFF9FF',
    borderLeftWidth: 4,
    borderLeftColor: '#2AABEE',
    marginBottom: 2,
  },
  subjectHeaderOpen: {
    borderBottomColor: '#daeef9',
    borderBottomWidth: 1,
  },
  subjectName: { fontSize: 13, fontWeight: '600', color: '#1a7bbf', textTransform: 'uppercase', letterSpacing: 0.4 },
  chevronSmall: { fontSize: 17, color: '#2AABEE' },

  // Тема
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f4f4',
    borderLeftWidth: 4,
    borderLeftColor: '#2AABEE',
    gap: 10,
  },
  topicRowIndented: {
    paddingLeft: 24,
    borderLeftColor: '#c8e8f8',
    backgroundColor: '#fafafa',
  },
  subtopicLine: {
    position: 'absolute',
    left: 16,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#d0eaf8',
  },
  topicContent: { flex: 1 },
  topicTitle: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  topicDesc: { fontSize: 12, color: '#aaa', marginTop: 2 },
  topicRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  childBadge: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  childBadgeText: { fontSize: 11, fontWeight: '700', color: '#1976D2' },
  topicChevron: { fontSize: 20, color: '#ccc' },

  // Модальный фильтр
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingBottom: 90,
    paddingRight: 20,
  },
  filterPanel: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    minWidth: 200,
    maxWidth: 290,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    gap: 10,
  },
  filterPanelTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#f4f4f4',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipActive: {
    backgroundColor: '#EFF9FF',
    borderColor: '#2AABEE',
  },
  chipText: { fontSize: 14, fontWeight: '500', color: '#555' },
  chipTextActive: { color: '#2AABEE', fontWeight: '700' },
  filterEmpty: { fontSize: 13, color: '#bbb', fontStyle: 'italic' },
});
