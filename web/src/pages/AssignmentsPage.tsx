import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Trash2 } from 'lucide-react';
import {
  createAssignment,
  deleteAssignment,
  getAssignments,
  updateAssignment,
  type Assignment,
  type AssignmentAttachments,
  type AssignmentFileAttachment,
  type AssignmentLinkAttachment,
  type CompletionStatus,
} from '../api/assignments';
import { getStudents, type Student } from '../api/students';
import { Modal } from '../components/Modal';
import { getSubjects, type Subject } from '../api/subjects';
import { getTopics, type TheoryTopic } from '../api/topics';
import { getTutorLevels, type TutorLevel } from '../api/tutorLevels';
import { getTutorStudents, type TutorStudent } from '../api/tutorStudents';
import {
  getHomeworkQueue,
  skipHomework,
  type HomeworkQueueItem,
} from '../api/homework';
import { useToast } from '../components/Toast';
import { useFieldErrors, FieldError, type FieldRules } from '../components/formValidation';
import { useConfirm } from '../components/ConfirmDialog';
import { formatTopicLevels, topicMatchesStudentLevel } from '../utils/studyLevel';
import { formatFileSize, getMediaUrl, isImageSource } from '../utils/media';

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

type AssignmentColumn = {
  key: AssignmentLane;
  title: string;
  color: string;
  soft: string;
  items: Assignment[];
};

type AssignmentLane = 'created' | 'in_progress' | 'review' | 'overdue' | 'checked';

type AssignmentCardMode = 'kanban' | 'checked' | 'archive';

const LANE_META: Record<AssignmentLane, { title: string; color: string; soft: string; actionLabel: string }> = {
  created: { title: 'Создано', color: '#2AABEE', soft: '#EFF9FF', actionLabel: 'Создано' },
  in_progress: { title: 'В работе', color: '#4CAF50', soft: '#F1FBF2', actionLabel: 'Открыто' },
  review: { title: 'На проверке', color: '#FF9800', soft: '#FFF8EE', actionLabel: 'Отправлено' },
  overdue: { title: 'Просрочено', color: '#F44336', soft: '#FFF2F1', actionLabel: 'Дедлайн' },
  checked: { title: 'Проверено', color: '#9C27B0', soft: '#F9F0FF', actionLabel: 'Проверено' },
};

const ACTIVE_LANES: AssignmentLane[] = ['created', 'in_progress', 'review', 'overdue'];

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

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return `${date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  })}, ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
}

// Подбираем размер шрифта по длине строки, чтобы текст карточки влезал в одну
// строку без обрезки троеточием: до `start` символов — максимум, после `end` —
// минимум, между — линейная интерполяция. Дальше срабатывает ellipsis как страховка.
function fitCardFont(text: string, max: number, min: number, start: number, end: number) {
  const len = text.length;
  if (len <= start) return max;
  if (len >= end) return min;
  const ratio = (len - start) / (end - start);
  return Math.round((max - (max - min) * ratio) * 10) / 10;
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateRangeInputLabel(value: string) {
  const [, month, day] = value.split('-');
  return day && month ? `${day}-${month}` : 'ДД-ММ';
}

function defaultPeriodStart() {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return formatDateInput(date);
}

function defaultPeriodEnd() {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return formatDateInput(date);
}

function getAssignmentLane(assignment: Assignment): AssignmentLane {
  const hasStudentAnswer =
    Boolean(assignment.student_comment?.trim()) ||
    Boolean(assignment.student_files?.length);
  const isDeadlineOverdue =
    new Date(assignment.deadline).getTime() < Date.now() &&
    assignment.completion_status !== 'completed' &&
    assignment.completion_status !== 'in_progress' &&
    !hasStudentAnswer;

  if (assignment.completion_status === 'completed' && assignment.grade) return 'checked';
  if (assignment.completion_status === 'completed' || hasStudentAnswer) return 'review';
  if (assignment.completion_status === 'in_progress') return 'in_progress';
  if (assignment.completion_status === 'overdue' || isDeadlineOverdue) return 'overdue';

  return 'created';
}

function getAssignmentActionDate(assignment: Assignment, lane = getAssignmentLane(assignment)) {
  if (lane === 'created') return assignment.created_at;
  if (lane === 'overdue') return assignment.deadline;
  return assignment.updated_at ?? assignment.created_at;
}

function isDateInRange(value: string, start: string, end: string) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;

  const startTime = start ? new Date(`${start}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
  const endTime = end ? new Date(`${end}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;

  return time >= startTime && time <= endTime;
}

export default function AssignmentsPage() {
  const toast = useToast();
  const { errors, validateField, validateAll, clearError, reset } = useFieldErrors();
  const confirm = useConfirm();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [homeworkQueue, setHomeworkQueue] = useState<HomeworkQueueItem[]>([]);
  const [pendingLessonId, setPendingLessonId] = useState<number | null>(null);
  const [tutorStudents, setTutorStudents] = useState<TutorStudent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<TheoryTopic[]>([]);
  const [tutorLevels, setTutorLevels] = useState<TutorLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<'all' | string>('all');
  const [studentFilter, setStudentFilter] = useState<'all' | string>('all');
  const [periodStart, setPeriodStart] = useState(defaultPeriodStart);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriodEnd);
  const [checkedArchiveOpen, setCheckedArchiveOpen] = useState(false);
  // expandedColumnKey удалён: колонки теперь скроллятся, без «Показать ещё».
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveSubjectFilter, setArchiveSubjectFilter] = useState<'all' | string>('all');
  const [archiveStudentFilter, setArchiveStudentFilter] = useState<'all' | string>('all');
  const [archiveStart, setArchiveStart] = useState(defaultPeriodStart);
  const [archiveEnd, setArchiveEnd] = useState(defaultPeriodEnd);
  const [newTutorStudentId, setNewTutorStudentId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDeadline, setNewDeadline] = useState('');
  const [newTopicId, setNewTopicId] = useState('');
  const [topicLevelFilter, setTopicLevelFilter] = useState('student');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [attachedLinks, setAttachedLinks] = useState<AssignmentLinkAttachment[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<AssignmentFileAttachment[]>([]);
  const [assignmentGradeCommentDraft, setAssignmentGradeCommentDraft] = useState('');
  const [assignmentCommentSaving, setAssignmentCommentSaving] = useState(false);

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

  const studentOptions = useMemo(
    () =>
      [...students]
        .filter((student) => tutorStudents.some((relation) => relation.student_id === student.id))
        .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru-RU')),
    [students, tutorStudents]
  );

  const subjectOptions = useMemo(
    () =>
      [...subjects]
        .filter((subject) => tutorStudents.some((relation) => relation.subject_id === subject.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'ru-RU')),
    [subjects, tutorStudents]
  );

  const filteredAssignments = useMemo(
    () =>
      assignments.filter((assignment) => {
        const relation = tutorStudents.find((item) => item.id === assignment.tutor_student_id);
        const student = students.find((item) => item.id === relation?.student_id);
        const subject = subjects.find((item) => item.id === relation?.subject_id);
        const lane = getAssignmentLane(assignment);
        const topicTitle = topics.find((topic) => topic.id === assignment.topic_id)?.title ?? 'Без темы';
        const query = search.trim().toLowerCase();
        const haystack = [
          assignment.title ?? '',
          assignment.description,
          topicTitle,
          student?.full_name ?? '',
          subject?.name ?? '',
        ]
          .join(' ')
          .toLowerCase();
        const bySubject = subjectFilter === 'all' || String(relation?.subject_id) === subjectFilter;
        const byStudent = studentFilter === 'all' || String(relation?.student_id) === studentFilter;
        const byPeriod = isDateInRange(getAssignmentActionDate(assignment, lane), periodStart, periodEnd);

        return (!query || haystack.includes(query)) && bySubject && byStudent && byPeriod;
      }),
    [
      assignments,
      periodEnd,
      periodStart,
      search,
      studentFilter,
      students,
      subjectFilter,
      subjects,
      topics,
      tutorStudents,
    ]
  );

  const selectedAssignment = useMemo(
    () => assignments.find((assignment) => assignment.id === selectedAssignmentId) ?? null,
    [assignments, selectedAssignmentId]
  );

  const selectedAttachments = useMemo(
    () => normalizeAttachments(selectedAssignment?.attachments ?? null),
    [selectedAssignment]
  );

  useEffect(() => {
    setAssignmentGradeCommentDraft(selectedAssignment?.grade_comment ?? '');
  }, [selectedAssignment]);

  const availableTopics = useMemo(() => {
    const selectedRelation = relationOptions.find(
      (item) => String(item.id) === newTutorStudentId
    );
    if (!selectedRelation) return topics;

    const relation = tutorStudents.find((item) => item.id === selectedRelation.id);
    const relationLevelIds = relation?.level_ids ?? [];
    const selectedLevelIds =
      topicLevelFilter === 'student'
        ? relationLevelIds
        : topicLevelFilter
          ? [Number(topicLevelFilter)]
          : [];

    return topics.filter(
      (topic) =>
        topic.subject_id === selectedRelation.subjectId &&
        topicMatchesStudentLevel(topic, selectedLevelIds)
    );
  }, [newTutorStudentId, relationOptions, topicLevelFilter, topics, tutorStudents]);

  const selectedRelationLevelIds = useMemo(() => {
    const relation = tutorStudents.find((item) => String(item.id) === newTutorStudentId);
    return relation?.level_ids ?? [];
  }, [newTutorStudentId, tutorStudents]);

  const topicLevelOptions = useMemo(() => {
    if (selectedRelationLevelIds.length === 0) return tutorLevels;
    const levelIds = new Set(selectedRelationLevelIds);
    return tutorLevels.filter((level) => levelIds.has(level.id));
  }, [selectedRelationLevelIds, tutorLevels]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [
          assignmentData,
          tutorStudentData,
          studentData,
          subjectData,
          topicData,
          levelData,
          homeworkData,
        ] = await Promise.all([
          getAssignments(),
          getTutorStudents(),
          getStudents(),
          getSubjects(),
          getTopics(),
          getTutorLevels(),
          getHomeworkQueue(),
        ]);
        setAssignments(assignmentData);
        setTutorStudents(tutorStudentData);
        setStudents(studentData);
        setSubjects(subjectData);
        setTopics(topicData);
        setTutorLevels(levelData);
        setHomeworkQueue(homeworkData);
      } catch (error) {
        console.error('Ошибка загрузки заданий:', error);
        toast.error('Не удалось загрузить задания');
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

    const oversized = files.find((file) => file.size > MAX_ATTACHMENT_SIZE);
    if (oversized) {
      toast.error(`Файл «${oversized.name}» слишком большой. Максимальный размер: ${formatFileSize(MAX_ATTACHMENT_SIZE)}.`);
      event.target.value = '';
      return;
    }

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
      toast.error('Не удалось прикрепить файл');
    }
  };

  const handleAddLink = () => {
    const label = newLinkLabel.trim();
    const url = newLinkUrl.trim();
    if (!url) return toast.error('Добавь ссылку');
    try {
      const normalizedUrl = new URL(url).toString();
      setAttachedLinks((prev) => [...prev, { label: label || normalizedUrl, url: normalizedUrl }]);
      setNewLinkLabel('');
      setNewLinkUrl('');
    } catch {
      toast.error('Ссылка должна начинаться с http:// или https://');
    }
  };

  const openAssignForLesson = (item: HomeworkQueueItem) => {
    reset();
    setPendingLessonId(item.lesson_id);
    setNewTutorStudentId(String(item.tutor_student_id));
    if (item.topic_id) setNewTopicId(String(item.topic_id));
    setCreateModalOpen(true);
  };

  const handleSkipHomework = async (lessonId: number) => {
    try {
      await skipHomework(lessonId);
      setHomeworkQueue((prev) => prev.filter((item) => item.lesson_id !== lessonId));
    } catch (error) {
      console.error('Ошибка отметки «без ДЗ»:', error);
      toast.error('Не удалось отметить «без ДЗ»');
    }
  };

  const closeCreateModal = () => {
    reset();
    setCreateModalOpen(false);
    setPendingLessonId(null);
  };

  const createAssignmentRules: FieldRules = {
    newTutorStudentId: () => (newTutorStudentId ? null : 'Выбери ученика и предмет'),
    newDescription: () => (newDescription.trim() ? null : 'Укажи описание задания'),
    newDeadline: () => {
      if (!newDeadline) return 'Укажи дедлайн';
      if (new Date(newDeadline).getTime() < Date.now()) return 'Дедлайн не может быть в прошлом';
      return null;
    },
  };

  const handleCreate = async () => {
    if (!validateAll(createAssignmentRules)) return;
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
        lesson_id: pendingLessonId ?? undefined,
        attachments,
      });
      setAssignments((prev) => [created, ...prev].sort((a, b) => a.deadline.localeCompare(b.deadline)));
      if (pendingLessonId !== null) {
        setHomeworkQueue((prev) => prev.filter((item) => item.lesson_id !== pendingLessonId));
      }
      setNewTitle('');
      setNewDescription('');
      setNewLinkLabel('');
      setNewLinkUrl('');
      setAttachedLinks([]);
      setAttachedFiles([]);
      closeCreateModal();
      toast.success('Задание создано');
    } catch (error) {
      console.error('Ошибка создания задания:', error);
      toast.error('Не удалось создать задание');
    } finally {
      setCreating(false);
    }
  };

  const handlePatchAssignment = async (
    assignmentId: number,
    payload: { completion_status?: CompletionStatus; grade?: number; grade_comment?: string | null }
  ) => {
    try {
      const updated = await updateAssignment(assignmentId, payload);
      upsertAssignment(updated);
      setSelectedAssignmentId(updated.id);
    } catch (error) {
      console.error('Ошибка обновления задания:', error);
      toast.error('Не удалось обновить задание');
    }
  };

  const handleSaveAssignmentGradeComment = async () => {
    if (!selectedAssignment) {
      return;
    }

    if ((selectedAssignment.grade_comment ?? '') === assignmentGradeCommentDraft.trim()) {
      return;
    }

    try {
      setAssignmentCommentSaving(true);
      const updated = await updateAssignment(selectedAssignment.id, {
        grade_comment: assignmentGradeCommentDraft.trim() || null,
      });
      upsertAssignment(updated);
      setSelectedAssignmentId(updated.id);
    } catch (error) {
      console.error('Ошибка сохранения комментария к оценке ДЗ:', error);
      toast.error('Не удалось сохранить комментарий к оценке ДЗ');
    } finally {
      setAssignmentCommentSaving(false);
    }
  };

  const handleDeleteAssignment = async (assignment: Assignment) => {
    const title = assignment.title || 'задание без заголовка';
    if (!(await confirm(`Удалить ДЗ «${title}»?`))) {
      return;
    }

    try {
      await deleteAssignment(assignment.id);
      setAssignments((prev) => prev.filter((item) => item.id !== assignment.id));
      if (selectedAssignmentId === assignment.id) {
        setSelectedAssignmentId(null);
      }
    } catch (error) {
      console.error('Ошибка удаления задания:', error);
      toast.error('Не удалось удалить задание');
    }
  };

  const assignmentColumns = useMemo<AssignmentColumn[]>(() => {
    const sortByActionDate = (items: Assignment[]) =>
      [...items].sort((a, b) =>
        getAssignmentActionDate(a).localeCompare(getAssignmentActionDate(b))
      );

    return ACTIVE_LANES.map((lane) => {
      const meta = LANE_META[lane];

      return {
        key: lane,
        title: meta.title,
        color: meta.color,
        soft: meta.soft,
        items: sortByActionDate(
          filteredAssignments.filter((assignment) => getAssignmentLane(assignment) === lane)
        ),
      };
    });
  }, [filteredAssignments]);

  const checkedAssignments = useMemo(
    () =>
      filteredAssignments
        .filter((assignment) => getAssignmentLane(assignment) === 'checked')
        .sort((a, b) => getAssignmentActionDate(b, 'checked').localeCompare(getAssignmentActionDate(a, 'checked'))),
    [filteredAssignments]
  );

  const archiveAssignments = useMemo(
    () =>
      assignments
        .filter((assignment) => {
          if (getAssignmentLane(assignment) !== 'checked') return false;

          const relation = tutorStudents.find((item) => item.id === assignment.tutor_student_id);
          const student = students.find((item) => item.id === relation?.student_id);
          const subject = subjects.find((item) => item.id === relation?.subject_id);
          const topicTitle = topics.find((topic) => topic.id === assignment.topic_id)?.title ?? 'Без темы';
          const query = archiveSearch.trim().toLowerCase();
          const haystack = [
            assignment.title ?? '',
            assignment.description,
            topicTitle,
            student?.full_name ?? '',
            subject?.name ?? '',
          ]
            .join(' ')
            .toLowerCase();
          const bySubject =
            archiveSubjectFilter === 'all' || String(relation?.subject_id) === archiveSubjectFilter;
          const byStudent =
            archiveStudentFilter === 'all' || String(relation?.student_id) === archiveStudentFilter;
          const byPeriod = isDateInRange(
            getAssignmentActionDate(assignment, 'checked'),
            archiveStart,
            archiveEnd
          );

          return (!query || haystack.includes(query)) && bySubject && byStudent && byPeriod;
        })
        .sort((a, b) => getAssignmentActionDate(b, 'checked').localeCompare(getAssignmentActionDate(a, 'checked'))),
    [
      archiveEnd,
      archiveSearch,
      archiveStart,
      archiveStudentFilter,
      archiveSubjectFilter,
      assignments,
      students,
      subjects,
      topics,
      tutorStudents,
    ]
  );

  const renderAssignmentCard = (
    assignment: Assignment,
    laneOverride?: AssignmentLane,
    mode: AssignmentCardMode = 'kanban'
  ) => {
    const lane = laneOverride ?? getAssignmentLane(assignment);
    const meta = LANE_META[lane];
    const { student, subject } = getRelationMeta(assignment.tutor_student_id);
    const hasTopic = assignment.topic_id != null;
    // Заголовок карточки: явный title → тема (если задана) → начало описания.
    // «Без темы» как заголовок больше не показываем (раньше topicTitle-заглушка попадала сюда).
    const cardTitle =
      assignment.title?.trim() ||
      (hasTopic ? getTopicTitle(assignment.topic_id) : assignment.description.trim());
    const actionDate = formatDateTime(getAssignmentActionDate(assignment, lane));
    const isArchive = mode === 'archive';
    const studentName = student?.full_name ?? 'Ученик';
    const footerText = `${meta.actionLabel}: ${actionDate}`;
    // Имя и строка даты подгоняются по длине, чтобы не обрезаться; тема — на ellipsis.
    const nameFontSize = fitCardFont(studentName, 15, 11, 16, 30);
    const dateFontSize = fitCardFont(footerText, 13, 10, 20, 32);

    return (
      <article
        key={assignment.id}
        className={`assignment-card assignment-card-${mode}`}
        onClick={() => setSelectedAssignmentId(assignment.id)}
        style={{ borderLeftColor: meta.color }}
      >
        <div className="assignment-card-name" style={{ fontSize: nameFontSize }}>{studentName}</div>
        <div className="assignment-card-meta">
          {subject?.name ?? 'Без предмета'} · <b>{cardTitle}</b>
        </div>

        <div className="assignment-card-footer">
          <span
            className={lane === 'overdue' ? 'assignment-date assignment-date-danger' : 'assignment-date'}
            style={{ fontSize: dateFontSize, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {footerText}
          </span>
          {(lane === 'checked' || isArchive) && assignment.grade && (
            <span className="assignment-grade-badge">{assignment.grade}</span>
          )}
          {isArchive && <span className="assignment-open-link">Открыть</span>}
        </div>
      </article>
    );
  };

  const showHomework = homeworkQueue.length > 0;

  return (
    <div className={`assignments-page-shell${showHomework ? ' has-homework' : ''}`}>
      <style>
        {`
          .assignments-page-shell {
            display: grid;
            grid-template-rows: auto auto minmax(0, 1fr);
            gap: 14px;
            height: 100%;
            min-height: 0;
            overflow: hidden;
          }

          .assignments-page-shell.has-homework {
            grid-template-rows: auto auto auto minmax(0, 1fr);
          }

          .homework-nudge {
            display: grid;
            gap: 12px;
          }

          .assignments-controls {
            display: grid;
            grid-template-columns: minmax(260px, 1.55fr) minmax(170px, 0.85fr) minmax(170px, 0.85fr) minmax(270px, 1fr) auto;
            gap: 14px;
            align-items: center;
          }

          .assignments-control,
          .assignments-period-control {
            min-height: 54px;
            width: 100%;
            border: 1px solid #E8EDF5;
            border-radius: 16px;
            background: #FFFFFF;
            color: #1A1A1A;
            box-shadow: 0 12px 30px rgba(15, 23, 42, 0.04);
          }

          .assignments-control {
            padding: 0 16px;
            font-size: 15px;
            outline: none;
          }

          .assignments-search {
            padding-left: 44px;
          }

          .assignments-search-wrap {
            position: relative;
          }

          .assignments-search-icon {
            position: absolute;
            left: 17px;
            top: 50%;
            transform: translateY(-50%);
            color: #667085;
            font-size: 20px;
            pointer-events: none;
          }

          .assignments-period-control {
            display: grid;
            grid-template-columns: auto minmax(72px, auto) auto minmax(72px, auto);
            gap: 8px;
            align-items: center;
            padding: 0 14px;
            color: #566173;
          }

          .assignments-date-picker {
            position: relative;
            min-width: 76px;
            height: 38px;
            display: grid;
            place-items: center;
            border-radius: 12px;
            background: #F5F7FB;
            color: #1A1A1A;
            font-weight: 850;
            overflow: hidden;
            cursor: pointer;
          }

          .assignments-date-picker input {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            opacity: 0;
            cursor: pointer;
          }

          .assignments-date-picker span {
            pointer-events: none;
          }

          .assignments-create-button {
            min-height: 54px;
            padding: 0 22px;
            border-radius: 16px;
            background: #2AABEE;
            box-shadow: 0 14px 28px rgba(42, 171, 238, 0.26);
            white-space: nowrap;
          }

          .assignments-kpi-grid,
          .assignments-board-grid {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 14px;
            align-items: stretch;
          }

          .assignments-board-grid {
            min-height: 0;
            overflow: hidden;
          }

          .assignment-kpi-card,
          .assignment-board-block {
            border: 1px solid #E8EDF5;
            background: #FFFFFF;
            box-shadow: 0 14px 34px rgba(15, 23, 42, 0.055);
          }

          .assignment-kpi-card {
            min-height: 92px;
            border-radius: 22px;
            padding: 16px;
            display: flex;
            gap: 14px;
            align-items: center;
          }

          .assignment-kpi-icon {
            width: 48px;
            height: 48px;
            border-radius: 999px;
            display: inline-grid;
            place-items: center;
            flex: 0 0 48px;
            font-size: 22px;
            font-weight: 900;
          }

          .assignment-kpi-value {
            font-size: 28px;
            line-height: 1;
            font-weight: 950;
            letter-spacing: 0;
            color: #101828;
          }

          .assignment-kpi-title {
            margin-top: 8px;
            color: #1A1A1A;
            font-size: 15px;
            font-weight: 800;
          }

          .assignment-board-block {
            min-height: 0;
            height: 100%;
            border-radius: 22px;
            padding: 14px;
            display: grid;
            grid-template-rows: auto 1fr auto;
            gap: 12px;
            overflow: hidden;
          }

          .assignment-column-title,
          .checked-panel-title {
            display: flex;
            align-items: center;
            gap: 10px;
            margin: 0;
            color: #101828;
            font-size: 17px;
            line-height: 1.2;
            font-weight: 950;
          }

          .assignment-status-dot {
            width: 11px;
            height: 11px;
            border-radius: 999px;
            flex: 0 0 11px;
          }

          .assignment-card-list {
            display: grid;
            align-content: start;
            gap: 12px;
            min-height: 0;
            overflow-y: auto;
            padding-right: 2px;
            scrollbar-width: thin;
          }

          .assignment-empty-spacer {
            min-height: 0;
          }

          .assignment-card {
            border: 1px solid #E8EDF5;
            border-left: 4px solid #2AABEE;
            border-radius: 16px;
            padding: 11px 13px;
            background: #FFFFFF;
            box-shadow: 0 10px 24px rgba(15, 23, 42, 0.045);
            cursor: pointer;
            display: grid;
            gap: 5px;
            transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
          }

          .assignment-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 16px 34px rgba(15, 23, 42, 0.08);
            border-color: #DDE6F3;
          }

          .assignment-card-name {
            margin: 0;
            min-width: 0;
            max-width: 100%;
            color: #101828;
            font-size: 15px;
            line-height: 1.2;
            font-weight: 950;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .assignment-card-meta {
            min-width: 0;
            color: #475467;
            font-size: 13px;
            line-height: 1.3;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .assignment-card-meta b {
            color: #101828;
            font-weight: 850;
          }

          .assignment-column-name {
            flex: 1 1 auto;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .assignment-column-count {
            flex: 0 0 auto;
            min-width: 26px;
            height: 24px;
            padding: 0 8px;
            border-radius: 999px;
            display: inline-grid;
            place-items: center;
            font-size: 14px;
            font-weight: 950;
          }

          .assignment-card-footer {
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
          }

          .assignment-date {
            min-width: 0;
            flex: 1 1 auto;
            color: #566173;
            font-size: 13px;
            line-height: 1.35;
            font-weight: 750;
          }

          .assignment-date-danger {
            color: #F44336;
          }

          .assignment-grade-badge {
            min-width: 30px;
            height: 30px;
            border-radius: 999px;
            display: inline-grid;
            place-items: center;
            background: #F1DFFF;
            color: #7B1FA2;
            font-size: 15px;
            font-weight: 950;
            flex: 0 0 auto;
          }

          .assignment-open-link {
            color: #7B1FA2;
            font-size: 12px;
            font-weight: 900;
            flex: 0 0 auto;
          }

          .checked-panel-list {
            display: grid;
            align-content: start;
            gap: 12px;
            min-height: 0;
            overflow-y: auto;
            padding-right: 2px;
            scrollbar-width: thin;
          }

          .checked-archive-button {
            min-height: 46px;
            border-radius: 14px;
            border: 1px solid rgba(156, 39, 176, 0.22);
            background: #F9F0FF;
            color: #7B1FA2;
            box-shadow: none;
            font-weight: 900;
          }

          .assignment-archive-overlay {
            position: fixed;
            inset: 0;
            z-index: 1000;
            display: grid;
            justify-items: end;
            background: rgba(15, 23, 42, 0.52);
            backdrop-filter: blur(6px);
          }

          .assignment-archive-drawer {
            width: min(760px, 100%);
            height: 100vh;
            overflow-y: auto;
            padding: 24px;
            background: #F5F7FB;
            box-shadow: -28px 0 70px rgba(15, 23, 42, 0.18);
            display: grid;
            grid-template-rows: auto auto 1fr;
            gap: 18px;
          }

          .assignment-archive-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 14px;
          }

          .assignment-archive-header h2 {
            margin: 0;
            color: #101828;
            font-size: 26px;
            line-height: 1.1;
          }

          .assignment-archive-close {
            min-width: 42px;
            width: 42px;
            height: 42px;
            padding: 0;
            border-radius: 999px;
            background: #172033;
            border: 1px solid rgba(23, 32, 51, 0.18);
            color: #fff;
            box-shadow: none;
            display: inline-grid;
            place-items: center;
          }

          .assignment-archive-filters {
            display: grid;
            grid-template-columns: minmax(220px, 1.3fr) minmax(150px, 0.8fr) minmax(150px, 0.8fr);
            gap: 10px;
          }

          .assignment-archive-period {
            grid-column: 1 / -1;
          }

          .assignment-archive-list {
            display: grid;
            align-content: start;
            gap: 12px;
          }

          .assignment-archive-empty,
          .assignments-loading {
            border: 1px solid #E8EDF5;
            border-radius: 22px;
            padding: 24px;
            background: #FFFFFF;
            color: #667085;
          }

          @media (max-width: 1280px) {
            .assignments-page-shell {
              overflow-y: auto;
              scrollbar-width: thin;
            }

            .assignments-controls {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }

            .assignments-create-button {
              width: 100%;
            }

            .assignments-kpi-grid,
            .assignments-board-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
          }

          @media (max-width: 720px) {
            .assignments-page-shell {
              height: auto;
              overflow: visible;
            }

            .assignments-controls,
            .assignments-kpi-grid,
            .assignments-board-grid,
            .assignment-archive-filters {
              grid-template-columns: 1fr;
            }

            .assignments-period-control {
              grid-template-columns: auto minmax(72px, auto) auto minmax(72px, auto);
              padding: 10px 14px;
            }

            .assignment-board-block {
              min-height: auto;
            }

            .assignment-empty-spacer {
              min-height: 80px;
            }
          }
        `}
      </style>
      <h1 className="page-heading">Задания</h1>

      {showHomework && (
        <div className="homework-nudge">
          {homeworkQueue.length > 0 && (
            <section style={{ border: '1px solid #FFE0B2', borderRadius: 18, padding: 14, background: '#FFF8EE' }}>
              <h3 style={{ margin: '0 0 10px', color: '#B26A00' }}>Требуют решения по ДЗ ({homeworkQueue.length})</h3>
              <div style={{ display: 'grid', gap: 8 }}>
                {homeworkQueue.map((item) => (
                  <div key={item.lesson_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 12, background: '#fff', border: '1px solid #F0E2CC' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, color: '#1f2a3b' }}>{item.student_name}</div>
                      <div style={{ fontSize: 13, color: '#566173' }}>{formatDateTime(item.starts_at)}{item.topic_id ? ` · ${getTopicTitle(item.topic_id)}` : ''}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button type="button" className="modal-primary" onClick={() => openAssignForLesson(item)}>Задать ДЗ</button>
                      <button type="button" className="modal-secondary" onClick={() => handleSkipHomework(item.lesson_id)}>Без ДЗ</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <section className="assignments-controls">
        <label className="assignments-search-wrap">
          <span className="assignments-search-icon">⌕</span>
          <input
            className="assignments-control assignments-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по заданиям..."
          />
        </label>

        <select
          className="assignments-control"
          value={subjectFilter}
          onChange={(event) => setSubjectFilter(event.target.value)}
        >
          <option value="all">Все предметы</option>
          {subjectOptions.map((subject) => (
            <option key={subject.id} value={String(subject.id)}>
              {subject.name}
            </option>
          ))}
        </select>

        <select
          className="assignments-control"
          value={studentFilter}
          onChange={(event) => setStudentFilter(event.target.value)}
        >
          <option value="all">Все ученики</option>
          {studentOptions.map((student) => (
            <option key={student.id} value={String(student.id)}>
              {student.full_name}
            </option>
          ))}
        </select>

        <div className="assignments-period-control">
          <span>Период:</span>
          <label className="assignments-date-picker">
            <span>{formatDateRangeInputLabel(periodStart)}</span>
            <input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
          </label>
          <span>—</span>
          <label className="assignments-date-picker">
            <span>{formatDateRangeInputLabel(periodEnd)}</span>
            <input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
          </label>
        </div>

        <button type="button" onClick={() => { reset(); setCreateModalOpen(true); }} className="assignments-create-button">
          + Создать задание
        </button>
      </section>

      {createModalOpen && (
        <Modal onClose={closeCreateModal} className="wide">
          <div className="modal-header">
            <div>
              <h3 className="modal-title">Создать задание</h3>
              <p className="modal-subtitle">Выбери ученика, задай дедлайн и прикрепи материалы для выполнения.</p>
            </div>
            <button title="Закрыть" type="button" onClick={closeCreateModal} className="modal-close">×</button>
          </div>

          {relationOptions.length === 0 ? (
            <div style={{ padding: 16, borderRadius: 16, background: 'rgba(23,32,51,0.06)', color: '#566173' }}>
              Сначала создай ученика и привяжи его к предмету.
            </div>
          ) : (
            <div className="modal-form-grid">
              <label className="modal-field">
                Ученик и предмет
                <select
                  className={errors.newTutorStudentId ? 'field-invalid' : undefined}
                  value={newTutorStudentId}
                  onChange={(event) => { setNewTutorStudentId(event.target.value); clearError('newTutorStudentId'); }}
                  onBlur={() => validateField('newTutorStudentId', createAssignmentRules)}
                >
                  {relationOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <FieldError message={errors.newTutorStudentId} />
              </label>

              <label className="modal-field">
                Краткий заголовок (необязательно)
                <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Например: Уравнения" />
              </label>

              <label className="modal-field">
                Описание задания *
                <textarea
                  className={errors.newDescription ? 'field-invalid' : undefined}
                  value={newDescription}
                  onChange={(event) => { setNewDescription(event.target.value); clearError('newDescription'); }}
                  onBlur={() => validateField('newDescription', createAssignmentRules)}
                  placeholder="Что нужно сделать ученику"
                  rows={5}
                  style={{ resize: 'vertical' }}
                />
                <FieldError message={errors.newDescription} />
              </label>

              <label className="modal-field">
                Дедлайн
                <input
                  type="datetime-local"
                  className={errors.newDeadline ? 'field-invalid' : undefined}
                  value={newDeadline}
                  onChange={(event) => { setNewDeadline(event.target.value); clearError('newDeadline'); }}
                  onBlur={() => validateField('newDeadline', createAssignmentRules)}
                />
                <FieldError message={errors.newDeadline} />
              </label>

              <div className="modal-row">
                <label className="modal-field">
                  Уровень ученика
                  <select value={topicLevelFilter} onChange={(event) => setTopicLevelFilter(event.target.value)}>
                    <option value="student">Уровни ученика</option>
                    <option value="">Все уровни</option>
                    {topicLevelOptions.map((level) => (
                      <option key={level.id} value={String(level.id)}>
                        {level.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="modal-field">
                  Тема
                  <select value={newTopicId} onChange={(event) => setNewTopicId(event.target.value)}>
                    <option value="">Без темы</option>
                    {availableTopics.map((topic) => (
                      <option key={topic.id} value={topic.id}>
                        {topic.title} • {formatTopicLevels(topic, tutorLevels)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="modal-section">
                <div className="modal-section-title">Вложения преподавателя</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr auto', gap: 8 }}>
                  <input value={newLinkLabel} onChange={(event) => setNewLinkLabel(event.target.value)} placeholder="Подпись ссылки" />
                  <input value={newLinkUrl} onChange={(event) => setNewLinkUrl(event.target.value)} placeholder="https://..." />
                  <button type="button" onClick={handleAddLink} style={{ boxShadow: 'none', minWidth: 112 }}>
                    +
                  </button>
                </div>

                <label className="modal-field">
                  Прикрепить файл
                  <input type="file" multiple onChange={handleFileSelection} />
                </label>

                {(attachedLinks.length > 0 || attachedFiles.length > 0) && (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {attachedLinks.map((link, index) => (
                      <div key={`${link.url}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', padding: '10px 12px', borderRadius: 14, background: '#fff' }}>
                        <a href={link.url} target="_blank" rel="noreferrer">{link.label}</a>
                        <button type="button" onClick={() => setAttachedLinks((prev) => prev.filter((_, itemIndex) => itemIndex !== index))} className="modal-secondary">
                          Убрать
                        </button>
                      </div>
                    ))}

                    {attachedFiles.map((file, index) => (
                      <div key={`${file.name}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', padding: '10px 12px', borderRadius: 14, background: '#fff' }}>
                        <div style={{ color: '#243041' }}>{file.name} ({formatFileSize(file.size)})</div>
                        <button type="button" onClick={() => setAttachedFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index))} className="modal-secondary">
                          Убрать
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button className="modal-primary" onClick={handleCreate} disabled={creating}>
                  {creating ? 'Создаём...' : 'Создать задание'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {loading ? (
        <section className="assignments-loading">Загрузка заданий...</section>
      ) : (
        <>
          <section className="assignments-board-grid">
            {assignmentColumns.map((column) => (
              <section key={column.key} className="assignment-board-block">
                <h3 className="assignment-column-title">
                  <span className="assignment-status-dot" style={{ background: column.color }} />
                  <span className="assignment-column-name">{column.title}</span>
                  <span className="assignment-column-count" style={{ background: column.soft, color: column.color }}>
                    {column.items.length}
                  </span>
                </h3>

                <div className="assignment-card-list">
                  {column.items.map((assignment) => renderAssignmentCard(assignment, column.key))}
                  {column.items.length === 0 && <div className="assignment-empty-spacer" />}
                </div>
              </section>
            ))}

            <section className="assignment-board-block checked-panel">
              <h3 className="checked-panel-title">
                <span className="assignment-status-dot" style={{ background: '#9C27B0' }} />
                <span className="assignment-column-name">Проверено</span>
                <span className="assignment-column-count" style={{ background: '#F9F0FF', color: '#9C27B0' }}>
                  {checkedAssignments.length}
                </span>
              </h3>

              <div className="checked-panel-list">
                {checkedAssignments
                  .slice(0, 3)
                  .map((assignment) => renderAssignmentCard(assignment, 'checked', 'checked'))}
                {checkedAssignments.length === 0 && <div className="assignment-empty-spacer" />}
              </div>

              {checkedAssignments.length > 3 && (
                <button
                  type="button"
                  className="checked-archive-button"
                  onClick={() => setCheckedArchiveOpen(true)}
                >
                  Открыть архив проверенных заданий
                </button>
              )}
            </section>
          </section>
        </>
      )}

      {checkedArchiveOpen && (
        <div className="assignment-archive-overlay" onClick={() => setCheckedArchiveOpen(false)}>
          <aside className="assignment-archive-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="assignment-archive-header">
              <div>
                <h2>Архив проверенных заданий</h2>
              </div>
              <button
                type="button"
                className="assignment-archive-close"
                onClick={() => setCheckedArchiveOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="assignment-archive-filters">
              <input
                className="assignments-control"
                value={archiveSearch}
                onChange={(event) => setArchiveSearch(event.target.value)}
                placeholder="Поиск по заданиям..."
              />
              <select
                className="assignments-control"
                value={archiveSubjectFilter}
                onChange={(event) => setArchiveSubjectFilter(event.target.value)}
              >
                <option value="all">Все предметы</option>
                {subjectOptions.map((subject) => (
                  <option key={subject.id} value={String(subject.id)}>
                    {subject.name}
                  </option>
                ))}
              </select>
              <select
                className="assignments-control"
                value={archiveStudentFilter}
                onChange={(event) => setArchiveStudentFilter(event.target.value)}
              >
                <option value="all">Все ученики</option>
                {studentOptions.map((student) => (
                  <option key={student.id} value={String(student.id)}>
                    {student.full_name}
                  </option>
                ))}
              </select>
              <div className="assignments-period-control assignment-archive-period">
                <span>Период:</span>
                <label className="assignments-date-picker">
                  <span>{formatDateRangeInputLabel(archiveStart)}</span>
                  <input type="date" value={archiveStart} onChange={(event) => setArchiveStart(event.target.value)} />
                </label>
                <span>—</span>
                <label className="assignments-date-picker">
                  <span>{formatDateRangeInputLabel(archiveEnd)}</span>
                  <input type="date" value={archiveEnd} onChange={(event) => setArchiveEnd(event.target.value)} />
                </label>
              </div>
            </div>

            <div className="assignment-archive-list">
              {archiveAssignments.map((assignment) => renderAssignmentCard(assignment, 'checked', 'archive'))}
              {archiveAssignments.length === 0 && (
                <div className="assignment-archive-empty">Проверенных заданий по выбранным фильтрам нет.</div>
              )}
            </div>
          </aside>
        </div>
      )}

      {selectedAssignment && (() => {
        const { student, subject } = getRelationMeta(selectedAssignment.tutor_student_id);
        const selectedLane = getAssignmentLane(selectedAssignment);
        const color = LANE_META[selectedLane].color;

        return (
          <Modal onClose={() => setSelectedAssignmentId(null)} style={{ width: 'min(640px, 100%)', padding: 0, gap: 0 }}>
              <div style={{ padding: '22px 24px 18px', background: `${color}14`, borderBottom: '1px solid rgba(24,33,47,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'inline-flex', padding: '8px 12px', borderRadius: 999, background: color, color: '#fff', fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
                      {LANE_META[selectedLane].title}
                    </div>
                    <h3 style={{ fontSize: 24, lineHeight: 1.02, marginBottom: 6 }}>{selectedAssignment.title || 'Задание без заголовка'}</h3>
                    <p style={{ color: '#5d6778', marginBottom: 0 }}>{student?.full_name ?? 'Ученик'} • {subject?.name ?? 'Без предмета'}</p>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      type="button"
                      title="Удалить ДЗ"
                      onClick={() => handleDeleteAssignment(selectedAssignment)}
                      className="icon-button icon-button-danger"
                    >
                      <Trash2 size={16} />
                    </button>
                    <button type="button" title="Закрыть" onClick={() => setSelectedAssignmentId(null)} className="modal-close">
                      ×
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ padding: 24 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}>
                  {[
                    ['Дедлайн', new Date(selectedAssignment.deadline).toLocaleString('ru-RU')],
                    ['Тема', getTopicTitle(selectedAssignment.topic_id)],
                    ['Оценка', selectedAssignment.grade ? String(selectedAssignment.grade) : 'Не выставлена'],
                    ['Статус', LANE_META[selectedLane].title],
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
                        isImageSource(file.data_url, file.type) ? (
                          <a key={`${file.name}-${index}`} href={file.data_url} download={file.name} style={{ display: 'block', padding: 12, borderRadius: 16, background: 'rgba(23,32,51,0.04)', border: '1px solid rgba(24,33,47,0.06)' }}>
                            <img src={file.data_url} alt={file.name} style={{ width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 12, background: '#fff' }} />
                            <div style={{ marginTop: 8, color: '#243041', wordBreak: 'break-all' }}>{file.name}</div>
                          </a>
                        ) : (
                          <a key={`${file.name}-${index}`} href={file.data_url} download={file.name} style={{ padding: 12, borderRadius: 16, background: 'rgba(23,32,51,0.04)', border: '1px solid rgba(24,33,47,0.06)', color: '#243041', wordBreak: 'break-all' }}>
                            {file.name}
                          </a>
                        )
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
                        isImageSource(filePath) ? (
                          <a key={filePath} href={getMediaUrl(filePath)} target="_blank" rel="noreferrer" style={{ display: 'block', padding: 10, borderRadius: 16, background: 'rgba(23,32,51,0.04)', border: '1px solid rgba(24,33,47,0.06)' }}>
                            <img src={getMediaUrl(filePath)} alt="Ответ ученика" style={{ width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 12, background: '#fff' }} />
                          </a>
                        ) : (
                          <a key={filePath} href={getMediaUrl(filePath)} target="_blank" rel="noreferrer" style={{ padding: 12, borderRadius: 16, background: 'rgba(23,32,51,0.04)', border: '1px solid rgba(24,33,47,0.06)', color: '#243041', wordBreak: 'break-all' }}>
                            {filePath}
                          </a>
                        )
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button type="button" onClick={() => handlePatchAssignment(selectedAssignment.id, { completion_status: 'completed' })} className="modal-primary">
                    Отметить выполненным
                  </button>
                  <button type="button" onClick={() => handlePatchAssignment(selectedAssignment.id, { completion_status: 'in_progress' })} className="modal-secondary">
                    В работу
                  </button>
                </div>

                <div style={{ marginTop: 16, display: 'grid', gap: 12, padding: 16, borderRadius: 18, background: 'rgba(23,32,51,0.035)', border: '1px solid rgba(24,33,47,0.06)' }}>
                  <div style={{ fontSize: 14, color: '#687486' }}>Оценка за задание</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <input
                      key={selectedAssignment.id}
                      type="number"
                      min="1"
                      max="5"
                      defaultValue={selectedAssignment.grade ?? ''}
                      onBlur={(event) => {
                        const value = Number(event.target.value);
                        if (!value || value < 1 || value > 5 || value === selectedAssignment.grade) return;
                        handlePatchAssignment(selectedAssignment.id, { grade: value, completion_status: 'completed' });
                      }}
                      style={{ maxWidth: 100 }}
                    />
                    <span style={{ color: '#5d6778' }}>Оценка от 1 до 5</span>
                  </div>

                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 13, color: '#687486' }}>Комментарий к оценке за ДЗ</span>
                    <textarea
                      value={assignmentGradeCommentDraft}
                      onChange={(event) => setAssignmentGradeCommentDraft(event.target.value)}
                      rows={3}
                      placeholder="Например: решение верное, но нужно внимательнее оформлять ответ"
                      style={{ resize: 'vertical' }}
                    />
                  </label>
                  <div>
                    <button
                      type="button"
                      onClick={handleSaveAssignmentGradeComment}
                      disabled={
                        assignmentCommentSaving ||
                        (selectedAssignment.grade_comment ?? '') === assignmentGradeCommentDraft.trim()
                      }
                      className="modal-primary"
                    >
                      {assignmentCommentSaving ? 'Сохраняем...' : 'Сохранить комментарий'}
                    </button>
                  </div>
                </div>
              </div>
        </Modal>
        );
      })()}
    </div>
  );
}
