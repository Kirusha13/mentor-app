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

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <span style={{ color: '#B42318', fontSize: 12, fontWeight: 600, marginTop: 4 }}>
      {message}
    </span>
  );
}
