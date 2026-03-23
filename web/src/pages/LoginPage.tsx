import { useMediaQuery } from '../hooks/useMediaQuery';

const API_BASE = import.meta.env.VITE_API_BASE_URL.replace('/api/v1', '');
const CALLBACK_URL = `${window.location.origin}/auth/callback`;

export default function LoginPage() {
  const searchParams = new URLSearchParams(window.location.search);
  const error = searchParams.get('error');
  const reason = searchParams.get('reason');
  const isTablet = useMediaQuery('(max-width: 1100px)');
  const isMobile = useMediaQuery('(max-width: 720px)');

  const handleLogin = () => {
    window.location.href = `${API_BASE}/telegram-login?redirect=${encodeURIComponent(CALLBACK_URL)}`;
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: 'min(1120px, 100%)',
          display: 'grid',
          gridTemplateColumns: isTablet ? '1fr' : '1.1fr 0.9fr',
          gap: 24,
          alignItems: 'stretch',
        }}
      >
        <section
          style={{
            padding: isMobile ? '24px' : isTablet ? '32px' : '42px',
            borderRadius: 32,
            background:
              'linear-gradient(160deg, rgba(23,32,51,0.96) 0%, rgba(39,59,92,0.92) 100%)',
            color: '#fff',
            boxShadow: '0 28px 65px rgba(20, 30, 44, 0.22)',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              padding: '8px 14px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.84)',
              fontSize: 12,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: 22,
            }}
          >
            Mentor
          </div>

          <h1
            style={{
              fontSize: 'clamp(2.6rem, 5vw, 4.4rem)',
              lineHeight: 0.95,
              marginBottom: 18,
              letterSpacing: '-0.05em',
            }}
          >
            Всё обучение
            <br />
            в одном кабинете
          </h1>

          <p
            style={{
              maxWidth: 560,
              fontSize: 18,
              lineHeight: 1.65,
              color: 'rgba(255,255,255,0.72)',
              marginBottom: 32,
            }}
          >
            Управляй учениками, занятиями, заданиями и материалами в одном интерфейсе
            с быстрым входом через Telegram.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))',
              gap: 14,
            }}
          >
            {[
              ['Ученики', 'Карточки, статусы и тарифы'],
              ['Расписание', 'Планирование и переносы'],
              ['Материалы', 'Темы, задания и прогресс'],
            ].map(([title, text]) => (
              <div
                key={title}
                style={{
                  borderRadius: 20,
                  padding: 18,
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>
                <div style={{ color: 'rgba(255,255,255,0.68)', fontSize: 14 }}>{text}</div>
              </div>
            ))}
          </div>
        </section>

        <section
          style={{
            padding: isMobile ? '24px 20px' : '36px 32px',
            borderRadius: 32,
            background: 'rgba(255,255,255,0.82)',
            border: '1px solid rgba(255,255,255,0.65)',
            boxShadow: '0 24px 60px rgba(27, 39, 52, 0.08)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 18,
              background: 'rgba(217,111,50,0.14)',
              color: '#c35f28',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 800,
              marginBottom: 18,
            }}
          >
            M
          </div>

          <h2 style={{ fontSize: 34, lineHeight: 1.05, marginBottom: 10 }}>Вход для репетитора</h2>
          <p style={{ color: '#5d6778', marginBottom: 22, fontSize: 16 }}>
            Авторизация идёт через Telegram и возвращает тебя прямо в рабочий кабинет.
          </p>

          {error && (
            <div
              style={{
                marginBottom: 16,
                padding: '14px 16px',
                borderRadius: 16,
                border: '1px solid rgba(195, 61, 59, 0.18)',
                background: 'rgba(195, 61, 59, 0.08)',
                color: '#9d2e2b',
              }}
            >
              Ошибка: {decodeURIComponent(error)}
            </div>
          )}

          {!error && reason === 'session_expired' && (
            <div
              style={{
                marginBottom: 16,
                padding: '14px 16px',
                borderRadius: 16,
                border: '1px solid rgba(217, 111, 50, 0.18)',
                background: 'rgba(217, 111, 50, 0.08)',
                color: '#b9551f',
              }}
            >
              Сессия истекла. Войди снова через Telegram, и мы вернём тебя обратно в кабинет.
            </div>
          )}

          <button
            onClick={handleLogin}
            style={{
              minHeight: 54,
              fontSize: 16,
            }}
          >
            Войти через Telegram
          </button>

          <p style={{ marginTop: 18, color: '#7a8493', fontSize: 14 }}>
            Если вход не сработал, проверь `VITE_API_BASE_URL` и Telegram callback.
          </p>
        </section>
      </div>
    </div>
  );
}
