import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { studentLogin, studentRegister, TelegramAuthData } from '../../api/auth';
import { API_BASE_URL } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const TELEGRAM_LOGIN_URL = API_BASE_URL.replace('/api/v1', '') + '/telegram-login';

type Step = 'start' | 'form';

export default function LoginScreen() {
  const { signIn } = useAuth();

  const [step, setStep] = useState<Step>('start');
  const [inviteToken, setInviteToken] = useState('');
  const [tgData, setTgData] = useState<TelegramAuthData | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  // Предотвращаем двойную обработку (iOS через result.url, Android через Linking)
  const tgHandledRef = useRef(false);
  // Актуальный inviteToken внутри callback-ов без пересоздания listener-а
  const inviteTokenRef = useRef(inviteToken);
  useEffect(() => { inviteTokenRef.current = inviteToken; }, [inviteToken]);

  // Обрабатывает данные Telegram после успешной авторизации
  const handleTelegramData = useCallback(async (data: TelegramAuthData) => {
    const token = inviteTokenRef.current;
    setLoading(true);
    try {
      if (token) {
        setTgData(data);
        setFullName([data.first_name, data.last_name].filter(Boolean).join(' '));
        setStep('form');
      } else {
        const accessToken = await studentLogin(data);
        await signIn(accessToken);
      }
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.detail ?? 'Не удалось войти');
    } finally {
      setLoading(false);
    }
  }, [signIn]);

  // Парсит URL deep link → TelegramAuthData (если там есть Telegram-данные)
  const parseTelegramUrl = (url: string): TelegramAuthData | null => {
    try {
      const parsed = Linking.parse(url);
      const p = parsed.queryParams as Record<string, string> | null;
      if (!p?.hash || !p?.id) return null;
      return {
        id: Number(p.id),
        first_name: p.first_name ?? '',
        last_name: p.last_name,
        username: p.username,
        photo_url: p.photo_url,
        auth_date: Number(p.auth_date),
        hash: p.hash,
      };
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const handleUrl = ({ url }: { url: string }) => {
      const parsed = Linking.parse(url);

      // Ссылка приглашения: mentor://register?token=xxx
      if (parsed.path === 'register' && parsed.queryParams?.token) {
        setInviteToken(String(parsed.queryParams.token));
        return;
      }

      // Telegram callback:
      //   Expo Go dev → exp://host/--/auth?id=...&hash=...  (path = '--/auth')
      //   Production  → mentor://auth?id=...&hash=...       (path = 'auth')
      if (parsed.path === 'auth' || parsed.path === '--/auth') {
        const data = parseTelegramUrl(url);
        if (data && !tgHandledRef.current) {
          tgHandledRef.current = true;
          WebBrowser.dismissBrowser();
          handleTelegramData(data);
        }
      }
    };

    const sub = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });
    return () => sub.remove();
  }, [handleTelegramData]);

  const openTelegramAuth = async () => {
    tgHandledRef.current = false;
    setLoading(true);
    try {
      const redirectUrl = Linking.createURL('auth');
      const result = await WebBrowser.openAuthSessionAsync(
        `${TELEGRAM_LOGIN_URL}?redirect=${encodeURIComponent(redirectUrl)}`,
        redirectUrl,
      );

      // iOS: возвращает type='success' с URL → парсим здесь
      // Android: type='cancel'/'dismiss' → данные уже обработал Linking listener
      if (result.type === 'success' && !tgHandledRef.current) {
        tgHandledRef.current = true;
        const data = parseTelegramUrl(result.url);
        if (data) {
          await handleTelegramData(data);
          return; // handleTelegramData сам снимет loading
        }
      }
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.detail ?? 'Не удалось открыть браузер');
    } finally {
      // Снимаем loading только если Telegram-данные НЕ получены
      if (!tgHandledRef.current) {
        setLoading(false);
      }
    }
  };

  const handleRegisterSubmit = async () => {
    if (!fullName.trim() || !phone.trim()) {
      Alert.alert('Ошибка', 'Заполните все поля');
      return;
    }
    if (!tgData) return;
    setLoading(true);
    try {
      const token = await studentRegister(tgData, inviteToken, fullName.trim(), phone.trim());
      await signIn(token);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.detail ?? 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  // ── Шаг 2: форма ──
  if (step === 'form') {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Почти готово!</Text>
          <Text style={styles.subtitle}>Проверьте и уточните данные</Text>

          <Text style={styles.label}>ФИО</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Иванов Иван Иванович"
          />

          <Text style={styles.label}>Номер телефона</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+79001234567"
            keyboardType="phone-pad"
          />

          <TouchableOpacity style={styles.btn} onPress={handleRegisterSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Завершить регистрацию</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setStep('start')}>
            <Text style={styles.link}>← Назад</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Шаг 1: начальный экран ──
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mentor</Text>
      <Text style={styles.subtitle}>Приложение для учеников</Text>

      {inviteToken ? (
        <View style={styles.tokenBanner}>
          <Text style={styles.tokenText}>🔗 Ссылка приглашения активирована</Text>
        </View>
      ) : null}

      <TextInput
        style={styles.input}
        placeholder="Или введите токен приглашения вручную"
        value={inviteToken}
        onChangeText={setInviteToken}
        autoCapitalize="none"
      />

      <TouchableOpacity style={styles.btn} onPress={openTelegramAuth} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>
            {inviteToken ? 'Зарегистрироваться через Telegram' : 'Войти через Telegram'}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 32 },
  tokenBanner: {
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  tokenText: { color: '#2E7D32', fontWeight: '600' },
  label: { fontSize: 14, color: '#555', marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
  },
  btn: {
    backgroundColor: '#2AABEE',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 16,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { color: '#2AABEE', textAlign: 'center', fontSize: 14 },
});
