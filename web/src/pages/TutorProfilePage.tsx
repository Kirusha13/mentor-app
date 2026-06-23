import { useEffect, useMemo, useState, useCallback } from 'react';
import { Check, GraduationCap, Pencil, Star, Trash2, X } from 'lucide-react';
import {
  createSubject,
  deleteSubject,
  getSubjects,
  updateSubject,
  type Subject,
} from '../api/subjects';
import { getTutorProfile, updateTutorProfile, type TutorProfile } from '../api/tutor';
import { Modal } from '../components/Modal';
import {
  createTutorLevel,
  deleteTutorLevel,
  getTutorLevels,
  updateTutorLevel,
  type TutorLevel,
} from '../api/tutorLevels';
import { getApiErrorMessage } from '../utils/apiError';
import { useToast } from '../components/Toast';
import { useFieldErrors, FieldError, phoneError, type FieldRules } from '../components/formValidation';
import { useConfirm } from '../components/ConfirmDialog';

const API_BASE = import.meta.env.VITE_API_BASE_URL.replace('/api/v1', '');

const panelStyle = {
  background: 'rgba(255,255,255,0.9)',
  padding: '18px',
  borderRadius: '22px',
  border: '1px solid rgba(24,33,47,0.08)',
  boxShadow: 'var(--shadow-card)',
} as const;

const mutedTextStyle = {
  color: '#687486',
  fontSize: 14,
} as const;

function formatDateTime(value: string | null) {
  if (!value) return 'Не было';

  try {
    return new Date(value).toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function fieldCard(label: string, value: string) {
  return (
    <div
      key={label}
      style={{
        display: 'grid',
        gap: 3,
        padding: '10px 12px',
        borderRadius: 14,
        background: 'rgba(23,32,51,0.035)',
        border: '1px solid rgba(24,33,47,0.07)',
      }}
    >
      <div style={{ ...mutedTextStyle, fontSize: 12 }}>{label}</div>
      <div style={{ color: '#1f2a3b', fontSize: 15, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

export default function TutorProfilePage() {
  const toast = useToast();
  const { errors, validateField, validateAll, clearError, reset } = useFieldErrors();
  const confirm = useConfirm();
  const [profile, setProfile] = useState<TutorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [subjectSearch, setSubjectSearch] = useState('');
  const [subjectCreateModalOpen, setSubjectCreateModalOpen] = useState(false);
  const [creatingSubject, setCreatingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectRate, setNewSubjectRate] = useState('');
  const [editingSubjectId, setEditingSubjectId] = useState<number | null>(null);
  const [editSubjectName, setEditSubjectName] = useState('');
  const [editSubjectRate, setEditSubjectRate] = useState('');

  const [levels, setLevels] = useState<TutorLevel[]>([]);
  const [levelsLoading, setLevelsLoading] = useState(true);
  const [levelsSaving, setLevelsSaving] = useState(false);
  const [levelsModalOpen, setLevelsModalOpen] = useState(false);
  const [newLevelName, setNewLevelName] = useState('');
  const [editingLevelId, setEditingLevelId] = useState<number | null>(null);
  const [editLevelName, setEditLevelName] = useState('');
  const [editLevelIsFavourite, setEditLevelIsFavourite] = useState(false);
  const [showOnlyFavouriteLevels, setShowOnlyFavouriteLevels] = useState(false);

  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [paymentBankName, setPaymentBankName] = useState('');
  const [linkMessage, setLinkMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      try {
        setLoading(true);
        const data = await getTutorProfile();
        if (cancelled) return;
        setProfile(data);
        setFullName(data.full_name);
        setPhoneNumber(data.phone_number ?? '');
        setPaymentBankName(data.payment_bank_name ?? '');
      } catch (error) {
        if (!cancelled) {
          console.error('Ошибка загрузки профиля репетитора:', error);
          toast.error(getApiErrorMessage(error, 'Не удалось загрузить личный кабинет.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const loadSubjects = async () => {
      try {
        setSubjectsLoading(true);
        const data = await getSubjects();
        if (!cancelled) setSubjects(data);
      } catch (error) {
        if (!cancelled) {
          console.error('Ошибка загрузки предметов:', error);
          toast.error('Не удалось загрузить предметы');
        }
      } finally {
        if (!cancelled) setSubjectsLoading(false);
      }
    };

    const loadLevels = async () => {
      try {
        setLevelsLoading(true);
        const data = await getTutorLevels();
        if (!cancelled) setLevels(data);
      } catch (error) {
        if (!cancelled) {
          console.error('Ошибка загрузки уровней:', error);
          toast.error(getApiErrorMessage(error, 'Не удалось загрузить уровни обучения'));
        }
      } finally {
        if (!cancelled) setLevelsLoading(false);
      }
    };

    void loadProfile();
    void loadSubjects();
    void loadLevels();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('vk_linked') === '1') {
      setLinkMessage({ type: 'ok', text: 'VK ID успешно привязан' });
      window.history.replaceState({}, '', '/profile');
    } else if (params.get('tg_linked') === '1') {
      setLinkMessage({ type: 'ok', text: 'Telegram успешно привязан' });
      window.history.replaceState({}, '', '/profile');
    } else if (params.get('error') === 'vk_link_failed') {
      setLinkMessage({ type: 'err', text: 'Не удалось привязать VK ID — попробуй ещё раз' });
      window.history.replaceState({}, '', '/profile');
    } else if (params.get('error') === 'tg_link_failed') {
      setLinkMessage({ type: 'err', text: 'Не удалось привязать Telegram — попробуй ещё раз' });
      window.history.replaceState({}, '', '/profile');
    }
  }, []);

  const handleLinkVk = useCallback(() => {
    const callbackUrl = `${window.location.origin}/link-vk-callback`;
    window.location.href = `${API_BASE}/vk-login?redirect=${encodeURIComponent(callbackUrl)}&role=tutor&mode=link`;
  }, []);

  const handleLinkTelegram = useCallback(() => {
    const callbackUrl = `${window.location.origin}/link-telegram-callback`;
    window.location.href = `${API_BASE}/telegram-login?redirect=${encodeURIComponent(callbackUrl)}&mode=link`;
  }, []);

  const initials = useMemo(() => getInitials(profile?.full_name ?? 'Репетитор'), [profile?.full_name]);

  const filteredSubjects = useMemo(
    () =>
      subjects.filter((subject) =>
        subject.name.toLowerCase().includes(subjectSearch.trim().toLowerCase())
      ),
    [subjectSearch, subjects]
  );

  const sortedLevels = useMemo(
    () =>
      [...levels].sort((a, b) => {
        if (a.is_favourite !== b.is_favourite) {
          return a.is_favourite ? -1 : 1;
        }
        return a.name.localeCompare(b.name, 'ru-RU');
      }),
    [levels]
  );

  const visibleLevels = useMemo(
    () => (showOnlyFavouriteLevels ? sortedLevels.filter((level) => level.is_favourite) : sortedLevels),
    [showOnlyFavouriteLevels, sortedLevels]
  );

  const handleProfileCancel = () => {
    if (!profile) return;
    setFullName(profile.full_name);
    setPhoneNumber(profile.phone_number ?? '');
    setPaymentBankName(profile.payment_bank_name ?? '');
    setEditing(false);
  };

const profileRules: FieldRules = {
    fullName: () => (fullName.trim() ? null : 'Укажи имя репетитора'),
    phoneNumber: () => phoneError(phoneNumber),
  };

  const handleProfileSave = async () => {
    if (!profile) return;
    if (!validateAll(profileRules)) return;

    try {
      setSaving(true);
      const updated = await updateTutorProfile({
        full_name: fullName.trim(),
        phone_number: phoneNumber.trim() || null,
        payment_bank_name: paymentBankName.trim() || null,
      });
      setProfile(updated);
      setFullName(updated.full_name);
      setPhoneNumber(updated.phone_number ?? '');
      setPaymentBankName(updated.payment_bank_name ?? '');
      setEditing(false);
    } catch (error) {
      console.error('Ошибка сохранения профиля репетитора:', error);
      toast.error(getApiErrorMessage(error, 'Не удалось сохранить изменения профиля.'));
    } finally {
      setSaving(false);
    }
  };

  const subjectCreateRules: FieldRules = {
    newSubjectName: () => (newSubjectName.trim() ? null : 'Укажи название предмета'),
    newSubjectRate: () => (Number(newSubjectRate) > 0 ? null : 'Ставка должна быть больше нуля'),
  };

  const handleSubjectCreate = async () => {
    if (!validateAll(subjectCreateRules)) return;
    const rate = Number(newSubjectRate);

    try {
      setCreatingSubject(true);
      const created = await createSubject({
        name: newSubjectName.trim(),
        default_rate: rate,
      });

      setSubjects((prev) => [created, ...prev]);
      setNewSubjectName('');
      setNewSubjectRate('');
      setSubjectCreateModalOpen(false);
      toast.success(`Предмет "${created.name}" создан`);
    } catch (error) {
      console.error('Ошибка создания предмета:', error);
      toast.error('Не удалось создать предмет');
    } finally {
      setCreatingSubject(false);
    }
  };

  const startSubjectEditing = (subject: Subject) => {
    setEditingSubjectId(subject.id);
    setEditSubjectName(subject.name);
    setEditSubjectRate(String(subject.default_rate ?? ''));
  };

  const cancelSubjectEditing = () => {
    setEditingSubjectId(null);
    setEditSubjectName('');
    setEditSubjectRate('');
  };

  const subjectSaveRules: FieldRules = {
    editSubjectName: () => (editSubjectName.trim() ? null : 'Укажи название предмета'),
    editSubjectRate: () => (Number(editSubjectRate) > 0 ? null : 'Ставка должна быть больше нуля'),
  };

  const handleSubjectSave = async (subjectId: number) => {
    if (!validateAll(subjectSaveRules)) return;
    const rate = Number(editSubjectRate);

    try {
      const updated = await updateSubject(subjectId, {
        name: editSubjectName.trim(),
        default_rate: rate,
      });

      setSubjects((prev) =>
        prev.map((subject) => (subject.id === subjectId ? updated : subject))
      );
      cancelSubjectEditing();
    } catch (error) {
      console.error('Ошибка обновления предмета:', error);
      toast.error('Не удалось обновить предмет');
    }
  };

  const handleSubjectDelete = async (subjectId: number, subjectName: string) => {
    const confirmed = await confirm(`Удалить предмет "${subjectName}"?`);
    if (!confirmed) return;

    try {
      await deleteSubject(subjectId);
      setSubjects((prev) => prev.filter((subject) => subject.id !== subjectId));
    } catch (error) {
      console.error('Ошибка удаления предмета:', error);
      toast.error('Не удалось удалить предмет');
    }
  };

  const handleCopyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      toast.success('Код приглашения скопирован');
    } catch (error) {
      console.error('Ошибка копирования токена:', error);
      toast.error('Не удалось скопировать код приглашения');
    }
  };

  const startLevelEditing = (level: TutorLevel) => {
    setEditingLevelId(level.id);
    setEditLevelName(level.name);
    setEditLevelIsFavourite(level.is_favourite);
  };

  const cancelLevelEditing = () => {
    setEditingLevelId(null);
    setEditLevelName('');
    setEditLevelIsFavourite(false);
  };

  const levelCreateRules: FieldRules = {
    newLevelName: () => (newLevelName.trim() ? null : 'Укажи название уровня'),
  };
  const levelSaveRules: FieldRules = {
    editLevelName: () => (editLevelName.trim() ? null : 'Название уровня не может быть пустым'),
  };

  const handleLevelCreate = async () => {
    const name = newLevelName.trim();
    if (!validateAll(levelCreateRules)) return;

    try {
      setLevelsSaving(true);
      const created = await createTutorLevel({
        name,
        is_favourite: false,
      });
      setLevels((prev) => [...prev, created]);
      setNewLevelName('');
    } catch (error) {
      console.error('Ошибка создания уровня:', error);
      toast.error(getApiErrorMessage(error, 'Не удалось создать уровень'));
    } finally {
      setLevelsSaving(false);
    }
  };

  const handleLevelSave = async (level: TutorLevel) => {
    const name = editLevelName.trim();
    if (!validateAll(levelSaveRules)) return;

    try {
      setLevelsSaving(true);
      const updated = await updateTutorLevel(level.id, {
        name,
        is_favourite: editLevelIsFavourite,
      });
      setLevels((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      cancelLevelEditing();
    } catch (error) {
      console.error('Ошибка сохранения уровня:', error);
      toast.error(getApiErrorMessage(error, 'Не удалось сохранить уровень'));
    } finally {
      setLevelsSaving(false);
    }
  };

  const handleLevelDelete = async (level: TutorLevel) => {
    if (!(await confirm(`Удалить уровень «${level.name}»? Связи с темами и учениками будут очищены.`))) {
      return;
    }

    try {
      await deleteTutorLevel(level.id);
      setLevels((prev) => prev.filter((item) => item.id !== level.id));
    } catch (error) {
      console.error('Ошибка удаления уровня:', error);
      toast.error(getApiErrorMessage(error, 'Не удалось удалить уровень'));
    }
  };

  const handleToggleLevelFavourite = async (level: TutorLevel) => {
    try {
      const updated = await updateTutorLevel(level.id, {
        is_favourite: !level.is_favourite,
      });
      setLevels((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      console.error('Ошибка обновления избранного уровня:', error);
      toast.error(getApiErrorMessage(error, 'Не удалось обновить избранное'));
    }
  };

  if (loading) {
    return <p style={{ color: '#687486', margin: 0 }}>Загрузка личного кабинета...</p>;
  }

  if (!profile) {
    return <p style={{ color: '#687486', margin: 0 }}>Профиль репетитора недоступен.</p>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto auto', alignContent: 'start', gap: 16, height: '100%', minHeight: 0, overflow: 'hidden' }}>
      <section
        style={{
          ...panelStyle,
          padding: 0,
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          alignItems: 'stretch',
        }}
      >
        <div
          style={{
            padding: 22,
            background:
              'radial-gradient(circle at 18% 12%, rgba(42,171,238,0.34), transparent 28%), linear-gradient(135deg, #172033 0%, #24324a 100%)',
            color: '#fff',
            display: 'flex',
            gap: 16,
            alignItems: 'center',
            minHeight: 180,
          }}
        >
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.full_name}
              style={{
                width: 78,
                height: 78,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid rgba(255,255,255,0.18)',
                boxShadow: '0 18px 38px rgba(0,0,0,0.18)',
              }}
            />
          ) : (
            <div
              style={{
                width: 78,
                height: 78,
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.12)',
                border: '2px solid rgba(255,255,255,0.14)',
                fontSize: 28,
                fontWeight: 900,
                boxShadow: '0 18px 38px rgba(0,0,0,0.14)',
                flexShrink: 0,
              }}
            >
              {initials || 'Р'}
            </div>
          )}

          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.05, marginBottom: 8 }}>
              {profile.full_name}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 14 }}>
              Личный кабинет репетитора
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={profile.vk_id ? undefined : handleLinkVk}
                title={profile.vk_id ? `VK ID: ${profile.vk_id}` : 'Привязать VK ID'}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px', borderRadius: 20, fontWeight: 700, fontSize: 13,
                  background: profile.vk_id ? 'rgba(0,119,255,0.3)' : 'rgba(255,255,255,0.1)',
                  border: `1px solid ${profile.vk_id ? 'rgba(0,119,255,0.7)' : 'rgba(255,255,255,0.2)'}`,
                  color: '#fff',
                  cursor: profile.vk_id ? 'default' : 'pointer',
                  boxShadow: 'none',
                }}
              >
                VK
                <span style={{ display: 'inline-flex', color: profile.vk_id ? '#81c784' : '#ef9a9a' }}>
                  {profile.vk_id ? <Check size={15} /> : <X size={15} />}
                </span>
              </button>

              <button
                type="button"
                onClick={profile.telegram_id ? undefined : handleLinkTelegram}
                title={profile.telegram_id ? `Telegram ID: ${profile.telegram_id}` : 'Привязать Telegram'}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px', borderRadius: 20, fontWeight: 700, fontSize: 13,
                  background: profile.telegram_id ? 'rgba(42,171,238,0.3)' : 'rgba(255,255,255,0.1)',
                  border: `1px solid ${profile.telegram_id ? 'rgba(42,171,238,0.7)' : 'rgba(255,255,255,0.2)'}`,
                  color: '#fff',
                  cursor: profile.telegram_id ? 'default' : 'pointer',
                  boxShadow: 'none',
                }}
              >
                Telegram
                <span style={{ display: 'inline-flex', color: profile.telegram_id ? '#81c784' : '#ef9a9a' }}>
                  {profile.telegram_id ? <Check size={15} /> : <X size={15} />}
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 0.9fr) minmax(420px, 1.1fr)', gap: 16, minHeight: 0, overflow: 'visible', alignItems: 'start' }}>
      <article style={{ ...panelStyle, display: 'grid', alignContent: 'start', gap: 12, minHeight: 0, padding: 16 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(180px, 1fr) auto',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            minHeight: 48,
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#1f2a3b', lineHeight: 1.1 }}>
              Данные профиля
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {!editing ? (
              <button type="button" title="Редактировать профиль" onClick={() => setEditing(true)}>
                Редактировать
              </button>
            ) : (
              <>
                <button type="button" onClick={handleProfileSave} disabled={saving}>
                  {saving ? 'Сохраняем...' : 'Сохранить'}
                </button>
                <button
                  type="button"
                  onClick={handleProfileCancel}
                  style={{
                    background: '#fff',
                    color: '#1f2a3b',
                    border: '1px solid rgba(24,33,47,0.12)',
                    boxShadow: 'none',
                  }}
                >
                  Отмена
                </button>
              </>
            )}
          </div>
        </div>

        {editing ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={mutedTextStyle}>Полное имя</span>
              <input className={errors.fullName ? 'field-invalid' : undefined} value={fullName} onChange={(event) => { setFullName(event.target.value); clearError('fullName'); }} onBlur={() => validateField('fullName', profileRules)} />
              <FieldError message={errors.fullName} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'start' }}>
              <label style={{ display: 'grid', gap: 5 }}>
                <span style={mutedTextStyle}>Телефон (СБП)</span>
                <input
                  className={errors.phoneNumber ? 'field-invalid' : undefined}
                  value={phoneNumber}
                  onChange={(event) => { setPhoneNumber(event.target.value); clearError('phoneNumber'); }}
                  onBlur={() => validateField('phoneNumber', profileRules)}
                  placeholder="+7..."
                />
                <FieldError message={errors.phoneNumber} />
              </label>
              <label style={{ display: 'grid', gap: 5 }}>
                <span style={mutedTextStyle}>Банк для СБП</span>
                <input
                  value={paymentBankName}
                  onChange={(event) => setPaymentBankName(event.target.value)}
                  placeholder="Тинькофф, Сбер..."
                />
              </label>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            {fieldCard('Дата регистрации', formatDateTime(profile.registered_at))}
            {fieldCard('Телефон (СБП)', profile.phone_number ?? '—')}
            {fieldCard('Банк для СБП', profile.payment_bank_name ?? '—')}
          </div>
        )}

        {linkMessage && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            background: linkMessage.type === 'ok' ? 'rgba(76,175,80,0.1)' : 'rgba(239,83,80,0.1)',
            color: linkMessage.type === 'ok' ? '#2e7d32' : '#c62828',
            border: `1px solid ${linkMessage.type === 'ok' ? 'rgba(76,175,80,0.3)' : 'rgba(239,83,80,0.3)'}`,
          }}>
            {linkMessage.text}
          </div>
        )}
      </article>

      <article style={{ ...panelStyle, display: 'grid', alignContent: 'start', gap: 12, minHeight: 0, overflow: 'visible', padding: 16 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(180px, 1fr) minmax(270px, auto)',
            alignItems: 'center',
            gap: 12,
            minHeight: 48,
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#1f2a3b', marginBottom: 2, lineHeight: 1.1 }}>
              Предметы
            </div>
            <div style={{ ...mutedTextStyle, fontSize: 13 }}>Всего предметов: {subjects.length}</div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
            <button
              type="button"
              title="Открыть уровни обучения"
              onClick={() => { reset(); setLevelsModalOpen(true); }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#fff',
                color: '#1f2a3b',
                border: '1px solid rgba(24,33,47,0.12)',
                boxShadow: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              <GraduationCap size={16} />
              Уровни
            </button>
            <input
              value={subjectSearch}
              onChange={(event) => setSubjectSearch(event.target.value)}
              placeholder="Поиск по названию"
              style={{ width: 'min(220px, 40vw)' }}
            />
            <button
              title="Создать предмет"
              type="button"
              onClick={() => { reset(); setSubjectCreateModalOpen(true); }}
              className="add-trigger"
            >
              +
            </button>
          </div>
        </div>

        {subjectsLoading ? (
          <p style={{ color: '#687486', marginBottom: 0 }}>Загрузка предметов...</p>
        ) : filteredSubjects.length === 0 ? (
          <div
            style={{
              padding: 18,
              borderRadius: 18,
              background: 'rgba(23,32,51,0.04)',
              color: '#687486',
            }}
          >
            Предметы не найдены.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {filteredSubjects.map((subject) => {
              const isEditing = editingSubjectId === subject.id;

              return (
                <article
                  key={subject.id}
                  style={{
                    border: '1px solid rgba(24,33,47,0.08)',
                    borderRadius: '18px',
                    padding: '14px',
                    background: '#fff',
                    boxShadow: '0 10px 24px rgba(15,23,42,0.05)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 240 }}>
                      {isEditing ? (
                        <div style={{ display: 'grid', gap: 10 }}>
                          <input
                            className={errors.editSubjectName ? 'field-invalid' : undefined}
                            value={editSubjectName}
                            onChange={(event) => { setEditSubjectName(event.target.value); clearError('editSubjectName'); }}
                            onBlur={() => validateField('editSubjectName', subjectSaveRules)}
                            placeholder="Название предмета"
                          />
                          <FieldError message={errors.editSubjectName} />
                          <input
                            className={errors.editSubjectRate ? 'field-invalid' : undefined}
                            value={editSubjectRate}
                            onChange={(event) => { setEditSubjectRate(event.target.value); clearError('editSubjectRate'); }}
                            onBlur={() => validateField('editSubjectRate', subjectSaveRules)}
                            placeholder="Ставка"
                            type="number"
                          />
                          <FieldError message={errors.editSubjectRate} />
                        </div>
                      ) : (
                        <>
                          <h4 style={{ fontSize: 19, lineHeight: 1.15, marginBottom: 6 }}>{subject.name}</h4>
                          <p style={{ color: '#435066', marginBottom: 4, fontSize: 14 }}>
                            <span style={{ fontWeight: 700 }}>Ставка:</span> {subject.default_rate || '—'} ₽/ч
                          </p>
                          <p
                            style={{
                              color: '#687486',
                              marginBottom: 0,
                              wordBreak: 'break-all',
                              fontSize: 13,
                              lineHeight: 1.35,
                            }}
                          >
                            <span style={{ fontWeight: 700, color: '#435066' }}>Код приглашения:</span> {subject.invitation_token || '—'}
                          </p>
                        </>
                      )}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      {isEditing ? (
                        <>
                          <button type="button" onClick={() => handleSubjectSave(subject.id)} className="modal-primary">Сохранить</button>
                          <button
                            type="button"
                            onClick={cancelSubjectEditing}
                            className="modal-secondary"
                          >
                            Отмена
                          </button>
                        </>
                      ) : (
                        <>
                          {subject.invitation_token && (
                            <button
                              title="Скопировать код приглашения"
                              onClick={() => handleCopyToken(subject.invitation_token)}
                              className="icon-button icon-button-ghost"
                            >
                              ⧉
                            </button>
                          )}
                          <button
                            title="Редактировать предмет"
                            onClick={() => startSubjectEditing(subject)}
                            className="icon-button icon-button-dark"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            title="Удалить предмет"
                            onClick={() => handleSubjectDelete(subject.id, subject.name)}
                            className="icon-button icon-button-danger"
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </article>
      </div>

      {levelsModalOpen && (
        <Modal onClose={() => setLevelsModalOpen(false)} className="wide">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Уровни обучения</h3>
                <p className="modal-subtitle">Добавляй уровни и отмечай избранные для быстрого выбора в темах и карточках учеников.</p>
              </div>
              <button title="Закрыть" type="button" onClick={() => { reset(); setLevelsModalOpen(false); }} className="modal-close">×</button>
            </div>

            <section className="modal-section">
              <div className="modal-section-title">Добавить уровень</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) auto', gap: 10, alignItems: 'start' }}>
                <div>
                  <input
                    className={errors.newLevelName ? 'field-invalid' : undefined}
                    value={newLevelName}
                    onChange={(event) => { setNewLevelName(event.target.value); clearError('newLevelName'); }}
                    onBlur={() => validateField('newLevelName', levelCreateRules)}
                    placeholder="Например: 9 класс, ОГЭ, ЕГЭ база"
                    style={{ width: '100%' }}
                  />
                  <FieldError message={errors.newLevelName} />
                </div>
                <button type="button" onClick={handleLevelCreate} disabled={levelsSaving}>
                  Добавить
                </button>
              </div>
            </section>

            <section style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ color: '#1f2a3b', fontSize: 18, fontWeight: 900 }}>Список уровней</div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#435066', fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={showOnlyFavouriteLevels}
                    onChange={(event) => setShowOnlyFavouriteLevels(event.target.checked)}
                    style={{ width: 'auto' }}
                  />
                  Избранные
                </label>
              </div>

              {levelsLoading ? (
                <p style={{ ...mutedTextStyle, marginBottom: 0 }}>Загрузка...</p>
              ) : visibleLevels.length === 0 ? (
                <p style={{ ...mutedTextStyle, marginBottom: 0 }}>Уровней пока нет.</p>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {visibleLevels.map((level) => {
                    const isEditingLevel = editingLevelId === level.id;

                    return (
                      <article
                        key={level.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: isEditingLevel ? 'minmax(220px, 1fr) auto auto' : 'minmax(220px, 1fr) auto',
                          gap: 10,
                          alignItems: 'center',
                          padding: 14,
                          borderRadius: 18,
                          background: 'rgba(23,32,51,0.03)',
                          border: '1px solid rgba(24,33,47,0.08)',
                        }}
                      >
                        {isEditingLevel ? (
                          <>
                            <div style={{ display: 'grid', gap: 4 }}>
                              <input className={errors.editLevelName ? 'field-invalid' : undefined} value={editLevelName} onChange={(event) => { setEditLevelName(event.target.value); clearError('editLevelName'); }} onBlur={() => validateField('editLevelName', levelSaveRules)} />
                              <FieldError message={errors.editLevelName} />
                            </div>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#435066', fontSize: 14, whiteSpace: 'nowrap' }}>
                              <input
                                type="checkbox"
                                checked={editLevelIsFavourite}
                                onChange={(event) => setEditLevelIsFavourite(event.target.checked)}
                                style={{ width: 'auto' }}
                              />
                              Избранное
                            </label>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              <button type="button" onClick={() => handleLevelSave(level)} disabled={levelsSaving} className="modal-primary">
                                Сохранить
                              </button>
                              <button type="button" onClick={cancelLevelEditing} className="modal-secondary">
                                Отмена
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                              <button
                                type="button"
                                title={level.is_favourite ? 'Убрать из избранного' : 'Добавить в избранное'}
                                onClick={() => handleToggleLevelFavourite(level)}
                                style={{ minWidth: 34, width: 34, height: 34, padding: 0, borderRadius: 999, background: 'rgba(23,32,51,0.04)', color: level.is_favourite ? '#2AABEE' : '#98a3b3', border: '1px solid rgba(24,33,47,0.08)', boxShadow: 'none', fontSize: 18, display: 'inline-grid', placeItems: 'center' }}
                              >
                                <Star size={18} fill={level.is_favourite ? 'currentColor' : 'none'} />
                              </button>
                              <div style={{ color: '#1f2a3b', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {level.name}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                title="Редактировать уровень"
                                onClick={() => startLevelEditing(level)}
                                className="icon-button icon-button-dark"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                title="Удалить уровень"
                                onClick={() => handleLevelDelete(level)}
                                className="icon-button icon-button-danger"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
        </Modal>
      )}

      {subjectCreateModalOpen && (
        <Modal onClose={() => setSubjectCreateModalOpen(false)}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Создать предмет</h3>
                <p className="modal-subtitle">Добавь название и ставку по умолчанию.</p>
              </div>
              <button title="Закрыть" type="button" onClick={() => { reset(); setSubjectCreateModalOpen(false); }} className="modal-close">×</button>
            </div>

            <div className="modal-form-grid">
              <label className="modal-field">
                Название предмета
                <input
                  className={errors.newSubjectName ? 'field-invalid' : undefined}
                  value={newSubjectName}
                  onChange={(event) => { setNewSubjectName(event.target.value); clearError('newSubjectName'); }}
                  onBlur={() => validateField('newSubjectName', subjectCreateRules)}
                  placeholder="Название предмета"
                />
                <FieldError message={errors.newSubjectName} />
              </label>
              <label className="modal-field">
                Ставка по умолчанию
                <input
                  className={errors.newSubjectRate ? 'field-invalid' : undefined}
                  value={newSubjectRate}
                  onChange={(event) => { setNewSubjectRate(event.target.value); clearError('newSubjectRate'); }}
                  onBlur={() => validateField('newSubjectRate', subjectCreateRules)}
                  placeholder="Ставка по умолчанию"
                  type="number"
                />
                <FieldError message={errors.newSubjectRate} />
              </label>

              <div className="modal-actions">
                <button onClick={handleSubjectCreate} disabled={creatingSubject} className="modal-primary">
                  {creatingSubject ? 'Создаём...' : 'Создать предмет'}
                </button>
              </div>
            </div>
        </Modal>
      )}
    </div>
  );
}
