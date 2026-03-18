const API_BASE = import.meta.env.VITE_API_BASE_URL.replace('/api/v1', '');
const CALLBACK_URL = window.location.origin + '/auth/callback';

export default function LoginPage() {
  const handleLogin = () => {
    window.location.href = `${API_BASE}/telegram-login?redirect=${encodeURIComponent(CALLBACK_URL)}`;
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center', background: '#f5f7fb',
    }}>
      <div style={{
        width: '100%', maxWidth: 420, background: '#fff',
        padding: 32, borderRadius: 16,
        boxShadow: '0 10px 30px rgba(0,0,0,0.08)', textAlign: 'center',
      }}>
        <h1 style={{ marginTop: 0 }}>Mentor</h1>
        <p style={{ color: '#666' }}>Вход для репетитора</p>
        <button
          onClick={handleLogin}
          style={{
            marginTop: 24, padding: '14px 32px', fontSize: 16,
            backgroundColor: '#2AABEE', color: '#fff',
            border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600,
          }}
        >
          Войти через Telegram
        </button>
      </div>
    </div>
  );
}
