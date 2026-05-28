import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
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
import client, { API_BASE_URL } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const TELEGRAM_LOGIN_URL = API_BASE_URL.replace('/api/v1', '') + '/telegram-login';

type Step = 'start' | 'form' | 'join';

export default function LoginScreen() {
  const { signIn } = useAuth();

  const [step, setStep] = useState<Step>('start');
  const [tgData, setTgData] = useState<TelegramAuthData | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [grade, setGrade] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const tgHandledRef = useRef(false);

  // ── После Telegram-авторизации: логин или переход к форме (новый пользователь) ──
  const handleTelegramData = useCallback(async (data: TelegramAuthData) => {
    setLoading(true);
    try {
      const accessToken = await studentLogin(data);
      await signIn(accessToken);
    } catch (e: any) {
      if (e?.response?.status === 404) {
        // Новый пользователь — переходим к форме регистрации
        setTgData(data);
        setFullName([data.first_name, data.last_name].filter(Boolean).join(' '));
        setStep('form');
      } else {
        Alert.alert('Ошибка', e?.response?.data?.detail ?? 'Не удалось войти');
      }
    } finally {
      setLoading(false);
    }
  }, [signIn]);

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

      // Deep link с токеном приглашения — сохраняем для шага «подключение»
      if (parsed.path === 'register' && parsed.queryParams?.token) {
        setInviteToken(String(parsed.queryParams.token));
        return;
      }

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

      if (result.type === 'success' && !tgHandledRef.current) {
        tgHandledRef.current = true;
        const data = parseTelegramUrl(result.url);
        if (data) {
          await handleTelegramData(data);
          return;
        }
      }
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.detail ?? 'Не удалось открыть браузер');
    } finally {
      if (!tgHandledRef.current) {
        setLoading(false);
      }
    }
  };

  // ── Шаг 2: отправка формы регистрации (без токена) ──
  const handleRegisterSubmit = async () => {
    if (!fullName.trim() || !phone.trim()) {
      Alert.alert('Ошибка', 'Заполните все поля');
      return;
    }
    if (!tgData) return;
    setLoading(true);
    try {
      const token = await studentRegister(tgData, null, fullName.trim(), phone.trim(), parsedGrade);
      setPendingToken(token);
      setStep('join');
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.detail ?? 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  // ── Шаг 3: подключение к репетитору по токену ──
  const handleJoinSubmit = async () => {
    const t = inviteToken.trim();
    if (!t || !pendingToken) return;
    setLoading(true);
    try {
      await client.post(
        '/student/join',
        { token: t },
        { headers: { Authorization: `Bearer ${pendingToken}` } },
      );
      await signIn(pendingToken);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.detail ?? 'Неверный код приглашения');
    } finally {
      setLoading(false);
    }
  };

  const handleSkipJoin = async () => {
    if (pendingToken) await signIn(pendingToken);
  };

  // ══════════════════════════════════════════════════════
  //  Шаг 3: подключение к репетитору
  // ══════════════════════════════════════════════════════
  if (step === 'join') {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.iconWrap}>
            <Ionicons name="key" size={36} color="#2AABEE" />
          </View>
          <Text style={styles.title}>Подключитесь к репетитору</Text>
          <Text style={styles.subtitle}>
            Введите код, который выдал вам репетитор. Это можно сделать позже в профиле.
          </Text>

          {inviteToken ? (
            <View style={styles.tokenBanner}>
              <Ionicons name="checkmark-circle" size={15} color="#2E7D32" />
              <Text style={styles.tokenBannerText}>Код приглашения получен</Text>
            </View>
          ) : null}

          <TextInput
            style={styles.input}
            placeholder="Код приглашения"
            placeholderTextColor="#bbb"
            value={inviteToken}
            onChangeText={setInviteToken}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity
            style={[styles.tgBtn, (!inviteToken.trim() || loading) && styles.btnDisabled]}
            onPress={handleJoinSubmit}
            disabled={!inviteToken.trim() || loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.tgBtnText}>Подключиться</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={handleSkipJoin} disabled={loading}>
            <Text style={styles.backLink}>Пропустить, сделаю позже →</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ══════════════════════════════════════════════════════
  //  Шаг 2: форма регистрации
  // ══════════════════════════════════════════════════════
  if (step === 'form') {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Создайте аккаунт</Text>
          <Text style={styles.subtitle}>Заполните данные для завершения регистрации</Text>

          <Text style={styles.fieldLabel}>ФИО</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Иванов Иван Иванович"
            placeholderTextColor="#bbb"
          />

          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Номер телефона</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+79001234567"
            placeholderTextColor="#bbb"
            keyboardType="phone-pad"
          />

          <TouchableOpacity style={styles.tgBtn} onPress={handleRegisterSubmit} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.tgBtnText}>Продолжить</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setStep('start')}>
            <Text style={styles.backLink}>← Назад</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ══════════════════════════════════════════════════════
  //  Шаг 1: начальный экран
  // ══════════════════════════════════════════════════════
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <View style={styles.hero}>
          <View style={styles.logoWrap}>
            <Ionicons name="school" size={44} color="#fff" />
          </View>
          <Text style={styles.title}>Mentor</Text>
          <Text style={styles.subtitle}>Приложение для учеников</Text>
        </View>

        {inviteToken ? (
          <View style={styles.tokenBanner}>
            <Ionicons name="checkmark-circle" size={15} color="#2E7D32" />
            <Text style={styles.tokenBannerText}>Код приглашения получен</Text>
          </View>
        ) : null}

        <TouchableOpacity style={styles.tgBtn} onPress={openTelegramAuth} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.tgBtnInner}>
              <Ionicons name="paper-plane" size={20} color="#fff" />
              <Text style={styles.tgBtnText}>Войти через Telegram</Text>
            </View>
          )}
        </TouchableOpacity>

        <Text style={styles.hintText}>
          Нет аккаунта — он будет создан автоматически
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 28,
    backgroundColor: '#fff',
    gap: 12,
  },

  hero: { alignItems: 'center', marginBottom: 12, gap: 8 },
  logoWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: '#2AABEE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    shadowColor: '#2AABEE',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  title: { fontSize: 28, fontWeight: '700', color: '#1a1a1a', textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#aaa', textAlign: 'center' },

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

  tokenBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  tokenBannerText: { color: '#2E7D32', fontWeight: '600', fontSize: 13 },

  fieldLabel: { fontSize: 13, color: '#888', fontWeight: '500' },
  input: {
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#1a1a1a',
    backgroundColor: '#fafafa',
  },

  tgBtn: {
    backgroundColor: '#2AABEE',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#2AABEE',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    marginTop: 4,
  },
  btnDisabled: { backgroundColor: '#b0d8f5', shadowOpacity: 0 },
  tgBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tgBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  hintText: { textAlign: 'center', fontSize: 13, color: '#bbb', marginTop: 4 },
  backLink: { textAlign: 'center', fontSize: 14, color: '#2AABEE', fontWeight: '500' },
});
