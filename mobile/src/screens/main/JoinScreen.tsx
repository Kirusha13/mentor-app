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
}

export default function JoinScreen({ onSuccess }: Props) {
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
      const msg = e?.response?.data?.detail ?? 'Неверный токен';
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
      <View style={styles.inner}>
        <Text style={styles.title}>Подключиться к репетитору</Text>
        <Text style={styles.subtitle}>
          Введите токен приглашения, который выдал вам репетитор
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Токен приглашения"
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
            <Text style={styles.btnText}>Подключиться</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 16,
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
  },
  btn: {
    backgroundColor: '#2AABEE',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  btnDisabled: { backgroundColor: '#b0d8f5' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
