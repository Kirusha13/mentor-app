import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { getStudentMe, StudentProfile } from '../../api/student';
import { API_BASE_URL } from '../../api/client';

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

function Avatar({ hasAvatar, name, token }: { hasAvatar: boolean; name: string; token: string | null }) {
  const [imgError, setImgError] = useState(false);

  if (hasAvatar && token && !imgError) {
    return (
      <Image
        source={{
          uri: `${API_BASE_URL}/student/avatar`,
          headers: { Authorization: `Bearer ${token}` },
        }}
        style={styles.avatar}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{getInitials(name)}</Text>
    </View>
  );
}

function InfoRow({ icon, label, value, ionicon }: {
  icon?: string; label: string; value: string; ionicon?: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIconWrap}>
        {ionicon ?? <Text style={styles.rowIcon}>{icon}</Text>}
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const { signOut, token } = useAuth();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      getStudentMe()
        .then(setProfile)
        .finally(() => setLoading(false));
    }, []),
  );

  const handleLogout = () => {
    Alert.alert('Выход', 'Вы уверены, что хотите выйти?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: signOut },
    ]);
  };

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} color="#2AABEE" />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Аватар и имя */}
      <View style={styles.hero}>
        <Avatar hasAvatar={!!profile?.avatar_url} name={profile?.full_name ?? ''} token={token} />
        <Text style={styles.name}>{profile?.full_name ?? '—'}</Text>
        {profile?.started_at && (
          <Text style={styles.since}>С нами с {formatDate(profile.started_at)}</Text>
        )}
      </View>

      {/* Информация */}
      {profile && (
        <View style={styles.card}>
          {profile.phone_number && (
            <InfoRow icon="📱" label="Телефон" value={profile.phone_number} />
          )}
          {profile.grade != null && (
            <InfoRow icon="🎓" label="Класс" value={`${profile.grade} класс`} />
          )}
          <InfoRow
            ionicon={<Ionicons name="paper-plane" size={20} color="#2AABEE" />}
            label="Telegram"
            value="Привязан"
          />
        </View>
      )}

      {/* Выход */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Выйти из аккаунта</Text>
      </TouchableOpacity>
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
  name: { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  since: { fontSize: 13, color: '#aaa' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 14,
  },
  rowIconWrap: { width: 28, alignItems: 'center' },
  rowIcon: { fontSize: 20 },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 12, color: '#aaa', marginBottom: 2 },
  rowValue: { fontSize: 15, color: '#1a1a1a', fontWeight: '500' },

  logoutBtn: {
    borderWidth: 1.5,
    borderColor: '#F44336',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  logoutText: { color: '#F44336', fontWeight: '600', fontSize: 15 },
});
