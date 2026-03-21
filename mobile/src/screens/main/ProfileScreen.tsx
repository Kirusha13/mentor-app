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
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { getStudentMe, StudentProfile, updateStudentMe, uploadStudentAvatar } from '../../api/student';
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
  const [loading, setLoading] = useState(true);
  const [joinVisible, setJoinVisible] = useState(false);

  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getStudentMe().then(p => {
        setProfile(p);
        setEditName(p.full_name);
        setEditPhone(p.phone_number ?? '');
      }).finally(() => setLoading(false));
    }, []),
  );

  const handleSave = async () => {
    if (!editName.trim()) { Alert.alert('Ошибка', 'Имя не может быть пустым'); return; }
    setSaving(true);
    try {
      const updated = await updateStudentMe({
        full_name: editName.trim(),
        phone_number: editPhone.trim() || null,
      });
      setProfile(updated);
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

      {/* Редактирование */}
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>Имя</Text>
        <TextInput
          style={styles.input}
          value={editName}
          onChangeText={setEditName}
          placeholder="Полное имя"
          placeholderTextColor="#bbb"
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
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Сохранить</Text>}
        </TouchableOpacity>
      </View>

      {/* Подключиться к репетитору */}
      <TouchableOpacity style={styles.joinBtn} onPress={() => setJoinVisible(true)}>
        <Text style={styles.joinText}>+ Подключиться к репетитору</Text>
      </TouchableOpacity>

      {/* Выход */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Выйти из аккаунта</Text>
      </TouchableOpacity>

      <Modal visible={joinVisible} animationType="slide" presentationStyle="pageSheet">
        <JoinScreen onSuccess={() => setJoinVisible(false)} />
        <TouchableOpacity style={styles.closeModal} onPress={() => setJoinVisible(false)}>
          <Text style={styles.closeModalText}>Закрыть</Text>
        </TouchableOpacity>
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
  fieldLabel: { fontSize: 12, color: '#aaa', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#1a1a1a',
  },
  gradeInfo: { fontSize: 13, color: '#888', marginTop: 8 },
  saveBtn: {
    backgroundColor: '#2AABEE',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  joinBtn: {
    borderWidth: 1.5,
    borderColor: '#2AABEE',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  joinText: { color: '#2AABEE', fontWeight: '600', fontSize: 15 },
  logoutBtn: {
    borderWidth: 1.5,
    borderColor: '#F44336',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  logoutText: { color: '#F44336', fontWeight: '600', fontSize: 15 },
  closeModal: {
    padding: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  closeModalText: { color: '#888', fontSize: 15 },
});
