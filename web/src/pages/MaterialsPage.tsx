import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { getTutorLevels, type TutorLevel } from '../api/tutorLevels';
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

const formatColor: Record<MaterialFormat, string> = {
  pdf: '#D32F2F', video: '#1565C0', presentation: '#2E7D32',
  image: '#6A1B9A', link: '#0d7fc5', text: '#546e7a',
};

type TopicModalState =
  | { mode: 'create-root'; topic: null }
  | { mode: 'create-child'; topic: TheoryTopic }
  | { mode: 'edit'; topic: TheoryTopic }
  | null;

type MaterialModalState =
  | { mode: 'create'; material: null }
  | { mode: 'edit'; material: Material }
  | null;

function buildTopicRows(
  topics: TheoryTopic[],
  parentId: number | null,
  depth = 0,
  collapsedIds: Set<number> = new Set()
): Array<TheoryTopic & { depth: number }> {
  const children = topics
    .filter((topic) => topic.parent_topic_id === parentId)
    .sort((a, b) => a.title.localeCompare(b.title, 'ru-RU'));

  return children.flatMap((topic) => [
    { ...topic, depth },
    ...(collapsedIds.has(topic.id) ? [] : buildTopicRows(topics, topic.id, depth + 1, collapsedIds)),
  ]);
}

function parseStudyLevel(value: string): string[] | null {
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : null;
}

function getMaterialTitle(material: Material): string {
  if (material.title?.trim()) return material.title.trim();
  if (material.content_text?.trim()) return material.content_text.trim().slice(0, 60);
  if (material.content_url?.trim()) {
    try { return new URL(material.content_url).hostname; } catch { return material.content_url; }
  }
  return 'Материал без названия';
}

function getDomainHint(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export default function MaterialsPage() {
  const [searchParams] = useSearchParams();
  const isTablet = useMediaQuery('(max-width: 1100px)');
  const isMobile = useMediaQuery('(max-width: 720px)');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tutorLevels, setTutorLevels] = useState<TutorLevel[]>([]);
  const [topics, setTopics] = useState<TheoryTopic[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [topicModal, setTopicModal] = useState<TopicModalState>(null);
  const [materialModal, setMaterialModal] = useState<MaterialModalState>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | MaterialLevel>('all');
  const [collapsedTopicIds, setCollapsedTopicIds] = useState<Set<number>>(() => new Set());
  const [expandedMaterialIds, setExpandedMaterialIds] = useState<Set<number>>(() => new Set());

  const [topicTitle, setTopicTitle] = useState('');
  const [topicDescription, setTopicDescription] = useState('');
  const [topicStudyLevel, setTopicStudyLevel] = useState('');
  const [topicLevelMode, setTopicLevelMode] = useState<'all' | 'custom'>('all');
  const [topicLevelIds, setTopicLevelIds] = useState<number[]>([]);

  const [materialFormat, setMaterialFormat] = useState<MaterialFormat>('text');
  const [materialLevel, setMaterialLevel] = useState<MaterialLevel>('basic');
  const [materialText, setMaterialText] = useState('');
  const [materialUrl, setMaterialUrl] = useState('');
  const [materialTitle, setMaterialTitle] = useState('');

  const requestedSubjectId = searchParams.get('subject_id');
  const requestedTopicId = searchParams.get('topic_id');

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [subjectData, topicData, materialData, levelData] = await Promise.all([
          getSubjects(),
          getTopics(),
          getMaterials(),
          getTutorLevels(),
        ]);
        setSubjects(subjectData);
        setTopics(topicData);
        setMaterials(materialData);
        setTutorLevels(levelData);
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

    setSelectedSubjectId((current) => {
      if (requestedSubjectId && subjects.some((subject) => String(subject.id) === requestedSubjectId)) {
        return requestedSubjectId;
      }

      return current && subjects.some((subject) => String(subject.id) === current)
        ? current
        : String(subjects[0].id);
    });
  }, [requestedSubjectId, subjects]);

  const normalizedSearch = search.trim().toLowerCase();

  const filteredTopics = useMemo(() => {
    if (!selectedSubjectId) return [];
    return topics.filter((topic) => {
      if (topic.subject_id !== Number(selectedSubjectId)) return false;
      if (!normalizedSearch) return true;

      const haystack = [
        topic.title,
        topic.description ?? '',
        ...((topic.level_ids ?? []).map((levelId) => tutorLevels.find((level) => level.id === levelId)?.name ?? String(levelId))),
        ...(topic.study_level ?? []).map(String),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [normalizedSearch, selectedSubjectId, topics, tutorLevels]);

  const topicRows = useMemo(
    () => buildTopicRows(filteredTopics, null, 0, collapsedTopicIds),
    [collapsedTopicIds, filteredTopics]
  );

  const childTopicCount = useMemo(() => {
    const map = new Map<number, number>();
    filteredTopics.forEach((topic) => {
      if (topic.parent_topic_id !== null) {
        map.set(topic.parent_topic_id, (map.get(topic.parent_topic_id) ?? 0) + 1);
      }
    });
    return map;
  }, [filteredTopics]);

  useEffect(() => {
    setCollapsedTopicIds((current) => {
      const next = new Set(current);
      childTopicCount.forEach((_, topicId) => {
        if (!next.has(topicId)) {
          next.add(topicId);
        }
      });
      return next;
    });
  }, [childTopicCount]);

  useEffect(() => {
    if (!topicRows.length) {
      setSelectedTopicId('');
      return;
    }

    setSelectedTopicId((current) => {
      if (requestedTopicId && topicRows.some((topic) => String(topic.id) === requestedTopicId)) {
        return requestedTopicId;
      }

      return current && topicRows.some((topic) => String(topic.id) === current)
        ? current
        : String(topicRows[0].id);
    });
  }, [requestedTopicId, topicRows]);

  useEffect(() => {
    setExpandedMaterialIds(new Set());
  }, [selectedTopicId]);

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
              if (levelFilter !== 'all' && material.level !== levelFilter) return false;
              if (!normalizedSearch) return true;

              const haystack = [
                material.title ?? '',
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
    [levelFilter, materials, normalizedSearch, selectedTopic]
  );

  const openCreateRootTopic = () => {
    setTopicModal({ mode: 'create-root', topic: null });
    setTopicTitle('');
    setTopicDescription('');
    setTopicStudyLevel('');
    setTopicLevelMode('all');
    setTopicLevelIds([]);
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
    setTopicLevelMode('all');
    setTopicLevelIds([]);
  };

  const openEditTopic = () => {
    if (!selectedTopic) return;
    setTopicModal({ mode: 'edit', topic: selectedTopic });
    setTopicTitle(selectedTopic.title);
    setTopicDescription(selectedTopic.description ?? '');
    setTopicStudyLevel(Array.isArray(selectedTopic.study_level) ? selectedTopic.study_level.join(', ') : '');
    setTopicLevelMode(selectedTopic.level_ids?.length ? 'custom' : 'all');
    setTopicLevelIds(selectedTopic.level_ids ?? []);
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
    setMaterialTitle('');
  };

  const openEditMaterial = (material: Material) => {
    setMaterialModal({ mode: 'edit', material });
    setMaterialFormat(material.format);
    setMaterialLevel(material.level);
    setMaterialText(material.content_text ?? '');
    setMaterialUrl(material.content_url ?? '');
    setMaterialTitle(material.title ?? '');
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
          level_ids: topicLevelMode === 'all' ? [] : topicLevelIds,
          study_level: parseStudyLevel(topicStudyLevel),
        });
        setTopics((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        setSelectedTopicId(String(updated.id));
      } else {
        const created = await createTopic({
          title: topicTitle.trim(),
          subject_id: selectedSubject.id,
          description: topicDescription.trim() || null,
          level_ids: topicLevelMode === 'all' ? [] : topicLevelIds,
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

    const childCount = childTopicCount.get(selectedTopic.id) ?? 0;
    const materialCount = materials.filter((m) => m.topic_id === selectedTopic.id).length;
    const hasChildren = childCount > 0;
    const hasMaterials = materialCount > 0;

    let message = `Удалить тему «${selectedTopic.title}»?`;
    if (hasChildren && hasMaterials) {
      message += `\n\nВместе с ней удалятся ${childCount} подтем(ы) и ${materialCount} материал(ов).`;
    } else if (hasChildren) {
      message += `\n\nВместе с ней удалятся ${childCount} подтем(ы).`;
    } else if (hasMaterials) {
      message += `\n\nВместе с ней удалятся ${materialCount} материал(ов).`;
    }

    if (!window.confirm(message)) {
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

    if (!materialTitle.trim()) {
      alert('Укажи название материала.');
      return;
    }

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
        title: materialTitle.trim(),
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
    <div style={{ display: 'grid', gridTemplateRows: 'auto auto minmax(0, 1fr)', gap: 16, height: isMobile ? 'auto' : '100%', minHeight: 0, overflow: isMobile ? 'visible' : 'hidden' }}>
      <h1 className="page-heading">Материалы</h1>

      {/* ── Toolbar: search + subject only ── */}
      <section className="mentor-panel toolbar-panel" style={{ gridTemplateColumns: isTablet ? '1fr' : '1fr 220px' }}>
        <label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>
          Поиск по темам и материалам
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Например: квадратные, формула, pdf, ОГЭ"
          />
        </label>

        <label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>
          Предмет
          <select value={selectedSubjectId} onChange={(event) => setSelectedSubjectId(event.target.value)}>
            {subjects.map((subject) => (
              <option key={subject.id} value={String(subject.id)}>
                {subject.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: isTablet ? '1fr' : '260px minmax(0, 1fr)',
          gap: 16,
          minHeight: 0,
          overflow: isMobile ? 'visible' : 'hidden',
        }}
      >
        {/* ── Sidebar: flat indented topic tree ── */}
        <aside style={{ ...panelStyle, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: 0, minHeight: 0, overflow: isMobile ? 'visible' : 'hidden', padding: 0 }}>
          <div style={{ padding: '14px 14px 12px', borderBottom: '1px solid rgba(24,33,47,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#1f2a3b' }}>Темы</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                title="Создать подтему"
                type="button"
                onClick={openCreateChildTopic}
                style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid rgba(24,33,47,0.1)', background: '#f5f7fb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontSize: 14, color: '#556', boxShadow: 'none', cursor: 'pointer' }}
              >
                ⤵
              </button>
              <button
                title="Создать тему"
                type="button"
                onClick={openCreateRootTopic}
                style={{ width: 30, height: 30, borderRadius: 9, border: 'none', background: '#2AABEE', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontSize: 18, color: '#fff', boxShadow: 'none', cursor: 'pointer', fontWeight: 700 }}
              >
                +
              </button>
            </div>
          </div>

          <div style={{ padding: '10px 10px', display: 'grid', alignContent: 'start', gap: 2, minHeight: 0, overflowY: isMobile ? 'visible' : 'auto', scrollbarWidth: 'thin' }}>
            {loading ? (
              <div style={mutedTextStyle}>Загружаем темы...</div>
            ) : topicRows.length === 0 ? (
              <div style={mutedTextStyle}>
                {normalizedSearch ? 'По текущему поиску темы не найдены.' : 'Для этого предмета пока нет тем.'}
              </div>
            ) : (
              topicRows.map((topic) => {
                const active = String(topic.id) === selectedTopicId;
                const hasChildren = (childTopicCount.get(topic.id) ?? 0) > 0;
                const isCollapsed = collapsedTopicIds.has(topic.id);

                return (
                  <div
                    key={topic.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedTopicId(String(topic.id))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedTopicId(String(topic.id));
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      padding: '7px 10px',
                      borderRadius: 10,
                      border: active ? '1px solid rgba(42,171,238,0.22)' : '1px solid transparent',
                      background: active ? 'rgba(42,171,238,0.1)' : 'transparent',
                      color: active ? '#1565C0' : '#324055',
                      fontWeight: active ? 700 : 400,
                      textAlign: 'left',
                      marginLeft: topic.depth * 14,
                      cursor: 'pointer',
                      transition: 'background 0.12s',
                      userSelect: 'none',
                    }}
                  >
                    {hasChildren ? (
                      <button
                        type="button"
                        aria-expanded={!isCollapsed}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCollapsedTopicIds((cur) => {
                            const next = new Set(cur);
                            if (next.has(topic.id)) next.delete(topic.id);
                            else next.add(topic.id);
                            return next;
                          });
                        }}
                        style={{ fontSize: 10, color: '#aab', width: 12, flexShrink: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', boxShadow: 'none' }}
                      >
                        {isCollapsed ? '▸' : '▾'}
                      </button>
                    ) : (
                      <span style={{ width: 12, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ width: 6, height: 6, borderRadius: 999, background: active ? '#2AABEE' : '#cbd5e0' }} />
                      </span>
                    )}
                    <span style={{ flex: 1, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {topic.title}
                    </span>
                    {hasChildren && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999,
                        background: active ? '#2AABEE' : 'rgba(23,32,51,0.07)',
                        color: active ? '#fff' : '#778',
                      }}>
                        {childTopicCount.get(topic.id)}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* ── Right panel ── */}
        <section style={{ display: 'grid', gridTemplateRows: 'auto auto minmax(0, 1fr)', gap: 12, minHeight: 0, overflow: isMobile ? 'visible' : 'hidden' }}>

          {/* Topic header */}
          <article style={{ ...panelStyle, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: '1 1 200px' }}>
              <h2 style={{ fontSize: 19, fontWeight: 800, color: '#1f2a3b', marginBottom: 4, overflowWrap: 'anywhere' }}>
                {selectedTopic ? selectedTopic.title : 'Выбери тему'}
              </h2>
              <div style={mutedTextStyle}>
                {selectedTopic
                  ? selectedTopic.description || 'У темы пока нет описания.'
                  : 'Выбери тему слева, чтобы увидеть материалы.'}
              </div>
              {selectedTopic && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(23,32,51,0.06)', color: '#445', fontSize: 12, fontWeight: 600 }}>
                    {selectedSubject?.name ?? '—'}
                  </span>
                  <span style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(23,32,51,0.06)', color: '#445', fontSize: 12, fontWeight: 600 }}>
                    {selectedTopic.level_ids?.length
                      ? selectedTopic.level_ids.map((id) => tutorLevels.find((l) => l.id === id)?.name ?? `#${id}`).join(', ')
                      : 'Все уровни'}
                  </span>
                </div>
              )}
            </div>
            {selectedTopic && (
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button type="button" onClick={openEditTopic} className="icon-button icon-button-dark" title="Редактировать тему">✎</button>
                <button type="button" onClick={handleDeleteTopic} className="icon-button icon-button-danger" title="Удалить тему">🗑</button>
              </div>
            )}
          </article>

          {/* Materials toolbar: filter chips + add button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 15, color: '#1f2a3b', marginRight: 4 }}>
              Материалы{selectedTopic ? ` · ${selectedTopicMaterials.length}` : ''}
            </span>

            {(['all', 'basic', 'advanced'] as const).map((lvl) => {
              const active = levelFilter === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setLevelFilter(lvl as typeof levelFilter)}
                  style={{
                    padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    border: active ? '1px solid rgba(42,171,238,0.28)' : '1px solid rgba(24,33,47,0.1)',
                    background: active ? 'rgba(42,171,238,0.12)' : '#f5f7fb',
                    color: active ? '#1565C0' : '#556',
                    boxShadow: 'none',
                  }}
                >
                  {lvl === 'all' ? 'Все уровни' : levelLabels[lvl as MaterialLevel]}
                </button>
              );
            })}

            <button
              type="button"
              onClick={openCreateMaterial}
              disabled={!selectedTopic}
              style={{
                marginLeft: 'auto', padding: '7px 16px', borderRadius: 11,
                background: selectedTopic ? '#2AABEE' : 'rgba(23,32,51,0.1)',
                color: selectedTopic ? '#fff' : '#aaa',
                fontSize: 13, fontWeight: 700, border: 'none',
                boxShadow: selectedTopic ? '0 4px 12px rgba(42,171,238,0.3)' : 'none',
                cursor: selectedTopic ? 'pointer' : 'default',
              }}
            >
              + Добавить материал
            </button>
          </div>

          {/* Material cards */}
          {!selectedTopic ? (
            <div style={mutedTextStyle}>Сначала выбери тему слева.</div>
          ) : selectedTopicMaterials.length === 0 ? (
            <div style={mutedTextStyle}>
              {normalizedSearch || levelFilter !== 'all'
                ? 'По текущим фильтрам материалы не найдены.'
                : 'У этой темы пока нет материалов.'}
            </div>
          ) : (
            <div style={{ display: 'grid', alignContent: 'start', gap: 8, minHeight: 0, overflowY: isMobile ? 'visible' : 'auto', scrollbarWidth: 'thin', paddingRight: 2 }}>
              {selectedTopicMaterials.map((material) => {
                const color = formatColor[material.format];
                const isExpanded = expandedMaterialIds.has(material.id);
                const isTextMaterial = material.format === 'text';
                const canOpen = Boolean(material.content_url);
                const displayTitle = getMaterialTitle(material);

                return (
                  <div
                    key={material.id}
                    style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(24,33,47,0.08)', boxShadow: '0 2px 8px rgba(15,23,42,0.04)', overflow: 'hidden' }}
                  >
                    <div
                      style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', cursor: isTextMaterial || canOpen ? 'pointer' : 'default' }}
                      onClick={() => {
                        if (isTextMaterial) {
                          setExpandedMaterialIds((cur) => {
                            const next = new Set(cur);
                            if (next.has(material.id)) next.delete(material.id);
                            else next.add(material.id);
                            return next;
                          });
                        } else if (canOpen && material.content_url) {
                          const win = window.open(material.content_url, '_blank');
                          if (win) win.opener = null;
                        }
                      }}
                    >
                      <span style={{ width: 40, height: 40, borderRadius: 11, background: `${color}18`, color, display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>
                        {material.format === 'video' ? '▶' : material.format === 'text' ? '▤' : material.format === 'image' ? '▧' : material.format === 'presentation' ? '▦' : '↗'}
                      </span>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: '#1f2a3b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 3 }}>
                          {displayTitle}
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ padding: '3px 8px', borderRadius: 999, background: `${color}18`, color, fontSize: 11, fontWeight: 700 }}>
                            {formatLabels[material.format]}
                          </span>
                          <span style={{ padding: '3px 8px', borderRadius: 999, background: 'rgba(23,32,51,0.06)', color: '#556', fontSize: 11 }}>
                            {levelLabels[material.level]}
                          </span>
                          {isTextMaterial && (
                            <span style={{ fontSize: 11, color: '#9aabb8' }}>
                              {isExpanded ? '▾ свернуть' : '▸ развернуть'}
                            </span>
                          )}
                          {canOpen && material.content_url && !isTextMaterial && (
                            <span style={{ fontSize: 11, color: '#9aabb8' }}>
                              ▸ {getDomainHint(material.content_url)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                        {canOpen && (
                          <a
                            href={material.content_url ?? ''}
                            target="_blank"
                            rel="noreferrer"
                            title="Открыть"
                            className="icon-button ghost-button"
                            style={{ textDecoration: 'none', width: 30, height: 30, borderRadius: 8, background: '#EFF9FF', color: '#2AABEE', display: 'grid', placeItems: 'center', fontSize: 14 }}
                          >
                            ↗
                          </a>
                        )}
                        <button type="button" title="Редактировать" onClick={() => openEditMaterial(material)} className="icon-button icon-button-dark" style={{ width: 30, height: 30, borderRadius: 8 }}>✎</button>
                        <button type="button" title="Удалить" onClick={() => handleDeleteMaterial(material)} className="icon-button icon-button-danger" style={{ width: 30, height: 30, borderRadius: 8 }}>🗑</button>
                      </div>
                    </div>

                    {isTextMaterial && isExpanded && (
                      <div style={{ borderTop: '1px solid rgba(24,33,47,0.06)', padding: '14px 16px 14px 20px', background: '#fafcff', fontSize: 13, color: '#324055', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                        {material.content_text ?? <em style={{ color: '#aaa' }}>Содержание не добавлено</em>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </section>

      {topicModal && (
        <div onClick={() => setTopicModal(null)} className="modal-overlay">
          <div onClick={(event) => event.stopPropagation()} className="app-modal">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  {topicModal.mode === 'edit'
                    ? 'Редактировать тему'
                    : topicModal.mode === 'create-child'
                      ? 'Создать подтему'
                      : 'Создать тему'}
                </h3>
                <p className="modal-subtitle">Опиши тему и выбери уровни, для которых она будет доступна.</p>
              </div>
              <button type="button" title="Закрыть" onClick={() => setTopicModal(null)} className="modal-close">×</button>
            </div>

            <label className="modal-field">
              Название темы
              <input value={topicTitle} onChange={(event) => setTopicTitle(event.target.value)} />
            </label>

            <label className="modal-field">
              Описание
              <textarea
                value={topicDescription}
                onChange={(event) => setTopicDescription(event.target.value)}
                rows={4}
              />
            </label>

            <div className="modal-section">
              <div className="modal-section-title">Уровни обучения</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    setTopicLevelMode('all');
                    setTopicLevelIds([]);
                  }}
                  style={{
                    background: topicLevelMode === 'all' ? '#2AABEE' : 'rgba(23,32,51,0.08)',
                    color: topicLevelMode === 'all' ? '#fff' : '#324055',
                    boxShadow: 'none',
                  }}
                >
                  Все уровни
                </button>
                <button
                  type="button"
                  onClick={() => setTopicLevelMode('custom')}
                  style={{
                    background: topicLevelMode === 'custom' ? '#2AABEE' : 'rgba(23,32,51,0.08)',
                    color: topicLevelMode === 'custom' ? '#fff' : '#324055',
                    boxShadow: 'none',
                  }}
                >
                  Выбрать уровни
                </button>
              </div>
              {topicLevelMode === 'custom' && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {tutorLevels.length === 0 ? (
                    <div style={mutedTextStyle}>Сначала создай уровни в настройках.</div>
                  ) : (
                    tutorLevels.map((level) => {
                      const active = topicLevelIds.includes(level.id);
                      return (
                        <button
                          key={level.id}
                          type="button"
                          onClick={() =>
                            setTopicLevelIds((current) =>
                              active ? current.filter((id) => id !== level.id) : [...current, level.id]
                            )
                          }
                          style={{
                            padding: '8px 10px',
                            borderRadius: 999,
                            background: active ? 'rgba(42,171,238,0.12)' : 'rgba(23,32,51,0.05)',
                            color: active ? '#2AABEE' : '#324055',
                            border: active
                              ? '1px solid rgba(42,171,238,0.24)'
                              : '1px solid rgba(24,33,47,0.08)',
                            boxShadow: 'none',
                            fontWeight: 700,
                            fontSize: 12,
                          }}
                        >
                          {level.name}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button type="button" onClick={handleSaveTopic} disabled={saving} className="modal-primary">
                {saving ? 'Сохраняем...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {materialModal && (
        <div onClick={() => setMaterialModal(null)} className="modal-overlay">
          <div onClick={(event) => event.stopPropagation()} className="app-modal">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  {materialModal.mode === 'edit' ? 'Редактировать материал' : 'Добавить материал'}
                </h3>
                <p className="modal-subtitle">Выбери формат, уровень и добавь содержимое материала.</p>
              </div>
              <button type="button" title="Закрыть" onClick={() => setMaterialModal(null)} className="modal-close">×</button>
            </div>

            <label className="modal-field">
              Название материала
              <input
                value={materialTitle}
                onChange={(event) => setMaterialTitle(event.target.value)}
                placeholder="Например: Формула дискриминанта, Демоверсия ЕГЭ 2024"
              />
            </label>

            <div className="modal-row">
              <label className="modal-field">
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

              <label className="modal-field">
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
              <label className="modal-field">
                Содержимое
                <textarea
                  value={materialText}
                  onChange={(event) => setMaterialText(event.target.value)}
                  rows={8}
                  placeholder="Добавь конспект, пояснение или теорию по теме"
                />
              </label>
            ) : (
              <label className="modal-field">
                Ссылка
                <input
                  value={materialUrl}
                  onChange={(event) => setMaterialUrl(event.target.value)}
                  placeholder="https://..."
                />
              </label>
            )}

            <div className="modal-actions">
              <button type="button" onClick={handleSaveMaterial} disabled={saving} className="modal-primary">
                {saving ? 'Сохраняем...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
