import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStudentContacts, type StudentContact } from '../api/contacts';
import { createStudent, getStudents, updateStudent, type Student } from '../api/students';
import { getSubjects, type Subject } from '../api/subjects';
import {
  createTutorStudent,
  deleteTutorStudent,
  getTutorStudents,
  updateTutorStudent,
  type TutorStudent,
  type TutorStudentStatus,
} from '../api/tutorStudents';
import { getApiErrorMessage } from '../utils/apiError';

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

const statusLabels: Record<TutorStudentStatus, string> = { active: t.active, paused: t.paused, completed: t.completed };
const panelStyle = { background: 'rgba(255,255,255,0.9)', padding: '16px', borderRadius: '18px', border: '1px solid rgba(24,33,47,0.08)', boxShadow: 'var(--shadow-card)' } as const;
const mutedTextStyle = { color: '#687486', fontSize: 14 } as const;
const today = () => new Date().toISOString().slice(0, 10);

export default function StudentsPage() {
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [tutorStudents, setTutorStudents] = useState<TutorStudent[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
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
  const [savingTutorStudent, setSavingTutorStudent] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [studentsData, tutorStudentsData, subjectsData] = await Promise.all([getStudents(), getTutorStudents(), getSubjects()]);
        setStudents(studentsData);
        setTutorStudents(tutorStudentsData);
        setSubjects(subjectsData);
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

  useEffect(() => {
    if (!selectedCard) { setDetailRate(''); setDetailStatus('active'); setDetailGrade(''); return; }
    setDetailRate(String(selectedCard.tutorStudent.hourly_rate));
    setDetailStatus(selectedCard.tutorStudent.status);
    setDetailGrade(selectedCard.student.grade ? String(selectedCard.student.grade) : '');
  }, [selectedCard]);

  const handleCreateStudent = async () => {
    if (!newStudentName.trim() || !newStudentTelegramId.trim() || !newStudentSubjectId || !newStudentRate.trim() || !newStudentStartedAt) {
      alert('\u0417\u0430\u043f\u043e\u043b\u043d\u0438 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u043f\u043e\u043b\u044f \u0434\u043b\u044f \u0441\u043e\u0437\u0434\u0430\u043d\u0438\u044f \u0443\u0447\u0435\u043d\u0438\u043a\u0430');
      return;
    }
    try {
      setCreatingStudent(true);
      const createdStudent = await createStudent({ full_name: newStudentName.trim(), telegram_id: Number(newStudentTelegramId), grade: newStudentGrade.trim() ? Number(newStudentGrade) : undefined, phone_number: newStudentPhone.trim() || undefined });
      const createdTutorStudent = await createTutorStudent({ student_id: createdStudent.id, subject_id: Number(newStudentSubjectId), hourly_rate: Number(newStudentRate), started_at: newStudentStartedAt });
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
        updateTutorStudent(selectedCard.tutorStudent.id, { hourly_rate: rate, status: detailStatus }),
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

  const renderGrid = (cards: StudentCardData[]) => <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>{cards.map((card) => <button key={card.tutorStudent.id} type="button" onClick={() => { setSelectedTutorStudentId(card.tutorStudent.id); setDetailsModalOpen(true); }} style={{ display: 'grid', gap: 10, padding: 16, textAlign: 'left', borderRadius: 18, background: 'rgba(23,32,51,0.03)', color: '#1f2a3b', border: '1px solid rgba(24,33,47,0.08)', boxShadow: 'none' }}><div><div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>{card.student.full_name}</div><div style={{ color: '#687486', fontSize: 14 }}>{card.subject?.name ?? t.subjectMissing}</div></div><div style={{ display: 'grid', gap: 6, color: '#435066', fontSize: 14 }}><span>{`${t.rate}: ${card.tutorStudent.hourly_rate} \u20bd/\u0447`}</span><span>{`${t.status}: ${statusLabels[card.tutorStudent.status]}`}</span><span>{`${t.contacts}: ${card.contacts.length}`}</span></div></button>)}</div>;
  return (
    <div>
      <section style={{ ...panelStyle, padding: '20px', marginBottom: '16px', background: 'linear-gradient(140deg, rgba(255,249,242,0.98) 0%, rgba(255,255,255,0.9) 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', lineHeight: 0.98, letterSpacing: '-0.04em', marginBottom: 10 }}>{t.title}</h1>
            <p style={{ color: '#5e6a7b', maxWidth: 760, fontSize: 14, marginBottom: 0 }}>{t.subtitle}</p>
          </div>
          <div style={{ minWidth: 176, borderRadius: 16, padding: '12px 14px', background: '#172033', color: '#fff' }}>
            <div style={{ color: 'rgba(255,255,255,0.64)', fontSize: 12, marginBottom: 6 }}>{t.found}</div>
            <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1, marginBottom: 6 }}>{filteredCards.length}</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', color: 'rgba(255,255,255,0.78)', fontSize: 12 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80' }} />
                {activeCards.length}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171' }} />
                {inactiveCards.length}
              </span>
            </div>
          </div>
        </div>
      </section>

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
              {Array.from({ length: 11 }, (_, i) => i + 1).map((grade) => <option key={grade} value={grade}>{`${grade} \u043a\u043b\u0430\u0441\u0441`}</option>)}
            </select>
            <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} style={{ flex: '1 1 190px' }}>
              <option value="">{t.allSubjects}</option>
              {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
            <button type="button" onClick={() => setCreateModalOpen(true)}>{t.create}</button>
          </div>
        </div>
      </section>

      <section style={panelStyle}>
        {loading ? <p style={{ ...mutedTextStyle, marginBottom: 0 }}>{t.loading}</p> : filteredCards.length === 0 ? <p style={{ ...mutedTextStyle, marginBottom: 0 }}>{t.notFound}</p> : <div style={{ display: 'grid', gap: 16 }}>{activeCards.length > 0 ? renderGrid(activeCards) : <div style={{ padding: 16, borderRadius: 16, background: 'rgba(23,32,51,0.03)', color: '#687486' }}>{t.noActive}</div>}{totalInactiveCards.length > 0 && <div style={{ display: 'grid', gap: 12, paddingTop: 4, borderTop: '1px solid rgba(24,33,47,0.08)' }}><button type="button" onClick={() => setShowInactiveStudents((prev) => !prev)} style={{ justifySelf: 'start', background: 'transparent', color: '#324055', border: '1px solid rgba(24,33,47,0.12)', boxShadow: 'none', padding: '8px 12px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171' }} />{showInactiveStudents ? `${t.hideInactive} (${inactiveCards.length})` : `${t.showInactive} (${inactiveCards.length})`}</button>{showInactiveStudents && (inactiveCards.length > 0 ? renderGrid(inactiveCards) : <div style={{ padding: 14, borderRadius: 14, background: 'rgba(23,32,51,0.03)', color: '#687486', fontSize: 14 }}>По текущим фильтрам неактивные ученики не найдены.</div>)}</div>}</div>}
      </section>

      {createModalOpen && <div onClick={() => setCreateModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.48)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 40 }}><div onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 100%)', background: '#fff', borderRadius: 24, border: '1px solid rgba(24,33,47,0.08)', boxShadow: '0 30px 80px rgba(15,23,42,0.18)', padding: 24, display: 'grid', gap: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}><div><h3 style={{ fontSize: 22, marginBottom: 6 }}>{'\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0443\u0447\u0435\u043d\u0438\u043a\u0430'}</h3><div style={mutedTextStyle}>{'\u041d\u043e\u0432\u044b\u0439 \u0443\u0447\u0435\u043d\u0438\u043a \u0441\u0440\u0430\u0437\u0443 \u0441\u043e\u0437\u0434\u0430\u0451\u0442\u0441\u044f \u0438 \u043f\u0440\u0438\u0432\u044f\u0437\u044b\u0432\u0430\u0435\u0442\u0441\u044f \u043a \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u043c\u0443 \u043f\u0440\u0435\u0434\u043c\u0435\u0442\u0443.'}</div></div><button type="button" onClick={() => setCreateModalOpen(false)} style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none', padding: '10px 14px' }}>{t.close}</button></div>{subjects.length === 0 ? <div style={{ padding: 16, borderRadius: 16, background: 'rgba(217,111,50,0.1)', color: '#b9551f' }}>{'\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0441\u043e\u0437\u0434\u0430\u0439 \u043f\u0440\u0435\u0434\u043c\u0435\u0442 \u043d\u0430 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0435 \u00ab\u041f\u0440\u0435\u0434\u043c\u0435\u0442\u044b\u00bb.'}</div> : <><input value={newStudentName} onChange={(e) => setNewStudentName(e.target.value)} placeholder={'\u0424\u0418\u041e \u0443\u0447\u0435\u043d\u0438\u043a\u0430'} /><input value={newStudentTelegramId} onChange={(e) => setNewStudentTelegramId(e.target.value)} placeholder={'Telegram ID'} type="number" /><input value={newStudentGrade} onChange={(e) => setNewStudentGrade(e.target.value)} placeholder={t.grade} type="number" /><input value={newStudentPhone} onChange={(e) => setNewStudentPhone(e.target.value)} placeholder={t.phone} /><select value={newStudentSubjectId} onChange={(e) => { const nextSubjectId = e.target.value; const nextSubject = subjects.find((subject) => String(subject.id) === nextSubjectId); setNewStudentSubjectId(nextSubjectId); setNewStudentRate(nextSubject?.default_rate ? String(nextSubject.default_rate) : ''); }}>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select><input value={newStudentRate} onChange={(e) => setNewStudentRate(e.target.value)} placeholder={t.rate} type="number" /><input value={newStudentStartedAt} onChange={(e) => setNewStudentStartedAt(e.target.value)} type="date" /><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button type="button" onClick={handleCreateStudent} disabled={creatingStudent}>{creatingStudent ? '\u0421\u043e\u0437\u0434\u0430\u0451\u043c...' : t.create}</button><button type="button" onClick={() => setCreateModalOpen(false)} style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}>{t.cancel}</button></div></>}</div></div>}

      {detailsModalOpen && selectedCard && <div onClick={() => setDetailsModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.48)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 40 }}><div onClick={(e) => e.stopPropagation()} style={{ width: 'min(760px, 100%)', maxHeight: '88vh', overflowY: 'auto', background: '#fff', borderRadius: 24, border: '1px solid rgba(24,33,47,0.08)', boxShadow: '0 30px 80px rgba(15,23,42,0.18)', padding: 24, display: 'grid', gap: 16 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}><div><h3 style={{ fontSize: 22, marginBottom: 6 }}>{selectedCard.student.full_name}</h3><div style={mutedTextStyle}>{selectedCard.subject?.name ?? t.subjectMissing}</div></div><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}><button type="button" onClick={handleDeleteTutorStudent} style={{ background: 'rgba(166,63,59,0.92)', boxShadow: 'none', padding: '10px 14px' }}>{'\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0441\u0432\u044f\u0437\u044c'}</button><button type="button" onClick={() => setDetailsModalOpen(false)} style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none', padding: '10px 14px' }}>{t.close}</button></div></div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{[`${t.phone}: ${selectedCard.student.phone_number || '\u2014'}`, `${t.grade}: ${selectedCard.student.grade || '\u2014'}`, `Telegram ID: ${selectedCard.student.telegram_id || '\u2014'}`, `${t.contacts}: ${selectedCard.contacts.length}`].map((item) => <span key={item} style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(23,32,51,0.06)', color: '#324055', fontSize: 13 }}>{item}</span>)}</div><section style={{ ...panelStyle, padding: 14 }}><div style={{ fontWeight: 800, color: '#1f2a3b', marginBottom: 10 }}>{'\u041e\u0441\u043d\u043e\u0432\u043d\u044b\u0435 \u043f\u0430\u0440\u0430\u043c\u0435\u0442\u0440\u044b'}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 12 }}><label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>{t.rate}<input type="number" value={detailRate} onChange={(e) => setDetailRate(e.target.value)} /></label><label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>{t.status}<select value={detailStatus} onChange={(e) => setDetailStatus(e.target.value as TutorStudentStatus)}><option value="active">active</option><option value="paused">paused</option><option value="completed">completed</option></select></label><label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>{t.grade}<input type="number" min={1} max={11} value={detailGrade} onChange={(e) => setDetailGrade(e.target.value)} placeholder="1-11" /></label></div><button type="button" onClick={handleSaveTutorStudent} disabled={savingTutorStudent}>{savingTutorStudent ? '\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c...' : '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f'}</button></section><section style={{ ...panelStyle, padding: 14 }}><div style={{ fontWeight: 800, color: '#1f2a3b', marginBottom: 8 }}>{'\u041a\u043e\u043d\u0442\u0430\u043a\u0442\u043d\u044b\u0435 \u043b\u0438\u0446\u0430'}</div>{selectedCard.contacts.length === 0 ? <p style={{ ...mutedTextStyle, marginBottom: 12 }}>{'\u0423 \u044d\u0442\u043e\u0433\u043e \u0443\u0447\u0435\u043d\u0438\u043a\u0430 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442 \u043f\u0440\u0438\u0432\u044f\u0437\u0430\u043d\u043d\u044b\u0445 \u043a\u043e\u043d\u0442\u0430\u043a\u0442\u043d\u044b\u0445 \u043b\u0438\u0446.'}</p> : <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>{selectedCard.contacts.map((item) => <div key={item.id} style={{ padding: 12, borderRadius: 14, background: 'rgba(23,32,51,0.03)', border: '1px solid rgba(24,33,47,0.08)' }}><div style={{ fontWeight: 700, color: '#243041', marginBottom: 4 }}>{item.contact.full_name}</div><div style={{ color: '#556173', fontSize: 14 }}>{`${t.phone}: ${item.contact.phone_number || '\u2014'} \u2022 Telegram ID: ${item.contact.telegram_id || '\u2014'}`}</div></div>)}</div>}<button type="button" onClick={() => navigate('/contacts')} style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}>{'\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043a\u043e\u043d\u0442\u0430\u043a\u0442\u043d\u0443\u044e \u043a\u043d\u0438\u0436\u043a\u0443'}</button></section></div></div>}
    </div>
  );
}
