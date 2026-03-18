import { useAuth } from '../context/AuthContext';

export default function Layout({ children }: any) {
  const { logout } = useAuth();

  return (
    <div>
      <header style={{ padding: 20, background: '#eee' }}>
        <button onClick={logout}>Выйти</button>
      </header>

      <main style={{ padding: 20 }}>{children}</main>
    </div>
  );
}