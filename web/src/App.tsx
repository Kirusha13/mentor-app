import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/ConfirmDialog';
import AppRouter from './router/AppRouter';

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}