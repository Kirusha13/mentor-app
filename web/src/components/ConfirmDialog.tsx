import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Modal } from './Modal';

interface ConfirmOptions {
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingConfirm {
  message: string;
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm должен использоваться внутри <ConfirmProvider>');
  }
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useRef<ConfirmFn>((message, options = {}) =>
    new Promise<boolean>((resolve) => {
      setPending({ message, options, resolve });
    })
  );

  const close = useCallback((value: boolean) => {
    setPending((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  const danger = pending?.options.danger ?? true;

  return (
    <ConfirmContext.Provider value={confirm.current}>
      {children}
      {pending && (
        <Modal
          onClose={() => close(false)}
          overlayStyle={{ zIndex: 3500 }}
          style={{ width: 'min(420px, 100%)', gap: 18 }}
        >
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: '#1f2a3b', fontWeight: 600 }}>
            {pending.message}
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="modal-secondary" onClick={() => close(false)}>
              {pending.options.cancelLabel ?? 'Отмена'}
            </button>
            <button
              type="button"
              className="modal-primary"
              onClick={() => close(true)}
              style={danger ? { background: '#e53e3e', boxShadow: '0 10px 24px rgba(229,62,62,0.26)' } : undefined}
            >
              {pending.options.confirmLabel ?? 'Подтвердить'}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}
