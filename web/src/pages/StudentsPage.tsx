import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStudentContacts, type StudentContact } from '../api/contacts';
import { getAssignments, type Assignment } from '../api/assignments';
import { getLessons, type Lesson } from '../api/lessons';
import { createStudent, getStudents, updateStudent, type Student } from '../api/students';
import { getSubjects, type Subject } from '../api/subjects';
import { getTutorLevels, type TutorLevel } from '../api/tutorLevels';
import {
  createTutorStudent,
  deleteTutorStudent,
  getTutorStudents,
  updateTutorStudent,
  type TutorStudent,
  type TutorStudentStatus,
} from '../api/tutorStudents';
import { getApiErrorMessage } from '../utils/apiError';

interface StudentGroupData {
  student: Student;
  cards: StudentCardData[];
  contacts: StudentContact[];
}

interface StudentCardData {
  student: Student;
  tutorStudent: TutorStudent;
  subject?: Subject;
  contacts: StudentContact[];
}

const t = {
  title: '\u0423\u0447\u0435\u043d\u0438\u043a\u0438',
  subtitle:
    '\u041e\u0442\u043a\u0440\u043e\u0439 \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0443 \u0443\u0447\u0435\u043d\u0438\u043a\u0430, \u0447\u0442\u043e\u0431\u044b \u0438\u0437\u043c\u0435\u043d\u0438\u0442\u044c \u0441\u0442\u0430\u0432\u043a\u0443, \u0441\u0442\u0430\u0442\u0443\u0441, \u043a\u043b\u0430\u0441\u0441 \u0438\u043b\u0438 \u0443\u0434\u0430\u043b\u0438\u0442\u044c \u0441\u0432\u044f\u0437\u044c.',
  found: '\u041d\u0430\u0439\u0434\u0435\u043d\u043e \u0443\u0447\u0435\u043d\u0438\u043a\u043e\u0432',
  list: '\u0421\u043f\u0438\u0441\u043e\u043a \u0443\u0447\u0435\u043d\u0438\u043a\u043e\u0432',
  hint: '\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u0438\u043c\u0435\u043d\u0438, \u043a\u043b\u0430\u0441\u0441\u0443, \u043f\u0440\u0435\u0434\u043c\u0435\u0442\u0443, \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0443, Telegram ID \u0438 \u043a\u043e\u043d\u0442\u0430\u043a\u0442\u0430\u043c.',
  search: '\u041d\u0430\u043f\u0440\u0438\u043c\u0435\u0440: \u0418\u0432\u0430\u043d, \u043c\u0430\u0442\u0435\u043c\u0430\u0442\u0438\u043a\u0430, \u043c\u0430\u043c\u0430',
  allClasses: '\u0412\u0441\u0435 \u043a\u043b\u0430\u0441\u0441\u044b',
  allSubjects: '\u0412\u0441\u0435 \u043f\u0440\u0435\u0434\u043c\u0435\u0442\u044b',
  create: '\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0443\u0447\u0435\u043d\u0438\u043a\u0430',
  loading: '\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...',
  notFound: '\u0423\u0447\u0435\u043d\u0438\u043a\u0438 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u044b',
  noActive: '\u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0445 \u0443\u0447\u0435\u043d\u0438\u043a\u043e\u0432 \u043f\u043e \u0442\u0435\u043a\u0443\u0449\u0435\u043c\u0443 \u0444\u0438\u043b\u044c\u0442\u0440\u0443 \u043d\u0435\u0442.',
  showInactive: '\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u043d\u0435\u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0445',
  hideInactive: '\u0421\u043a\u0440\u044b\u0442\u044c \u043d\u0435\u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0445',
  active: '\u0410\u043a\u0442\u0438\u0432\u0435\u043d',
  paused: '\u041d\u0430 \u043f\u0430\u0443\u0437\u0435',
  completed: '\u0417\u0430\u0432\u0435\u0440\u0448\u0451\u043d',
  subjectMissing: '\u041f\u0440\u0435\u0434\u043c\u0435\u0442 \u043d\u0435 \u043f\u0440\u0438\u0432\u044f\u0437\u0430\u043d',
  contacts: '\u041a\u043e\u043d\u0442\u0430\u043a\u0442\u043e\u0432',
  rate: '\u0421\u0442\u0430\u0432\u043a\u0430',
  status: '\u0421\u0442\u0430\u0442\u0443\u0441',
  grade: '\u041a\u043b\u0430\u0441\u0441',
  phone: '\u0422\u0435\u043b\u0435\u0444\u043e\u043d',
  close: '\u0417\u0430\u043a\u0440\u044b\u0442\u044c',
  cancel: '\u041e\u0442\u043c\u0435\u043d\u0430',
};

const panelStyle = { background: 'rgba(255,255,255,0.9)', padding: '16px', borderRadius: '18px', border: '1px solid rgba(24,33,47,0.08)', boxShadow: 'var(--shadow-card)' } as const;
const mutedTextStyle = { color: '#687486', fontSize: 14 } as const;
const today = () => new Date().toISOString().slice(0, 10);

export default function StudentsPage() {
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [tutorStudents, setTutorStudents] = useState<TutorStudent[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tutorLevels, setTutorLevels] = useState<TutorLevel[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [contactsByStudent, setContactsByStudent] = useState<Record<number, StudentContact[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [showInactiveStudents, setShowInactiveStudents] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creatingStudent, setCreatingStudent] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentTelegramId, setNewStudentTelegramId] = useState('');
  const [newStudentGrade, setNewStudentGrade] = useState('');
  const [newStudentPhone, setNewStudentPhone] = useState('');
  const [newStudentSubjectId, setNewStudentSubjectId] = useState('');
  const [newStudentRate, setNewStudentRate] = useState('');
  const [newStudentStartedAt, setNewStudentStartedAt] = useState(today);
  const [selectedTutorStudentId, setSelectedTutorStudentId] = useState<number | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [detailRate, setDetailRate] = useState('');
  const [detailStatus, setDetailStatus] = useState<TutorStudentStatus>('active');
  const [detailGrade, setDetailGrade] = useState('');
  const [detailLevelIds, setDetailLevelIds] = useState<number[]>([]);
  const [savingTutorStudent, setSavingTutorStudent] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [studentsData, tutorStudentsData, subjectsData, levelData, lessonData, assignmentData] = await Promise.all([
          getStudents(),
          getTutorStudents(),
          getSubjects(),
          getTutorLevels(),
          getLessons(),
          getAssignments(),
        ]);
        setStudents(studentsData);
        setTutorStudents(tutorStudentsData);
        setSubjects(subjectsData);
        setTutorLevels(levelData);
        setLessons(lessonData);
        setAssignments(assignmentData);
        const contactsEntries = await Promise.all(studentsData.map(async (student) => [student.id, await getStudentContacts(student.id)] as const));
        setContactsByStudent(Object.fromEntries(contactsEntries));
      } catch (error) {
        console.error('Students load error:', error);
        alert('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0441\u043f\u0438\u0441\u043e\u043a \u0443\u0447\u0435\u043d\u0438\u043a\u043e\u0432');
      } finally { setLoading(false); }
    };
    void loadData();
  }, []);

  useEffect(() => {
    if (!subjects.length) { setNewStudentSubjectId(''); setNewStudentRate(''); return; }
    setNewStudentSubjectId((current) => current && subjects.some((s) => String(s.id) === current) ? current : String(subjects[0].id));
  }, [subjects]);

  useEffect(() => {
    const subject = subjects.find((item) => String(item.id) === newStudentSubjectId);
    if (subject) setNewStudentRate((current) => (current ? current : String(subject.default_rate ?? '')));
  }, [newStudentSubjectId, subjects]);

  const studentCards = useMemo<StudentCardData[]>(() => tutorStudents.flatMap((relation) => {
    const student = students.find((item) => item.id === relation.student_id);
    if (!student) return [];
    return [{ student, tutorStudent: relation, subject: subjects.find((item) => item.id === relation.subject_id), contacts: contactsByStudent[student.id] ?? [] }];
  }), [contactsByStudent, students, subjects, tutorStudents]);

  const realClassOptions = useMemo(
    () =>
      Array.from(new Set(studentCards.map(({ student }) => student.grade).filter((grade): grade is number => Boolean(grade))))
        .sort((a, b) => a - b),
    [studentCards]
  );

  const filteredCards = useMemo(() => {
    const query = search.trim().toLowerCase();
    return studentCards.filter(({ student, subject, contacts }) => {
      const haystack = [student.full_name, student.grade ? String(student.grade) : '', subject?.name ?? '', student.phone_number ?? '', student.telegram_id ?? '', ...contacts.map((i) => i.contact.full_name), ...contacts.map((i) => i.contact.phone_number ?? ''), ...contacts.map((i) => i.contact.telegram_id ?? '')].join(' ').toLowerCase();
      return (!query || haystack.includes(query)) && (!classFilter || String(student.grade ?? '') === classFilter) && (!subjectFilter || String(subject?.id ?? '') === subjectFilter);
    });
  }, [classFilter, search, studentCards, subjectFilter]);

  const activeCards = useMemo(() => filteredCards.filter(({ tutorStudent }) => tutorStudent.status === 'active'), [filteredCards]);
  const inactiveCards = useMemo(() => filteredCards.filter(({ tutorStudent }) => tutorStudent.status !== 'active'), [filteredCards]);
  const totalInactiveCards = useMemo(
    () => studentCards.filter(({ tutorStudent }) => tutorStudent.status !== 'active'),
    [studentCards]
  );
  const selectedCard = useMemo(() => studentCards.find((card) => card.tutorStudent.id === selectedTutorStudentId) ?? null, [selectedTutorStudentId, studentCards]);
  const selectedStudentCards = useMemo(
    () => (selectedCard ? studentCards.filter((card) => card.student.id === selectedCard.student.id) : []),
    [selectedCard, studentCards]
  );

  const groupCards = (cards: StudentCardData[]) => {
    const map = new Map<number, StudentGroupData>();
    cards.forEach((card) => {
      const current = map.get(card.student.id);
      if (current) {
        current.cards.push(card);
      } else {
        map.set(card.student.id, { student: card.student, cards: [card], contacts: card.contacts });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.student.full_name.localeCompare(b.student.full_name, 'ru-RU'));
  };

  const activeGroups = useMemo(() => groupCards(activeCards), [activeCards]);
  const inactiveGroups = useMemo(() => groupCards(inactiveCards), [inactiveCards]);
  const selectedRelationIds = useMemo(
    () => new Set(selectedStudentCards.map((card) => card.tutorStudent.id)),
    [selectedStudentCards]
  );
  const selectedStudentLessons = useMemo(
    () => lessons.filter((lesson) => lesson.tutor_student_id !== null && selectedRelationIds.has(lesson.tutor_student_id)),
    [lessons, selectedRelationIds]
  );
  const selectedStudentAssignments = useMemo(
    () => assignments.filter((assignment) => selectedRelationIds.has(assignment.tutor_student_id)),
    [assignments, selectedRelationIds]
  );
  const selectedConductedLessons = selectedStudentLessons.filter((lesson) => lesson.conduct_status === 'conducted');
  const lessonGrades = selectedConductedLessons.map((lesson) => lesson.grade).filter((grade): grade is number => grade !== null);
  const assignmentGrades = selectedStudentAssignments.map((assignment) => assignment.grade).filter((grade): grade is number => grade !== null);
  const averageLessonGrade = lessonGrades.length ? lessonGrades.reduce((sum, grade) => sum + grade, 0) / lessonGrades.length : null;
  const averageAssignmentGrade = assignmentGrades.length ? assignmentGrades.reduce((sum, grade) => sum + grade, 0) / assignmentGrades.length : null;
  const completedAssignmentsCount = selectedStudentAssignments.filter((assignment) => assignment.completion_status === 'completed').length;

  useEffect(() => {
    if (!selectedCard) { setDetailRate(''); setDetailStatus('active'); setDetailGrade(''); setDetailLevelIds([]); return; }
    setDetailRate(String(selectedCard.tutorStudent.hourly_rate));
    setDetailStatus(selectedCard.tutorStudent.status);
    setDetailGrade(selectedCard.student.grade ? String(selectedCard.student.grade) : '');
    setDetailLevelIds(selectedCard.tutorStudent.level_ids ?? []);
  }, [selectedCard]);

  const handleCreateStudent = async () => {
    if (!newStudentName.trim() || !newStudentTelegramId.trim() || !newStudentSubjectId || !newStudentRate.trim()) {
      alert('\u0417\u0430\u043f\u043e\u043b\u043d\u0438 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u043f\u043e\u043b\u044f \u0434\u043b\u044f \u0441\u043e\u0437\u0434\u0430\u043d\u0438\u044f \u0443\u0447\u0435\u043d\u0438\u043a\u0430');
      return;
    }
    try {
      setCreatingStudent(true);
      const createdStudent = await createStudent({ full_name: newStudentName.trim(), telegram_id: Number(newStudentTelegramId), grade: newStudentGrade.trim() ? Number(newStudentGrade) : undefined, phone_number: newStudentPhone.trim() || undefined });
      const createdTutorStudent = await createTutorStudent({ student_id: createdStudent.id, subject_id: Number(newStudentSubjectId), hourly_rate: Number(newStudentRate), started_at: newStudentStartedAt || today() });
      setStudents((prev) => [...prev, createdStudent]);
      setTutorStudents((prev) => [...prev, createdTutorStudent]);
      setContactsByStudent((prev) => ({ ...prev, [createdStudent.id]: [] }));
      setNewStudentName(''); setNewStudentTelegramId(''); setNewStudentGrade(''); setNewStudentPhone(''); setNewStudentRate(''); setNewStudentStartedAt(today());
      setCreateModalOpen(false);
      alert('\u0423\u0447\u0435\u043d\u0438\u043a \u0441\u043e\u0437\u0434\u0430\u043d \u0438 \u043f\u0440\u0438\u0432\u044f\u0437\u0430\u043d \u043a \u043f\u0440\u0435\u0434\u043c\u0435\u0442\u0443');
    } catch (error) {
      console.error('Create student error:', error);
      alert(getApiErrorMessage(error, '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0437\u0434\u0430\u0442\u044c \u0443\u0447\u0435\u043d\u0438\u043a\u0430'));
    } finally { setCreatingStudent(false); }
  };

  const handleSaveTutorStudent = async () => {
    if (!selectedCard) return;
    const rate = Number(detailRate);
    if (!Number.isFinite(rate) || rate <= 0) { alert('\u0421\u0442\u0430\u0432\u043a\u0430 \u0434\u043e\u043b\u0436\u043d\u0430 \u0431\u044b\u0442\u044c \u0447\u0438\u0441\u043b\u043e\u043c \u0431\u043e\u043b\u044c\u0448\u0435 \u043d\u0443\u043b\u044f'); return; }
    const trimmedGrade = detailGrade.trim();
    const parsedGrade = trimmedGrade ? Number(trimmedGrade) : undefined;
    if (trimmedGrade && (parsedGrade === undefined || !Number.isInteger(parsedGrade) || parsedGrade < 1 || parsedGrade > 11)) {
      alert('\u041a\u043b\u0430\u0441\u0441 \u0434\u043e\u043b\u0436\u0435\u043d \u0431\u044b\u0442\u044c \u0446\u0435\u043b\u044b\u043c \u0447\u0438\u0441\u043b\u043e\u043c \u043e\u0442 1 \u0434\u043e 11');
      return;
    }
    try {
      setSavingTutorStudent(true);
      const [updatedTutorStudent, updatedStudent] = await Promise.all([
        updateTutorStudent(selectedCard.tutorStudent.id, { hourly_rate: rate, status: detailStatus, level_ids: detailLevelIds }),
        updateStudent(selectedCard.student.id, { grade: parsedGrade }),
      ]);
      setTutorStudents((prev) => prev.map((item) => item.id === updatedTutorStudent.id ? updatedTutorStudent : item));
      setStudents((prev) => prev.map((item) => item.id === updatedStudent.id ? updatedStudent : item));
      alert('\u041f\u0430\u0440\u0430\u043c\u0435\u0442\u0440\u044b \u0443\u0447\u0435\u043d\u0438\u043a\u0430 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u044b');
    } catch (error) {
      console.error('Update student error:', error);
      alert(getApiErrorMessage(error, '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f'));
    } finally { setSavingTutorStudent(false); }
  };

  const handleDeleteTutorStudent = async () => {
    if (!selectedCard) return;
    const confirmed = window.confirm(`\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0441\u0432\u044f\u0437\u044c \u0441 \u0443\u0447\u0435\u043d\u0438\u043a\u043e\u043c "${selectedCard.student.full_name}"? \u0423\u0447\u0435\u043d\u0438\u043a \u043e\u0441\u0442\u0430\u043d\u0435\u0442\u0441\u044f \u0432 \u0441\u0438\u0441\u0442\u0435\u043c\u0435, \u043d\u043e \u0438\u0441\u0447\u0435\u0437\u043d\u0435\u0442 \u0438\u0437 \u0442\u0432\u043e\u0435\u0433\u043e \u0441\u043f\u0438\u0441\u043a\u0430 \u043f\u043e \u044d\u0442\u043e\u043c\u0443 \u043f\u0440\u0435\u0434\u043c\u0435\u0442\u0443.`);
    if (!confirmed) return;
    try {
      await deleteTutorStudent(selectedCard.tutorStudent.id);
      setTutorStudents((prev) => prev.filter((item) => item.id !== selectedCard.tutorStudent.id));
      setDetailsModalOpen(false);
      setSelectedTutorStudentId(null);
      alert('\u0421\u0432\u044f\u0437\u044c \u0441 \u0443\u0447\u0435\u043d\u0438\u043a\u043e\u043c \u0443\u0434\u0430\u043b\u0435\u043d\u0430');
    } catch (error) {
      console.error('Delete tutor-student error:', error);
      alert(getApiErrorMessage(error, '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0443\u0434\u0430\u043b\u0438\u0442\u044c \u0441\u0432\u044f\u0437\u044c. \u0415\u0441\u043b\u0438 \u043f\u043e \u043d\u0435\u0439 \u0443\u0436\u0435 \u0435\u0441\u0442\u044c \u0437\u0430\u043d\u044f\u0442\u0438\u044f \u0438\u043b\u0438 \u0437\u0430\u0434\u0430\u043d\u0438\u044f, \u0438\u0441\u0442\u043e\u0440\u0438\u044e \u043d\u0443\u0436\u043d\u043e \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c.'));
    }
  };

  const renderGrid = (groups: StudentGroupData[]) => <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>{groups.map((group) => {
    const primary = group.cards[0];
    const activeSubjects = group.cards.filter((card) => card.tutorStudent.status === 'active').length;
    return (
      <button key={group.student.id} type="button" onClick={() => { setSelectedTutorStudentId(primary.tutorStudent.id); setDetailsModalOpen(true); }} style={{ display: 'grid', gap: 12, padding: 16, textAlign: 'left', borderRadius: 18, background: 'rgba(23,32,51,0.03)', color: '#1f2a3b', border: '1px solid rgba(24,33,47,0.08)', boxShadow: 'none' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>{group.student.full_name}</div>
          <div style={{ color: '#687486', fontSize: 14 }}>{group.student.grade ? `${group.student.grade} класс` : 'Класс не указан'} • {group.contacts.length} контактов</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {group.cards.map((card) => (
            <span key={card.tutorStudent.id} style={{ padding: '6px 9px', borderRadius: 999, background: card.tutorStudent.status === 'active' ? 'rgba(47,125,99,0.12)' : 'rgba(166,63,59,0.1)', color: card.tutorStudent.status === 'active' ? '#2f7d63' : '#a63f3b', fontSize: 12, fontWeight: 800 }}>
              {card.subject?.name ?? t.subjectMissing}
            </span>
          ))}
        </div>
        <div style={{ color: '#435066', fontSize: 14 }}>
          Активных предметов: {activeSubjects} из {group.cards.length}
        </div>
      </button>
    );
  })}</div>;
  return (
    <div>
      <section style={{ ...panelStyle, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px' }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#1f2a3b', marginBottom: 6 }}>{t.list}</div>
            <div style={mutedTextStyle}>{t.hint}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', width: 'min(100%, 860px)' }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.search} style={{ flex: '1 1 260px' }} />
            <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} style={{ flex: '0 1 150px' }}>
              <option value="">{t.allClasses}</option>
              {realClassOptions.map((grade) => <option key={grade} value={grade}>{`${grade} \u043a\u043b\u0430\u0441\u0441`}</option>)}
            </select>
            <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} style={{ flex: '1 1 190px' }}>
              <option value="">{t.allSubjects}</option>
              {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
            <button type="button" title="Создать ученика" onClick={() => setCreateModalOpen(true)} style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, fontSize: 20, display: 'inline-grid', placeItems: 'center' }}>+</button>
          </div>
        </div>
      </section>

      <section style={panelStyle}>
        {loading ? <p style={{ ...mutedTextStyle, marginBottom: 0 }}>{t.loading}</p> : filteredCards.length === 0 ? <p style={{ ...mutedTextStyle, marginBottom: 0 }}>{t.notFound}</p> : <div style={{ display: 'grid', gap: 16 }}>{activeGroups.length > 0 ? renderGrid(activeGroups) : <div style={{ padding: 16, borderRadius: 16, background: 'rgba(23,32,51,0.03)', color: '#687486' }}>{t.noActive}</div>}{totalInactiveCards.length > 0 && <div style={{ display: 'grid', gap: 12, paddingTop: 4, borderTop: '1px solid rgba(24,33,47,0.08)' }}><button type="button" onClick={() => setShowInactiveStudents((prev) => !prev)} style={{ justifySelf: 'start', background: 'transparent', color: '#324055', border: '1px solid rgba(24,33,47,0.12)', boxShadow: 'none', padding: '8px 12px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171' }} />{showInactiveStudents ? `${t.hideInactive} (${inactiveGroups.length})` : `${t.showInactive} (${inactiveGroups.length})`}</button>{showInactiveStudents && (inactiveGroups.length > 0 ? renderGrid(inactiveGroups) : <div style={{ padding: 14, borderRadius: 14, background: 'rgba(23,32,51,0.03)', color: '#687486', fontSize: 14 }}>По текущим фильтрам неактивные ученики не найдены.</div>)}</div>}</div>}
      </section>

      {createModalOpen && <div onClick={() => setCreateModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.48)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 40 }}><div onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 100%)', background: '#fff', borderRadius: 24, border: '1px solid rgba(24,33,47,0.08)', boxShadow: '0 30px 80px rgba(15,23,42,0.18)', padding: 24, display: 'grid', gap: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}><div><h3 style={{ fontSize: 22, marginBottom: 6 }}>{'\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0443\u0447\u0435\u043d\u0438\u043a\u0430'}</h3><div style={mutedTextStyle}>{'\u041d\u043e\u0432\u044b\u0439 \u0443\u0447\u0435\u043d\u0438\u043a \u0441\u0440\u0430\u0437\u0443 \u0441\u043e\u0437\u0434\u0430\u0451\u0442\u0441\u044f \u0438 \u043f\u0440\u0438\u0432\u044f\u0437\u044b\u0432\u0430\u0435\u0442\u0441\u044f \u043a \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u043c\u0443 \u043f\u0440\u0435\u0434\u043c\u0435\u0442\u0443.'}</div></div><button type="button" onClick={() => setCreateModalOpen(false)} style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none', padding: '10px 14px' }}>{t.close}</button></div>{subjects.length === 0 ? <div style={{ padding: 16, borderRadius: 16, background: 'rgba(217,111,50,0.1)', color: '#b9551f' }}>{'\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0441\u043e\u0437\u0434\u0430\u0439 \u043f\u0440\u0435\u0434\u043c\u0435\u0442 \u043d\u0430 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0435 \u00ab\u041f\u0440\u0435\u0434\u043c\u0435\u0442\u044b\u00bb.'}</div> : <><input value={newStudentName} onChange={(e) => setNewStudentName(e.target.value)} placeholder={'\u0424\u0418\u041e \u0443\u0447\u0435\u043d\u0438\u043a\u0430'} /><input value={newStudentTelegramId} onChange={(e) => setNewStudentTelegramId(e.target.value)} placeholder={'Telegram ID'} type="number" /><input value={newStudentGrade} onChange={(e) => setNewStudentGrade(e.target.value)} placeholder={t.grade} type="number" /><input value={newStudentPhone} onChange={(e) => setNewStudentPhone(e.target.value)} placeholder={t.phone} /><select value={newStudentSubjectId} onChange={(e) => { const nextSubjectId = e.target.value; const nextSubject = subjects.find((subject) => String(subject.id) === nextSubjectId); setNewStudentSubjectId(nextSubjectId); setNewStudentRate(nextSubject?.default_rate ? String(nextSubject.default_rate) : ''); }}>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select><input value={newStudentRate} onChange={(e) => setNewStudentRate(e.target.value)} placeholder={t.rate} type="number" /><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button type="button" onClick={handleCreateStudent} disabled={creatingStudent}>{creatingStudent ? '\u0421\u043e\u0437\u0434\u0430\u0451\u043c...' : t.create}</button><button type="button" onClick={() => setCreateModalOpen(false)} style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}>{t.cancel}</button></div></>}</div></div>}

      {detailsModalOpen && selectedCard && <div onClick={() => setDetailsModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.48)', display: 'grid', placeItems: 'center', padding: 12, zIndex: 40 }}><div onClick={(e) => e.stopPropagation()} style={{ width: 'min(1180px, calc(100vw - 24px))', maxHeight: 'calc(100vh - 24px)', overflowY: 'auto', background: '#fff', borderRadius: 24, border: '1px solid rgba(24,33,47,0.08)', boxShadow: '0 30px 80px rgba(15,23,42,0.18)', padding: 18, display: 'grid', gap: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}><div><div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}><h3 style={{ fontSize: 26, marginBottom: 0 }}>{selectedCard.student.full_name}</h3><button type="button" title="Удалить связь" onClick={handleDeleteTutorStudent} style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, background: 'rgba(166,63,59,0.92)', boxShadow: 'none', fontSize: 18 }}>🗑</button></div></div><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}><button type="button" title="Закрыть" onClick={() => setDetailsModalOpen(false)} style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, background: 'rgba(23,32,51,0.92)', boxShadow: 'none', fontSize: 22 }}>×</button></div></div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{[`${t.phone}: ${selectedCard.student.phone_number || '\u2014'}`, `${t.grade}: ${selectedCard.student.grade || '\u2014'}`, `Telegram ID: ${selectedCard.student.telegram_id || '\u2014'}`, `Занимается с: ${new Date(`${selectedCard.tutorStudent.started_at}T00:00:00`).toLocaleDateString('ru-RU')}`, `${t.contacts}: ${selectedCard.contacts.length}`].map((item) => <span key={item} style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(23,32,51,0.06)', color: '#324055', fontSize: 13 }}>{item}</span>)}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12, alignItems: 'start' }}><div style={{ display: 'grid', gap: 12 }}><section style={{ ...panelStyle, padding: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}><div style={{ fontWeight: 800, color: '#1f2a3b' }}>Краткая статистика</div><button type="button" title="Открыть полное портфолио" onClick={() => navigate(`/portfolio?student_id=${selectedCard.student.id}`)} style={{ background: '#2a6fdb', boxShadow: 'none', padding: '10px 14px' }}>Портфолио</button></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gap: 8 }}>{[['Проведено занятий', selectedConductedLessons.length], ['Оценка занятий', averageLessonGrade === null ? '—' : averageLessonGrade.toFixed(1)], ['Оценка ДЗ', averageAssignmentGrade === null ? '—' : averageAssignmentGrade.toFixed(1)], ['Выполнено ДЗ', `${completedAssignmentsCount}/${selectedStudentAssignments.length}`]].map(([label, value]) => <div key={label} style={{ padding: 10, borderRadius: 14, background: 'rgba(23,32,51,0.04)', border: '1px solid rgba(24,33,47,0.06)' }}><div style={{ ...mutedTextStyle, marginBottom: 5 }}>{label}</div><div style={{ color: '#1f2a3b', fontSize: 20, fontWeight: 900 }}>{value}</div></div>)}</div></section><section style={{ ...panelStyle, padding: 12 }}><div style={{ fontWeight: 800, color: '#1f2a3b', marginBottom: 10 }}>Предметы ученика</div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{selectedStudentCards.map((card) => <button key={card.tutorStudent.id} type="button" onClick={() => setSelectedTutorStudentId(card.tutorStudent.id)} style={{ background: selectedCard.tutorStudent.id === card.tutorStudent.id ? '#d96f32' : 'rgba(23,32,51,0.08)', color: selectedCard.tutorStudent.id === card.tutorStudent.id ? '#fff' : '#324055', boxShadow: 'none' }}>{card.subject?.name ?? t.subjectMissing}</button>)}</div></section></div><div style={{ display: 'grid', gap: 12 }}><section style={{ ...panelStyle, padding: 12 }}><div style={{ fontWeight: 800, color: '#1f2a3b', marginBottom: 10 }}>{'\u041e\u0441\u043d\u043e\u0432\u043d\u044b\u0435 \u043f\u0430\u0440\u0430\u043c\u0435\u0442\u0440\u044b'}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginBottom: 10 }}><label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>{t.rate}<input type="number" value={detailRate} onChange={(e) => setDetailRate(e.target.value)} /></label><label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>{t.status}<select value={detailStatus} onChange={(e) => setDetailStatus(e.target.value as TutorStudentStatus)}><option value="active">active</option><option value="paused">paused</option><option value="completed">completed</option></select></label><label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>{t.grade}<input type="number" min={1} max={11} value={detailGrade} onChange={(e) => setDetailGrade(e.target.value)} placeholder="1-11" /></label></div><div style={{ marginBottom: 10 }}><div style={{ color: '#556173', fontSize: 14, marginBottom: 8 }}>Уровни обучения по предмету</div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{tutorLevels.length === 0 ? <span style={mutedTextStyle}>Уровни ещё не созданы.</span> : tutorLevels.map((level) => { const active = detailLevelIds.includes(level.id); return <button key={level.id} type="button" onClick={() => setDetailLevelIds((current) => active ? current.filter((id) => id !== level.id) : [...current, level.id])} style={{ padding: '8px 10px', borderRadius: 999, background: active ? 'rgba(42,111,219,0.12)' : 'rgba(23,32,51,0.05)', color: active ? '#2a6fdb' : '#324055', border: active ? '1px solid rgba(42,111,219,0.24)' : '1px solid rgba(24,33,47,0.08)', boxShadow: 'none', fontWeight: 700, fontSize: 12 }}>{level.name}</button>; })}</div></div><button type="button" onClick={handleSaveTutorStudent} disabled={savingTutorStudent}>{savingTutorStudent ? '\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c...' : '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f'}</button></section><section style={{ ...panelStyle, padding: 12 }}><div style={{ fontWeight: 800, color: '#1f2a3b', marginBottom: 8 }}>{'\u041a\u043e\u043d\u0442\u0430\u043a\u0442\u043d\u044b\u0435 \u043b\u0438\u0446\u0430'}</div>{selectedCard.contacts.length === 0 ? <p style={{ ...mutedTextStyle, marginBottom: 12 }}>{'\u0423 \u044d\u0442\u043e\u0433\u043e \u0443\u0447\u0435\u043d\u0438\u043a\u0430 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442 \u043f\u0440\u0438\u0432\u044f\u0437\u0430\u043d\u043d\u044b\u0445 \u043a\u043e\u043d\u0442\u0430\u043a\u0442\u043d\u044b\u0445 \u043b\u0438\u0446.'}</p> : <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>{selectedCard.contacts.map((item) => <div key={item.id} style={{ padding: 10, borderRadius: 14, background: 'rgba(23,32,51,0.03)', border: '1px solid rgba(24,33,47,0.08)' }}><div style={{ fontWeight: 700, color: '#243041', marginBottom: 4 }}>{item.contact.full_name}</div><div style={{ color: '#556173', fontSize: 14 }}>{`${t.phone}: ${item.contact.phone_number || '\u2014'} \u2022 Telegram ID: ${item.contact.telegram_id || '\u2014'}`}</div></div>)}</div>}<button type="button" onClick={() => navigate('/contacts')} style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}>{'\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043a\u043e\u043d\u0442\u0430\u043a\u0442\u043d\u0443\u044e \u043a\u043d\u0438\u0436\u043a\u0443'}</button></section></div></div></div></div>}
    </div>
  );
}


