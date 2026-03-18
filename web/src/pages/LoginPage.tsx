import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginWithTelegram } from '../api/auth';
import { useAuth } from '../context/AuthContext';

declare global {
  interface Window {
    onTelegramAuth?: (user: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
      auth_date: number;
      hash: string;
    }) => Promise<void>;
  }
}

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
      return;
    }

    window.onTelegramAuth = async (user) => {
  try {
    console.log('Telegram user:', user);
    alert('Callback from Telegram received');

    const data = await loginWithTelegram(user);
    console.log('Backend login response:', data);
    alert('Backend responded');

    login(data.access_token);
    navigate('/', { replace: true });
  } catch (error) {
    console.error('Telegram login error:', error);
    alert('Ошибка входа через Telegram');
  }
};

    const container = document.getElementById('telegram-login-container');
    if (!container) return;

    container.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', 'mentors1bot');
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-userpic', 'false');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');

    container.appendChild(script);

    return () => {
      container.innerHTML = '';
      delete window.onTelegramAuth;
    };
  }, [isAuthenticated, login, navigate]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f7fb',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#fff',
          padding: 32,
          borderRadius: 16,
          boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
          textAlign: 'center',
        }}
      >
        <h1 style={{ marginTop: 0 }}>Вход в систему</h1>
        <p>Авторизация репетитора через Telegram</p>

        <div
          id="telegram-login-container"
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: 24,
          }}
        />
      </div>
    </div>
  );
}