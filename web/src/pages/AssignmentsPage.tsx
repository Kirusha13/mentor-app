import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  createAssignment,
  getAssignments,
  updateAssignment,
  type Assignment,
  type AssignmentAttachments,
  type AssignmentFileAttachment,
  type AssignmentLinkAttachment,
  type CompletionStatus,
} from '../api/assignments';
import { getStudents, type Student } from '../api/students';
import { getSubjects, type Subject } from '../api/subjects';
import { getTopics, type TheoryTopic } from '../api/topics';
import { getTutorStudents, type TutorStudent } from '../api/tutorStudents';
import { formatTopicLevels, topicMatchesStudentLevel } from '../utils/studyLevel';

const panelStyle = {
  background: 'rgba(255,255,255,0.88)',
  padding: '16px',
  borderRadius: '18px',
  border: '1px solid rgba(24,33,47,0.08)',
  boxShadow: 'var(--shadow-card)',
} as const;

const badgeStyle = {
  padding: '7px 11px',
  borderRadius: 999,
  background: 'rgba(23,32,51,0.06)',
  color: '#3f4e63',
  fontSize: 13,
} as const;

const STATUS_LABELS: Record<CompletionStatus, string> = {
  assigned: 'Назначено',
  in_progress: 'В работе',
  completed: 'Выполнено',
  overdue: 'Просрочено',
};

const STATUS_COLORS: Record<CompletionStatus, string> = {
  assigned: '#2a6fdb',
  in_progress: '#d96f32',
  completed: '#2f7d63',
  overdue: '#a63f3b',
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const normalizeAttachments = (attachments: Assignment['attachments']): AssignmentAttachments => {
  if (!attachments || typeof attachments !== 'object') return {};
  const links = Array.isArray(attachments.links)
    ? attachments.links.filter(
        (item): item is AssignmentLinkAttachment =>
          !!item &&
          typeof item === 'object' &&
          typeof item.label === 'string' &&
          typeof item.url === 'string'
      )
    : [];
  const files = Array.isArray(attachments.files)
    ? attachments.files.filter(
        (item): item is AssignmentFileAttachment =>
          !!item &&
          typeof item === 'object' &&
          typeof item.name === 'string' &&
          typeof item.data_url === 'string'
      )
    : [];
  return { links, files };
};

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [tutorStudents, setTutorStudents] = useState<TutorStudent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<TheoryTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<CompletionStatus | 'all'>('all');
  const [relationFilter, setRelationFilter] = useState<'all' | string>('all');
  const [newTutorStudentId, setNewTutorStudentId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDeadline, setNewDeadline] = useState('');
  const [newTopicId, setNewTopicId] = useState('');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [attachedLinks, setAttachedLinks] = useState<AssignmentLinkAttachment[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<AssignmentFileAttachment[]>([]);

  const relationOptions = useMemo(
    () =>
      tutorStudents.map((item) => {
        const student = students.find((entry) => entry.id === item.student_id);
        const subject = subjects.find((entry) => entry.id === item.subject_id);
        return {
          id: item.id,
          label: `${student?.full_name ?? `Ученик #${item.student_id}`} • ${
            subject?.name ?? 'Без предмета'
          }`,
          subjectId: item.subject_id,
        };
      }),
    [students, subjects, tutorStudents]
  );

  const filteredAssignments = useMemo(
    () =>
      assignments.filter((assignment) => {
        const byStatus =
          statusFilter === 'all' || assignment.completion_status === statusFilter;
        const byRelation =
          relationFilter === 'all' || String(assignment.tutor_student_id) === relationFilter;
        return byStatus && byRelation;
      }),
    [assignments, relationFilter, statusFilter]
  );

  const selectedAssignment = useMemo(
    () => assignments.find((assignment) => assignment.id === selectedAssignmentId) ?? null,
    [assignments, selectedAssignmentId]
  );

  const selectedAttachments = useMemo(
    () => normalizeAttachments(selectedAssignment?.attachments ?? null),
    [selectedAssignment]
  );

  const availableTopics = useMemo(() => {
    const selectedRelation = relationOptions.find(
      (item) => String(item.id) === newTutorStudentId
    );
    if (!selectedRelation) return topics;

    const relation = tutorStudents.find((item) => item.id === selectedRelation.id);
    const student = students.find((item) => item.id === relation?.student_id);

    return topics.filter(
      (topic) =>
        topic.subject_id === selectedRelation.subjectId &&
        topicMatchesStudentLevel(topic, student?.grade)
    );
  }, [newTutorStudentId, relationOptions, students, topics, tutorStudents]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [assignmentData, tutorStudentData, studentData, subjectData, topicData] =
          await Promise.all([
            getAssignments(),
            getTutorStudents(),
            getStudents(),
            getSubjects(),
            getTopics(),
          ]);
        setAssignments(assignmentData);
        setTutorStudents(tutorStudentData);
        setStudents(studentData);
        setSubjects(subjectData);
        setTopics(topicData);
      } catch (error) {
        console.error('Ошибка загрузки заданий:', error);
        alert('Не удалось загрузить задания');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (!relationOptions.length) return setNewTutorStudentId('');
    setNewTutorStudentId((current) =>
      current && relationOptions.some((item) => String(item.id) === current)
        ? current
        : String(relationOptions[0].id)
    );
  }, [relationOptions]);

  useEffect(() => {
    if (!availableTopics.length) return setNewTopicId('');
    setNewTopicId((current) =>
      current && availableTopics.some((topic) => String(topic.id) === current)
        ? current
        : String(availableTopics[0].id)
    );
  }, [availableTopics]);

  useEffect(() => {
    if (newDeadline) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(18, 0, 0, 0);
    setNewDeadline(tomorrow.toISOString().slice(0, 16));
  }, [newDeadline]);

  const getRelationMeta = (tutorStudentId: number) => {
    const relation = tutorStudents.find((item) => item.id === tutorStudentId);
    return {
      student: students.find((item) => item.id === relation?.student_id),
      subject: subjects.find((item) => item.id === relation?.subject_id),
    };
  };

  const getTopicTitle = (topicId: number | null) =>
    topics.find((topic) => topic.id === topicId)?.title ?? 'Без темы';

  const upsertAssignment = (updated: Assignment) =>
    setAssignments((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item)).sort((a, b) => a.deadline.localeCompare(b.deadline))
    );

  const handleFileSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    try {
      const prepared = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          data_url: await fileToDataUrl(file),
        }))
      );
      setAttachedFiles((prev) => [...prev, ...prepared]);
      event.target.value = '';
    } catch (error) {
      console.error('Ошибка подготовки файлов:', error);
      alert('Не удалось прикрепить файл');
    }
  };

  const handleAddLink = () => {
    const label = newLinkLabel.trim();
    const url = newLinkUrl.trim();
    if (!url) return alert('Добавь ссылку');
    try {
      const normalizedUrl = new URL(url).toString();
      setAttachedLinks((prev) => [...prev, { label: label || normalizedUrl, url: normalizedUrl }]);
      setNewLinkLabel('');
      setNewLinkUrl('');
    } catch {
      alert('Ссылка должна начинаться с http:// или https://');
    }
  };

  const handleCreate = async () => {
    if (!newTutorStudentId || !newDescription.trim() || !newDeadline) {
      return alert('Заполни ученика, описание и дедлайн');
    }
    const attachments: AssignmentAttachments =
      attachedLinks.length || attachedFiles.length
        ? { links: attachedLinks, files: attachedFiles }
        : {};
    try {
      setCreating(true);
      const created = await createAssignment({
        tutor_student_id: Number(newTutorStudentId),
        title: newTitle.trim() || undefined,
        description: newDescription.trim(),
        deadline: new Date(newDeadline).toISOString(),
        topic_id: newTopicId ? Number(newTopicId) : undefined,
        attachments,
      });
      setAssignments((prev) => [created, ...prev].sort((a, b) => a.deadline.localeCompare(b.deadline)));
      setNewTitle('');
      setNewDescription('');
      setNewLinkLabel('');
      setNewLinkUrl('');
      setAttachedLinks([]);
      setAttachedFiles([]);
      alert('Задание создано');
    } catch (error) {
      console.error('Ошибка создания задания:', error);
      alert('Не удалось создать задание');
    } finally {
      setCreating(false);
    }
  };

  const handlePatchAssignment = async (
    assignmentId: number,
    payload: { completion_status?: CompletionStatus; grade?: number }
  ) => {
    try {
      const updated = await updateAssignment(assignmentId, payload);
      upsertAssignment(updated);
      setSelectedAssignmentId(updated.id);
    } catch (error) {
      console.error('Ошибка обновления задания:', error);
      alert('Не удалось обновить задание');
    }
  };

  const mediaBase = import.meta.env.VITE_API_BASE_URL.replace('/api/v1', '');

  return (
    <div>
      <section style={{ ...panelStyle, padding: 20, marginBottom: 16, background: 'linear-gradient(140deg, rgba(255,245,238,0.98) 0%, rgba(255,255,255,0.9) 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', lineHeight: 0.98, letterSpacing: '-0.04em', marginBottom: 10 }}>Домашние задания</h1>
            <p style={{ color: '#5e6a7b', maxWidth: 760, fontSize: 16, marginBottom: 0 }}>Работа с заданиями, ответами и дедлайнами.</p>
          </div>
          <div style={{ minWidth: 176, borderRadius: 16, padding: '12px 14px', background: '#172033', color: '#fff' }}>
            <div style={{ color: 'rgba(255,255,255,0.64)', fontSize: 12, marginBottom: 6 }}>Всего заданий</div>
            <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1, marginBottom: 6 }}>{assignments.length}</div>
            <div style={{ color: 'rgba(255,255,255,0.74)', fontSize: 12 }}>После фильтров: {filteredAssignments.length}</div>
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 360px) minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
        <section style={panelStyle}>
          <h3 style={{ fontSize: 19, marginBottom: 8 }}>Создать задание</h3>
          <p style={{ color: '#687486', marginBottom: 10, fontSize: 14 }}>
            Выбери ученика, тему, дедлайн и при необходимости прикрепи ссылки или файлы.
          </p>

          {relationOptions.length === 0 ? (
            <div style={{ padding: 16, borderRadius: 16, background: 'rgba(23,32,51,0.06)', color: '#566173' }}>
              Сначала создай ученика и привяжи его к предмету.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              <select value={newTutorStudentId} onChange={(event) => setNewTutorStudentId(event.target.value)}>
                {relationOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>

              <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Заголовок задания" />
              <textarea value={newDescription} onChange={(event) => setNewDescription(event.target.value)} placeholder="Описание задания" rows={5} style={{ resize: 'vertical' }} />
              <input type="datetime-local" value={newDeadline} onChange={(event) => setNewDeadline(event.target.value)} />

              <select value={newTopicId} onChange={(event) => setNewTopicId(event.target.value)}>
                <option value="">Без темы</option>
                {availableTopics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.title} • {formatTopicLevels(topic.study_level)}
                  </option>
                ))}
              </select>

              <div style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 16, background: 'rgba(23,32,51,0.04)', border: '1px solid rgba(24,33,47,0.06)' }}>
                <div style={{ fontWeight: 700, color: '#243041' }}>Вложения преподавателя</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr auto', gap: 8 }}>
                  <input value={newLinkLabel} onChange={(event) => setNewLinkLabel(event.target.value)} placeholder="Подпись ссылки" />
                  <input value={newLinkUrl} onChange={(event) => setNewLinkUrl(event.target.value)} placeholder="https://..." />
                  <button type="button" onClick={handleAddLink} style={{ boxShadow: 'none', minWidth: 112 }}>
                    Добавить
                  </button>
                </div>

                <label style={{ display: 'grid', gap: 6, color: '#4d5a6d', fontSize: 14 }}>
                  Прикрепить файл
                  <input type="file" multiple onChange={handleFileSelection} />
                </label>

                {(attachedLinks.length > 0 || attachedFiles.length > 0) && (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {attachedLinks.map((link, index) => (
                      <div key={`${link.url}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', padding: '10px 12px', borderRadius: 14, background: '#fff' }}>
                        <a href={link.url} target="_blank" rel="noreferrer">{link.label}</a>
                        <button type="button" onClick={() => setAttachedLinks((prev) => prev.filter((_, itemIndex) => itemIndex !== index))} style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}>
                          Убрать
                        </button>
                      </div>
                    ))}

                    {attachedFiles.map((file, index) => (
                      <div key={`${file.name}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', padding: '10px 12px', borderRadius: 14, background: '#fff' }}>
                        <div style={{ color: '#243041' }}>{file.name} ({Math.max(1, Math.round(file.size / 1024))} KB)</div>
                        <button type="button" onClick={() => setAttachedFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index))} style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}>
                          Убрать
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={handleCreate} disabled={creating}>
                {creating ? 'Создаём...' : 'Создать задание'}
              </button>
            </div>
          )}
        </section>

        <section style={panelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 19, marginBottom: 4 }}>Список заданий</h3>
              <div style={{ color: '#6b7788' }}>Фильтруй по статусу и ученику, чтобы быстро находить нужные задания.</div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CompletionStatus | 'all')} style={{ minWidth: 170 }}>
                <option value="all">Все статусы</option>
                <option value="assigned">Назначено</option>
                <option value="in_progress">В работе</option>
                <option value="completed">Выполнено</option>
                <option value="overdue">Просрочено</option>
              </select>

              <select value={relationFilter} onChange={(event) => setRelationFilter(event.target.value)} style={{ minWidth: 200 }}>
                <option value="all">Все ученики</option>
                {relationOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <p style={{ color: '#687486', marginBottom: 0 }}>Загрузка заданий...</p>
          ) : filteredAssignments.length === 0 ? (
            <div style={{ padding: 14, borderRadius: 16, background: 'rgba(23,32,51,0.04)', color: '#687486' }}>
              Задания не найдены.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 14 }}>
              {filteredAssignments.map((assignment) => {
                const { student, subject } = getRelationMeta(assignment.tutor_student_id);
                const color = STATUS_COLORS[assignment.completion_status];
                const attachments = normalizeAttachments(assignment.attachments);
                const attachmentCount = (attachments.links?.length ?? 0) + (attachments.files?.length ?? 0);

                return (
                  <article key={assignment.id} onClick={() => setSelectedAssignmentId(assignment.id)} style={{ border: '1px solid rgba(24,33,47,0.08)', borderRadius: '16px', padding: '14px', background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.9) 100%)', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                      <div>
                        <div style={{ display: 'inline-flex', padding: '7px 11px', borderRadius: 999, background: color, color: '#fff', fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
                          {STATUS_LABELS[assignment.completion_status]}
                        </div>
                        <h4 style={{ fontSize: 19, marginBottom: 6 }}>{assignment.title || 'Задание без заголовка'}</h4>
                        <div style={{ color: '#5d6778' }}>{student?.full_name ?? 'Ученик'} • {subject?.name ?? 'Без предмета'}</div>
                      </div>

                      <div style={{ textAlign: 'right', color: '#5d6778' }}>
                        <div style={{ fontWeight: 700, color: '#243041' }}>до {new Date(assignment.deadline).toLocaleString('ru-RU')}</div>
                        <div style={{ marginTop: 6 }}>{assignment.grade ? `Оценка: ${assignment.grade}` : 'Без оценки'}</div>
                      </div>
                    </div>

                    <p style={{ color: '#4d5a6d', marginBottom: 8, fontSize: 14 }}>{assignment.description}</p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={badgeStyle}>Тема: {getTopicTitle(assignment.topic_id)}</span>
                      <span style={badgeStyle}>Ответ: {assignment.student_comment ? 'Есть' : 'Нет'}</span>
                      <span style={badgeStyle}>Вложения: {attachmentCount}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {selectedAssignment && (() => {
        const { student, subject } = getRelationMeta(selectedAssignment.tutor_student_id);
        const color = STATUS_COLORS[selectedAssignment.completion_status];

        return (
          <div onClick={() => setSelectedAssignmentId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.34)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 24, zIndex: 1000 }}>
            <div onClick={(event) => event.stopPropagation()} style={{ width: 'min(640px, 100%)', maxHeight: '84vh', overflowY: 'auto', borderRadius: 22, background: 'rgba(255,255,255,0.98)', boxShadow: '0 28px 70px rgba(15, 23, 42, 0.22)', border: '1px solid rgba(24,33,47,0.08)' }}>
              <div style={{ padding: '22px 24px 18px', background: `${color}14`, borderBottom: '1px solid rgba(24,33,47,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'inline-flex', padding: '8px 12px', borderRadius: 999, background: color, color: '#fff', fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
                      {STATUS_LABELS[selectedAssignment.completion_status]}
                    </div>
                    <h3 style={{ fontSize: 24, lineHeight: 1.02, marginBottom: 6 }}>{selectedAssignment.title || 'Задание без заголовка'}</h3>
                    <p style={{ color: '#5d6778', marginBottom: 0 }}>{student?.full_name ?? 'Ученик'} • {subject?.name ?? 'Без предмета'}</p>
                  </div>

                  <button onClick={() => setSelectedAssignmentId(null)} style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}>
                    ×
                  </button>
                </div>
              </div>

              <div style={{ padding: 24 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}>
                  {[
                    ['Дедлайн', new Date(selectedAssignment.deadline).toLocaleString('ru-RU')],
                    ['Тема', getTopicTitle(selectedAssignment.topic_id)],
                    ['Оценка', selectedAssignment.grade ? String(selectedAssignment.grade) : 'Не выставлена'],
                    ['Статус', STATUS_LABELS[selectedAssignment.completion_status]],
                  ].map(([label, value]) => (
                    <div key={label} style={{ padding: 12, borderRadius: 14, background: 'rgba(23,32,51,0.04)', border: '1px solid rgba(24,33,47,0.06)' }}>
                      <div style={{ fontSize: 13, color: '#768294', marginBottom: 6 }}>{label}</div>
                      <div style={{ fontWeight: 700, color: '#1f2a3b' }}>{value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: '#687486', marginBottom: 6 }}>Описание</div>
                  <div style={{ padding: 16, borderRadius: 18, background: 'rgba(23,32,51,0.04)', color: '#243041', lineHeight: 1.6 }}>
                    {selectedAssignment.description}
                  </div>
                </div>

                {((selectedAttachments.links?.length ?? 0) + (selectedAttachments.files?.length ?? 0) > 0) && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: '#687486', marginBottom: 8 }}>Материалы преподавателя</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {selectedAttachments.links?.map((link, index) => (
                        <a key={`${link.url}-${index}`} href={link.url} target="_blank" rel="noreferrer" style={{ padding: 12, borderRadius: 16, background: 'rgba(23,32,51,0.04)', border: '1px solid rgba(24,33,47,0.06)', color: '#243041', wordBreak: 'break-all' }}>
                          {link.label}
                        </a>
                      ))}
                      {selectedAttachments.files?.map((file, index) => (
                        <a key={`${file.name}-${index}`} href={file.data_url} download={file.name} style={{ padding: 12, borderRadius: 16, background: 'rgba(23,32,51,0.04)', border: '1px solid rgba(24,33,47,0.06)', color: '#243041', wordBreak: 'break-all' }}>
                          {file.name}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: '#687486', marginBottom: 6 }}>Ответ ученика</div>
                  <div style={{ padding: 16, borderRadius: 18, background: 'rgba(23,32,51,0.04)', color: '#243041', lineHeight: 1.6 }}>
                    {selectedAssignment.student_comment || 'Ученик ещё не отправил комментарий'}
                  </div>
                </div>

                {selectedAssignment.student_files && selectedAssignment.student_files.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: '#687486', marginBottom: 8 }}>Файлы ученика</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                      {selectedAssignment.student_files.map((filePath) => (
                        <a key={filePath} href={`${mediaBase}${filePath}`} target="_blank" rel="noreferrer" style={{ padding: 12, borderRadius: 16, background: 'rgba(23,32,51,0.04)', border: '1px solid rgba(24,33,47,0.06)', color: '#243041', wordBreak: 'break-all' }}>
                          {filePath}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button onClick={() => handlePatchAssignment(selectedAssignment.id, { completion_status: 'completed' })}>
                    Отметить выполненным
                  </button>
                  <button onClick={() => handlePatchAssignment(selectedAssignment.id, { completion_status: 'in_progress' })} style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}>
                    В работу
                  </button>
                  <button
                    onClick={() => {
                      const grade = window.prompt('Поставить оценку 1-5');
                      const value = Number(grade);
                      if (!value || value < 1 || value > 5) return;
                      handlePatchAssignment(selectedAssignment.id, { grade: value });
                    }}
                    style={{ background: '#2f7d63', boxShadow: 'none' }}
                  >
                    Поставить оценку
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
