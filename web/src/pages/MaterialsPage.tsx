import { useEffect, useMemo, useState } from 'react';
import {
  createMaterial,
  deleteMaterial,
  getMaterials,
  type Material,
  type MaterialFormat,
  type MaterialLevel,
  updateMaterial,
} from '../api/materials';
import { getSubjects, type Subject } from '../api/subjects';
import {
  createTopic,
  deleteTopic,
  getTopics,
  type TheoryTopic,
  updateTopic,
} from '../api/topics';
import { useMediaQuery } from '../hooks/useMediaQuery';
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

const formatLabels: Record<MaterialFormat, string> = {
  text: 'Текст',
  pdf: 'PDF',
  video: 'Видео',
  presentation: 'Презентация',
  image: 'Изображение',
  link: 'Ссылка',
};

const levelLabels: Record<MaterialLevel, string> = {
  basic: 'Базовый',
  advanced: 'Углублённый',
};

const topicLevelPresets = ['5 класс', '6 класс', '7 класс', '8 класс', '9 класс', '10 класс', '11 класс', 'ОГЭ', 'ЕГЭ'];

type TopicModalState =
  | { mode: 'create-root'; topic: null }
  | { mode: 'create-child'; topic: TheoryTopic }
  | { mode: 'edit'; topic: TheoryTopic }
  | null;

type MaterialModalState =
  | { mode: 'create'; material: null }
  | { mode: 'edit'; material: Material }
  | null;

function buildTopicRows(topics: TheoryTopic[], parentId: number | null, depth = 0): Array<TheoryTopic & { depth: number }> {
  const children = topics
    .filter((topic) => topic.parent_topic_id === parentId)
    .sort((a, b) => a.title.localeCompare(b.title, 'ru-RU'));

  return children.flatMap((topic) => [ { ...topic, depth }, ...buildTopicRows(topics, topic.id, depth + 1) ]);
}

function parseStudyLevel(value: string): string[] | null {
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : null;
}

function toggleStudyLevelValue(current: string, value: string) {
  const items = parseStudyLevel(current) ?? [];
  const nextItems = items.includes(value)
    ? items.filter((item) => item !== value)
    : [...items, value];
  return nextItems.join(', ');
}

export default function MaterialsPage() {
  const isTablet = useMediaQuery('(max-width: 1100px)');
  const isMobile = useMediaQuery('(max-width: 720px)');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<TheoryTopic[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [topicModal, setTopicModal] = useState<TopicModalState>(null);
  const [materialModal, setMaterialModal] = useState<MaterialModalState>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [formatFilter, setFormatFilter] = useState<'all' | MaterialFormat>('all');
  const [levelFilter, setLevelFilter] = useState<'all' | MaterialLevel>('all');

  const [topicTitle, setTopicTitle] = useState('');
  const [topicDescription, setTopicDescription] = useState('');
  const [topicStudyLevel, setTopicStudyLevel] = useState('');

  const [materialFormat, setMaterialFormat] = useState<MaterialFormat>('text');
  const [materialLevel, setMaterialLevel] = useState<MaterialLevel>('basic');
  const [materialText, setMaterialText] = useState('');
  const [materialUrl, setMaterialUrl] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [subjectData, topicData, materialData] = await Promise.all([
          getSubjects(),
          getTopics(),
          getMaterials(),
        ]);
        setSubjects(subjectData);
        setTopics(topicData);
        setMaterials(materialData);
      } catch (error) {
        console.error('Ошибка загрузки материалов:', error);
        alert('Не удалось загрузить раздел материалов');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    if (!subjects.length) {
      setSelectedSubjectId('');
      return;
    }

    setSelectedSubjectId((current) =>
      current && subjects.some((subject) => String(subject.id) === current)
        ? current
        : String(subjects[0].id)
    );
  }, [subjects]);

  const normalizedSearch = search.trim().toLowerCase();

  const filteredTopics = useMemo(() => {
    if (!selectedSubjectId) return [];
    return topics.filter((topic) => {
      if (topic.subject_id !== Number(selectedSubjectId)) return false;
      if (!normalizedSearch) return true;

      const haystack = [
        topic.title,
        topic.description ?? '',
        ...(topic.study_level ?? []).map(String),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [normalizedSearch, selectedSubjectId, topics]);

  const topicRows = useMemo(
    () => buildTopicRows(filteredTopics, null),
    [filteredTopics]
  );

  useEffect(() => {
    if (!topicRows.length) {
      setSelectedTopicId('');
      return;
    }

    setSelectedTopicId((current) =>
      current && topicRows.some((topic) => String(topic.id) === current)
        ? current
        : String(topicRows[0].id)
    );
  }, [topicRows]);

  const selectedSubject = useMemo(
    () => subjects.find((subject) => String(subject.id) === selectedSubjectId) ?? null,
    [selectedSubjectId, subjects]
  );

  const selectedTopic = useMemo(
    () => topicRows.find((topic) => String(topic.id) === selectedTopicId) ?? null,
    [selectedTopicId, topicRows]
  );

  const selectedTopicMaterials = useMemo(
    () =>
      selectedTopic
        ? materials
            .filter((material) => {
              if (material.topic_id !== selectedTopic.id) return false;
              if (formatFilter !== 'all' && material.format !== formatFilter) return false;
              if (levelFilter !== 'all' && material.level !== levelFilter) return false;
              if (!normalizedSearch) return true;

              const haystack = [
                material.content_text ?? '',
                material.content_url ?? '',
                formatLabels[material.format],
                levelLabels[material.level],
              ]
                .join(' ')
                .toLowerCase();

              return haystack.includes(normalizedSearch);
            })
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        : [],
    [formatFilter, levelFilter, materials, normalizedSearch, selectedTopic]
  );

  const subjectTopicCount = filteredTopics.length;
  const subjectMaterialCount = useMemo(() => {
    const topicIds = new Set(filteredTopics.map((topic) => topic.id));
    return materials.filter((material) => topicIds.has(material.topic_id)).length;
  }, [filteredTopics, materials]);

  const openCreateRootTopic = () => {
    setTopicModal({ mode: 'create-root', topic: null });
    setTopicTitle('');
    setTopicDescription('');
    setTopicStudyLevel('');
  };

  const openCreateChildTopic = () => {
    if (!selectedTopic) {
      alert('Сначала выбери тему, чтобы создать подтему.');
      return;
    }

    setTopicModal({ mode: 'create-child', topic: selectedTopic });
    setTopicTitle('');
    setTopicDescription('');
    setTopicStudyLevel('');
  };

  const openEditTopic = () => {
    if (!selectedTopic) return;
    setTopicModal({ mode: 'edit', topic: selectedTopic });
    setTopicTitle(selectedTopic.title);
    setTopicDescription(selectedTopic.description ?? '');
    setTopicStudyLevel(Array.isArray(selectedTopic.study_level) ? selectedTopic.study_level.join(', ') : '');
  };

  const openCreateMaterial = () => {
    if (!selectedTopic) {
      alert('Сначала выбери тему, чтобы добавить материал.');
      return;
    }

    setMaterialModal({ mode: 'create', material: null });
    setMaterialFormat('text');
    setMaterialLevel('basic');
    setMaterialText('');
    setMaterialUrl('');
  };

  const openEditMaterial = (material: Material) => {
    setMaterialModal({ mode: 'edit', material });
    setMaterialFormat(material.format);
    setMaterialLevel(material.level);
    setMaterialText(material.content_text ?? '');
    setMaterialUrl(material.content_url ?? '');
  };

  const handleSaveTopic = async () => {
    if (!selectedSubject) {
      alert('Сначала выбери предмет.');
      return;
    }

    if (!topicTitle.trim()) {
      alert('Укажи название темы.');
      return;
    }

    try {
      setSaving(true);
      if (topicModal?.mode === 'edit' && topicModal.topic) {
        const updated = await updateTopic(topicModal.topic.id, {
          title: topicTitle.trim(),
          description: topicDescription.trim() || null,
          study_level: parseStudyLevel(topicStudyLevel),
        });
        setTopics((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        setSelectedTopicId(String(updated.id));
      } else {
        const created = await createTopic({
          title: topicTitle.trim(),
          subject_id: selectedSubject.id,
          description: topicDescription.trim() || null,
          study_level: parseStudyLevel(topicStudyLevel),
          parent_topic_id: topicModal?.mode === 'create-child' ? topicModal.topic.id : null,
        });
        setTopics((prev) => [...prev, created]);
        setSelectedTopicId(String(created.id));
      }

      setTopicModal(null);
    } catch (error) {
      console.error('Ошибка сохранения темы:', error);
      alert(getApiErrorMessage(error, 'Не удалось сохранить тему.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTopic = async () => {
    if (!selectedTopic) return;

    if (!window.confirm(`Удалить тему «${selectedTopic.title}»?`)) {
      return;
    }

    try {
      await deleteTopic(selectedTopic.id);
      setTopics((prev) =>
        prev.filter(
          (topic) => topic.id !== selectedTopic.id && topic.parent_topic_id !== selectedTopic.id
        )
      );
      setMaterials((prev) => prev.filter((material) => material.topic_id !== selectedTopic.id));
      setSelectedTopicId('');
    } catch (error) {
      console.error('Ошибка удаления темы:', error);
      alert(getApiErrorMessage(error, 'Не удалось удалить тему.'));
    }
  };

  const handleSaveMaterial = async () => {
    if (!selectedTopic) {
      alert('Сначала выбери тему.');
      return;
    }

    const trimmedText = materialText.trim();
    const trimmedUrl = materialUrl.trim();
    const usesText = materialFormat === 'text';

    if (usesText && !trimmedText) {
      alert('Для текстового материала укажи содержание.');
      return;
    }

    if (!usesText && !trimmedUrl) {
      alert('Для этого формата укажи ссылку.');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        topic_id: selectedTopic.id,
        format: materialFormat,
        level: materialLevel,
        content_text: usesText ? trimmedText : null,
        content_url: usesText ? null : trimmedUrl,
      };

      if (materialModal?.mode === 'edit' && materialModal.material) {
        const updated = await updateMaterial(materialModal.material.id, payload);
        setMaterials((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await createMaterial(payload);
        setMaterials((prev) => [created, ...prev]);
      }

      setMaterialModal(null);
    } catch (error) {
      console.error('Ошибка сохранения материала:', error);
      alert(getApiErrorMessage(error, 'Не удалось сохранить материал.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMaterial = async (material: Material) => {
    if (!window.confirm('Удалить материал?')) {
      return;
    }

    try {
      await deleteMaterial(material.id);
      setMaterials((prev) => prev.filter((item) => item.id !== material.id));
    } catch (error) {
      console.error('Ошибка удаления материала:', error);
      alert(getApiErrorMessage(error, 'Не удалось удалить материал.'));
    }
  };

  return (
    <div>
      <section
        style={{
          ...panelStyle,
          padding: isMobile ? 18 : 24,
          marginBottom: 16,
          background:
            'linear-gradient(140deg, rgba(255,249,242,0.98) 0%, rgba(255,255,255,0.9) 100%)',
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
            <div
              style={{
                display: 'inline-flex',
                padding: '8px 12px',
                borderRadius: 999,
                background: 'rgba(217,111,50,0.12)',
                color: '#b9551f',
                fontWeight: 700,
                fontSize: 13,
                marginBottom: 14,
              }}
            >
              Теория
            </div>
            <h1
              style={{
                fontSize: 'clamp(2rem, 4vw, 3.2rem)',
                lineHeight: 0.98,
                letterSpacing: '-0.04em',
                marginBottom: 12,
              }}
            >
              Материалы и
              <br />
              темы
            </h1>
            <p style={{ ...mutedTextStyle, maxWidth: 760, fontSize: 16, marginBottom: 0 }}>
              Здесь можно собирать теоретическую базу по предметам: темы, подтемы и материалы,
              которые потом пригодятся для занятий, заданий и прогресса.
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            {[
              `Тем по предмету: ${subjectTopicCount}`,
              `Материалов: ${subjectMaterialCount}`,
            ].map((item) => (
              <span
                key={item}
                style={{
                  padding: '8px 12px',
                  borderRadius: 999,
                  background: 'rgba(23,32,51,0.06)',
                  color: '#324055',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section style={{ ...panelStyle, marginBottom: 16 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isTablet ? '1fr' : '1.3fr 1fr 1fr',
            gap: 12,
            alignItems: 'end',
          }}
        >
          <label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>
            Поиск по темам и материалам
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Например: квадратные, формула, pdf, ОГЭ"
            />
          </label>

          <label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>
            Формат материала
            <select
              value={formatFilter}
              onChange={(event) => setFormatFilter(event.target.value as 'all' | MaterialFormat)}
            >
              <option value="all">Все форматы</option>
              {Object.entries(formatLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>
            Уровень
            <select
              value={levelFilter}
              onChange={(event) => setLevelFilter(event.target.value as 'all' | MaterialLevel)}
            >
              <option value="all">Все уровни</option>
              {Object.entries(levelLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: isTablet ? '1fr' : '320px minmax(0, 1fr)',
          gap: 16,
        }}
      >
        <aside style={{ ...panelStyle, display: 'grid', gap: 14, alignContent: 'start' }}>
          <div>
            <div style={{ fontWeight: 800, color: '#1f2a3b', marginBottom: 6 }}>Предмет</div>
            <div style={mutedTextStyle}>Выбери предмет, чтобы увидеть связанные темы.</div>
          </div>

          <select value={selectedSubjectId} onChange={(event) => setSelectedSubjectId(event.target.value)}>
            {subjects.map((subject) => (
              <option key={subject.id} value={String(subject.id)}>
                {subject.name}
              </option>
            ))}
          </select>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={openCreateRootTopic}>
              Новая тема
            </button>
            <button
              type="button"
              onClick={openCreateChildTopic}
              style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}
            >
              Подтема
            </button>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {loading ? (
              <div style={mutedTextStyle}>Загружаем темы...</div>
            ) : topicRows.length === 0 ? (
              <div style={mutedTextStyle}>
                {normalizedSearch
                  ? 'По текущему поиску темы не найдены.'
                  : 'Для этого предмета пока нет тем.'}
              </div>
            ) : (
              topicRows.map((topic) => {
                const active = String(topic.id) === selectedTopicId;

                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => setSelectedTopicId(String(topic.id))}
                    style={{
                      textAlign: 'left',
                      padding: '12px 14px',
                      borderRadius: 16,
                      border: active
                        ? '1px solid rgba(42,111,219,0.28)'
                        : '1px solid rgba(24,33,47,0.08)',
                      background: active ? 'rgba(42,111,219,0.1)' : 'rgba(23,32,51,0.03)',
                      boxShadow: 'none',
                      color: '#1f2a3b',
                      marginLeft: topic.depth * 16,
                      position: 'relative',
                    }}
                  >
                    {topic.depth > 0 && (
                      <span
                        style={{
                          position: 'absolute',
                          left: -10,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: 8,
                          height: 2,
                          borderRadius: 999,
                          background: 'rgba(90,106,128,0.45)',
                        }}
                      />
                    )}
                    <div style={{ fontWeight: 700 }}>{topic.title}</div>
                    {topic.study_level?.length ? (
                      <div
                        style={{
                          marginTop: 6,
                          display: 'flex',
                          gap: 6,
                          flexWrap: 'wrap',
                        }}
                      >
                        {topic.study_level.map((level) => (
                          <span
                            key={level}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 999,
                              background: 'rgba(23,32,51,0.06)',
                              color: '#435066',
                              fontSize: 12,
                            }}
                          >
                            {level}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {topic.description && (
                      <div style={{ ...mutedTextStyle, marginTop: 4, fontSize: 13 }}>
                        {topic.description}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <article style={panelStyle}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                marginBottom: 14,
              }}
            >
              <div>
                <h3 style={{ fontSize: 22, marginBottom: 6 }}>
                  {selectedTopic ? selectedTopic.title : 'Выбери тему'}
                </h3>
                <div style={mutedTextStyle}>
                  {selectedTopic
                    ? selectedTopic.description || 'У темы пока нет описания.'
                    : 'Выбери тему слева, чтобы увидеть материалы и действия.'}
                </div>
              </div>

              {selectedTopic && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" onClick={openEditTopic}>
                    Редактировать тему
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteTopic}
                    style={{ background: 'rgba(166,63,59,0.92)', boxShadow: 'none' }}
                  >
                    Удалить тему
                  </button>
                </div>
              )}
            </div>

            {selectedTopic && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: 'rgba(23,32,51,0.06)',
                    color: '#324055',
                    fontSize: 13,
                  }}
                >
                  Предмет: {selectedSubject?.name ?? '—'}
                </span>
                <span
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: 'rgba(23,32,51,0.06)',
                    color: '#324055',
                    fontSize: 13,
                  }}
                >
                  Уровни: {selectedTopic.study_level?.join(', ') || 'не указаны'}
                </span>
              </div>
            )}
          </article>

          <article style={panelStyle}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                alignItems: 'center',
                flexWrap: 'wrap',
                marginBottom: 14,
              }}
            >
              <div>
                <h3 style={{ fontSize: 20, marginBottom: 6 }}>Материалы темы</h3>
                <div style={mutedTextStyle}>
                  Добавляй текстовые конспекты, ссылки и другие материалы по выбранной теме.
                </div>
              </div>

              <button type="button" onClick={openCreateMaterial} disabled={!selectedTopic}>
                Добавить материал
              </button>
            </div>

            {!selectedTopic ? (
              <div style={mutedTextStyle}>Сначала выбери тему слева.</div>
            ) : selectedTopicMaterials.length === 0 ? (
              <div style={mutedTextStyle}>
                {normalizedSearch || formatFilter !== 'all' || levelFilter !== 'all'
                  ? 'По текущим фильтрам материалы не найдены.'
                  : 'У этой темы пока нет материалов.'}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {selectedTopicMaterials.map((material) => (
                  <div
                    key={material.id}
                    style={{
                      padding: 14,
                      borderRadius: 18,
                      border: '1px solid rgba(24,33,47,0.08)',
                      background: 'rgba(23,32,51,0.03)',
                      display: 'grid',
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 10,
                        alignItems: 'flex-start',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span
                          style={{
                            padding: '6px 10px',
                            borderRadius: 999,
                            background: 'rgba(42,111,219,0.1)',
                            color: '#2a6fdb',
                            fontWeight: 700,
                            fontSize: 12,
                          }}
                        >
                          {formatLabels[material.format]}
                        </span>
                        <span
                          style={{
                            padding: '6px 10px',
                            borderRadius: 999,
                            background: 'rgba(23,32,51,0.06)',
                            color: '#324055',
                            fontSize: 12,
                          }}
                        >
                          {levelLabels[material.level]}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => openEditMaterial(material)}>
                          Редактировать
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMaterial(material)}
                          style={{ background: 'rgba(166,63,59,0.92)', boxShadow: 'none' }}
                        >
                          Удалить
                        </button>
                      </div>
                    </div>

                    {material.content_text && (
                      <div style={{ color: '#243041', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                        {material.content_text}
                      </div>
                    )}

                    {material.content_url && (
                      <a href={material.content_url} target="_blank" rel="noreferrer">
                        {material.content_url}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      </section>

      {topicModal && (
        <div
          onClick={() => setTopicModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.48)',
            display: 'grid',
            placeItems: 'center',
            padding: 20,
            zIndex: 40,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(560px, 100%)',
              background: '#fff',
              borderRadius: 24,
              border: '1px solid rgba(24,33,47,0.08)',
              boxShadow: '0 30px 80px rgba(15,23,42,0.18)',
              padding: isMobile ? 18 : 24,
              display: 'grid',
              gap: 14,
            }}
          >
            <h3 style={{ fontSize: 22, marginBottom: 0 }}>
              {topicModal.mode === 'edit'
                ? 'Редактировать тему'
                : topicModal.mode === 'create-child'
                  ? 'Создать подтему'
                  : 'Создать тему'}
            </h3>

            <label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>
              Название темы
              <input value={topicTitle} onChange={(event) => setTopicTitle(event.target.value)} />
            </label>

            <label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>
              Описание
              <textarea
                value={topicDescription}
                onChange={(event) => setTopicDescription(event.target.value)}
                rows={4}
              />
            </label>

            <label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>
              Уровни обучения
              <input
                value={topicStudyLevel}
                onChange={(event) => setTopicStudyLevel(event.target.value)}
                placeholder="Например: 9 класс, ОГЭ, ЕГЭ"
              />
            </label>

            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ ...mutedTextStyle, fontSize: 13 }}>
                Быстрый выбор уровня темы. Это поможет дальше корректно фильтровать материалы и прогресс.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {topicLevelPresets.map((level) => {
                  const active = (parseStudyLevel(topicStudyLevel) ?? []).includes(level);
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setTopicStudyLevel((current) => toggleStudyLevelValue(current, level))}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 999,
                        background: active ? 'rgba(42,111,219,0.12)' : 'rgba(23,32,51,0.05)',
                        color: active ? '#2a6fdb' : '#324055',
                        border: active
                          ? '1px solid rgba(42,111,219,0.24)'
                          : '1px solid rgba(24,33,47,0.08)',
                        boxShadow: 'none',
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      {level}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={handleSaveTopic} disabled={saving}>
                {saving ? 'Сохраняем...' : 'Сохранить'}
              </button>
              <button
                type="button"
                onClick={() => setTopicModal(null)}
                style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {materialModal && (
        <div
          onClick={() => setMaterialModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.48)',
            display: 'grid',
            placeItems: 'center',
            padding: 20,
            zIndex: 40,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(620px, 100%)',
              background: '#fff',
              borderRadius: 24,
              border: '1px solid rgba(24,33,47,0.08)',
              boxShadow: '0 30px 80px rgba(15,23,42,0.18)',
              padding: isMobile ? 18 : 24,
              display: 'grid',
              gap: 14,
            }}
          >
            <h3 style={{ fontSize: 22, marginBottom: 0 }}>
              {materialModal.mode === 'edit' ? 'Редактировать материал' : 'Добавить материал'}
            </h3>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                gap: 10,
              }}
            >
              <label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>
                Формат
                <select
                  value={materialFormat}
                  onChange={(event) => setMaterialFormat(event.target.value as MaterialFormat)}
                >
                  {Object.entries(formatLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>
                Уровень
                <select
                  value={materialLevel}
                  onChange={(event) => setMaterialLevel(event.target.value as MaterialLevel)}
                >
                  {Object.entries(levelLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {materialFormat === 'text' ? (
              <label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>
                Содержимое
                <textarea
                  value={materialText}
                  onChange={(event) => setMaterialText(event.target.value)}
                  rows={8}
                  placeholder="Добавь конспект, пояснение или теорию по теме"
                />
              </label>
            ) : (
              <label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>
                Ссылка
                <input
                  value={materialUrl}
                  onChange={(event) => setMaterialUrl(event.target.value)}
                  placeholder="https://..."
                />
              </label>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={handleSaveMaterial} disabled={saving}>
                {saving ? 'Сохраняем...' : 'Сохранить'}
              </button>
              <button
                type="button"
                onClick={() => setMaterialModal(null)}
                style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
