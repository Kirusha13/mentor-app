import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  Assignment,
  deleteAssignmentPhoto,
  updateAssignment,
  uploadAssignmentPhoto,
} from '../../api/assignments';
import { getTopicContext, TheoryTopic } from '../../api/materials';
import TopicModal from '../../components/TopicModal';
import { AssignmentsStackParamList } from '../../navigation/AppNavigator';
import { API_BASE_URL } from '../../api/client';

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

const API_BASE = API_BASE_URL.replace('/api/v1', '');

function gradeColor(grade: number) {
  if (grade >= 5) return { backgroundColor: '#E8F5E9', borderColor: '#A5D6A7', text: '#2E7D32' };
  if (grade === 4) return { backgroundColor: '#E3F2FD', borderColor: '#90CAF9', text: '#1565C0' };
  if (grade === 3) return { backgroundColor: '#FFF8E1', borderColor: '#FFD54F', text: '#E65100' };
  return { backgroundColor: '#FFEBEE', borderColor: '#EF9A9A', text: '#C62828' };
}

type Props = NativeStackScreenProps<AssignmentsStackParamList, 'AssignmentDetail'>;

export default function AssignmentDetailScreen({ route }: Props) {
  const { width, height } = useWindowDimensions();
  const [assignment, setAssignment] = useState<Assignment>(route.params.assignment);
  const [comment, setComment] = useState(assignment.student_comment ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [topicModalVisible, setTopicModalVisible] = useState(false);
  const [topicContext, setTopicContext] = useState<{ topic: TheoryTopic; allTopics: TheoryTopic[] } | null>(null);
  const [topicLoading, setTopicLoading] = useState(false);

  const deadline = new Date(assignment.deadline);
  const isOverdue = deadline < new Date() && assignment.completion_status !== 'completed';
  const isCompleted = assignment.completion_status === 'completed';
  const isEditable = !isCompleted;
  const files = assignment.student_files ?? [];
  const tutorLinks = assignment.attachments?.links ?? [];
  const tutorFilesB64 = assignment.attachments?.files ?? [];
  const completedAt = isCompleted ? new Date(assignment.updated_at) : null;

  // Автопереход assigned → in_progress при открытии экрана
  useEffect(() => {
    if (assignment.completion_status === 'assigned') {
      updateAssignment(assignment.id, { completion_status: 'in_progress' })
        .then(updated => setAssignment(updated))
        .catch(() => {});
    }
  }, []);

  // ─── Открыть тему ────────────────────────────────────────────────────────

  const handleOpenTopic = async () => {
    if (!assignment.topic_id) return;
    setTopicLoading(true);
    setTopicModalVisible(true);
    try {
      const ctx = await getTopicContext(assignment.topic_id);
      setTopicContext(ctx);
    } catch {
      setTopicModalVisible(false);
    } finally {
      setTopicLoading(false);
    }
  };

  // ─── Отправить ответ ──────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!comment.trim() && files.length === 0) {
      Alert.alert('Пустой ответ', 'Напиши текстовый ответ или прикрепи фото перед отправкой');
      return;
    }
    Alert.alert('Отправить ответ?', 'После отправки задание будет помечено как выполненное', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Отправить',
        onPress: async () => {
          setSubmitting(true);
          try {
            const updated = await updateAssignment(assignment.id, {
              student_comment: comment.trim() || undefined,
              completion_status: 'completed',
            });
            setAssignment(updated);
          } catch {
            Alert.alert('Ошибка', 'Не удалось отправить ответ');
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  };

  // ─── Добавить фото ────────────────────────────────────────────────────────

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Нет доступа', 'Разрешите доступ к фотографиям в настройках');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.8,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    const filename = asset.uri.split('/').pop() ?? 'photo.jpg';

    setUploadingPhoto(true);
    try {
      const updated = await uploadAssignmentPhoto(assignment.id, asset.uri, filename);
      setAssignment(updated);
    } catch (e: any) {
      const msg = e?.response?.data?.detail ?? e?.message ?? String(e);
      Alert.alert('Ошибка загрузки', msg);
      console.error('uploadAssignmentPhoto error:', e?.response?.status, e?.response?.data, e?.message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  // ─── Удалить фото ─────────────────────────────────────────────────────────

  const handleDeletePhoto = (fileUrl: string) => {
    Alert.alert('Удалить фото?', '', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          setDeletingUrl(fileUrl);
          try {
            const updated = await deleteAssignmentPhoto(assignment.id, fileUrl);
            setAssignment(updated);
          } catch {
            Alert.alert('Ошибка', 'Не удалось удалить фото');
          } finally {
            setDeletingUrl(null);
          }
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Статус и дедлайн */}
        <View style={styles.section}>
          <View style={styles.row}>
            <View style={[styles.badge, { backgroundColor: STATUS_COLOR[assignment.completion_status] }]}>
              <Text style={styles.badgeText}>{STATUS_LABEL[assignment.completion_status]}</Text>
            </View>
            <Text style={[styles.deadline, isOverdue && { color: '#F44336' }]}>
              до {deadline.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          {(completedAt || assignment.topic_title || assignment.grade != null) && (
            <View style={styles.infoGrid}>
              {completedAt && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Сдано</Text>
                  <Text style={styles.infoValue}>
                    {completedAt.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              )}
              {assignment.topic_title && (
                <TouchableOpacity style={styles.infoRow} onPress={handleOpenTopic} activeOpacity={0.7}>
                  <Text style={styles.infoLabel}>Тема</Text>
                  <View style={styles.topicValueWrap}>
                    <Text style={styles.topicValueText} numberOfLines={1}>{assignment.topic_title}</Text>
                    <Ionicons name="chevron-forward" size={14} color="#2AABEE" />
                  </View>
                </TouchableOpacity>
              )}
              {assignment.grade != null && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Оценка</Text>
                  <View style={[styles.gradeBadge, gradeColor(assignment.grade)]}>
                    <Text style={[styles.gradeText, { color: gradeColor(assignment.grade).text }]}>{assignment.grade}</Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Описание задания */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Задание</Text>
          <Text style={styles.description}>{assignment.description}</Text>
        </View>

        {/* Вложения репетитора */}
        {(tutorLinks.length > 0 || tutorFilesB64.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Материалы к заданию</Text>
            {tutorLinks.map((link, i) => (
              <TouchableOpacity key={`link-${i}`} onPress={() => Linking.openURL(link.url)}>
                <Text style={styles.attachmentLink}>{link.label || link.url}</Text>
              </TouchableOpacity>
            ))}
            {tutorFilesB64.length > 0 && (
              <View style={styles.photosGrid}>
                {tutorFilesB64.map((file, i) =>
                  file.type?.startsWith('image/') ? (
                    <TouchableOpacity key={`file-${i}`} style={styles.photoWrapper} activeOpacity={0.85} onPress={() => setLightboxUri(file.data_url)}>
                      <Image source={{ uri: file.data_url }} style={styles.photo} resizeMode="cover" />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity key={`file-${i}`} onPress={() => Linking.openURL(file.data_url)}>
                      <Text style={styles.attachmentLink}>{file.name}</Text>
                    </TouchableOpacity>
                  )
                )}
              </View>
            )}
          </View>
        )}

        {/* Текстовый ответ: при редактировании всегда, при просмотре — только если есть */}
        {(isEditable || !!comment) && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{isCompleted ? 'Мой ответ' : 'Напиши ответ'}</Text>
            {isEditable ? (
              <TextInput
                style={styles.commentInput}
                value={comment}
                onChangeText={setComment}
                placeholder="Текстовый ответ или комментарий к фото..."
                placeholderTextColor="#bbb"
                multiline
                textAlignVertical="top"
              />
            ) : (
              <Text style={styles.commentReadonly}>{comment}</Text>
            )}
          </View>
        )}

        {/* Фотографии: при редактировании всегда, при просмотре — только если есть */}
        {(isEditable || files.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Фотографии</Text>
            {files.length > 0 && (
              <View style={styles.photosGrid}>
                {files.map((url) => (
                  <TouchableOpacity key={url} style={styles.photoWrapper} activeOpacity={0.85} onPress={() => setLightboxUri(`${API_BASE}${url}`)}>
                    <Image
                      source={{ uri: `${API_BASE}${url}` }}
                      style={styles.photo}
                      resizeMode="cover"
                      onError={() => {}}
                    />
                    {isEditable && (
                      deletingUrl === url ? (
                        <View style={styles.photoOverlay}>
                          <ActivityIndicator color="#fff" />
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.photoDeleteBtn}
                          onPress={() => handleDeletePhoto(url)}
                        >
                          <Text style={styles.photoDeleteText}>✕</Text>
                        </TouchableOpacity>
                      )
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {isEditable && (
              <TouchableOpacity
                style={[styles.addPhotoBtn, uploadingPhoto && { opacity: 0.6 }]}
                onPress={handlePickPhoto}
                disabled={uploadingPhoto}
              >
                {uploadingPhoto
                  ? <ActivityIndicator color="#2AABEE" />
                  : <Text style={styles.addPhotoBtnText}>+ Добавить фото</Text>
                }
              </TouchableOpacity>
            )}
          </View>
        )}

      </ScrollView>

      {isEditable && (
        <View style={styles.submitContainer}>
          <TouchableOpacity
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>Отправить ответ</Text>
            }
          </TouchableOpacity>
        </View>
      )}

      <TopicModal
        visible={topicModalVisible}
        topic={topicContext?.topic ?? null}
        allTopics={topicContext?.allTopics ?? []}
        loading={topicLoading}
        onClose={() => setTopicModalVisible(false)}
      />

      <Modal visible={!!lightboxUri} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setLightboxUri(null)}>
        <TouchableWithoutFeedback onPress={() => setLightboxUri(null)}>
          <View style={styles.lightboxBackdrop}>
            <StatusBar hidden />
            {lightboxUri && (
              <Image
                source={{ uri: lightboxUri }}
                style={{ width, height }}
                resizeMode="contain"
              />
            )}
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, paddingBottom: 40, backgroundColor: '#f5f5f5' },

  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  badgeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  deadline: { fontSize: 13, color: '#888' },
  infoGrid: { borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 10, gap: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  infoLabel: { fontSize: 13, color: '#aaa', fontWeight: '600' },
  infoValue: { fontSize: 13, color: '#333', fontWeight: '500' },
  attachmentLink: { fontSize: 14, color: '#2AABEE', textDecorationLine: 'underline', paddingVertical: 4 },
  gradeBadge: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1.5,
  },
  gradeText: { fontSize: 17, fontWeight: '800' },

  topicValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'flex-end' },
  topicValueText: { fontSize: 13, color: '#2AABEE', fontWeight: '500', flexShrink: 1, textAlign: 'right' },
  description: { fontSize: 15, color: '#333', lineHeight: 22 },

  commentInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#1a1a1a',
    minHeight: 110,
    backgroundColor: '#fafafa',
  },
  commentReadonly: { fontSize: 15, color: '#333', lineHeight: 22 },
  commentEmpty: { fontSize: 14, color: '#bbb', fontStyle: 'italic' },

  photosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoWrapper: { width: 100, height: 100, borderRadius: 10, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoDeleteBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoDeleteText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  addPhotoBtn: {
    borderWidth: 1.5,
    borderColor: '#2AABEE',
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addPhotoBtnText: { color: '#2AABEE', fontWeight: '600', fontSize: 15 },

  submitContainer: {
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderTopWidth: 1,
    borderTopColor: '#e8e8e8',
  },
  submitBtn: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  lightboxBackdrop: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
