import type { CSSProperties } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';

const API_BASE = import.meta.env.VITE_API_BASE_URL.replace('/api/v1', '');
const CALLBACK_URL = `${window.location.origin}/auth/callback`;

const featureCards = [
  {
    title: 'Расписание',
    text: 'Занятия, свободные слоты, переносы и отмены в одном календаре.',
  },
  {
    title: 'Финансы',
    text: 'Оплаты, долги, абонементы и прогноз дохода без ручных таблиц.',
  },
  {
    title: 'Портфолио',
    text: 'Темы, оценки, динамика и понятный отчёт для опекуна.',
  },
];

const quickStats = [
  ['Сегодня', 'занятия и дедлайны'],
  ['Запросы', 'запись, переносы, оплаты'],
  ['Прогресс', 'сильные стороны и зоны роста'],
];

const glassCardStyle: CSSProperties = {
  borderRadius: 22,
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.12)',
  backdropFilter: 'blur(14px)',
};

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
    <main
      style={{
        minHeight: '100vh',
        padding: isMobile ? 12 : 24,
        display: 'grid',
        placeItems: 'center',
        position: 'relative',
        overflow: isTablet ? 'auto' : 'hidden',
      }}
    >
      <section
        style={{
          width: 'min(1180px, 100%)',
          minHeight: isTablet ? 'auto' : 'calc(100vh - 48px)',
          borderRadius: isMobile ? 26 : 38,
          padding: isMobile ? 20 : isTablet ? 28 : 38,
          color: '#fff',
          position: 'relative',
          overflow: 'hidden',
          display: 'grid',
          gap: isMobile ? 22 : 28,
          background:
            'linear-gradient(145deg, rgba(23,32,51,0.98) 0%, rgba(31,50,82,0.96) 55%, rgba(217,111,50,0.9) 135%)',
          boxShadow: '0 34px 90px rgba(17, 25, 39, 0.28)',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            width: 520,
            height: 520,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)',
            right: -190,
            top: -210,
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            width: 380,
            height: 380,
            borderRadius: '42% 58% 54% 46%',
            background: 'rgba(217,111,50,0.22)',
            left: -120,
            bottom: -160,
            filter: 'blur(8px)',
          }}
        />

        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'grid',
            gridTemplateColumns: isTablet ? '1fr' : 'minmax(0, 1fr) minmax(330px, 430px)',
            gap: isMobile ? 22 : 30,
            alignItems: 'center',
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '8px 12px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.82)',
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                marginBottom: 18,
              }}
            >
              Mentor App
            </div>

            <h1
              style={{
                maxWidth: 720,
                fontSize: 'clamp(2.55rem, 6vw, 5.2rem)',
                lineHeight: 0.92,
                marginBottom: 18,
                letterSpacing: '-0.07em',
              }}
            >
              Рабочий день репетитора без хаоса
            </h1>

            <p
              style={{
                maxWidth: 650,
                marginBottom: isMobile ? 20 : 26,
                color: 'rgba(255,255,255,0.74)',
                fontSize: isMobile ? 16 : 19,
                lineHeight: 1.62,
              }}
            >
              Кабинет собирает учеников, расписание, домашние задания, материалы,
              оплаты и прогресс в одном месте. Меньше блокнотов и Excel, больше
              понятного контроля над учебным процессом.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                gap: 12,
                maxWidth: 760,
              }}
            >
              {featureCards.map((item) => (
                <article key={item.title} style={{ ...glassCardStyle, padding: 15 }}>
                  <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 6 }}>{item.title}</div>
                  <div style={{ color: 'rgba(255,255,255,0.68)', fontSize: 14, lineHeight: 1.45 }}>
                    {item.text}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div
            style={{
              justifySelf: isTablet ? 'center' : 'end',
              width: 'min(430px, 100%)',
              borderRadius: 30,
              padding: isMobile ? 18 : 22,
              background: 'rgba(255,255,255,0.92)',
              border: '1px solid rgba(255,255,255,0.76)',
              boxShadow: '0 28px 70px rgba(7, 11, 20, 0.22)',
              color: '#18212f',
              display: 'grid',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 20,
                  display: 'grid',
                  placeItems: 'center',
                  background:
                    'linear-gradient(135deg, rgba(217,111,50,0.18), rgba(42,111,219,0.14))',
                  color: '#c35f28',
                  fontWeight: 950,
                  fontSize: 24,
                  border: '1px solid rgba(217,111,50,0.14)',
                }}
              >
                M
              </div>
              <div>
                <div style={{ color: '#697589', fontWeight: 800, fontSize: 13, marginBottom: 4 }}>
                  Вход в кабинет
                </div>
                <h2 style={{ fontSize: 28, lineHeight: 1.05, marginBottom: 0, letterSpacing: '-0.04em' }}>
                  Продолжим работу
                </h2>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gap: 8,
                padding: 12,
                borderRadius: 20,
                background: 'rgba(23,32,51,0.04)',
                border: '1px solid rgba(24,33,47,0.07)',
              }}
            >
              {quickStats.map(([title, text]) => (
                <div
                  key={title}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    alignItems: 'center',
                    minHeight: 32,
                    color: '#526075',
                    fontSize: 14,
                  }}
                >
                  <span>{title}</span>
                  <strong style={{ color: '#1f2a3b', textAlign: 'right' }}>{text}</strong>
                </div>
              ))}
            </div>

            {error && (
              <div
                style={{
                  padding: '13px 14px',
                  borderRadius: 16,
                  border: '1px solid rgba(195, 61, 59, 0.18)',
                  background: 'rgba(195, 61, 59, 0.08)',
                  color: '#9d2e2b',
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                Ошибка входа: {decodeURIComponent(error)}
              </div>
            )}

            {!error && reason === 'session_expired' && (
              <div
                style={{
                  padding: '13px 14px',
                  borderRadius: 16,
                  border: '1px solid rgba(217, 111, 50, 0.18)',
                  background: 'rgba(217, 111, 50, 0.08)',
                  color: '#b9551f',
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                Сессия истекла. Войди снова, и мы вернём тебя обратно в кабинет.
              </div>
            )}

            <button
              onClick={handleLogin}
              style={{
                minHeight: 56,
                fontSize: 16,
                borderRadius: 16,
                boxShadow: '0 16px 34px rgba(217,111,50,0.24)',
              }}
            >
              Войти через Telegram
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
