import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import {
  Assignment,
  deleteAssignmentPhoto,
  updateAssignment,
  uploadAssignmentPhoto,
} from '../../api/assignments';
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

type Props = NativeStackScreenProps<AssignmentsStackParamList, 'AssignmentDetail'>;

export default function AssignmentDetailScreen({ route }: Props) {
  const [assignment, setAssignment] = useState<Assignment>(route.params.assignment);
  const [comment, setComment] = useState(assignment.student_comment ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);

  const deadline = new Date(assignment.deadline);
  const isOverdue = deadline < new Date() && assignment.completion_status !== 'completed';
  const isCompleted = assignment.completion_status === 'completed';
  const isEditable = !isCompleted;
  const files = assignment.student_files ?? [];
  const tutorFiles = assignment.attachments
    ? Object.values(assignment.attachments).filter((v): v is string => typeof v === 'string')
    : [];
  const completedAt = isCompleted ? new Date(assignment.updated_at) : null;

  // Автопереход assigned → in_progress при открытии экрана
  useEffect(() => {
    if (assignment.completion_status === 'assigned') {
      updateAssignment(assignment.id, { completion_status: 'in_progress' })
        .then(updated => setAssignment(updated))
        .catch(() => {});
    }
  }, []);

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
          {completedAt && (
            <Text style={styles.completedAt}>
              Выполнено {completedAt.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
          {assignment.grade != null && (
            <View style={styles.gradeRow}>
              <Text style={styles.gradeLabel}>Оценка:</Text>
              <View style={styles.gradeBadge}>
                <Text style={styles.gradeText}>{assignment.grade}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Описание задания */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Задание</Text>
          <Text style={styles.description}>{assignment.description}</Text>
        </View>

        {/* Вложения репетитора */}
        {tutorFiles.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Материалы к заданию</Text>
            {tutorFiles.map((url, i) => {
              const fullUrl = url.startsWith('/') ? `${API_BASE}${url}` : url;
              const label = url.split('/').pop() ?? url;
              return (
                <TouchableOpacity key={i} onPress={() => Linking.openURL(fullUrl)}>
                  <Text style={styles.attachmentLink}>{label}</Text>
                </TouchableOpacity>
              );
            })}
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
                  <View key={url} style={styles.photoWrapper}>
                    <Image
                      source={{ uri: `${API_BASE}${url}` }}
                      style={styles.photo}
                      resizeMode="cover"
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
                  </View>
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
  completedAt: { fontSize: 12, color: '#4CAF50', fontWeight: '600' },
  attachmentLink: { fontSize: 14, color: '#2AABEE', textDecorationLine: 'underline', paddingVertical: 4 },
  gradeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gradeLabel: { fontSize: 14, color: '#888' },
  gradeBadge: {
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#FFD54F',
  },
  gradeText: { fontSize: 14, fontWeight: '700', color: '#F57F17' },

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
});
