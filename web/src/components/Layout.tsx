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
];

export default function Layout({ children }: LayoutProps) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{ width: 200, background: '#1a1a2e', padding: '24px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, padding: '0 20px 20px' }}>Репетитор</div>
        {NAV_ITEMS.map(({ to, label, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            style={({ isActive }) => ({
              display: 'block',
              padding: '10px 20px',
              color: isActive ? '#fff' : '#aaa',
              background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
              textDecoration: 'none',
              borderRadius: 6,
              margin: '0 8px',
              fontSize: 14,
            })}
          >
            {label}
          </NavLink>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={handleLogout}
          style={{ margin: '0 8px', padding: '10px 20px', background: 'transparent', border: '1px solid #444', color: '#aaa', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
        >
          Выйти
        </button>
      </nav>

      <main style={{ flex: 1, padding: 24, background: '#f5f5f5' }}>{children}</main>
    </div>
  );
}