import { useEffect, useState } from 'react';
import {
  createSeries,
  deleteSeries,
  listSeriesByLink,
  type LessonSeries,
  updateSeries,
} from '../api/series';
import { getApiErrorMessage } from '../utils/apiError';
import { useToast } from './Toast';
import { useFieldErrors, FieldError, type FieldRules } from './formValidation';
import { useConfirm } from './ConfirmDialog';

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const panelStyle = {
  background: 'rgba(255,255,255,0.9)',
  padding: '12px',
  borderRadius: '18px',
  border: '1px solid rgba(24,33,47,0.08)',
  boxShadow: 'var(--shadow-card)',
} as const;

const mutedTextStyle = { color: '#687486', fontSize: 14 } as const;

const today = () => new Date().toISOString().slice(0, 10);

function formatTime(hms: string): string {
  return hms.slice(0, 5);
}

interface FormState {
  weekday: string;
  start_time: string;
  duration_minutes: string;
  starts_on: string;
  ends_on: string;
}

const emptyForm = (): FormState => ({
  weekday: '0',
  start_time: '10:00',
  duration_minutes: '60',
  starts_on: today(),
  ends_on: '',
});

interface Props {
  linkId: number;
}

export function SeriesBlock({ linkId }: Props) {
  const toast = useToast();
  const { errors, validateField, validateAll, clearError } = useFieldErrors();
  const confirm = useConfirm();
  const [series, setSeries] = useState<LessonSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    try {
      setError(null);
      setLoading(true);
      const data = await listSeriesByLink(linkId);
      setSeries(data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Не удалось загрузить серии'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkId]);

  const seriesRules: FieldRules = {
    duration_minutes: () => (Number(form.duration_minutes) > 0 ? null : 'Длительность должна быть больше нуля'),
    starts_on: () => (form.starts_on ? null : 'Укажи дату начала серии'),
  };

  const handleSubmit = async () => {
    const duration = Number(form.duration_minutes);
    if (!validateAll(seriesRules)) return;
    try {
      setSubmitting(true);
      await createSeries({
        tutor_student_id: linkId,
        weekday: Number(form.weekday),
        start_time: form.start_time,
        duration_minutes: duration,
        starts_on: form.starts_on,
        ends_on: form.ends_on || null,
      });
      setForm(emptyForm());
      setShowForm(false);
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Не удалось создать серию'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (item: LessonSeries) => {
    if (item.is_active) {
      const ok = await confirm(
        'Поставить серию на паузу? Будущие незанятые занятия серии будут удалены.'
      );
      if (!ok) return;
    }
    try {
      setBusyId(item.id);
      await updateSeries(item.id, { is_active: !item.is_active });
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Не удалось обновить серию'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (item: LessonSeries) => {
    const ok = await confirm(
      'Удалить серию? Будущие нетронутые занятия будут удалены, история останется.'
    );
    if (!ok) return;
    try {
      setBusyId(item.id);
      await deleteSeries(item.id);
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Не удалось удалить серию'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section style={panelStyle}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
          gap: 8,
        }}
      >
        <div style={{ fontWeight: 800, color: '#1f2a3b' }}>Серии занятий</div>
        <button
          type="button"
          title="Добавить серию"
          onClick={() => {
            setForm(emptyForm());
            setShowForm((v) => !v);
          }}
          className="add-trigger"
          style={{ width: 28, height: 28, fontSize: 18, borderRadius: 10 }}
        >
          +
        </button>
      </div>

      {loading && <p style={{ ...mutedTextStyle, marginBottom: 0 }}>Загрузка...</p>}
      {!loading && error && (
        <p style={{ color: '#F44336', fontSize: 14, marginBottom: 0 }}>{error}</p>
      )}

      {!loading && !error && series.length === 0 && (
        <p style={{ ...mutedTextStyle, marginBottom: 0 }}>Серий пока нет.</p>
      )}

      {!loading && !error && series.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginBottom: showForm ? 12 : 0 }}>
          {series.map((item) => {
            const busy = busyId === item.id;
            const label = `Каждый ${WEEKDAY_LABELS[item.weekday]} ${formatTime(item.start_time)}, ${item.duration_minutes} мин`;
            const statusText = item.is_active ? 'активна' : 'на паузе';
            const statusColor = item.is_active ? '#4CAF50' : '#FF9800';
            const dateRange = `с ${item.starts_on}${item.ends_on ? ` до ${item.ends_on}` : ''}`;
            return (
              <div
                key={item.id}
                style={{
                  padding: '9px 12px',
                  borderRadius: 12,
                  background: 'rgba(23,32,51,0.03)',
                  border: '1px solid rgba(24,33,47,0.08)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: '#1f2a3b', fontSize: 14 }}>{label}</div>
                  <div style={{ fontSize: 12, marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: statusColor, fontWeight: 700 }}>{statusText}</span>
                    <span style={mutedTextStyle}>{dateRange}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    title={item.is_active ? 'Поставить на паузу' : 'Возобновить'}
                    disabled={busy}
                    onClick={() => handleToggleActive(item)}
                    className="icon-button"
                    style={{
                      width: 28,
                      height: 28,
                      background: item.is_active
                        ? 'rgba(255,152,0,0.12)'
                        : 'rgba(76,175,80,0.12)',
                      color: item.is_active ? '#FF9800' : '#4CAF50',
                      border: 'none',
                      borderRadius: 8,
                    }}
                  >
                    {item.is_active ? '⏸' : '▶'}
                  </button>
                  <button
                    type="button"
                    title="Удалить серию"
                    disabled={busy}
                    onClick={() => handleDelete(item)}
                    className="icon-button icon-button-danger"
                    style={{ width: 28, height: 28 }}
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div
          style={{
            marginTop: series.length > 0 ? 0 : 4,
            padding: 12,
            borderRadius: 12,
            background: 'rgba(42,171,238,0.05)',
            border: '1px solid rgba(42,171,238,0.16)',
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 700, color: '#1f2a3b', fontSize: 14 }}>Новая серия</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={{ display: 'grid', gap: 4, color: '#556173', fontSize: 13 }}>
              День недели
              <select
                value={form.weekday}
                onChange={(e) => setForm((f) => ({ ...f, weekday: e.target.value }))}
              >
                {WEEKDAY_LABELS.map((label, idx) => (
                  <option key={idx} value={idx}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4, color: '#556173', fontSize: 13 }}>
              Время начала
              <input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
              />
            </label>
          </div>

          <label style={{ display: 'grid', gap: 4, color: '#556173', fontSize: 13 }}>
            Длительность (мин)
            <input
              type="number"
              min={1}
              className={errors.duration_minutes ? 'field-invalid' : undefined}
              value={form.duration_minutes}
              onChange={(e) => { setForm((f) => ({ ...f, duration_minutes: e.target.value })); clearError('duration_minutes'); }}
              onBlur={() => validateField('duration_minutes', seriesRules)}
            />
            <FieldError message={errors.duration_minutes} />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={{ display: 'grid', gap: 4, color: '#556173', fontSize: 13 }}>
              Дата начала
              <input
                type="date"
                className={errors.starts_on ? 'field-invalid' : undefined}
                value={form.starts_on}
                onChange={(e) => { setForm((f) => ({ ...f, starts_on: e.target.value })); clearError('starts_on'); }}
                onBlur={() => validateField('starts_on', seriesRules)}
              />
              <FieldError message={errors.starts_on} />
            </label>
            <label style={{ display: 'grid', gap: 4, color: '#556173', fontSize: 13 }}>
              Дата конца (опц.)
              <input
                type="date"
                value={form.ends_on}
                onChange={(e) => setForm((f) => ({ ...f, ends_on: e.target.value }))}
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="modal-primary"
              style={{ flex: 1 }}
            >
              {submitting ? 'Создаём...' : 'Создать серию'}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setShowForm(false)}
              className="modal-secondary"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
