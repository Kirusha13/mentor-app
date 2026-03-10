import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getMaterials, Material, TheoryTopic } from '../../api/materials';
import { MaterialsStackParamList } from '../../navigation/AppNavigator';

type Props = {
  navigation: NativeStackNavigationProp<MaterialsStackParamList, 'TopicDetail'>;
  route: RouteProp<MaterialsStackParamList, 'TopicDetail'>;
};

const FORMAT_ICON: Record<Material['format'], string> = {
  text: '📄',
  pdf: '📕',
  video: '🎬',
  presentation: '📊',
  image: '🖼️',
  link: '🔗',
};

const FORMAT_LABEL: Record<Material['format'], string> = {
  text: 'Текст',
  pdf: 'PDF',
  video: 'Видео',
  presentation: 'Презентация',
  image: 'Изображение',
  link: 'Ссылка',
};

const LEVEL_LABEL: Record<Material['level'], string> = {
  basic: 'Базовый',
  advanced: 'Углублённый',
};

export default function TopicDetailScreen({ navigation, route }: Props) {
  const { topic, allTopics } = route.params;
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMaterials({ topic_id: topic.id }).then(setMaterials).finally(() => setLoading(false));
  }, [topic.id]);

  const children = allTopics.filter((t) => t.parent_topic_id === topic.id);
  const parent = topic.parent_topic_id ? allTopics.find((t) => t.id === topic.parent_topic_id) : null;

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Материалы */}
        {loading ? (
          <ActivityIndicator style={{ marginTop: 32 }} />
        ) : materials.length === 0 ? (
          <Text style={styles.empty}>Материалов пока нет</Text>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Материалы</Text>
            {materials.map((m) => (
              <View key={m.id} style={styles.materialCard}>
                <View style={styles.materialHeader}>
                  <Text style={styles.materialIcon}>{FORMAT_ICON[m.format]}</Text>
                  <Text style={styles.materialFormat}>{FORMAT_LABEL[m.format]}</Text>
                  <View style={[styles.levelBadge, m.level === 'advanced' && styles.levelAdvanced]}>
                    <Text style={styles.levelText}>{LEVEL_LABEL[m.level]}</Text>
                  </View>
                </View>
                {m.content_text ? (
                  <Text style={styles.materialText}>{m.content_text}</Text>
                ) : (
                  <TouchableOpacity onPress={() => Linking.openURL(m.content_url!)}>
                    <Text style={styles.materialLink}>{m.content_url}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </>
        )}

        {/* Подтемы */}
        {children.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Подтемы</Text>
            {children.map((child) => (
              <TouchableOpacity
                key={child.id}
                style={styles.topicCard}
                onPress={() => navigation.push('TopicDetail', { topic: child, allTopics })}
              >
                <Text style={styles.topicTitle}>{child.title}</Text>
                <Text style={styles.arrow}>›</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Родительская тема */}
        {parent && (
          <>
            <Text style={styles.sectionTitle}>Родительская тема</Text>
            <TouchableOpacity
              style={[styles.topicCard, styles.parentCard]}
              onPress={() => navigation.push('TopicDetail', { topic: parent, allTopics })}
            >
              <Text style={styles.arrow}>‹</Text>
              <Text style={styles.topicTitle}>{parent.title}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 32 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 8,
  },
  materialCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  materialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  materialIcon: { fontSize: 20 },
  materialFormat: { fontSize: 12, color: '#999', fontWeight: '700', flex: 1 },
  materialText: { fontSize: 15, color: '#333', lineHeight: 24 },
  materialLink: { fontSize: 14, color: '#2AABEE', textDecorationLine: 'underline', lineHeight: 22 },
  levelBadge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  levelAdvanced: { backgroundColor: '#FFF3E0' },
  levelText: { fontSize: 11, fontWeight: '600', color: '#555' },
  topicCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  parentCard: { flexDirection: 'row', gap: 8 },
  topicTitle: { fontSize: 15, fontWeight: '500', color: '#1a1a1a', flex: 1 },
  arrow: { fontSize: 22, color: '#ccc' },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
});
