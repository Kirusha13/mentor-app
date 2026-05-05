import type { CSSProperties } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';

const API_BASE = import.meta.env.VITE_API_BASE_URL.replace('/api/v1', '');
const CALLBACK_URL = `${window.location.origin}/auth/callback`;

const featureCards = [
  {
    title: 'Расписание',
    text: 'Свободные слоты, переносы, отмены и подтверждённые занятия в одном календаре.',
  },
  {
    title: 'Финансы',
    text: 'Доход, долги, оплаты на проверке и прогноз недели без отдельной таблицы.',
  },
  {
    title: 'Портфолио',
    text: 'Прогресс ученика, темы, оценки и отчёт для опекуна в красивом виде.',
  },
];

const workflowItems = [
  ['Сегодня', '3 занятия'],
  ['Оплаты', '2 ждут проверки'],
  ['ДЗ', '5 активных'],
];

const smallTextStyle: CSSProperties = {
  color: 'rgba(255,255,255,0.68)',
  fontSize: 14,
  lineHeight: 1.5,
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
        padding: isMobile ? 14 : 24,
        display: 'grid',
        placeItems: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: 420,
          height: 420,
          borderRadius: '50%',
          background: 'rgba(217,111,50,0.18)',
          filter: 'blur(24px)',
          left: -160,
          top: -130,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: 360,
          height: 360,
          borderRadius: '50%',
          background: 'rgba(42,111,219,0.14)',
          filter: 'blur(26px)',
          right: -120,
          bottom: -130,
        }}
      />

      <div
        style={{
          width: 'min(1180px, 100%)',
          display: 'grid',
          gridTemplateColumns: isTablet ? '1fr' : 'minmax(0, 1.12fr) minmax(360px, 0.88fr)',
          gap: isMobile ? 14 : 22,
          alignItems: 'stretch',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <section
          style={{
            minHeight: isTablet ? 'auto' : 'calc(100vh - 48px)',
            maxHeight: isTablet ? 'none' : 'calc(100vh - 48px)',
            padding: isMobile ? 20 : isTablet ? 28 : 34,
            borderRadius: isMobile ? 26 : 36,
            background:
              'linear-gradient(145deg, rgba(23,32,51,0.98) 0%, rgba(31,50,82,0.96) 58%, rgba(217,111,50,0.86) 140%)',
            color: '#fff',
            boxShadow: '0 34px 90px rgba(17, 25, 39, 0.28)',
            display: 'grid',
            alignContent: 'space-between',
            gap: 22,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 'auto -80px -120px auto',
              width: 360,
              height: 360,
              borderRadius: '44% 56% 48% 52%',
              background: 'rgba(255,255,255,0.08)',
              transform: 'rotate(-12deg)',
            }}
          />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.09)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.82)',
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginBottom: 16,
              }}
            >
              Mentor App
            </div>

            <h1
              style={{
                fontSize: 'clamp(2.45rem, 5.4vw, 4.55rem)',
                lineHeight: 0.94,
                marginBottom: 14,
                letterSpacing: '-0.065em',
                maxWidth: 760,
              }}
            >
              Рабочий день репетитора без хаоса
            </h1>

            <p
              style={{
                maxWidth: 660,
                fontSize: isMobile ? 16 : 19,
                lineHeight: 1.65,
                color: 'rgba(255,255,255,0.74)',
                marginBottom: 20,
              }}
            >
              Веб-кабинет помогает вести учеников, расписание, домашние задания,
              материалы, оплаты и прогресс в одном месте. То, что раньше жило в
              блокнотах, Excel и заметках, теперь собрано в понятный рабочий инструмент.
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
                <article
                  key={item.title}
                  style={{
                    padding: 15,
                    borderRadius: 22,
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 6 }}>{item.title}</div>
                  <div style={smallTextStyle}>{item.text}</div>
                </article>
              ))}
            </div>
          </div>

          <div
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1.05fr 0.95fr',
              gap: 14,
              alignItems: 'end',
            }}
          >
            <div
              style={{
                borderRadius: 22,
                padding: 14,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 12 }}>
                Как выглядит рабочее утро
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {workflowItems.map(([label, value]) => (
                  <div
                    key={label}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      alignItems: 'center',
                      padding: '11px 12px',
                      borderRadius: 16,
                      background: 'rgba(255,255,255,0.08)',
                    }}
                  >
                    <span style={{ color: 'rgba(255,255,255,0.72)' }}>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                borderRadius: 22,
                padding: 14,
                background: 'rgba(255,255,255,0.92)',
                color: '#18212f',
                boxShadow: '0 18px 38px rgba(0,0,0,0.16)',
              }}
            >
              <div style={{ color: '#697589', fontSize: 13, marginBottom: 8 }}>
                Цель системы
              </div>
              <div style={{ fontSize: 20, lineHeight: 1.15, fontWeight: 900, marginBottom: 8 }}>
                Репетитор видит главное сразу
              </div>
              <div style={{ color: '#596678', fontSize: 14, lineHeight: 1.5 }}>
                Ближайшие занятия, оплаты, дедлайны и прогресс ученика не нужно собирать вручную.
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            padding: isMobile ? '22px 18px' : '30px 28px',
            borderRadius: isMobile ? 26 : 36,
            background: 'rgba(255,255,255,0.84)',
            border: '1px solid rgba(255,255,255,0.72)',
            boxShadow: '0 28px 70px rgba(27, 39, 52, 0.1)',
            backdropFilter: 'blur(18px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 62,
              height: 62,
              borderRadius: 22,
              background: 'linear-gradient(135deg, rgba(217,111,50,0.18), rgba(42,111,219,0.14))',
              color: '#c35f28',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 950,
              fontSize: 24,
              marginBottom: 18,
              border: '1px solid rgba(217,111,50,0.14)',
            }}
          >
            M
          </div>

          <div style={{ color: '#697589', fontWeight: 800, fontSize: 13, marginBottom: 10 }}>
            Вход в кабинет
          </div>
          <h2
            style={{
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              lineHeight: 1.02,
              marginBottom: 10,
              letterSpacing: '-0.045em',
            }}
          >
            Продолжим работу с учениками
          </h2>
          <p style={{ color: '#5d6778', marginBottom: 20, fontSize: 16, lineHeight: 1.55 }}>
            Авторизация проходит через Telegram. После входа ты сразу попадёшь в рабочий кабинет,
            а при истёкшей сессии система вернёт на нужную страницу.
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
              Ошибка входа: {decodeURIComponent(error)}
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
              minHeight: 56,
              fontSize: 16,
              borderRadius: 16,
              boxShadow: '0 16px 34px rgba(217,111,50,0.24)',
            }}
          >
            Войти через Telegram
          </button>
        </section>
      </div>
    </main>
  );
}
