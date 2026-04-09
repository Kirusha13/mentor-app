import { useEffect, useMemo, useState } from 'react';
import {
  createSubject,
  deleteSubject,
  getSubjects,
  updateSubject,
  type Subject,
} from '../api/subjects';
import { useMediaQuery } from '../hooks/useMediaQuery';

const panelStyle = {
  background: 'rgba(255,255,255,0.88)',
  padding: '20px',
  borderRadius: '22px',
  border: '1px solid rgba(24,33,47,0.08)',
  boxShadow: 'var(--shadow-card)',
} as const;

const DEFAULT_COLORS = ['#d96f32', '#2a6fdb', '#2f7d63', '#7b61c8', '#cc8b00', '#c9485b'];

export default function SubjectsPage() {
  const isTablet = useMediaQuery('(max-width: 1100px)');
  const isMobile = useMediaQuery('(max-width: 720px)');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [newRate, setNewRate] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editRate, setEditRate] = useState('');
  const [editColor, setEditColor] = useState(DEFAULT_COLORS[0]);

  const filteredSubjects = useMemo(() => {
    return subjects.filter((subject) =>
      subject.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [search, subjects]);

  useEffect(() => {
    const loadSubjects = async () => {
      try {
        setLoading(true);
        const data = await getSubjects();
        setSubjects(data);
      } catch (error) {
        console.error('Ошибка загрузки предметов:', error);
        alert('Не удалось загрузить предметы');
      } finally {
        setLoading(false);
      }
    };

    loadSubjects();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim() || !newRate.trim()) {
      alert('Заполни название предмета и ставку');
      return;
    }

    try {
      setCreating(true);
      const created = await createSubject({
        name: newName.trim(),
        default_rate: Number(newRate),
        color: newColor,
      });

      setSubjects((prev) => [created, ...prev]);
      setNewName('');
      setNewRate('');
      setNewColor(DEFAULT_COLORS[0]);
      alert(`Предмет "${created.name}" создан`);
    } catch (error) {
      console.error('Ошибка создания предмета:', error);
      alert('Не удалось создать предмет');
    } finally {
      setCreating(false);
    }
  };

  const startEditing = (subject: Subject) => {
    setEditingId(subject.id);
    setEditName(subject.name);
    setEditRate(String(subject.default_rate ?? ''));
    setEditColor(subject.color || DEFAULT_COLORS[0]);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName('');
    setEditRate('');
    setEditColor(DEFAULT_COLORS[0]);
  };

  const handleSave = async (subjectId: number) => {
    if (!editName.trim() || !editRate.trim()) {
      alert('Заполни название предмета и ставку');
      return;
    }

    try {
      const updated = await updateSubject(subjectId, {
        name: editName.trim(),
        default_rate: Number(editRate),
        color: editColor,
      });

      setSubjects((prev) =>
        prev.map((subject) => (subject.id === subjectId ? updated : subject))
      );
      cancelEditing();
    } catch (error) {
      console.error('Ошибка обновления предмета:', error);
      alert('Не удалось обновить предмет');
    }
  };

  const handleDelete = async (subjectId: number, subjectName: string) => {
    const confirmed = window.confirm(`Удалить предмет "${subjectName}"?`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteSubject(subjectId);
      setSubjects((prev) => prev.filter((subject) => subject.id !== subjectId));
    } catch (error) {
      console.error('Ошибка удаления предмета:', error);
      alert('Не удалось удалить предмет');
    }
  };

  const handleCopyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      alert('Invitation token скопирован');
    } catch (error) {
      console.error('Ошибка копирования токена:', error);
      alert('Не удалось скопировать token');
    }
  };

  return (
    <div>
      <section
        style={{
          ...panelStyle,
          padding: 28,
          marginBottom: 22,
          background:
            'linear-gradient(140deg, rgba(245,248,255,0.98) 0%, rgba(255,255,255,0.9) 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            alignItems: 'flex-start',
            flexWrap: 'wrap',
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
              Предметы и токены приглашения
            </h1>
            <p style={{ color: '#5e6a7b', maxWidth: 760, fontSize: 16, marginBottom: 0 }}>
              Управляй списком предметов, ставками, цветами и invitation token в одном месте.
            </p>
          </div>

          <div
            style={{
              minWidth: isMobile ? '100%' : 176,
              borderRadius: 16,
              padding: '12px 14px',
              background: '#172033',
              color: '#fff',
            }}
          >
            <div style={{ color: 'rgba(255,255,255,0.64)', fontSize: 12, marginBottom: 6 }}>
              Всего предметов
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1, marginBottom: 6 }}>
              {subjects.length}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.74)', fontSize: 12 }}>
              Доступно для приглашения и привязки учеников
            </div>
          </div>
        </div>
      </section>

      <div
        style={{
          display: 'grid',
          gap: 18,
          gridTemplateColumns: isTablet ? '1fr' : 'minmax(320px, 380px) minmax(0, 1fr)',
          alignItems: 'start',
        }}
      >
        <section style={panelStyle}>
          <h3 style={{ fontSize: 22, marginBottom: 10 }}>Создать предмет</h3>
          <p style={{ color: '#687486', marginBottom: 14 }}>
            Новый предмет получает цвет, ставку по умолчанию и token приглашения.
          </p>

          <div style={{ display: 'grid', gap: 10 }}>
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Название предмета"
            />
            <input
              value={newRate}
              onChange={(event) => setNewRate(event.target.value)}
              placeholder="Ставка по умолчанию"
              type="number"
            />

            <div>
              <div style={{ color: '#687486', fontSize: 14, marginBottom: 8 }}>Цвет предмета</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {DEFAULT_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewColor(color)}
                    style={{
                      width: 34,
                      height: 34,
                      minWidth: 34,
                      padding: 0,
                      borderRadius: 999,
                      background: color,
                      border:
                        newColor === color
                          ? '3px solid rgba(23,32,51,0.95)'
                          : '2px solid rgba(255,255,255,0.9)',
                      boxShadow: 'none',
                    }}
                  />
                ))}
              </div>
            </div>

            <button onClick={handleCreate} disabled={creating}>
              {creating ? 'Создаём...' : 'Создать предмет'}
            </button>
          </div>
        </section>

        <section style={panelStyle}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              marginBottom: 16,
            }}
          >
            <div>
              <h3 style={{ fontSize: 22, marginBottom: 6 }}>Список предметов</h3>
              <div style={{ color: '#6b7788' }}>
                Переименование, изменение ставки, цвета и копирование token.
              </div>
            </div>

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по названию"
              style={{ maxWidth: 260 }}
            />
          </div>

          {loading ? (
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
            <div style={{ display: 'grid', gap: 14 }}>
              {filteredSubjects.map((subject) => {
                const isEditing = editingId === subject.id;

                return (
                  <article
                    key={subject.id}
                    style={{
                      border: '1px solid rgba(24,33,47,0.08)',
                      borderRadius: '20px',
                      padding: '18px',
                      background:
                        'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.9) 100%)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 16,
                        alignItems: 'flex-start',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 240 }}>
                        {isEditing ? (
                          <div style={{ display: 'grid', gap: 10 }}>
                            <input
                              value={editName}
                              onChange={(event) => setEditName(event.target.value)}
                              placeholder="Название предмета"
                            />
                            <input
                              value={editRate}
                              onChange={(event) => setEditRate(event.target.value)}
                              placeholder="Ставка"
                              type="number"
                            />
                            <div>
                              <div
                                style={{
                                  color: '#687486',
                                  fontSize: 14,
                                  marginBottom: 8,
                                }}
                              >
                                Цвет
                              </div>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {DEFAULT_COLORS.map((color) => (
                                  <button
                                    key={color}
                                    onClick={() => setEditColor(color)}
                                    style={{
                                      width: 30,
                                      height: 30,
                                      minWidth: 30,
                                      padding: 0,
                                      borderRadius: 999,
                                      background: color,
                                      border:
                                        editColor === color
                                          ? '3px solid rgba(23,32,51,0.95)'
                                          : '2px solid rgba(255,255,255,0.9)',
                                      boxShadow: 'none',
                                    }}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                marginBottom: 10,
                              }}
                            >
                              <span
                                style={{
                                  width: 14,
                                  height: 14,
                                  borderRadius: 999,
                                  background: subject.color || '#d96f32',
                                  flexShrink: 0,
                                }}
                              />
                              <h4 style={{ fontSize: 22, marginBottom: 0 }}>{subject.name}</h4>
                            </div>

                            <p style={{ color: '#435066', marginBottom: 8 }}>
                              <strong>Ставка:</strong> {subject.default_rate || '—'} ₽/ч
                            </p>
                            <p
                              style={{
                                color: '#687486',
                                marginBottom: 0,
                                wordBreak: 'break-all',
                                fontSize: 14,
                              }}
                            >
                              <strong>Token:</strong> {subject.invitation_token || '—'}
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
                            <button onClick={() => handleSave(subject.id)}>Сохранить</button>
                            <button
                              onClick={cancelEditing}
                              style={{
                                background: 'rgba(23,32,51,0.92)',
                                boxShadow: 'none',
                              }}
                            >
                              Отмена
                            </button>
                          </>
                        ) : (
                          <>
                            {subject.invitation_token && (
                              <button onClick={() => handleCopyToken(subject.invitation_token)}>
                                Скопировать token
                              </button>
                            )}
                            <button
                              onClick={() => startEditing(subject)}
                              style={{
                                background: 'rgba(23,32,51,0.92)',
                                boxShadow: 'none',
                              }}
                            >
                              Редактировать
                            </button>
                            <button
                              onClick={() => handleDelete(subject.id, subject.name)}
                              style={{
                                background: '#a63f3b',
                                boxShadow: 'none',
                              }}
                            >
                              Удалить
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
        </section>
      </div>
    </div>
  );
}
