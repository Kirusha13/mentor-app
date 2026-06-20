import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const AUTO_DISMISS_MS = 3500;

const TYPE_STYLE: Record<ToastType, { bg: string; border: string; color: string; icon: string }> = {
  success: { bg: '#F0FBF2', border: '#BfE8C7', color: '#1B7A36', icon: '✓' },
  error: { bg: '#FFF2F1', border: '#F5C6C2', color: '#B42318', icon: '!' },
  info: { bg: '#EFF9FF', border: '#C5E7F7', color: '#0B6AA2', icon: 'i' },
};

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast должен использоваться внутри <ToastProvider>');
  }
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((type: ToastType, message: string) => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const api = useRef<ToastApi>({
    success: (message: string) => push('success', message),
    error: (message: string) => push('error', message),
    info: (message: string) => push('info', message),
  });

  return (
    <ToastContext.Provider value={api.current}>
      {children}
      <div
        style={{
          position: 'fixed',
          right: 18,
          bottom: 18,
          zIndex: 4000,
          display: 'grid',
          gap: 10,
          maxWidth: 'min(380px, calc(100vw - 36px))',
          pointerEvents: 'none',
        }}
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onClose={() => remove(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onClose }: { toast: ToastItem; onClose: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [onClose]);

  const style = TYPE_STYLE[toast.type];

  return (
    <div
      role="status"
      onClick={onClose}
      style={{
        pointerEvents: 'auto',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '12px 14px',
        borderRadius: 14,
        background: style.bg,
        border: `1px solid ${style.border}`,
        color: style.color,
        boxShadow: '0 14px 34px rgba(15, 23, 42, 0.14)',
        fontSize: 14,
        fontWeight: 700,
        lineHeight: 1.35,
        animation: 'toast-in 180ms ease',
      }}
    >
      <span
        style={{
          flex: '0 0 auto',
          width: 22,
          height: 22,
          borderRadius: 999,
          display: 'inline-grid',
          placeItems: 'center',
          background: style.color,
          color: '#fff',
          fontSize: 13,
          fontWeight: 900,
        }}
      >
        {style.icon}
      </span>
      <span style={{ minWidth: 0 }}>{toast.message}</span>
      <style>{`@keyframes toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
