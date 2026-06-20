import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import AppRouter from './router/AppRouter';

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </ToastProvider>
  );
}