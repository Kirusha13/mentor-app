import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginWithTelegram } from '../api/auth';
import { consumePostLoginRedirect } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const params = Object.fromEntries(new URLSearchParams(window.location.search));

    // VK: бэкенд передаёт готовый JWT прямо в access_token
    if (params.access_token) {
      login(params.access_token);
      const redirectPath = consumePostLoginRedirect();
      navigate(redirectPath || '/', { replace: true });
      return;
    }

    if (!params.hash || !params.id) {
      navigate('/login', { replace: true });
      return;
    }

    loginWithTelegram({
      id: Number(params.id),
      first_name: params.first_name ?? '',
      last_name: params.last_name,
      username: params.username,
      photo_url: params.photo_url,
      auth_date: Number(params.auth_date),
      hash: params.hash,
    })
      .then((data) => {
        login(data.access_token);
        const redirectPath = consumePostLoginRedirect();
        navigate(redirectPath || '/', { replace: true });
      })
      .catch((e) => {
        const msg =
          e?.code === 'ECONNABORTED'
            ? 'Сервер слишком долго отвечает. Попробуй войти ещё раз через несколько секунд.'
            : e?.response?.data?.detail ?? e?.message ?? 'unknown';
        navigate(`/login?error=${encodeURIComponent(msg)}`, { replace: true });
      });
  }, [login, navigate]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background:
          'radial-gradient(circle at 12% 18%, rgba(42,171,238,0.10), transparent 30%), radial-gradient(circle at 90% 8%, rgba(42,171,238,0.14), transparent 28%), #f5f5f5',
        color: '#1A1A1A',
      }}
    >
      <div
        style={{
          width: 'min(440px, 100%)',
          padding: 34,
          borderRadius: 28,
          background: '#fff',
          border: '1px solid #E0E0E0',
          boxShadow: '0 24px 70px rgba(15,23,42,0.14)',
          textAlign: 'center',
          display: 'grid',
          justifyItems: 'center',
          gap: 14,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: '#EFF9FF',
            color: '#2AABEE',
            display: 'grid',
            placeItems: 'center',
            fontSize: 28,
            fontWeight: 900,
          }}
        >
          M
        </div>
        <div>
          <h1 style={{ fontSize: 28, marginBottom: 8 }}>Завершаем вход</h1>
          <p style={{ color: '#555', lineHeight: 1.5, marginBottom: 0 }}>
            Проверяем авторизацию и открываем кабинет. Обычно это занимает несколько секунд.
          </p>
        </div>
        <div
          aria-label="Загрузка"
          style={{
            width: 42,
            height: 42,
            borderRadius: '50%',
            border: '4px solid #EFF9FF',
            borderTopColor: '#2AABEE',
            animation: 'spin 0.9s linear infinite',
          }}
        />
        <style>
          {'@keyframes spin { to { transform: rotate(360deg); } }'}
        </style>
      </div>
    </div>
  );
}
