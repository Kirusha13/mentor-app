import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { linkTelegramAccount } from '../api/tutor';

export default function LinkTelegramCallbackPage() {
  const navigate = useNavigate();
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const hash = params.get('hash');
    const auth_date = params.get('auth_date');
    const first_name = params.get('first_name') ?? '';

    if (!id || !hash || !auth_date) {
      navigate('/profile?error=tg_link_failed', { replace: true });
      return;
    }

    const payload: Record<string, string> = { id, hash, auth_date, first_name };
    const last_name = params.get('last_name');
    const username = params.get('username');
    const photo_url = params.get('photo_url');
    if (last_name) payload.last_name = last_name;
    if (username) payload.username = username;
    if (photo_url) payload.photo_url = photo_url;

    linkTelegramAccount(payload)
      .then(() => navigate('/profile?tg_linked=1', { replace: true }))
      .catch(() => navigate('/profile?error=tg_link_failed', { replace: true }));
  }, [navigate]);

  return (
    <div style={{
      minHeight: '100vh', display: 'grid', placeItems: 'center',
      fontFamily: 'Inter, sans-serif', color: '#1f2a3b',
    }}>
      <div style={{ textAlign: 'center', display: 'grid', gap: 12 }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          border: '4px solid #e8f0fe', borderTopColor: '#2aabee',
          animation: 'spin .9s linear infinite', margin: '0 auto',
        }} />
        <p style={{ margin: 0, color: '#687486' }}>Привязываем Telegram...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
