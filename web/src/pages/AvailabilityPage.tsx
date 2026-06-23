import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { listRules, replaceRules, type AvailabilityRule, type SaveResult } from '../api/availability';

const panelStyle = {
  background: 'rgba(255,255,255,0.88)',
  padding: '16px',
  borderRadius: '22px',
  border: '1px solid rgba(24,33,47,0.08)',
  boxShadow: 'var(--shadow-card)',
} as const;

const WEEKDAY_LABELS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

interface TimeWindow {
  start: string;
  end: string;
  error?: string;
}

type DayMap = Record<number, TimeWindow[]>;

function toHHMM(time: string): string {
  // "14:00:00" → "14:00"
  return time.slice(0, 5);
}

function rulesToDayMap(rules: AvailabilityRule[]): DayMap {
  const map: DayMap = {};
  for (let i = 0; i < 7; i++) {
    map[i] = [];
  }
  for (const rule of rules) {
    map[rule.weekday]?.push({ start: toHHMM(rule.start_time), end: toHHMM(rule.end_time) });
  }
  return map;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function validateDayWindows(windows: TimeWindow[]): TimeWindow[] {
  // Reset all errors first
  const validated = windows.map((w) => ({ ...w, error: undefined as string | undefined }));

  for (let i = 0; i < validated.length; i++) {
    const w = validated[i];
    if (!w) continue;

    if (!w.start || !w.end) {
      w.error = 'Укажи начало и конец окна';
      continue;
    }

    const startMin = timeToMinutes(w.start);
    const endMin = timeToMinutes(w.end);

    if (startMin >= endMin) {
      w.error = 'Начало должно быть раньше конца';
      continue;
    }

    // Check overlap with other windows
    for (let j = 0; j < validated.length; j++) {
      if (i === j) continue;
      const other = validated[j];
      if (!other || other.error || !other.start || !other.end) continue;
      const oStart = timeToMinutes(other.start);
      const oEnd = timeToMinutes(other.end);
      if (startMin < oEnd && endMin > oStart) {
        w.error = 'Окна пересекаются';
        break;
      }
    }
  }

  return validated;
}

function formatConflictDate(startsAt: string): string {
  try {
    return new Date(startsAt).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return startsAt;
  }
}

export default function AvailabilityPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [dayMap, setDayMap] = useState<DayMap>(() => {
    const m: DayMap = {};
    for (let i = 0; i < 7; i++) m[i] = [];
    return m;
  });
  const [hasRulesEver, setHasRulesEver] = useState(true);

  useEffect(() => {
    const loadRules = async () => {
      try {
        setLoading(true);
        setNetworkError(null);
        const rules = await listRules();
        setHasRulesEver(rules.length > 0);
        setDayMap(rulesToDayMap(rules));
      } catch (err) {
        console.error('Ошибка загрузки правил доступности:', err);
        setNetworkError('Не удалось загрузить правила доступности');
      } finally {
        setLoading(false);
      }
    };

    void loadRules();
  }, []);

  const addWindow = (weekday: number) => {
    setDayMap((prev) => ({
      ...prev,
      [weekday]: [...(prev[weekday] ?? []), { start: '', end: '' }],
    }));
    setSaveResult(null);
  };

  const removeWindow = (weekday: number, index: number) => {
    setDayMap((prev) => ({
      ...prev,
      [weekday]: (prev[weekday] ?? []).filter((_, i) => i !== index),
    }));
    setSaveResult(null);
  };

  const updateWindow = (weekday: number, index: number, field: 'start' | 'end', value: string) => {
    setDayMap((prev) => {
      const windows = [...(prev[weekday] ?? [])];
      const existing = windows[index];
      if (existing) {
        windows[index] = { ...existing, [field]: value, error: undefined };
      }
      return { ...prev, [weekday]: windows };
    });
    setSaveResult(null);
  };

  const handleSave = async () => {
    // Client-side validation
    let hasError = false;
    const validatedMap: DayMap = {};

    for (let day = 0; day < 7; day++) {
      const windows = dayMap[day] ?? [];
      const validated = validateDayWindows(windows);
      validatedMap[day] = validated;
      if (validated.some((w) => w.error)) {
        hasError = true;
      }
    }

    if (hasError) {
      setDayMap(validatedMap);
      return;
    }

    // Build flat list for replace
    const rules: { weekday: number; start_time: string; end_time: string }[] = [];
    for (let day = 0; day < 7; day++) {
      for (const w of dayMap[day] ?? []) {
        if (w.start && w.end) {
          rules.push({ weekday: day, start_time: w.start, end_time: w.end });
        }
      }
    }

    try {
      setSaving(true);
      setNetworkError(null);
      setSaveResult(null);

      const result = await replaceRules(rules);
      setSaveResult(result);
      setHasRulesEver(rules.length > 0);
    } catch (err) {
      console.error('Ошибка сохранения правил доступности:', err);
      setNetworkError('Не удалось сохранить правила. Проверь подключение и попробуй снова.');
    } finally {
      setSaving(false);
    }
  };

  const totalWindows = Object.values(dayMap).reduce((sum, windows) => sum + windows.length, 0);

  return (
    <div style={{ display: 'grid', gap: 16, height: '100%', minHeight: 0, overflow: 'hidden', gridTemplateRows: 'auto auto minmax(0, 1fr) auto' }}>
      <h1 className="page-heading">Моя доступность</h1>

      {loading ? (
        <div style={{ ...panelStyle, color: '#687486' }}>Загрузка...</div>
      ) : (
        <>
          {networkError && (
            <div
              style={{
                ...panelStyle,
                background: 'rgba(229,62,62,0.08)',
                border: '1px solid rgba(229,62,62,0.2)',
                color: '#c53030',
                padding: '12px 16px',
              }}
            >
              {networkError}
            </div>
          )}

          {saveResult && (
            <div
              style={{
                ...panelStyle,
                background: saveResult.conflicts.length > 0 ? 'rgba(237,137,54,0.08)' : 'rgba(72,187,120,0.1)',
                border: `1px solid ${saveResult.conflicts.length > 0 ? 'rgba(237,137,54,0.25)' : 'rgba(72,187,120,0.25)'}`,
                color: saveResult.conflicts.length > 0 ? '#c05621' : '#276749',
                padding: '12px 16px',
              }}
            >
              {saveResult.conflicts.length === 0 && saveResult.rejected_bookings === 0 ? (
                <span style={{ fontWeight: 700 }}>Правила сохранены.</span>
              ) : (
                <>
                  {saveResult.conflicts.length > 0 && (
                    <div style={{ marginBottom: saveResult.rejected_bookings > 0 ? 10 : 0 }}>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>
                        Вне новой доступности остались занятия:
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
                        {saveResult.conflicts.map((c) => (
                          <li key={c.lesson_id} style={{ fontSize: 14 }}>
                            {c.student_name ?? 'Ученик'} — {formatConflictDate(c.starts_at)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {saveResult.rejected_bookings > 0 && (
                    <div style={{ fontSize: 14 }}>
                      Автоматически отклонено заявок: <strong>{saveResult.rejected_bookings}</strong>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {!hasRulesEver && totalWindows === 0 && !networkError && (
            <div
              style={{
                ...panelStyle,
                background: 'rgba(42,171,238,0.07)',
                border: '1px solid rgba(42,171,238,0.2)',
                color: '#1a6fa8',
                padding: '12px 16px',
                fontSize: 14,
              }}
            >
              Задай рабочие часы один раз — ученики увидят свободные окна автоматически.
            </div>
          )}

          <section
            style={{
              display: 'grid',
              gap: 12,
              overflowY: 'auto',
              scrollbarWidth: 'thin',
              minHeight: 0,
            }}
          >
            {([0, 1, 2, 3, 4, 5, 6] as const).map((day) => {
              const windows = dayMap[day] ?? [];
              return (
                <div key={day} style={{ ...panelStyle, padding: '14px 16px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: windows.length > 0 ? 12 : 0,
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontWeight: 800, fontSize: 15, color: '#1f2a3b' }}>
                      {WEEKDAY_LABELS[day]}
                    </span>
                    <button
                      type="button"
                      onClick={() => addWindow(day)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '5px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(42,171,238,0.35)',
                        background: 'rgba(42,171,238,0.07)',
                        color: '#1a6fa8',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      + Добавить окно
                    </button>
                  </div>

                  {windows.length > 0 && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {windows.map((w, idx) => (
                        <div key={idx} style={{ display: 'grid', gap: 6 }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              flexWrap: 'wrap',
                            }}
                          >
                            <input
                              type="time"
                              value={w.start}
                              onChange={(e) => updateWindow(day, idx, 'start', e.target.value)}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 10,
                                border: w.error ? '1px solid #e53e3e' : '1px solid rgba(24,33,47,0.14)',
                                fontSize: 14,
                                fontFamily: 'inherit',
                                background: '#fff',
                                color: '#1f2a3b',
                                outline: 'none',
                              }}
                            />
                            <span style={{ color: '#687486', fontSize: 13, fontWeight: 600 }}>—</span>
                            <input
                              type="time"
                              value={w.end}
                              onChange={(e) => updateWindow(day, idx, 'end', e.target.value)}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 10,
                                border: w.error ? '1px solid #e53e3e' : '1px solid rgba(24,33,47,0.14)',
                                fontSize: 14,
                                fontFamily: 'inherit',
                                background: '#fff',
                                color: '#1f2a3b',
                                outline: 'none',
                              }}
                            />
                            <button
                              type="button"
                              title="Удалить окно"
                              onClick={() => removeWindow(day, idx)}
                              className="icon-button icon-button-danger"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                          {w.error && (
                            <div style={{ color: '#c53030', fontSize: 12, paddingLeft: 2 }}>
                              {w.error}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {windows.length === 0 && (
                    <div style={{ color: '#9aabba', fontSize: 13, marginTop: 6 }}>
                      Нет окон — день выходной
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          <div
            style={{
              ...panelStyle,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ color: '#687486', fontSize: 13 }}>
              Всего окон: {totalWindows}
            </span>
            <button
              type="button"
              onClick={() => { void handleSave(); }}
              disabled={saving}
              className="modal-primary"
              style={{ minWidth: 130 }}
            >
              {saving ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
