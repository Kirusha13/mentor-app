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
import { MaterialsStackParamList } from '../../navigation/AppNavigator';

type Props = {
  navigation: NativeStackNavigationProp<MaterialsStackParamList, 'TopicsList'>;
};

export default function MaterialsScreen({ navigation }: Props) {
  const [topics, setTopics] = useState<TheoryTopic[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await getTopics();
      setTopics(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Только корневые темы (без родителя) на главном экране
  const rootTopics = topics.filter((t) => t.parent_topic_id === null);

  const insets = useSafeAreaInsets();
  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;

  return (
    <FlatList
      style={{ paddingTop: insets.top }}
      data={rootTopics}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={styles.empty}>Тем пока нет</Text>}
      renderItem={({ item }) => {
        const childCount = topics.filter((t) => t.parent_topic_id === item.id).length;
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
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardContent: { flex: 1, marginRight: 8 },
  title: { fontSize: 16, fontWeight: '600', color: '#1a1a1a', marginBottom: 4 },
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
