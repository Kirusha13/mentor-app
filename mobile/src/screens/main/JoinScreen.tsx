import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import client from '../../api/client';

interface Props {
  onSuccess: () => void;
  onClose: () => void;
}

export default function JoinScreen({ onSuccess, onClose }: Props) {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    const t = token.trim();
    if (!t) return;
    setLoading(true);
    try {
      const res = await client.post('/student/join', { token: t });
      Alert.alert(
        'Успешно!',
        `Вы подключились к репетитору ${res.data.tutor_name ?? ''} по предмету «${res.data.subject_name ?? ''}»`,
        [{ text: 'OK', onPress: onSuccess }],
      );
    } catch (e: any) {
      const msg = e?.response?.data?.detail ?? 'Неверный код';
      Alert.alert('Ошибка', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Крестик */}
      <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
        <Ionicons name="close" size={24} color="#999" />
      </TouchableOpacity>

      <View style={styles.inner}>
        <View style={styles.iconWrap}>
          <Ionicons name="key" size={36} color="#2AABEE" />
        </View>
        <Text style={styles.title}>Код приглашения</Text>
        <Text style={styles.subtitle}>
          Введите код, который выдал вам репетитор, чтобы подключиться к занятиям
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Введите код"
          placeholderTextColor="#bbb"
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleJoin}
        />
        <TouchableOpacity
          style={[styles.btn, (!token.trim() || loading) && styles.btnDisabled]}
          onPress={handleJoin}
          disabled={!token.trim() || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Подтвердить</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  closeBtn: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  inner: {
    flex: 1,
    padding: 24,
    paddingTop: 72,
    gap: 14,
  },

  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: '#EFF9FF',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 4,
  },

  title: { fontSize: 22, fontWeight: '700', color: '#1a1a1a', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20 },

  input: {
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#1a1a1a',
    backgroundColor: '#fafafa',
  },

  btn: {
    backgroundColor: '#2AABEE',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#2AABEE',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  btnDisabled: { backgroundColor: '#b0d8f5', shadowOpacity: 0 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
