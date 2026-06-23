import { useState } from 'react';
import { AlertTriangle, Pencil } from 'lucide-react';
import type { Subscription } from '../../api/subscriptions';

interface Props {
  studentName: string;
  subjectName: string;
  purchasedHours: number;
  usedHours: number;
  remainingHours: number;
  subscriptionLow: boolean;
  totalPrice: number;
  subscriptions: Subscription[];
  isMobile: boolean;
  busy: boolean;
  onAdd: () => void;
  onEdit: (sub: Subscription) => void;
  onDelete: (sub: Subscription) => void;
  formatCurrency: (v: number) => string;
  formatReadableDate: (iso: string) => string;
}

const clampPct = (v: number) => Math.max(0, Math.min(100, v));

export function SubscriptionCard({
  studentName, subjectName, purchasedHours, usedHours, remainingHours,
  subscriptionLow, totalPrice, subscriptions, busy,
  onAdd, onEdit, onDelete, formatCurrency, formatReadableDate,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const remColor = subscriptionLow ? '#FF9800' : '#4CAF50';
  const usedPct = purchasedHours > 0 ? clampPct((usedHours / purchasedHours) * 100) : 0;

  return (
    <div style={{ background: '#fff', border: `1px solid ${expanded ? '#cfe8f7' : '#e2e6ee'}`, borderRadius: 14, padding: 14, boxShadow: expanded ? '0 4px 18px rgba(42,171,238,0.08)' : 'none' }}>
      <div onClick={() => setExpanded((v) => !v)} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <div style={{ fontWeight: 800, color: '#1f2a3b' }}>{studentName}</div>
          <div style={{ fontSize: 13, color: '#687486' }}>{subjectName}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div>
            <span style={{ fontWeight: 800, fontSize: 18, color: remColor }}>{remainingHours} ч</span>
            <span style={{ color: '#8a95a8', fontSize: 13 }}> / {purchasedHours} ч</span>
            {subscriptionLow && <span style={{ color: '#FF9800', marginLeft: 4, display: 'inline-flex', verticalAlign: 'text-bottom' }}><AlertTriangle size={12} /></span>}
          </div>
          <div style={{ color: '#8a95a8', fontSize: 12 }}>{formatCurrency(totalPrice)} · {expanded ? '▴' : '▾'}</div>
        </div>
      </div>

      <div style={{ height: 6, borderRadius: 3, background: '#eef1f5', marginTop: 10 }}>
        <div style={{ height: 6, width: `${usedPct}%`, borderRadius: 3, background: remColor }} />
      </div>

      {expanded && (
        <div style={{ marginTop: 12, borderTop: '1px dashed #e2e6ee', paddingTop: 12, display: 'grid', gap: 8 }}>
          {subscriptions.map((sub) => (
            <div key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '9px 12px', border: '1px solid #eef1f5', borderRadius: 10 }}>
              <div style={{ fontSize: 13, color: '#435066' }}>
                <b style={{ color: '#1f2a3b' }}>{sub.hours} ч</b> · {formatCurrency(sub.price)} · с {formatReadableDate(sub.start_date)}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" title="Изменить" onClick={() => onEdit(sub)} className="icon-button icon-button-primary" style={{ width: 28, height: 28 }}><Pencil size={14} /></button>
                <button type="button" title="Удалить" onClick={() => onDelete(sub)} disabled={busy} className="icon-button icon-button-danger" style={{ width: 28, height: 28 }}>×</button>
              </div>
            </div>
          ))}
          <button type="button" onClick={onAdd} style={{ background: 'transparent', border: '1px dashed #cfe8f7', color: '#2AABEE', borderRadius: 10, padding: '8px 12px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            + Добавить абонемент
          </button>
        </div>
      )}
    </div>
  );
}
