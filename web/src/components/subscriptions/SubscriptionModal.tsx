import { useState } from 'react';
import { backdateCheck } from '../../api/subscriptions';
import { getApiErrorMessage } from '../../utils/apiError';
import { useToast } from '../Toast';
import { useFieldErrors, FieldError, type FieldRules } from '../formValidation';
import { useConfirm } from '../ConfirmDialog';
import { Modal } from '../Modal';
import { DateField } from '../DateField';

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
  const { errors, validateField, validateAll, clearError } = useFieldErrors();
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

  const subscriptionRules: FieldRules = {
    linkId: () => (Number(linkId) ? null : 'Выберите ученика и предмет'),
    hours: () => (Number.isFinite(Number(hours)) && Number(hours) > 0 ? null : 'Часы должны быть числом больше нуля'),
    price: () => (Number.isFinite(Number(price)) && Number(price) >= 0 ? null : 'Стоимость не может быть отрицательной'),
    startDate: () => (startDate ? null : 'Укажите дату начала действия'),
  };

  const handleSubmit = async () => {
    const lid = Number(linkId);
    const h = Number(hours);
    const p = Number(price);
    if (!validateAll(subscriptionRules)) return;

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
    <Modal onClose={onClose} style={{ width: 'min(420px, 100%)' }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: '#1f2a3b', marginBottom: 16 }}>
          {mode === 'edit' ? 'Изменить абонемент' : 'Добавить абонемент'}
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <label style={{ display: 'grid', gap: 5, fontSize: 13, color: '#556173' }}>
            Ученик и предмет
            {locked ? (
              <input value={lockedLabel} disabled style={{ height: 40, borderRadius: 10, border: '1px solid #d8dee8', background: '#f6f8fc', padding: '0 12px', color: '#435066' }} />
            ) : (
              <select className={errors.linkId ? 'field-invalid' : undefined} value={linkId} onChange={(e) => { setLinkId(e.target.value); clearError('linkId'); }} onBlur={() => validateField('linkId', subscriptionRules)} style={{ height: 40, borderRadius: 10, border: '1px solid #d8dee8', padding: '0 10px' }}>
                {relations.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            )}
            {!locked && <FieldError message={errors.linkId} />}
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'grid', gap: 5, fontSize: 13, color: '#556173' }}>
              Часов
              <input type="number" min="0.5" step="0.5" className={errors.hours ? 'field-invalid' : undefined} value={hours} onChange={(e) => { setHours(e.target.value); clearError('hours'); }} onBlur={() => validateField('hours', subscriptionRules)} placeholder="15" style={{ height: 40, borderRadius: 10, border: '1px solid #d8dee8', padding: '0 12px' }} />
              <FieldError message={errors.hours} />
            </label>
            <label style={{ display: 'grid', gap: 5, fontSize: 13, color: '#556173' }}>
              Стоимость, ₽
              <input type="number" min="0" step="50" className={errors.price ? 'field-invalid' : undefined} value={price} onChange={(e) => { setPrice(e.target.value); clearError('price'); }} onBlur={() => validateField('price', subscriptionRules)} placeholder="5000" style={{ height: 40, borderRadius: 10, border: '1px solid #d8dee8', padding: '0 12px' }} />
              <FieldError message={errors.price} />
            </label>
          </div>

          <label style={{ display: 'grid', gap: 5, fontSize: 13, color: '#556173' }}>
            Начало действия
            <DateField value={startDate} onChange={(value) => { setStartDate(value); clearError('startDate'); }} onBlur={() => validateField('startDate', subscriptionRules)} invalid={!!errors.startDate} />
            <FieldError message={errors.startDate} />
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
    </Modal>
  );
}
