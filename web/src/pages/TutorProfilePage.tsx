import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTutorProfile, updateTutorProfile, type TutorProfile } from '../api/tutor';
import { useAuth } from '../context/AuthContext';
import { getApiErrorMessage } from '../utils/apiError';

const panelStyle = {
  background: 'rgba(255,255,255,0.9)',
  padding: '20px',
  borderRadius: '22px',
  border: '1px solid rgba(24,33,47,0.08)',
  boxShadow: 'var(--shadow-card)',
} as const;

function formatDateTime(value: string | null) {
  if (!value) return '—';
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

export default function TutorProfilePage() {
  const { logout } = useAuth();
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

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
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
          background:
            'linear-gradient(140deg, rgba(255,249,242,0.98) 0%, rgba(255,255,255,0.9) 100%)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gap: 16,
            gridTemplateColumns: 'minmax(0, 1.3fr) minmax(220px, 320px)',
            alignItems: 'start',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 'clamp(2rem, 4vw, 3rem)',
                lineHeight: 0.98,
                letterSpacing: '-0.04em',
                marginBottom: 10,
              }}
            >
              Личный кабинет репетитора
            </h1>
            <p style={{ color: '#5e6a7b', maxWidth: 720, fontSize: 15, marginBottom: 0 }}>
              Здесь собраны данные профиля, дата регистрации, Telegram и базовые настройки аккаунта.
            </p>
          </div>

          <div
            style={{
              borderRadius: 18,
              padding: 14,
              background: '#172033',
              color: '#fff',
              display: 'grid',
              gap: 10,
              justifyItems: 'start',
            }}
          >
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid rgba(255,255,255,0.14)',
                }}
              />
            ) : (
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(255,255,255,0.1)',
                  border: '2px solid rgba(255,255,255,0.12)',
                  fontSize: 24,
                  fontWeight: 800,
                }}
              >
                {initials || 'Р'}
              </div>
            )}

            <div>
              <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 4 }}>{profile.full_name}</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
                Telegram ID: {profile.telegram_id}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, 0.8fr)',
          alignItems: 'start',
        }}
      >
        <div style={{ ...panelStyle, display: 'grid', gap: 14 }}>
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
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Данные профиля</div>
              <div style={{ color: '#687486', fontSize: 14 }}>
                Основная информация, которую видит система и использует для авторизации.
              </div>
            </div>

            {!editing ? (
              <button type="button" onClick={() => setEditing(true)}>
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

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: '#687486', fontSize: 14 }}>Полное имя</span>
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} disabled={!editing} />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: '#687486', fontSize: 14 }}>Телефон</span>
              <input
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                disabled={!editing}
                placeholder="+7..."
              />
            </label>

            <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
              <span style={{ color: '#687486', fontSize: 14 }}>Ссылка на аватар</span>
              <input
                value={avatarUrl}
                onChange={(event) => setAvatarUrl(event.target.value)}
                disabled={!editing}
                placeholder="https://..."
              />
            </label>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <section style={{ ...panelStyle, display: 'grid', gap: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>Аккаунт</div>

            {[
              ['ID репетитора', String(profile.id)],
              ['Telegram ID', String(profile.telegram_id)],
              ['Дата регистрации', formatDateTime(profile.registered_at)],
              ['Последний визит', formatDateTime(profile.last_visited_at)],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  display: 'grid',
                  gap: 4,
                  padding: '12px 14px',
                  borderRadius: 16,
                  background: 'rgba(23,32,51,0.03)',
                  border: '1px solid rgba(24,33,47,0.06)',
                }}
              >
                <div style={{ fontSize: 13, color: '#687486' }}>{label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1f2a3b' }}>{value}</div>
              </div>
            ))}

            <button
              type="button"
              onClick={handleLogout}
              style={{
                marginTop: 4,
                background: 'transparent',
                color: '#1f2a3b',
                border: '1px solid rgba(24,33,47,0.12)',
                boxShadow: 'none',
              }}
            >
              Выйти из кабинета
            </button>
          </section>
        </div>
      </section>
    </div>
  );
}
