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

type ListItem =
  | { type: 'tutor'; tutorId: number; tutorName: string }
  | { type: 'subject'; subjectId: number; subjectName: string }
  | { type: 'topic'; topic: TheoryTopic; allTopics: TheoryTopic[]; depth: number };

export default function MaterialsScreen({ navigation }: Props) {
  const [topics, setTopics] = useState<TheoryTopic[]>([]);
  const [tutorStudents, setTutorStudents] = useState<TutorStudent[]>([]);
  const [loading, setLoading] = useState(true);

  const [expandedTutors, setExpandedTutors] = useState<Set<number>>(new Set());
  const [expandedSubjects, setExpandedSubjects] = useState<Set<number>>(new Set());
  const [expandedTopics, setExpandedTopics] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    try {
      const [topicsData, tsData] = await Promise.all([getTopics(), getTutors()]);
      setTopics(topicsData);
      setTutorStudents(tsData);

      // Авто-раскрытие если репетитор и предмет один
      const uniqueTutorIds = [...new Set(tsData.map(t => t.tutor_id))];
      if (uniqueTutorIds.length === 1) {
        setExpandedTutors(new Set([uniqueTutorIds[0]]));
        const subjects = tsData.filter(t => t.tutor_id === uniqueTutorIds[0]);
        if (subjects.length === 1) {
          setExpandedSubjects(new Set([subjects[0].subject_id]));
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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

  // Build flat list
  const uniqueTutors = [...new Map(tutorStudents.map(t => [t.tutor_id, t])).values()];
  const listData: ListItem[] = [];

  for (const tutor of uniqueTutors) {
    listData.push({ type: 'tutor', tutorId: tutor.tutor_id, tutorName: tutor.tutor_name ?? 'Репетитор' });
    if (!expandedTutors.has(tutor.tutor_id)) continue;

    const subjects = tutorStudents.filter(ts => ts.tutor_id === tutor.tutor_id);
    for (const sub of subjects) {
      listData.push({ type: 'subject', subjectId: sub.subject_id, subjectName: sub.subject_name ?? 'Предмет' });
      if (!expandedSubjects.has(sub.subject_id)) continue;

      const rootTopics = topics.filter(t => t.subject_id === sub.subject_id && t.parent_topic_id === null);
      for (const topic of rootTopics) {
        const children = topics.filter(t => t.parent_topic_id === topic.id);
        listData.push({ type: 'topic', topic, allTopics: topics, depth: 0 });
        if (expandedTopics.has(topic.id)) {
          for (const child of children) {
            listData.push({ type: 'topic', topic: child, allTopics: topics, depth: 1 });
          }
        }
      }
    }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;

  return (
    <FlatList
      style={{ paddingTop: insets.top, backgroundColor: '#f5f5f5' }}
      data={listData}
      keyExtractor={(item, idx) =>
        item.type === 'tutor' ? `tutor-${item.tutorId}` :
        item.type === 'subject' ? `subject-${item.subjectId}` :
        `topic-${item.topic.id}-d${item.depth}`
      }
      contentContainerStyle={styles.list}
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

        // topic at depth 0 or 1
        const { topic, allTopics, depth } = item;
        const children = allTopics.filter(t => t.parent_topic_id === topic.id);
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
            <View style={styles.topicRight}>
              {hasChildren && (
                <View style={styles.childBadge}>
                  <Text style={styles.childBadgeText}>{children.length}</Text>
                </View>
              )}
              <Text style={styles.topicChevron}>
                {hasChildren ? (isOpen ? '˅' : '›') : '›'}
              </Text>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingTop: 8, gap: 0 },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 60 },

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
});
