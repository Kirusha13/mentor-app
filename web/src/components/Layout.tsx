import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface LayoutProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { to: '/', label: 'Главная', exact: true },
  { to: '/students', label: 'Ученики' },
  { to: '/schedule', label: 'Расписание' },
  { to: '/assignments', label: 'Задания' },
  { to: '/subjects', label: 'Предметы' },
  { to: '/finance', label: 'Финансы' },
  { to: '/portfolio', label: 'Портфолио' },
];

export default function Layout({ children }: LayoutProps) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '280px minmax(0, 1fr)',
      }}
    >
      <aside
        style={{
          background:
            'linear-gradient(180deg, rgba(23,32,51,0.98) 0%, rgba(26,38,59,0.97) 100%)',
          color: '#f8fafc',
          padding: '28px 18px 22px',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '18px 0 40px rgba(18, 26, 38, 0.12)',
          position: 'sticky',
          top: 0,
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <div
          style={{
            padding: '8px 10px 20px',
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
          <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.05 }}>Кабинет</div>
          <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.68)', fontSize: 14 }}>
            Панель репетитора для работы с учениками, занятиями и материалами.
          </div>
        </div>

        <nav style={{ display: 'grid', gap: 8 }}>
          {NAV_ITEMS.map(({ to, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                minHeight: 46,
                padding: '0 14px',
                borderRadius: 14,
                color: isActive ? '#fff' : 'rgba(255,255,255,0.72)',
                background: isActive ? 'rgba(217,111,50,0.92)' : 'rgba(255,255,255,0.04)',
                border: isActive
                  ? '1px solid rgba(255,255,255,0.12)'
                  : '1px solid transparent',
                boxShadow: isActive ? '0 10px 24px rgba(217,111,50,0.24)' : 'none',
                fontSize: 15,
                fontWeight: 700,
              })}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div
          style={{
            marginTop: 'auto',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 18,
            padding: 16,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Рабочая сессия</div>
          <div style={{ color: 'rgba(255,255,255,0.68)', fontSize: 13, marginBottom: 14 }}>
            Все основные разделы доступны из бокового меню.
          </div>
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
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
          padding: '28px 32px 40px',
        }}
      >
        <div
          style={{
            minHeight: 'calc(100vh - 68px)',
            borderRadius: 30,
            background: 'rgba(255,255,255,0.52)',
            border: '1px solid rgba(255,255,255,0.5)',
            boxShadow: '0 24px 60px rgba(27, 39, 52, 0.08)',
            backdropFilter: 'blur(16px)',
            padding: 24,
          }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
