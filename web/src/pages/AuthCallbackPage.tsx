import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginWithTelegram } from '../api/auth';
import { useAuth } from '../context/AuthContext';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const params = Object.fromEntries(new URLSearchParams(window.location.search));
    if (!params.hash || !params.id) {
      navigate('/login', { replace: true });
      return;
    }

    console.log('API BASE:', import.meta.env.VITE_API_BASE_URL);
    console.log('Params:', params);
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
        navigate('/', { replace: true });
      })
      .catch((e) => {
        const msg = e?.response?.data?.detail ?? e?.message ?? 'unknown';
        navigate(`/login?error=${encodeURIComponent(msg)}`, { replace: true });
      });
  }, [login, navigate]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p>Выполняется вход...</p>
    </div>
  );
}
