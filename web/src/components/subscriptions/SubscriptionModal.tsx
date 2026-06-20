import { useState } from 'react';
import { backdateCheck } from '../../api/subscriptions';
import { getApiErrorMessage } from '../../utils/apiError';
import { useToast } from '../Toast';
import { useConfirm } from '../ConfirmDialog';

export interface RelationOption {
  id: number;
  label: string; // «Иван Петров · Математика»
}

export interface SubscriptionModalSubmit {
  mode: 'create' | 'edit';
  editingId: number | null;
  linkId: number;
  hours: number;
  price: number;
  startDate: string; // YYYY-MM-DD
}

interface Props {
  mode: 'create' | 'edit';
  relations: RelationOption[];
  lockedRelationId?: number | null;
  initial?: { hours: string; price: string; startDate: string };
  editingId?: number | null;
  onClose: () => void;
  onSubmit: (args: SubscriptionModalSubmit) => Promise<void>;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export function SubscriptionModal({
  mode, relations, lockedRelationId = null, initial, editingId = null, onClose, onSubmit,
}: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const [linkId, setLinkId] = useState<string>(
    lockedRelationId != null ? String(lockedRelationId) : (relations[0] ? String(relations[0].id) : '')
  );
  const [hours, setHours] = useState(initial?.hours ?? '');
  const [price, setPrice] = useState(initial?.price ?? '');
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayISO());
  const [saving, setSaving] = useState(false);

  const locked = lockedRelationId != null || mode === 'edit';
  const lockedLabel = relations.find((r) => String(r.id) === String(lockedRelationId ?? linkId))?.label ?? '';

  const handleSubmit = async () => {
    const lid = Number(linkId);
    const h = Number(hours);
    const p = Number(price);
    if (!lid) { toast.error('Выберите ученика и предмет.'); return; }
    if (!Number.isFinite(h) || h <= 0) { toast.error('Часы должны быть числом больше нуля.'); return; }
    if (!Number.isFinite(p) || p < 0) { toast.error('Стоимость не может быть отрицательной.'); return; }
    if (!startDate) { toast.error('Укажите дату начала действия.'); return; }

    try {
      setSaving(true);
      if (startDate < todayISO()) {
        const res = await backdateCheck(lid, startDate);
        const n = res.covered_paid_lessons.length;
        if (n > 0 && !(await confirm(
          `Дата в прошлом: ${n} уже оплаченных занятий попадут под абонемент. Продолжить?`
        ))) { setSaving(false); return; }
      }
      await onSubmit({ mode, editingId, linkId: lid, hours: h, price: p, startDate });
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Не удалось сохранить абонемент.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,32,56,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 18, padding: 22, width: 'min(420px, 100%)', boxShadow: '0 24px 70px rgba(15,23,42,0.2)' }}
      >
        <div style={{ fontWeight: 800, fontSize: 17, color: '#1f2a3b', marginBottom: 16 }}>
          {mode === 'edit' ? 'Изменить абонемент' : 'Добавить абонемент'}
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <label style={{ display: 'grid', gap: 5, fontSize: 13, color: '#556173' }}>
            Ученик и предмет
            {locked ? (
              <input value={lockedLabel} disabled style={{ height: 40, borderRadius: 10, border: '1px solid #d8dee8', background: '#f6f8fc', padding: '0 12px', color: '#435066' }} />
            ) : (
              <select value={linkId} onChange={(e) => setLinkId(e.target.value)} style={{ height: 40, borderRadius: 10, border: '1px solid #d8dee8', padding: '0 10px' }}>
                {relations.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            )}
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'grid', gap: 5, fontSize: 13, color: '#556173' }}>
              Часов
              <input type="number" min="0.5" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="15" style={{ height: 40, borderRadius: 10, border: '1px solid #d8dee8', padding: '0 12px' }} />
            </label>
            <label style={{ display: 'grid', gap: 5, fontSize: 13, color: '#556173' }}>
              Стоимость, ₽
              <input type="number" min="0" step="50" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="5000" style={{ height: 40, borderRadius: 10, border: '1px solid #d8dee8', padding: '0 12px' }} />
            </label>
          </div>

          <label style={{ display: 'grid', gap: 5, fontSize: 13, color: '#556173' }}>
            Начало действия
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ height: 40, borderRadius: 10, border: '1px solid #d8dee8', padding: '0 12px' }} />
          </label>

          <div style={{ fontSize: 12, color: '#8a95a8', background: '#f6f8fc', borderRadius: 10, padding: '10px 12px', lineHeight: 1.5 }}>
            Указывайте часы, а не занятия: 10 занятий по 1,5 ч = 15 ч.<br />
            «Начало действия» — дата, с которой занятия идут в счёт абонемента.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} className="modal-secondary" style={{ padding: '9px 16px' }}>Отмена</button>
          <button type="button" onClick={handleSubmit} disabled={saving} className="modal-primary" style={{ padding: '9px 16px', fontWeight: 700 }}>
            {saving ? 'Сохраняем...' : mode === 'edit' ? 'Сохранить' : 'Добавить'}
          </button>
        </div>
      </div>
    </div>
  );
}
