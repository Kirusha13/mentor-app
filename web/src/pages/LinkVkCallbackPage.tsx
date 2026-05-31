import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { linkVkAccount } from '../api/tutor';

export default function LinkVkCallbackPage() {
  const navigate = useNavigate();
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const device_id = params.get('device_id') ?? '';
    const code_verifier = params.get('code_verifier') ?? '';

    if (!code || !code_verifier) {
      navigate('/profile?error=vk_link_failed', { replace: true });
      return;
    }

    linkVkAccount({ code, device_id, code_verifier })
      .then(() => navigate('/profile?vk_linked=1', { replace: true }))
      .catch(() => navigate('/profile?error=vk_link_failed', { replace: true }));
  }, [navigate]);

  return (
    <div style={{
      minHeight: '100vh', display: 'grid', placeItems: 'center',
      fontFamily: 'Inter, sans-serif', color: '#1f2a3b',
    }}>
      <div style={{ textAlign: 'center', display: 'grid', gap: 12 }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          border: '4px solid #e8f0fe', borderTopColor: '#0077ff',
          animation: 'spin .9s linear infinite', margin: '0 auto',
        }} />
        <p style={{ margin: 0, color: '#687486' }}>Привязываем VK ID...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
