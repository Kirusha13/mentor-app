import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

// Стек открытых модалок: на Escape реагирует только верхняя (последняя открытая),
// чтобы вложенные диалоги (например, ConfirmDialog поверх формы) не закрывались разом.
const escStack: Array<() => void> = [];

interface ModalProps {
  /** Закрытие: клик по фону, Escape (если это верхняя модалка). */
  onClose: () => void;
  children: ReactNode;
  /** Доп. классы на `.app-modal` (например, "wide"). */
  className?: string;
  /** Инлайновые переопределения на `.app-modal` (ширина, паддинги и т.п.). */
  style?: CSSProperties;
  /** Инлайновые переопределения на `.modal-overlay` (например, zIndex). */
  overlayStyle?: CSSProperties;
  /** Закрывать по клику на фон. По умолчанию true. */
  closeOnOverlayClick?: boolean;
}

export function Modal({
  onClose,
  children,
  className,
  style,
  overlayStyle,
  closeOnOverlayClick = true,
}: ModalProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const handler = () => onCloseRef.current();
    escStack.push(handler);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && escStack[escStack.length - 1] === handler) {
        handler();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const idx = escStack.indexOf(handler);
      if (idx !== -1) escStack.splice(idx, 1);
    };
  }, []);

  return (
    <div
      className="modal-overlay"
      style={overlayStyle}
      onClick={closeOnOverlayClick ? onClose : undefined}
    >
      <div
        className={className ? `app-modal ${className}` : 'app-modal'}
        style={style}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}
