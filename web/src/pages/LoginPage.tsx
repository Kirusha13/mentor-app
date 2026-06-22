import type { CSSProperties } from 'react';
import { BarChart3, Calendar, CalendarDays, Inbox, TrendingUp, Wallet } from 'lucide-react';
import { useMediaQuery } from '../hooks/useMediaQuery';

const API_BASE = import.meta.env.VITE_API_BASE_URL.replace('/api/v1', '');
const CALLBACK_ORIGIN =
  window.location.hostname === '127.0.0.1'
    ? `${window.location.protocol}//localhost${window.location.port ? `:${window.location.port}` : ''}`
    : window.location.origin;
const CALLBACK_URL = `${CALLBACK_ORIGIN}/auth/callback`;

const featureCards = [
  {
    icon: <Calendar size={26} />,
    color: '#2AABEE',
    title: 'Расписание',
    text: 'Занятия, свободные слоты, переносы и отмены в одном календаре.',
  },
  {
    icon: <Wallet size={26} />,
    color: '#2AABEE',
    title: 'Финансы',
    text: 'Оплаты, долги, абонементы и прогноз дохода без ручных таблиц.',
  },
  {
    icon: <TrendingUp size={26} />,
    color: '#4CAF50',
    title: 'Портфолио',
    text: 'Темы, оценки, динамика и понятный отчёт о прогрессе ученика.',
  },
];

const insideItems = [
  { icon: <CalendarDays size={18} />, title: 'Сегодня', text: 'занятия и дедлайны' },
  { icon: <Inbox size={18} />, title: 'Запросы', text: 'запись, переносы, оплаты' },
  { icon: <BarChart3 size={18} />, title: 'Прогресс', text: 'сильные стороны и зоны роста' },
];

const featureCardStyle: CSSProperties = {
  minHeight: 172,
  padding: 22,
  borderRadius: 24,
  background: '#fff',
  border: '1px solid rgba(31, 42, 59, 0.08)',
  boxShadow: '0 20px 46px rgba(15, 23, 42, 0.08)',
};

export default function LoginPage() {
  const searchParams = new URLSearchParams(window.location.search);
  const error = searchParams.get('error');
  const reason = searchParams.get('reason');
  const isTablet = useMediaQuery('(max-width: 1100px)');
  const isMobile = useMediaQuery('(max-width: 720px)');

  const handleTelegramLogin = () => {
    window.location.href = `${API_BASE}/telegram-login?redirect=${encodeURIComponent(CALLBACK_URL)}`;
  };

  const handleVKLogin = () => {
    window.location.href = `${API_BASE}/vk-login?redirect=${encodeURIComponent(CALLBACK_URL)}&role=tutor`;
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: isMobile ? 14 : 28,
        display: 'grid',
        placeItems: 'center',
        overflow: isTablet ? 'auto' : 'hidden',
        background:
          'radial-gradient(circle at 8% 10%, rgba(42,171,238,0.08), transparent 28%), radial-gradient(circle at 92% 12%, rgba(42,171,238,0.12), transparent 30%), #f5f7fa',
      }}
    >
      <section
        style={{
          width: 'min(1240px, 100%)',
          minHeight: isTablet ? 'auto' : 'calc(100vh - 56px)',
          display: 'grid',
          gridTemplateColumns: isTablet ? '1fr' : 'minmax(0, 1.15fr) minmax(360px, 440px)',
          gap: isMobile ? 24 : isTablet ? 32 : 48,
          alignItems: 'center',
          position: 'relative',
          overflow: 'hidden',
          padding: isMobile ? 22 : isTablet ? 36 : 62,
          borderRadius: isMobile ? 28 : 42,
          background: '#fff',
          border: '1px solid rgba(31, 42, 59, 0.07)',
          boxShadow: '0 34px 90px rgba(15, 23, 42, 0.13)',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            width: 420,
            height: 420,
            right: isTablet ? -230 : 350,
            top: 130,
            borderRadius: '50%',
            background: 'rgba(42, 171, 238, 0.09)',
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            width: 160,
            height: 160,
            right: isTablet ? 24 : 470,
            top: 88,
            opacity: 0.45,
            backgroundImage: 'radial-gradient(rgba(31,42,59,0.18) 1.5px, transparent 1.5px)',
            backgroundSize: '22px 22px',
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '10px 18px',
              borderRadius: 999,
              background: 'linear-gradient(135deg, #2AABEE, #229ED9)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 950,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              marginBottom: isMobile ? 22 : 30,
              boxShadow: '0 14px 28px rgba(42,171,238,0.22)',
            }}
          >
            MENTOR APP
          </div>

          <h1
            style={{
              maxWidth: 650,
              color: '#172033',
              fontSize: 'clamp(3rem, 6.5vw, 5.8rem)',
              lineHeight: 0.95,
              letterSpacing: '-0.07em',
              marginBottom: 26,
            }}
          >
            Рабочий день репетитора{' '}
            <span style={{ display: 'block', color: '#2AABEE' }}>без хаоса</span>
          </h1>

          <p
            style={{
              maxWidth: 650,
              color: '#5c687b',
              fontSize: isMobile ? 17 : 20,
              lineHeight: 1.55,
              marginBottom: isMobile ? 26 : 42,
            }}
          >
            Управляйте учениками, расписанием, заданиями, материалами и оплатами в одном месте.
            Меньше рутины — больше времени на преподавание.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
              gap: 16,
              maxWidth: 760,
            }}
          >
            {featureCards.map((item) => (
              <article key={item.title} style={featureCardStyle}>
                <div
                  style={{
                    width: 50,
                    height: 50,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: 16,
                    color: item.color,
                    background: `${item.color}18`,
                    fontSize: 24,
                    fontWeight: 950,
                    marginBottom: 20,
                  }}
                >
                  {item.icon}
                </div>
                <h2 style={{ color: '#172033', fontSize: 20, marginBottom: 12, letterSpacing: '-0.03em' }}>
                  {item.title}
                </h2>
                <p style={{ color: '#627086', fontSize: 15, lineHeight: 1.55, margin: 0 }}>
                  {item.text}
                </p>
              </article>
            ))}
          </div>
        </div>

        <aside
          style={{
            position: 'relative',
            zIndex: 1,
            justifySelf: isTablet ? 'center' : 'end',
            width: 'min(440px, 100%)',
            padding: isMobile ? 24 : 34,
            borderRadius: 32,
            background: '#fff',
            border: '1px solid rgba(31, 42, 59, 0.08)',
            boxShadow: '0 28px 70px rgba(15, 23, 42, 0.12)',
            display: 'grid',
            gap: 24,
            color: '#172033',
          }}
        >
          <div style={{ display: 'grid', justifyItems: 'center', textAlign: 'center' }}>
            <div
              style={{
                position: 'relative',
                width: 104,
                height: 104,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                background: 'linear-gradient(145deg, #eef2f7, #f8fafc)',
                color: '#172033',
                fontSize: 58,
                fontWeight: 950,
                marginBottom: 24,
              }}
            >
              M
              <span
                style={{
                  position: 'absolute',
                  right: 18,
                  top: 16,
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: '#2AABEE',
                  boxShadow: '0 6px 14px rgba(42,171,238,0.26)',
                }}
              />
            </div>

            <h2 style={{ fontSize: 28, lineHeight: 1.05, marginBottom: 10, letterSpacing: '-0.04em' }}>
              Вход в кабинет
            </h2>
            <p style={{ color: '#5c687b', fontSize: 17, lineHeight: 1.45, margin: 0 }}>
              Ваше рабочее пространство всегда под рукой
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              borderRadius: 22,
              background: '#f8fafc',
              border: '1px solid rgba(31,42,59,0.08)',
              overflow: 'hidden',
            }}
          >
            {insideItems.map((item, index) => (
              <div
                key={item.title}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '34px minmax(80px, 0.6fr) minmax(0, 1fr)',
                  gap: 12,
                  alignItems: 'center',
                  padding: '15px 18px',
                  borderBottom: index === insideItems.length - 1 ? 'none' : '1px solid rgba(31,42,59,0.06)',
                }}
              >
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 12,
                    display: 'grid',
                    placeItems: 'center',
                    background: '#eef2f7',
                    color: '#536177',
                    fontWeight: 900,
                  }}
                >
                  {item.icon}
                </span>
                <span style={{ color: '#435066', fontSize: 14, fontWeight: 800 }}>{item.title}</span>
                <strong style={{ color: '#172033', fontSize: 14, textAlign: 'right' }}>{item.text}</strong>
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
                color: '#F44336',
                fontSize: 14,
                fontWeight: 800,
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
                border: '1px solid rgba(255, 152, 0, 0.24)',
                background: 'rgba(255, 152, 0, 0.1)',
                color: '#FF9800',
                fontSize: 14,
                fontWeight: 800,
              }}
            >
              Сессия истекла. Войди снова, и мы вернём тебя обратно в кабинет.
            </div>
          )}

          <div style={{ display: 'grid', gap: 12 }}>
            <button
              onClick={handleTelegramLogin}
              style={{
                width: '100%',
                minHeight: 58,
                borderRadius: 17,
                fontSize: 17,
                fontWeight: 900,
                background: 'linear-gradient(135deg, #2AABEE, #229ED9)',
                boxShadow: '0 18px 34px rgba(42,171,238,0.26)',
              }}
            >
              ▸ Войти через Telegram
            </button>
            <button
              onClick={handleVKLogin}
              style={{
                width: '100%',
                minHeight: 58,
                borderRadius: 17,
                fontSize: 17,
                fontWeight: 900,
                background: 'linear-gradient(135deg, #0077FF, #005CC8)',
                boxShadow: '0 18px 34px rgba(0,119,255,0.22)',
              }}
            >
              ▸ Войти через VK ID
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 10,
              color: '#7a8798',
              fontSize: 14,
              lineHeight: 1.45,
              textAlign: 'center',
            }}
          >
            <span style={{ color: '#536177' }}>▧</span>
            <span>Безопасный вход. Ваши данные надёжно защищены.</span>
          </div>
        </aside>
      </section>
    </main>
  );
}
