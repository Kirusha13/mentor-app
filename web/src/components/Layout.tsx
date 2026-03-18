import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div>
      <header
        style={{
          padding: 20,
          background: '#eee',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <strong>Личный кабинет репетитора</strong>
        <button onClick={handleLogout}>Выйти</button>
      </header>

      <main style={{ padding: 20 }}>{children}</main>
    </div>
  );
}