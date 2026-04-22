import { useEffect, useMemo, useState } from 'react';
import {
  createTutorLevel,
  deleteTutorLevel,
  getTutorLevels,
  updateTutorLevel,
  type TutorLevel,
} from '../api/tutorLevels';
import { getApiErrorMessage } from '../utils/apiError';

const panelStyle = {
  background: 'rgba(255,255,255,0.88)',
  padding: '20px',
  borderRadius: '22px',
  border: '1px solid rgba(24,33,47,0.08)',
  boxShadow: 'var(--shadow-card)',
} as const;

const mutedTextStyle = {
  color: '#687486',
  fontSize: 14,
} as const;

export default function LevelsPage() {
  const [levels, setLevels] = useState<TutorLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editIsFavourite, setEditIsFavourite] = useState(false);
  const [showOnlyFavourites, setShowOnlyFavourites] = useState(false);

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
    () => (showOnlyFavourites ? sortedLevels.filter((level) => level.is_favourite) : sortedLevels),
    [showOnlyFavourites, sortedLevels]
  );

  useEffect(() => {
    const loadLevels = async () => {
      try {
        setLoading(true);
        setLevels(await getTutorLevels());
      } catch (error) {
        console.error('Ошибка загрузки уровней:', error);
        alert('Не удалось загрузить уровни обучения');
      } finally {
        setLoading(false);
      }
    };

    void loadLevels();
  }, []);

  const startEdit = (level: TutorLevel) => {
    setEditingId(level.id);
    setEditName(level.name);
    setEditIsFavourite(level.is_favourite);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      alert('Укажи название уровня');
      return;
    }

    try {
      setSaving(true);
      const created = await createTutorLevel({
        name,
        is_favourite: false,
      });
      setLevels((prev) => [...prev, created]);
      setNewName('');
    } catch (error) {
      console.error('Ошибка создания уровня:', error);
      alert(getApiErrorMessage(error, 'Не удалось создать уровень'));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (level: TutorLevel) => {
    const name = editName.trim();
    if (!name) {
      alert('Название уровня не может быть пустым');
      return;
    }

    try {
      setSaving(true);
      const updated = await updateTutorLevel(level.id, {
        name,
        is_favourite: editIsFavourite,
      });
      setLevels((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setEditingId(null);
    } catch (error) {
      console.error('Ошибка сохранения уровня:', error);
      alert(getApiErrorMessage(error, 'Не удалось сохранить уровень'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (level: TutorLevel) => {
    if (!window.confirm(`Удалить уровень «${level.name}»? Связи с темами и учениками будут очищены.`)) {
      return;
    }

    try {
      await deleteTutorLevel(level.id);
      setLevels((prev) => prev.filter((item) => item.id !== level.id));
    } catch (error) {
      console.error('Ошибка удаления уровня:', error);
      alert(getApiErrorMessage(error, 'Не удалось удалить уровень'));
    }
  };

  const handleToggleFavourite = async (level: TutorLevel) => {
    try {
      const updated = await updateTutorLevel(level.id, {
        is_favourite: !level.is_favourite,
      });
      setLevels((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      console.error('Ошибка обновления избранного уровня:', error);
      alert(getApiErrorMessage(error, 'Не удалось обновить избранное'));
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section style={{ ...panelStyle, display: 'grid', gap: 12 }}>
        <h3 style={{ fontSize: 20, marginBottom: 0 }}>Добавить уровень</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) auto', gap: 10, alignItems: 'center' }}>
          <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Например: 9 класс, ОГЭ, ЕГЭ база" />
          <button type="button" onClick={handleCreate} disabled={saving}>
            Добавить
          </button>
        </div>
      </section>

      <section style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 20, marginBottom: 0 }}>Список уровней</h3>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#435066', fontSize: 14 }}>
            <input type="checkbox" checked={showOnlyFavourites} onChange={(event) => setShowOnlyFavourites(event.target.checked)} />
            Избранные
          </label>
        </div>
        {loading ? (
          <p style={{ ...mutedTextStyle, marginBottom: 0 }}>Загрузка...</p>
        ) : visibleLevels.length === 0 ? (
          <p style={{ ...mutedTextStyle, marginBottom: 0 }}>Уровней пока нет. Темы без уровней будут считаться доступными всем.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {visibleLevels.map((level) => {
              const editing = editingId === level.id;

              return (
                <article
                  key={level.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: editing ? 'minmax(220px, 1fr) auto auto' : 'minmax(220px, 1fr) auto',
                    gap: 10,
                    alignItems: 'center',
                    padding: 14,
                    borderRadius: 18,
                    background: 'rgba(23,32,51,0.03)',
                    border: '1px solid rgba(24,33,47,0.08)',
                  }}
                >
                  {editing ? (
                    <>
                      <input value={editName} onChange={(event) => setEditName(event.target.value)} />
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#435066', fontSize: 14, whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={editIsFavourite} onChange={(event) => setEditIsFavourite(event.target.checked)} />
                        Избранное
                      </label>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => handleSave(level)} disabled={saving}>
                          Сохранить
                        </button>
                        <button type="button" onClick={() => setEditingId(null)} style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}>
                          Отмена
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <button
                            type="button"
                            title={level.is_favourite ? 'Убрать из избранного' : 'Добавить в избранное'}
                            onClick={() => handleToggleFavourite(level)}
                            style={{ minWidth: 34, width: 34, height: 34, padding: 0, borderRadius: 999, background: 'rgba(23,32,51,0.04)', color: level.is_favourite ? '#d96f32' : '#98a3b3', border: '1px solid rgba(24,33,47,0.08)', boxShadow: 'none', fontSize: 18, display: 'inline-grid', placeItems: 'center' }}
                          >
                            ★
                          </button>
                          <div style={{ fontWeight: 900, color: '#1f2a3b' }}>{level.name}</div>
                        </div>
                        <div style={mutedTextStyle}>Используется для тем, ДЗ, расписания и карточек учеников.</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          title="Редактировать уровень"
                          onClick={() => startEdit(level)}
                          style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, boxShadow: 'none', fontSize: 18, display: 'inline-grid', placeItems: 'center' }}
                        >
                          ✎
                        </button>
                        <button type="button" title="Удалить уровень" onClick={() => handleDelete(level)} style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, background: 'rgba(166,63,59,0.92)', boxShadow: 'none', fontSize: 18 }}>
                          🗑
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
    </div>
  );
}
