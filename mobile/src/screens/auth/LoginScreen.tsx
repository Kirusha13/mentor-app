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
import { studentLogin, studentRegister, studentLoginVK, studentRegisterVK, TelegramAuthData, VKAuthData } from '../../api/auth';
import { API_BASE_URL } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const TELEGRAM_LOGIN_URL = API_BASE_URL.replace('/api/v1', '') + '/telegram-login';
const VK_LOGIN_URL = API_BASE_URL.replace('/api/v1', '') + '/vk-login';

type Step = 'start' | 'form';

export default function LoginScreen() {
  const { signIn } = useAuth();

  const [step, setStep] = useState<Step>('start');
  const [inviteToken, setInviteToken] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tgData, setTgData] = useState<TelegramAuthData | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [grade, setGrade] = useState('');
  const [loading, setLoading] = useState(false);
  const [vkData, setVkData] = useState<VKAuthData | null>(null);

  const tgHandledRef = useRef(false);
  const vkHandledRef = useRef(false);
  const inviteTokenRef = useRef(inviteToken);
  useEffect(() => { inviteTokenRef.current = inviteToken; }, [inviteToken]);

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

  const handleVKData = useCallback(async (data: VKAuthData) => {
    const token = inviteTokenRef.current;
    setLoading(true);
    try {
      if (token) {
        setVkData(data);
        setFullName([data.first_name, data.last_name].filter(Boolean).join(' '));
        setStep('form');
      } else {
        const accessToken = await studentLoginVK(data);
        await signIn(accessToken);
      }
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.detail ?? 'Не удалось войти через VK');
    } finally {
      setLoading(false);
    }
  }, [signIn]);

  const parseVKUrl = (url: string): VKAuthData | null => {
    try {
      const parsed = Linking.parse(url);
      const p = parsed.queryParams as Record<string, string> | null;
      if (!p?.vk_id || !p?.sign || !p?.expires_at) return null;
      return {
        vk_id: Number(p.vk_id),
        first_name: p.first_name ?? '',
        last_name: p.last_name,
        photo_url: p.photo_url,
        expires_at: p.expires_at,
        sign: p.sign,
      };
    } catch {
      return null;
    }
  };

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

      if (parsed.path === 'register' && parsed.queryParams?.token) {
        setInviteToken(String(parsed.queryParams.token));
        setShowTokenInput(true);
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

      if (parsed.path === 'auth-vk' || parsed.path === '--/auth-vk') {
        const data = parseVKUrl(url);
        if (data && !vkHandledRef.current) {
          vkHandledRef.current = true;
          WebBrowser.dismissBrowser();
          handleVKData(data);
        }
      }
    };

    const sub = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });
    return () => sub.remove();
  }, [handleTelegramData]);

  const openVKAuth = async () => {
    if (showTokenInput && !inviteToken.trim()) {
      Alert.alert('Нужен код приглашения', 'Введите код от репетитора, чтобы создать аккаунт');
      return;
    }
    vkHandledRef.current = false;
    setLoading(true);
    try {
      const redirectUrl = Linking.createURL('auth-vk');
      const result = await WebBrowser.openAuthSessionAsync(
        `${VK_LOGIN_URL}?redirect=${encodeURIComponent(redirectUrl)}&role=student`,
        redirectUrl,
      );

      if (result.type === 'success' && !vkHandledRef.current) {
        vkHandledRef.current = true;
        const data = parseVKUrl(result.url);
        if (data) {
          await handleVKData(data);
          return;
        }
      }
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.detail ?? 'Не удалось открыть VK');
    } finally {
      if (!vkHandledRef.current) {
        setLoading(false);
      }
    }
  };

  const openTelegramAuth = async () => {
    if (showTokenInput && !inviteToken.trim()) {
      Alert.alert('Нужен код приглашения', 'Введите код от репетитора, чтобы создать аккаунт');
      return;
    }
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

  const handleRegisterSubmit = async () => {
    if (!fullName.trim() || !phone.trim()) {
      Alert.alert('Ошибка', 'Заполните все поля');
      return;
    }
    const parsedGrade = grade.trim() ? parseInt(grade.trim(), 10) : undefined;
    if (grade.trim() && (isNaN(parsedGrade!) || parsedGrade! < 1 || parsedGrade! > 11)) {
      Alert.alert('Ошибка', 'Класс должен быть числом от 1 до 11');
      return;
    }
    if (!tgData && !vkData) return;
    setLoading(true);
    try {
      const token = vkData
        ? await studentRegisterVK(vkData, inviteToken, fullName.trim(), phone.trim(), parsedGrade)
        : await studentRegister(tgData!, inviteToken, fullName.trim(), phone.trim(), parsedGrade);
      await signIn(token);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.detail ?? 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  // ── Шаг 2: форма регистрации ──
  if (step === 'form') {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Почти готово!</Text>
          <Text style={styles.subtitle}>Проверьте и уточните данные</Text>

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

          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Класс обучения</Text>
          <TextInput
            style={styles.input}
            value={grade}
            onChangeText={setGrade}
            placeholder="Например: 9"
            placeholderTextColor="#bbb"
            keyboardType="number-pad"
            maxLength={2}
          />

          <TouchableOpacity style={styles.tgBtn} onPress={handleRegisterSubmit} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.tgBtnText}>Завершить регистрацию</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setStep('start')}>
            <Text style={styles.backLink}>← Назад</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Шаг 1: начальный экран ──
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.logoWrap}>
            <Ionicons name="school" size={44} color="#fff" />
          </View>
          <Text style={styles.title}>Mentor</Text>
          <Text style={styles.subtitle}>Приложение для учеников</Text>
        </View>

        {/* Бейдж активированного приглашения */}
        {inviteToken && showTokenInput ? (
          <View style={styles.tokenBanner}>
            <Ionicons name="link" size={15} color="#2E7D32" />
            <Text style={styles.tokenText}>Ссылка приглашения активирована</Text>
          </View>
        ) : null}

        {/* Поле токена (только в режиме регистрации) */}
        {showTokenInput && !inviteToken && (
          <View style={styles.tokenSection}>
            <Text style={styles.fieldLabel}>Код приглашения от репетитора</Text>
            <TextInput
              style={styles.input}
              placeholder="Введите код"
              placeholderTextColor="#bbb"
              value={inviteToken}
              onChangeText={setInviteToken}
              autoCapitalize="none"
              autoFocus
            />
          </View>
        )}

        {/* Кнопка Telegram */}
        <TouchableOpacity style={styles.tgBtn} onPress={openTelegramAuth} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.tgBtnInner}>
              <Ionicons name="paper-plane" size={20} color="#fff" />
              <Text style={styles.tgBtnText}>
                {showTokenInput ? 'Подключить Telegram' : 'Войти через Telegram'}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Кнопка VK ID */}
        <TouchableOpacity style={styles.vkBtn} onPress={openVKAuth} disabled={loading}>
          <View style={styles.tgBtnInner}>
            <Ionicons name="logo-vk" size={20} color="#fff" />
            <Text style={styles.tgBtnText}>
              {showTokenInput ? 'Подключить VK ID' : 'Войти через VK ID'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Ссылка регистрации / возврат */}
        {!showTokenInput ? (
          <TouchableOpacity onPress={() => setShowTokenInput(true)}>
            <Text style={styles.registerHint}>
              Нет аккаунта?{' '}
              <Text style={styles.registerLink}>Зарегистрироваться</Text>
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => { setShowTokenInput(false); setInviteToken(''); }}>
            <Text style={styles.backLink}>← Уже есть аккаунт</Text>
          </TouchableOpacity>
        )}
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

  // Hero
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

  // Invite banner
  tokenBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  tokenText: { color: '#2E7D32', fontWeight: '600', fontSize: 13 },

  // Token input section
  tokenSection: { gap: 6 },
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

  // Telegram button
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
  tgBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tgBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  vkBtn: {
    backgroundColor: '#0077FF',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#0077FF',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },

  // Links
  registerHint: { textAlign: 'center', fontSize: 14, color: '#999' },
  registerLink: { color: '#2AABEE', fontWeight: '600' },
  backLink: { textAlign: 'center', fontSize: 14, color: '#2AABEE', fontWeight: '500' },
});
