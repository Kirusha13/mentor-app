import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getTopics, TheoryTopic } from '../../api/materials';
import { getTutors, TutorStudent } from '../../api/student';
import { MaterialsStackParamList } from '../../navigation/AppNavigator';

type Props = {
  navigation: NativeStackNavigationProp<MaterialsStackParamList, 'TopicsList'>;
};

export default function MaterialsScreen({ navigation }: Props) {
  const [topics, setTopics] = useState<TheoryTopic[]>([]);
  const [tutorStudents, setTutorStudents] = useState<TutorStudent[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTutorId, setSelectedTutorId] = useState<number | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [tutorDropdownOpen, setTutorDropdownOpen] = useState(false);
  const [subjectDropdownOpen, setSubjectDropdownOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [topicsData, tsData] = await Promise.all([getTopics(), getTutors()]);
      setTopics(topicsData);
      setTutorStudents(tsData);

      // Авто-выбор если данные однозначные
      const uniqueTutors = [...new Map(tsData.map(t => [t.tutor_id, t])).values()];
      if (uniqueTutors.length === 1) {
        setSelectedTutorId(uniqueTutors[0].tutor_id);
        const subjects = tsData.filter(t => t.tutor_id === uniqueTutors[0].tutor_id);
        if (subjects.length === 1) {
          setSelectedSubjectId(subjects[0].subject_id);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const insets = useSafeAreaInsets();

  // Уникальные репетиторы
  const uniqueTutors = [...new Map(tutorStudents.map(t => [t.tutor_id, t])).values()];

  // Предметы для выбранного репетитора
  const subjectsForTutor = selectedTutorId !== null
    ? tutorStudents.filter(ts => ts.tutor_id === selectedTutorId)
    : [];

  // Топики для выбранного предмета
  const rootTopics = selectedSubjectId !== null
    ? topics.filter(t => t.subject_id === selectedSubjectId && t.parent_topic_id === null)
    : [];

  const selectedTutorName = uniqueTutors.find(t => t.tutor_id === selectedTutorId)?.tutor_name ?? null;
  const selectedSubjectName = subjectsForTutor.find(t => t.subject_id === selectedSubjectId)?.subject_name ?? null;

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f5', paddingTop: insets.top }}>
      {/* Фильтры */}
      <View style={styles.filters}>
        {/* Репетитор */}
        {uniqueTutors.length === 1 ? (
          <View style={styles.filterSingle}>
            <Text style={styles.filterSingleLabel}>Репетитор</Text>
            <Text style={styles.filterSingleValue}>{uniqueTutors[0].tutor_name ?? 'Репетитор'}</Text>
          </View>
        ) : (
          <View style={styles.dropdownWrapper}>
            <TouchableOpacity
              style={styles.dropdownTrigger}
              onPress={() => { setTutorDropdownOpen(o => !o); setSubjectDropdownOpen(false); }}
            >
              <Text style={selectedTutorId !== null ? styles.dropdownValue : styles.dropdownPlaceholder}>
                {selectedTutorName ?? 'Выберите репетитора'}
              </Text>
              <Text style={styles.chevron}>{tutorDropdownOpen ? '˄' : '˅'}</Text>
            </TouchableOpacity>
            {tutorDropdownOpen && (
              <View style={styles.dropdownList}>
                {uniqueTutors.map((ts, idx) => (
                  <TouchableOpacity
                    key={ts.tutor_id}
                    style={[
                      styles.dropdownItem,
                      ts.tutor_id === selectedTutorId && styles.dropdownItemSelected,
                      idx === uniqueTutors.length - 1 && { borderBottomWidth: 0 },
                    ]}
                    onPress={() => {
                      setSelectedTutorId(ts.tutor_id);
                      setSelectedSubjectId(null);
                      setTutorDropdownOpen(false);
                    }}
                  >
                    <Text style={[
                      styles.dropdownItemText,
                      ts.tutor_id === selectedTutorId && styles.dropdownItemTextSelected,
                    ]}>
                      {ts.tutor_name ?? 'Репетитор'}
                    </Text>
                    {ts.tutor_id === selectedTutorId && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Предмет */}
        {selectedTutorId !== null && (
          subjectsForTutor.length === 1 ? (
            <View style={styles.filterSingle}>
              <Text style={styles.filterSingleLabel}>Предмет</Text>
              <Text style={styles.filterSingleValue}>{subjectsForTutor[0].subject_name ?? 'Предмет'}</Text>
            </View>
          ) : (
            <View style={styles.dropdownWrapper}>
              <TouchableOpacity
                style={styles.dropdownTrigger}
                onPress={() => { setSubjectDropdownOpen(o => !o); setTutorDropdownOpen(false); }}
              >
                <Text style={selectedSubjectId !== null ? styles.dropdownValue : styles.dropdownPlaceholder}>
                  {selectedSubjectName ?? 'Выберите предмет'}
                </Text>
                <Text style={styles.chevron}>{subjectDropdownOpen ? '˄' : '˅'}</Text>
              </TouchableOpacity>
              {subjectDropdownOpen && (
                <View style={styles.dropdownList}>
                  {subjectsForTutor.map((ts, idx) => (
                    <TouchableOpacity
                      key={ts.subject_id}
                      style={[
                        styles.dropdownItem,
                        ts.subject_id === selectedSubjectId && styles.dropdownItemSelected,
                        idx === subjectsForTutor.length - 1 && { borderBottomWidth: 0 },
                      ]}
                      onPress={() => {
                        setSelectedSubjectId(ts.subject_id);
                        setSubjectDropdownOpen(false);
                      }}
                    >
                      <Text style={[
                        styles.dropdownItemText,
                        ts.subject_id === selectedSubjectId && styles.dropdownItemTextSelected,
                      ]}>
                        {ts.subject_name ?? 'Предмет'}
                      </Text>
                      {ts.subject_id === selectedSubjectId && <Text style={styles.checkmark}>✓</Text>}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )
        )}
      </View>

      {/* Список топиков */}
      {selectedSubjectId === null ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>
            {selectedTutorId === null ? 'Выберите репетитора' : 'Выберите предмет'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={rootTopics}
          keyExtractor={item => `topic-${item.id}`}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>Тем пока нет</Text>}
          renderItem={({ item }) => {
            const childCount = topics.filter(t => t.parent_topic_id === item.id).length;
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => navigation.navigate('TopicDetail', { topic: item, allTopics: topics })}
              >
                <View style={styles.cardContent}>
                  <Text style={styles.title}>{item.title}</Text>
                  {item.description ? (
                    <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
                  ) : null}
                </View>
                <View style={styles.meta}>
                  {childCount > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{childCount} подтем</Text>
                    </View>
                  )}
                  <Text style={styles.arrow}>›</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  filters: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    zIndex: 10,
  },

  filterSingle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  filterSingleLabel: { fontSize: 13, color: '#aaa', fontWeight: '500' },
  filterSingleValue: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },

  dropdownWrapper: { zIndex: 20 },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    backgroundColor: '#fafafa',
  },
  dropdownPlaceholder: { fontSize: 15, color: '#bbb', flex: 1 },
  dropdownValue: { fontSize: 15, fontWeight: '600', color: '#1a1a1a', flex: 1 },
  chevron: { fontSize: 16, color: '#aaa', marginLeft: 8 },
  dropdownList: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 100,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  dropdownItemSelected: { backgroundColor: '#EFF9FF' },
  dropdownItemText: { flex: 1, fontSize: 15, color: '#333', fontWeight: '500' },
  dropdownItemTextSelected: { color: '#2AABEE', fontWeight: '600' },
  checkmark: { fontSize: 15, color: '#2AABEE', fontWeight: '700' },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 60 },

  list: { padding: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  cardContent: { flex: 1, marginRight: 8 },
  title: { fontSize: 15, fontWeight: '600', color: '#1a1a1a', marginBottom: 4 },
  desc: { fontSize: 13, color: '#888', lineHeight: 18 },
  meta: { alignItems: 'flex-end', gap: 6 },
  badge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: { fontSize: 11, color: '#1976D2', fontWeight: '600' },
  arrow: { fontSize: 22, color: '#ccc', lineHeight: 24 },
});
