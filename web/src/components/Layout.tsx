import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { getPendingCount } from '../api/lessons';
import { useAuth } from '../context/AuthContext';
import { useMediaQuery } from '../hooks/useMediaQuery';

interface LayoutProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { to: '/', label: 'Главная', exact: true },
  { to: '/students', label: 'Ученики' },
  { to: '/contacts', label: 'Контакты' },
  { to: '/schedule', label: 'Расписание' },
  { to: '/requests', label: 'Запросы' },
  { to: '/assignments', label: 'Задания' },
  { to: '/subjects', label: 'Предметы' },
  { to: '/materials', label: 'Материалы' },
  { to: '/finance', label: 'Финансы' },
  { to: '/portfolio', label: 'Портфолио' },
];

export default function Layout({ children }: LayoutProps) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const isTablet = useMediaQuery('(max-width: 1100px)');
  const isMobile = useMediaQuery('(max-width: 820px)');
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadPendingCount = async () => {
      try {
        const result = await getPendingCount();
        if (!cancelled) {
          setPendingCount(result.count ?? 0);
        }
      } catch {
        if (!cancelled) {
          setPendingCount(0);
        }
      }
    };

    loadPendingCount();
    const intervalId = window.setInterval(loadPendingCount, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: isMobile
          ? '1fr'
          : isTablet
            ? '220px minmax(0, 1fr)'
            : '248px minmax(0, 1fr)',
      }}
    >
      <aside
        style={{
          background:
            'linear-gradient(180deg, rgba(23,32,51,0.98) 0%, rgba(26,38,59,0.97) 100%)',
          color: '#f8fafc',
          padding: isMobile ? '14px 14px 12px' : '20px 14px 16px',
          borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.06)',
          borderBottom: isMobile ? '1px solid rgba(255,255,255,0.06)' : 'none',
          boxShadow: isMobile
            ? '0 14px 32px rgba(18, 26, 38, 0.12)'
            : '18px 0 40px rgba(18, 26, 38, 0.12)',
          position: isMobile ? 'relative' : 'sticky',
          top: 0,
          height: isMobile ? 'auto' : '100vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div
          style={{
            padding: '6px 8px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div
            style={{
              fontSize: 12,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.52)',
              marginBottom: 10,
            }}
          >
            Mentor App
          </div>
          <div style={{ fontSize: isMobile ? 24 : 28, fontWeight: 800, lineHeight: 1.05 }}>
            Кабинет
          </div>
          {!isMobile && (
            <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.68)', fontSize: 14 }}>
              Панель репетитора для работы с учениками, занятиями, заданиями, финансами и
              контактными лицами.
            </div>
          )}
        </div>

        <nav
          style={{
            display: 'grid',
            gap: 6,
            gridTemplateColumns: isMobile ? 'repeat(auto-fit, minmax(132px, 1fr))' : '1fr',
          }}
        >
          {NAV_ITEMS.map(({ to, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                minHeight: 40,
                padding: '0 12px',
                borderRadius: 12,
                color: isActive ? '#fff' : 'rgba(255,255,255,0.72)',
                background: isActive ? 'rgba(217,111,50,0.92)' : 'rgba(255,255,255,0.04)',
                border: isActive
                  ? '1px solid rgba(255,255,255,0.12)'
                  : '1px solid transparent',
                boxShadow: isActive ? '0 10px 24px rgba(217,111,50,0.24)' : 'none',
                fontSize: 14,
                fontWeight: 700,
                gap: 10,
              })}
            >
              <span>{label}</span>
              {to === '/requests' && pendingCount > 0 ? (
                <span
                  style={{
                    minWidth: 22,
                    height: 22,
                    padding: '0 6px',
                    borderRadius: 999,
                    background: '#d94b4b',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 800,
                    boxShadow: '0 8px 18px rgba(217,75,75,0.28)',
                  }}
                >
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div
          style={{
            marginTop: isMobile ? 0 : 'auto',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16,
            padding: 14,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Рабочая сессия</div>
          {!isMobile && (
            <div style={{ color: 'rgba(255,255,255,0.68)', fontSize: 13, marginBottom: 14 }}>
              Все основные разделы доступны из бокового меню.
            </div>
          )}
          <button
            onClick={handleLogout}
            style={{
              width: isMobile ? 'auto' : '100%',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.16)',
              color: '#fff',
              boxShadow: 'none',
            }}
          >
            Выйти
          </button>
        </div>
      </aside>

      <main
        style={{
          minWidth: 0,
          padding: isMobile ? '12px' : isTablet ? '14px' : '16px 18px 20px',
        }}
      >
        <div
          style={{
            minHeight: isMobile ? 'auto' : 'calc(100vh - 36px)',
            borderRadius: isMobile ? 18 : 24,
            background: 'rgba(255,255,255,0.52)',
            border: '1px solid rgba(255,255,255,0.5)',
            boxShadow: '0 24px 60px rgba(27, 39, 52, 0.08)',
            backdropFilter: 'blur(16px)',
            padding: isMobile ? 12 : isTablet ? 14 : 18,
          }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
