import { type CSSProperties } from 'react';

// Нативный <input type="date"> показывает дату в формате локали браузера
// (часто mm/dd/yyyy). Здесь поверх него лежит видимый span с ru-датой
// «23 июня 2026», а сам инпут прозрачный и ловит клики/открывает календарь.
function formatRuDate(value: string): string {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

type DateFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  min?: string;
  placeholder?: string;
  style?: CSSProperties;
};

export function DateField({
  value,
  onChange,
  onBlur,
  invalid,
  min,
  placeholder = 'Выбрать дату',
  style,
}: DateFieldProps) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        height: 40,
        padding: '0 12px',
        borderRadius: 10,
        border: invalid ? '1px solid #e53e3e' : '1px solid #d8dee8',
        background: '#fff',
        color: value ? '#1f2a3b' : '#9aabba',
        fontSize: 14,
        ...style,
      }}
    >
      <span style={{ pointerEvents: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value ? formatRuDate(value) : placeholder}
      </span>
      <input
        type="date"
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onClick={(e) => {
          try {
            (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
          } catch {
            /* showPicker не поддержан — останется обычный клик по инпуту */
          }
        }}
        aria-label={placeholder}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer',
          border: 'none',
          margin: 0,
          padding: 0,
        }}
      />
    </div>
  );
}
