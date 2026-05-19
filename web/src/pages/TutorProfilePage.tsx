import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTutorProfile, updateTutorProfile, type TutorProfile } from '../api/tutor';
import { getApiErrorMessage } from '../utils/apiError';

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
        gap: 5,
        padding: '12px 14px',
        borderRadius: 16,
        background: 'rgba(23,32,51,0.035)',
        border: '1px solid rgba(24,33,47,0.07)',
      }}
    >
      <div style={{ ...mutedTextStyle, fontSize: 13 }}>{label}</div>
      <div style={{ color: '#1f2a3b', fontSize: 16, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

export default function TutorProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<TutorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true);
        const data = await getTutorProfile();
        setProfile(data);
        setFullName(data.full_name);
        setPhoneNumber(data.phone_number ?? '');
        setAvatarUrl(data.avatar_url ?? '');
      } catch (error) {
        console.error('Ошибка загрузки профиля репетитора:', error);
        alert(getApiErrorMessage(error, 'Не удалось загрузить личный кабинет.'));
      } finally {
        setLoading(false);
      }
    };

    void loadProfile();
  }, []);

  const initials = useMemo(() => getInitials(profile?.full_name ?? 'Репетитор'), [profile?.full_name]);

  const handleCancel = () => {
    if (!profile) return;
    setFullName(profile.full_name);
    setPhoneNumber(profile.phone_number ?? '');
    setAvatarUrl(profile.avatar_url ?? '');
    setEditing(false);
  };

  const handleSave = async () => {
    if (!profile) return;
    if (!fullName.trim()) {
      alert('Укажи имя репетитора.');
      return;
    }

    try {
      setSaving(true);
      const updated = await updateTutorProfile({
        full_name: fullName.trim(),
        phone_number: phoneNumber.trim() || null,
        avatar_url: avatarUrl.trim() || null,
      });
      setProfile(updated);
      setFullName(updated.full_name);
      setPhoneNumber(updated.phone_number ?? '');
      setAvatarUrl(updated.avatar_url ?? '');
      setEditing(false);
    } catch (error) {
      console.error('Ошибка сохранения профиля репетитора:', error);
      alert(getApiErrorMessage(error, 'Не удалось сохранить изменения профиля.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p style={{ color: '#687486', margin: 0 }}>Загрузка личного кабинета...</p>;
  }

  if (!profile) {
    return <p style={{ color: '#687486', margin: 0 }}>Профиль репетитора недоступен.</p>;
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section
        style={{
          ...panelStyle,
          padding: 0,
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          alignItems: 'stretch',
        }}
      >
        <div
          style={{
            padding: 22,
            background:
              'radial-gradient(circle at 18% 12%, rgba(42,171,238,0.34), transparent 28%), linear-gradient(135deg, #172033 0%, #24324a 100%)',
            color: '#fff',
            display: 'grid',
            alignContent: 'space-between',
            gap: 22,
            minHeight: 230,
          }}
        >
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
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
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              `Telegram ID: ${profile.telegram_id}`,
              profile.phone_number ? `Телефон: ${profile.phone_number}` : 'Телефон не указан',
            ].map((item) => (
              <span
                key={item}
                style={{
                  padding: '7px 10px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.82)',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <div style={{ padding: 22, display: 'grid', gap: 12, alignContent: 'center' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
            {fieldCard('Регистрация', formatDateTime(profile.registered_at))}
            {fieldCard('Последний визит', formatDateTime(profile.last_visited_at))}
            {fieldCard('ID профиля', String(profile.id))}
          </div>

          <button
            type="button"
            title="Открыть предметы"
            onClick={() => navigate('/subjects')}
            style={{
              justifySelf: 'start',
              background: '#fff',
              color: '#1f2a3b',
              border: '1px solid rgba(24,33,47,0.12)',
              boxShadow: 'none',
            }}
          >
            Предметы
          </button>
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <article style={{ ...panelStyle, display: 'grid', gap: 14 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ fontSize: 21, fontWeight: 900, color: '#1f2a3b', marginBottom: 4 }}>
                Данные профиля
              </div>
              <div style={mutedTextStyle}>Имя, телефон и аватар, которые используются в кабинете.</div>
            </div>

            {!editing ? (
              <button type="button" title="Редактировать профиль" onClick={() => setEditing(true)}>
                Редактировать
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={handleSave} disabled={saving}>
                  {saving ? 'Сохраняем...' : 'Сохранить'}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  style={{
                    background: '#fff',
                    color: '#1f2a3b',
                    border: '1px solid rgba(24,33,47,0.12)',
                    boxShadow: 'none',
                  }}
                >
                  Отмена
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={mutedTextStyle}>Полное имя</span>
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} disabled={!editing} />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={mutedTextStyle}>Телефон</span>
              <input
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                disabled={!editing}
                placeholder="+7..."
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={mutedTextStyle}>Ссылка на аватар</span>
              <input
                value={avatarUrl}
                onChange={(event) => setAvatarUrl(event.target.value)}
                disabled={!editing}
                placeholder="https://..."
              />
            </label>
          </div>
        </article>

        <article style={{ ...panelStyle, display: 'grid', gap: 12 }}>
          <div>
            <div style={{ fontSize: 21, fontWeight: 900, color: '#1f2a3b', marginBottom: 4 }}>
              Системная информация
            </div>
            <div style={mutedTextStyle}>Технические данные профиля. Обычно их не нужно редактировать.</div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {fieldCard('Telegram ID', String(profile.telegram_id))}
            {fieldCard('Дата регистрации', formatDateTime(profile.registered_at))}
            {fieldCard('Последний визит', formatDateTime(profile.last_visited_at))}
          </div>
        </article>
      </section>
    </div>
  );
}
