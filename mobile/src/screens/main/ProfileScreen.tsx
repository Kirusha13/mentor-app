import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { getStudentMe, getTutors, StudentProfile, TutorStudent, updateStudentMe, uploadStudentAvatar } from '../../api/student';
import { API_BASE_URL } from '../../api/client';
import JoinScreen from './JoinScreen';

const MONTHS_RU = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}`;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function Avatar({ hasAvatar, avatarUrl, name, token, onPress }: {
  hasAvatar: boolean; avatarUrl: string | null; name: string; token: string | null; onPress: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const uri = avatarUrl?.startsWith('/media/')
    ? `${API_BASE_URL.replace('/api/v1', '')}${avatarUrl}`
    : `${API_BASE_URL}/student/avatar`;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      {hasAvatar && token && !imgError ? (
        <Image
          source={{ uri, headers: { Authorization: `Bearer ${token}` } }}
          style={styles.avatar}
          onError={() => setImgError(true)}
        />
      ) : (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(name)}</Text>
        </View>
      )}
      <View style={styles.avatarEditBadge}>
        <Text style={styles.avatarEditBadgeText}>✎</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { signOut, token } = useAuth();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [tutors, setTutors] = useState<TutorStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinVisible, setJoinVisible] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Promise.all([getStudentMe(), getTutors()]).then(([p, ts]) => {
        setProfile(p);
        setEditName(p.full_name);
        setEditPhone(p.phone_number ?? '');
        setTutors(ts);
      }).finally(() => setLoading(false));
    }, []),
  );

  const handleEdit = () => {
    // Reset edit fields to current profile values before entering edit mode
    setEditName(profile?.full_name ?? '');
    setEditPhone(profile?.phone_number ?? '');
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
  };

  const handleSave = async () => {
    if (!editName.trim()) { Alert.alert('Ошибка', 'Имя не может быть пустым'); return; }
    setSaving(true);
    try {
      const updated = await updateStudentMe({
        full_name: editName.trim(),
        phone_number: editPhone.trim() || null,
      });
      setProfile(updated);
      setEditing(false);
      Alert.alert('Сохранено');
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const handlePickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });
    if (result.canceled) return;
    setUploadingAvatar(true);
    try {
      const updated = await uploadStudentAvatar(result.assets[0].uri);
      setProfile(updated);
    } catch {
      Alert.alert('Ошибка', 'Не удалось загрузить аватар');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Выход', 'Вы уверены, что хотите выйти?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: signOut },
    ]);
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#2AABEE" />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Аватар */}
      <View style={styles.hero}>
        {uploadingAvatar ? (
          <View style={styles.avatar}><ActivityIndicator color="#fff" /></View>
        ) : (
          <Avatar
            hasAvatar={!!profile?.avatar_url}
            avatarUrl={profile?.avatar_url ?? null}
            name={profile?.full_name ?? ''}
            token={token}
            onPress={handlePickAvatar}
          />
        )}
        {profile?.started_at && (
          <Text style={styles.since}>С нами с {formatDate(profile.started_at)}</Text>
        )}
      </View>

      {/* Профиль */}
      <View style={styles.card}>
        {editing ? (
          <>
            <Text style={styles.fieldLabel}>Имя</Text>
            <TextInput
              style={styles.input}
              value={editName}
              onChangeText={setEditName}
              placeholder="Полное имя"
              placeholderTextColor="#bbb"
              autoFocus
            />
            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Телефон</Text>
            <TextInput
              style={styles.input}
              value={editPhone}
              onChangeText={setEditPhone}
              placeholder="+7 999 000 00 00"
              placeholderTextColor="#bbb"
              keyboardType="phone-pad"
            />
            {profile?.grade != null && (
              <Text style={styles.gradeInfo}>Класс: {profile.grade}</Text>
            )}
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} disabled={saving}>
                <Text style={styles.cancelBtnText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Сохранить</Text>}
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <View style={styles.profileRow}>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{profile?.full_name}</Text>
                {profile?.phone_number ? (
                  <Text style={styles.profilePhone}>{profile.phone_number}</Text>
                ) : (
                  <Text style={styles.profilePhoneEmpty}>Телефон не указан</Text>
                )}
                {profile?.grade != null && (
                  <Text style={styles.gradeInfo}>Класс: {profile.grade}</Text>
                )}
              </View>
              <TouchableOpacity style={styles.editBtn} onPress={handleEdit}>
                <Text style={styles.editBtnText}>Изменить</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Репетиторы */}
      {tutors.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Мои репетиторы</Text>
          {[...new Map(tutors.map(t => [t.tutor_id, t])).values()].map((tutor, ti) => {
            const subjects = tutors.filter(t => t.tutor_id === tutor.tutor_id);
            return (
              <View key={tutor.tutor_id} style={ti > 0 ? styles.tutorGroupBorder : undefined}>
                {/* Имя репетитора */}
                <View style={styles.tutorGroupHeader}>
                  <View style={styles.tutorAvatarSmall}>
                    <Text style={styles.tutorAvatarText}>{tutor.tutor_name?.[0]?.toUpperCase() ?? '?'}</Text>
                  </View>
                  <Text style={styles.tutorName}>{tutor.tutor_name ?? '—'}</Text>
                </View>
                {/* Предметы */}
                {subjects.map((ts) => {
                  const remaining = ts.subscription_lessons != null
                    ? ts.subscription_lessons - (ts.used_lessons ?? 0)
                    : null;
                  return (
                    <View key={ts.id} style={styles.subjectRow}>
                      <Text style={styles.subjectName}>{ts.subject_name ?? '—'}</Text>
                      <View style={styles.subjectRight}>
                        {remaining != null && remaining > 0 && (
                          <View style={styles.subscriptionBadge}>
                            <Text style={styles.subscriptionBadgeText}>
                              {remaining} из {ts.subscription_lessons} зан.
                            </Text>
                          </View>
                        )}
                        <Text style={styles.hourlyRate}>{ts.hourly_rate} ₽/ч</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      )}

      {/* Действия */}
      <View style={styles.settingsCard}>
        <TouchableOpacity style={styles.settingsItem} onPress={() => setJoinVisible(true)}>
          <View style={[styles.settingsIconWrap, { backgroundColor: '#EFF9FF' }]}>
            <Ionicons name="key-outline" size={18} color="#2AABEE" />
          </View>
          <Text style={styles.settingsItemText}>Ввести код приглашения</Text>
          <Ionicons name="chevron-forward" size={18} color="#ccc" />
        </TouchableOpacity>

        <View style={styles.settingsDivider} />

        <TouchableOpacity style={styles.settingsItem} onPress={handleLogout}>
          <View style={[styles.settingsIconWrap, { backgroundColor: '#FFF2F1' }]}>
            <Ionicons name="log-out-outline" size={18} color="#F44336" />
          </View>
          <Text style={[styles.settingsItemText, { color: '#F44336' }]}>Выйти из аккаунта</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={joinVisible} animationType="slide" presentationStyle="pageSheet">
        <JoinScreen onSuccess={() => setJoinVisible(false)} onClose={() => setJoinVisible(false)} />
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 24, gap: 16 },

  hero: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#2AABEE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarText: { fontSize: 32, fontWeight: '700', color: '#fff' },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 4,
    right: -2,
    backgroundColor: '#fff',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  avatarEditBadgeText: { fontSize: 13, color: '#555' },
  since: { fontSize: 13, color: '#aaa' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
    gap: 4,
  },

  // View mode
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  profileInfo: { flex: 1, gap: 4 },
  profileName: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  profilePhone: { fontSize: 14, color: '#555' },
  profilePhoneEmpty: { fontSize: 14, color: '#bbb', fontStyle: 'italic' },
  editBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#2AABEE',
  },
  editBtnText: { color: '#2AABEE', fontWeight: '600', fontSize: 14 },

  // Edit mode
  fieldLabel: { fontSize: 12, color: '#aaa', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#1a1a1a',
  },
  gradeInfo: { fontSize: 13, color: '#888', marginTop: 4 },
  editActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  cancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: { color: '#888', fontWeight: '600', fontSize: 15 },
  saveBtn: {
    flex: 1,
    backgroundColor: '#2AABEE',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  sectionTitle: { fontSize: 12, fontWeight: '600', color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  tutorGroupBorder: { borderTopWidth: 1, borderTopColor: '#f0f0f0', marginTop: 10, paddingTop: 10 },
  tutorGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  tutorAvatarSmall: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#2AABEE',
    alignItems: 'center', justifyContent: 'center',
  },
  tutorAvatarText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  tutorName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  subjectRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, paddingLeft: 40 },
  subjectName: { fontSize: 14, color: '#444', flex: 1 },
  subjectRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hourlyRate: { fontSize: 13, fontWeight: '600', color: '#555' },
  subscriptionBadge: { backgroundColor: '#EFF9FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  subscriptionBadgeText: { fontSize: 11, fontWeight: '600', color: '#2AABEE' },

  settingsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
    overflow: 'hidden',
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  settingsIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsItemText: { flex: 1, fontSize: 15, fontWeight: '500', color: '#1a1a1a' },
  settingsDivider: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 62 },
});
