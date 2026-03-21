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
  | { type: 'tutor-header'; tutorName: string }
  | { type: 'subject-header'; subjectName: string }
  | { type: 'topic'; topic: TheoryTopic; allTopics: TheoryTopic[] };

export default function MaterialsScreen({ navigation }: Props) {
  const [topics, setTopics] = useState<TheoryTopic[]>([]);
  const [tutorStudents, setTutorStudents] = useState<TutorStudent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [topicsData, tsData] = await Promise.all([getTopics(), getTutors()]);
      setTopics(topicsData);
      setTutorStudents(tsData);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const insets = useSafeAreaInsets();

  // Build grouped flat list
  const listData: ListItem[] = [];
  const seenTutors = new Set<number>();
  for (const ts of tutorStudents) {
    if (!seenTutors.has(ts.tutor_id)) {
      seenTutors.add(ts.tutor_id);
      listData.push({ type: 'tutor-header', tutorName: ts.tutor_name ?? 'Репетитор' });
    }
    listData.push({ type: 'subject-header', subjectName: ts.subject_name ?? 'Предмет' });
    const rootTopics = topics.filter(t => t.subject_id === ts.subject_id && t.parent_topic_id === null);
    rootTopics.forEach(topic => listData.push({ type: 'topic', topic, allTopics: topics }));
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;

  return (
    <FlatList
      style={{ paddingTop: insets.top, backgroundColor: '#f5f5f5' }}
      data={listData}
      keyExtractor={(item, idx) =>
        item.type === 'topic' ? `topic-${item.topic.id}` :
        item.type === 'tutor-header' ? `tutor-${item.tutorName}-${idx}` :
        `subject-${item.subjectName}-${idx}`
      }
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={styles.empty}>Тем пока нет</Text>}
      renderItem={({ item }) => {
        if (item.type === 'tutor-header') {
          return (
            <View style={styles.tutorHeader}>
              <Text style={styles.tutorHeaderText}>{item.tutorName}</Text>
            </View>
          );
        }
        if (item.type === 'subject-header') {
          return (
            <View style={styles.subjectHeader}>
              <Text style={styles.subjectHeaderText}>{item.subjectName}</Text>
            </View>
          );
        }
        const { topic, allTopics } = item;
        const childCount = allTopics.filter(t => t.parent_topic_id === topic.id).length;
        return (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('TopicDetail', { topic, allTopics })}
          >
            <View style={styles.cardContent}>
              <Text style={styles.title}>{topic.title}</Text>
              {topic.description ? (
                <Text style={styles.desc} numberOfLines={2}>{topic.description}</Text>
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
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  tutorHeader: { marginTop: 8, marginBottom: 4, paddingHorizontal: 4 },
  tutorHeaderText: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  subjectHeader: { marginTop: 12, marginBottom: 6, paddingHorizontal: 4 },
  subjectHeaderText: { fontSize: 13, fontWeight: '600', color: '#2AABEE', textTransform: 'uppercase', letterSpacing: 0.5 },
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
  empty: { textAlign: 'center', color: '#999', marginTop: 60 },
});
