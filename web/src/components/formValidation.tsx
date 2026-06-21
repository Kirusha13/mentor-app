import { useCallback, useState } from 'react';

// поле -> функция, возвращающая текст ошибки или null (поле валидно)
export type FieldRules = Record<string, () => string | null>;

export function useFieldErrors() {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateField = useCallback((field: string, rules: FieldRules): boolean => {
    const message = rules[field]?.() ?? null;
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[field] = message;
      else delete next[field];
      return next;
    });
    return !message;
  }, []);

  const validateAll = useCallback((rules: FieldRules): boolean => {
    const next: Record<string, string> = {};
    for (const [field, rule] of Object.entries(rules)) {
      const message = rule();
      if (message) next[field] = message;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, []);

  const clearError = useCallback((field: string) => {
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const reset = useCallback(() => setErrors({}), []);

  return { errors, validateField, validateAll, clearError, reset };
}

// --- Переиспользуемые правила валидации полей ---

const PHONE_RE = /^[+()\d][\d\s()-]*$/;

/** Имя/ФИО: непустое, минимум 2 символа, содержит буквы (не только цифры). */
export function personNameError(value: string, label: string): string | null {
  const v = value.trim();
  if (!v) return `Укажи ${label}`;
  if (v.length < 2) return `${label} — минимум 2 символа`;
  if (!/\p{L}/u.test(v)) return `${label} должно содержать буквы, не только цифры`;
  return null;
}

/**
 * Телефон: необязателен; если задан — только цифры/+/пробелы/скобки/дефис,
 * не длиннее 15 символов (колонка БД — varchar(15)) и минимум 5 цифр.
 */
export function phoneError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (!PHONE_RE.test(v)) return 'Телефон: только цифры, +, пробелы, скобки и дефис';
  if (v.length > 15) return 'Телефон не длиннее 15 символов';
  if (v.replace(/\D/g, '').length < 5) return 'Слишком короткий телефон (минимум 5 цифр)';
  return null;
}

/**
 * Telegram ID: только цифры, не длиннее 15 знаков (укладывается в BigInteger).
 * required=true — поле обязательно (ученик); false — часть пары (контакт).
 */
export function telegramIdError(value: string, required: boolean): string | null {
  const v = value.trim();
  if (!v) return required ? 'Укажи Telegram ID' : null;
  if (!/^\d+$/.test(v)) return 'Telegram ID — только цифры';
  if (v.length > 15) return 'Слишком длинный Telegram ID';
  return null;
}

/** Класс: необязателен; если задан — целое число от 1 до 13. */
export function gradeError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (!/^\d{1,2}$/.test(v) || Number(v) < 1 || Number(v) > 13) {
    return 'Класс должен быть числом от 1 до 13';
  }
  return null;
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <span style={{ color: '#B42318', fontSize: 12, fontWeight: 600, marginTop: 4 }}>
      {message}
    </span>
  );
}
