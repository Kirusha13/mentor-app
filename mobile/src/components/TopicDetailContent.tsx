import React, { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getMaterials, Material, TheoryTopic } from '../api/materials';

const FORMAT_ICON: Record<Material['format'], keyof typeof Ionicons.glyphMap> = {
  text: 'document-text-outline',
  pdf: 'document-outline',
  video: 'play-circle-outline',
  presentation: 'easel-outline',
  image: 'image-outline',
  link: 'link-outline',
};

const FORMAT_ICON_COLOR: Record<Material['format'], string> = {
  text: '#607D8B',
  pdf: '#D32F2F',
  video: '#1565C0',
  presentation: '#2E7D32',
  image: '#6A1B9A',
  link: '#2AABEE',
};

const FORMAT_LABEL: Record<Material['format'], string> = {
  text: 'Текст',
  pdf: 'PDF',
  video: 'Видео',
  presentation: 'Презентация',
  image: 'Изображение',
  link: 'Ссылка',
};

interface Props {
  topic: TheoryTopic;
  allTopics: TheoryTopic[];
  onNavigateTopic?: (topic: TheoryTopic) => void;
}

export default function TopicDetailContent({ topic, allTopics, onNavigateTopic }: Props) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getMaterials({ topic_id: topic.id }).then(setMaterials).finally(() => setLoading(false));
  }, [topic.id]);

  const children = allTopics.filter((t) => t.parent_topic_id === topic.id);
  const parent = topic.parent_topic_id ? allTopics.find((t) => t.id === topic.parent_topic_id) : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
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
                <Ionicons name={FORMAT_ICON[m.format]} size={20} color={FORMAT_ICON_COLOR[m.format]} />
                <Text style={styles.materialFormat}>{FORMAT_LABEL[m.format]}</Text>
                <Ionicons
                  name={m.level === 'advanced' ? 'rocket' : 'school-outline'}
                  size={16}
                  color={m.level === 'advanced' ? '#FF9800' : '#2AABEE'}
                />
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

      {children.length > 0 && onNavigateTopic && (
        <>
          <Text style={styles.sectionTitle}>Подтемы</Text>
          {children.map((child) => (
            <TouchableOpacity
              key={child.id}
              style={styles.topicCard}
              onPress={() => onNavigateTopic(child)}
            >
              <Text style={styles.topicTitle}>{child.title}</Text>
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>
          ))}
        </>
      )}

      {parent && onNavigateTopic && (
        <>
          <Text style={styles.sectionTitle}>Родительская тема</Text>
          <TouchableOpacity
            style={[styles.topicCard, styles.parentCard]}
            onPress={() => onNavigateTopic(parent)}
          >
            <Text style={styles.arrow}>‹</Text>
            <Text style={styles.topicTitle}>{parent.title}</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
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
  materialFormat: { fontSize: 12, color: '#999', fontWeight: '700', flex: 1 },
  materialText: { fontSize: 15, color: '#333', lineHeight: 24 },
  materialLink: { fontSize: 14, color: '#2AABEE', textDecorationLine: 'underline', lineHeight: 22 },
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
