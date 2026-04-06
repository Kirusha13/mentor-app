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

const panelStyle = {
  background: 'rgba(255,255,255,0.9)',
  padding: '16px',
  borderRadius: '18px',
  border: '1px solid rgba(24,33,47,0.08)',
  boxShadow: 'var(--shadow-card)',
} as const;

const statusLabels: Record<TutorStudentStatus, string> = {
  active: 'РђРєС‚РёРІРµРЅ',
  paused: 'РќР° РїР°СѓР·Рµ',
  completed: 'Р—Р°РІРµСЂС€С‘РЅ',
};

const mutedTextStyle = {
  color: '#687486',
  fontSize: 14,
} as const;

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

  const loadData = async () => {
    try {
      setLoading(true);

      const [studentsData, tutorStudentsData, subjectsData] = await Promise.all([
        getStudents(),
        getTutorStudents(),
        getSubjects(),
      ]);

      setStudents(studentsData);
      setTutorStudents(tutorStudentsData);
      setSubjects(subjectsData);

      if (!studentsData.length) {
        setContactsByStudent({});
        return;
      }

      const contactsEntries = await Promise.all(
        studentsData.map(async (student) => {
          const contacts = await getStudentContacts(student.id);
          return [student.id, contacts] as const;
        })
      );

      setContactsByStudent(Object.fromEntries(contactsEntries));
    } catch (error) {
      console.error('РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё СѓС‡РµРЅРёРєРѕРІ:', error);
      alert('РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЃРїРёСЃРѕРє СѓС‡РµРЅРёРєРѕРІ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!subjects.length) {
      setNewStudentSubjectId('');
      setNewStudentRate('');
      return;
    }

    setNewStudentSubjectId((current) => {
      if (current && subjects.some((subject) => String(subject.id) === current)) {
        return current;
      }

      return String(subjects[0].id);
    });
  }, [subjects]);

  useEffect(() => {
    const subject = subjects.find((item) => String(item.id) === newStudentSubjectId);
    if (!subject) {
      return;
    }

    setNewStudentRate((current) => (current ? current : String(subject.default_rate ?? '')));
  }, [newStudentSubjectId, subjects]);

  const studentCards = useMemo<StudentCardData[]>(() => {
    const cards: StudentCardData[] = [];

    tutorStudents.forEach((relation) => {
      const student = students.find((item) => item.id === relation.student_id);
      if (!student) {
        return;
      }

      cards.push({
        student,
        tutorStudent: relation,
        subject: subjects.find((item) => item.id === relation.subject_id),
        contacts: contactsByStudent[student.id] ?? [],
      });
    });

    return cards;
  }, [contactsByStudent, students, subjects, tutorStudents]);

  const filteredCards = useMemo(() => {
    const query = search.trim().toLowerCase();

    return studentCards.filter(({ student, subject, contacts }) => {
      const haystack = [
        student.full_name,
        student.grade ? String(student.grade) : '',
        subject?.name ?? '',
        student.phone_number ?? '',
        student.telegram_id ?? '',
        ...contacts.map((item) => item.contact.full_name),
        ...contacts.map((item) => item.contact.phone_number ?? ''),
        ...contacts.map((item) => item.contact.telegram_id ?? ''),
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch = !query || haystack.includes(query);
      const matchesClass = !classFilter || String(student.grade ?? '') === classFilter;
      const matchesSubject = !subjectFilter || String(subject?.id ?? '') === subjectFilter;

      return matchesSearch && matchesClass && matchesSubject;
    });
  }, [classFilter, search, studentCards, subjectFilter]);

  const activeCards = useMemo(
    () => filteredCards.filter(({ tutorStudent }) => tutorStudent.status === 'active'),
    [filteredCards]
  );

  const inactiveCards = useMemo(
    () => filteredCards.filter(({ tutorStudent }) => tutorStudent.status !== 'active'),
    [filteredCards]
  );

  const selectedCard = useMemo(
    () => studentCards.find((card) => card.tutorStudent.id === selectedTutorStudentId) ?? null,
    [selectedTutorStudentId, studentCards]
  );

  useEffect(() => {
    if (!selectedCard?.tutorStudent) {
      setDetailRate('');
      setDetailStatus('active');
      setDetailGrade('');
      return;
    }

    setDetailRate(String(selectedCard.tutorStudent.hourly_rate));
    setDetailStatus(selectedCard.tutorStudent.status);
    setDetailGrade(selectedCard.student.grade ? String(selectedCard.student.grade) : '');
  }, [selectedCard]);

  const resetCreateStudentForm = () => {
    setNewStudentName('');
    setNewStudentTelegramId('');
    setNewStudentGrade('');
    setNewStudentPhone('');
    setNewStudentRate('');
    setNewStudentStartedAt(today());
  };

  const openStudentDetails = (card: StudentCardData) => {
    setSelectedTutorStudentId(card.tutorStudent?.id ?? null);
    setDetailsModalOpen(true);
  };

  const handleCreateStudent = async () => {
    if (
      !newStudentName.trim() ||
      !newStudentTelegramId.trim() ||
      !newStudentSubjectId ||
      !newStudentRate.trim() ||
      !newStudentStartedAt
    ) {
      alert('Р—Р°РїРѕР»РЅРё РѕР±СЏР·Р°С‚РµР»СЊРЅС‹Рµ РїРѕР»СЏ РґР»СЏ СЃРѕР·РґР°РЅРёСЏ СѓС‡РµРЅРёРєР°');
      return;
    }

    try {
      setCreatingStudent(true);

      const createdStudent = await createStudent({
        full_name: newStudentName.trim(),
        telegram_id: Number(newStudentTelegramId),
        grade: newStudentGrade.trim() ? Number(newStudentGrade) : undefined,
        phone_number: newStudentPhone.trim() || undefined,
      });

      const createdTutorStudent = await createTutorStudent({
        student_id: createdStudent.id,
        subject_id: Number(newStudentSubjectId),
        hourly_rate: Number(newStudentRate),
        started_at: newStudentStartedAt,
      });

      setStudents((prev) => [...prev, createdStudent]);
      setTutorStudents((prev) => [...prev, createdTutorStudent]);
      setContactsByStudent((prev) => ({ ...prev, [createdStudent.id]: [] }));

      resetCreateStudentForm();
      setCreateModalOpen(false);
      alert('РЈС‡РµРЅРёРє СЃРѕР·РґР°РЅ Рё РїСЂРёРІСЏР·Р°РЅ Рє РїСЂРµРґРјРµС‚Сѓ');
    } catch (error) {
      console.error('РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ СѓС‡РµРЅРёРєР°:', error);
      alert(getApiErrorMessage(error, 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ СѓС‡РµРЅРёРєР°'));
    } finally {
      setCreatingStudent(false);
    }
  };

  const handleSaveTutorStudent = async () => {
    if (!selectedCard?.tutorStudent) {
      return;
    }

    const rate = Number(detailRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      alert('РЎС‚Р°РІРєР° РґРѕР»Р¶РЅР° Р±С‹С‚СЊ С‡РёСЃР»РѕРј Р±РѕР»СЊС€Рµ РЅСѓР»СЏ');
      return;
    }

    const trimmedGrade = detailGrade.trim();
    const parsedGrade = trimmedGrade ? Number(trimmedGrade) : undefined;
    if (
      trimmedGrade &&
      (parsedGrade === undefined ||
        !Number.isInteger(parsedGrade) ||
        parsedGrade < 1 ||
        parsedGrade > 11)
    ) {
      alert('РљР»Р°СЃСЃ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ С†РµР»С‹Рј С‡РёСЃР»РѕРј РѕС‚ 1 РґРѕ 11');
      return;
    }

    try {
      setSavingTutorStudent(true);

      const [updatedTutorStudent, updatedStudent] = await Promise.all([
        updateTutorStudent(selectedCard.tutorStudent.id, {
          hourly_rate: rate,
          status: detailStatus,
        }),
        updateStudent(selectedCard.student.id, {
          grade: parsedGrade,
        }),
      ]);

      setTutorStudents((prev) =>
        prev.map((item) => (item.id === updatedTutorStudent.id ? updatedTutorStudent : item))
      );
      setStudents((prev) => prev.map((item) => (item.id === updatedStudent.id ? updatedStudent : item)));
      alert('РџР°СЂР°РјРµС‚СЂС‹ СѓС‡РµРЅРёРєР° РѕР±РЅРѕРІР»РµРЅС‹');
    } catch (error) {
      console.error('РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ СЃРІСЏР·Рё tutor-student:', error);
      alert(getApiErrorMessage(error, 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РёР·РјРµРЅРµРЅРёСЏ'));
    } finally {
      setSavingTutorStudent(false);
    }
  };

  const handleDeleteTutorStudent = async () => {
    if (!selectedCard?.tutorStudent) {
      return;
    }

    const confirmed = window.confirm(
      `РЈРґР°Р»РёС‚СЊ СЃРІСЏР·СЊ СЃ СѓС‡РµРЅРёРєРѕРј "${selectedCard.student.full_name}"? РЈС‡РµРЅРёРє РѕСЃС‚Р°РЅРµС‚СЃСЏ РІ СЃРёСЃС‚РµРјРµ, РЅРѕ РёСЃС‡РµР·РЅРµС‚ РёР· С‚РІРѕРµРіРѕ СЃРїРёСЃРєР° РїРѕ СЌС‚РѕРјСѓ РїСЂРµРґРјРµС‚Сѓ.`
    );

    if (!confirmed) {
      return;
    }

    try {
      await deleteTutorStudent(selectedCard.tutorStudent.id);

      setTutorStudents((prev) => prev.filter((item) => item.id !== selectedCard.tutorStudent?.id));
      setDetailsModalOpen(false);
      setSelectedTutorStudentId(null);
      alert('РЎРІСЏР·СЊ СЃ СѓС‡РµРЅРёРєРѕРј СѓРґР°Р»РµРЅР°');
    } catch (error) {
      console.error('РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ СЃРІСЏР·Рё tutor-student:', error);
      alert(
        getApiErrorMessage(
          error,
          'РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ СЃРІСЏР·СЊ. Р•СЃР»Рё РїРѕ РЅРµР№ СѓР¶Рµ РµСЃС‚СЊ Р·Р°РЅСЏС‚РёСЏ РёР»Рё Р·Р°РґР°РЅРёСЏ, РёСЃС‚РѕСЂРёСЋ РЅСѓР¶РЅРѕ СЃРѕС…СЂР°РЅРёС‚СЊ.'
        )
      );
    }
  };

  const renderStudentGrid = (cards: StudentCardData[]) => (
    <div
      style={{
        display: 'grid',
        gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      }}
    >
      {cards.map((card) => (
        <button
          key={card.tutorStudent?.id ?? card.student.id}
          type="button"
          onClick={() => openStudentDetails(card)}
          style={{
            display: 'grid',
            gap: 10,
            padding: 16,
            textAlign: 'left',
            borderRadius: 18,
            background: 'rgba(23,32,51,0.03)',
            color: '#1f2a3b',
            border: '1px solid rgba(24,33,47,0.08)',
            boxShadow: 'none',
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>{card.student.full_name}</div>
            <div style={{ color: '#687486', fontSize: 14 }}>{card.subject?.name ?? 'РџСЂРµРґРјРµС‚ РЅРµ РїСЂРёРІСЏР·Р°РЅ'}</div>
          </div>

          <div
            style={{
              display: 'grid',
              gap: 6,
              color: '#435066',
              fontSize: 14,
            }}
          >
            <span>РўР°СЂРёС„: {`${card.tutorStudent.hourly_rate} в‚Ѕ/С‡`}</span>
            <span>РЎС‚Р°С‚СѓСЃ: {statusLabels[card.tutorStudent.status]}</span>
            <span>РљРѕРЅС‚Р°РєС‚РѕРІ: {card.contacts.length}</span>
          </div>
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <section
        style={{
          ...panelStyle,
          padding: '20px',
          marginBottom: '16px',
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
                padding: '6px 10px',
                borderRadius: 999,
                background: 'rgba(217,111,50,0.12)',
                color: '#b9551f',
                fontWeight: 700,
                fontSize: 13,
                marginBottom: 10,
              }}
            >
              Р­С‚Р°Рї 1
            </div>
            <h1
              style={{
                fontSize: 'clamp(1.8rem, 3vw, 2.5rem)',
                lineHeight: 0.98,
                letterSpacing: '-0.04em',
                marginBottom: 12,
              }}
            >
              РЈС‡РµРЅРёРєРё
            </h1>
            <p style={{ color: '#5e6a7b', maxWidth: 760, fontSize: 14, marginBottom: 0 }}>
              РџРµСЂРµРґ С‚РѕР±РѕР№ С‚РѕР»СЊРєРѕ СЃРїРёСЃРѕРє СѓС‡РµРЅРёРєРѕРІ. РџРѕРґСЂРѕР±РЅР°СЏ РёРЅС„РѕСЂРјР°С†РёСЏ, СЃС‚Р°РІРєР°, СЃС‚Р°С‚СѓСЃ Рё СѓРґР°Р»РµРЅРёРµ
              СЃРІСЏР·Рё РѕС‚РєСЂС‹РІР°СЋС‚СЃСЏ РїРѕ РєР»РёРєСѓ РЅР° РєР°СЂС‚РѕС‡РєСѓ СѓС‡РµРЅРёРєР°.
            </p>
          </div>

          <div
            style={{
              minWidth: 220,
              borderRadius: 18,
              padding: 14,
              background: '#172033',
              color: '#fff',
            }}
          >
            <div style={{ color: 'rgba(255,255,255,0.64)', fontSize: 13, marginBottom: 8 }}>
              РќР°Р№РґРµРЅРѕ СѓС‡РµРЅРёРєРѕРІ
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1, marginBottom: 8 }}>
              {filteredCards.length}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.74)', fontSize: 14 }}>
              РђРєС‚РёРІРЅС‹С…: {activeCards.length} вЂў РќРµР°РєС‚РёРІРЅС‹С…: {inactiveCards.length}
            </div>
          </div>
        </div>
      </section>

      <section style={{ ...panelStyle, marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: '1 1 320px' }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#1f2a3b', marginBottom: 6 }}>
              РЎРїРёСЃРѕРє СѓС‡РµРЅРёРєРѕРІ
            </div>
            <div style={mutedTextStyle}>
              РџРѕРёСЃРє СЂР°Р±РѕС‚Р°РµС‚ РїРѕ СѓС‡РµРЅРёРєСѓ, РїСЂРµРґРјРµС‚Сѓ, С‚РµР»РµС„РѕРЅСѓ, Telegram ID Рё РїСЂРёРІСЏР·Р°РЅРЅС‹Рј РєРѕРЅС‚Р°РєС‚РЅС‹Рј Р»РёС†Р°Рј.
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
              width: 'min(100%, 860px)',
            }}
          >
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="РќР°РїСЂРёРјРµСЂ: РРІР°РЅ, РјР°С‚РµРјР°С‚РёРєР°, РјР°РјР°"
              style={{ flex: '1 1 260px' }}
            />
            <select
              value={classFilter}
              onChange={(event) => setClassFilter(event.target.value)}
              style={{ flex: '0 1 150px' }}
            >
              <option value="">Все классы</option>
              {Array.from({ length: 11 }, (_, index) => index + 1).map((grade) => (
                <option key={grade} value={grade}>
                  {grade} класс
                </option>
              ))}
            </select>
            <select
              value={subjectFilter}
              onChange={(event) => setSubjectFilter(event.target.value)}
              style={{ flex: '1 1 190px' }}
            >
              <option value="">Все предметы</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => setCreateModalOpen(true)}>
              РЎРѕР·РґР°С‚СЊ СѓС‡РµРЅРёРєР°
            </button>
          </div>
        </div>
      </section>

      <section style={panelStyle}>
        {loading ? (
          <p style={{ ...mutedTextStyle, marginBottom: 0 }}>Р—Р°РіСЂСѓР·РєР°...</p>
        ) : filteredCards.length === 0 ? (
          <p style={{ ...mutedTextStyle, marginBottom: 0 }}>РЈС‡РµРЅРёРєРё РЅРµ РЅР°Р№РґРµРЅС‹</p>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {activeCards.length > 0 ? (
              renderStudentGrid(activeCards)
            ) : (
              <div
                style={{
                  padding: 16,
                  borderRadius: 16,
                  background: 'rgba(23,32,51,0.03)',
                  color: '#687486',
                }}
              >
                РђРєС‚РёРІРЅС‹С… СѓС‡РµРЅРёРєРѕРІ РїРѕ С‚РµРєСѓС‰РµРјСѓ С„РёР»СЊС‚СЂСѓ РЅРµС‚.
              </div>
            )}

            {inactiveCards.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  paddingTop: 4,
                  borderTop: '1px solid rgba(24,33,47,0.08)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowInactiveStudents((prev) => !prev)}
                  style={{
                    justifySelf: 'start',
                    background: 'rgba(23,32,51,0.92)',
                    boxShadow: 'none',
                  }}
                >
                  {showInactiveStudents
                    ? `РЎРєСЂС‹С‚СЊ РЅРµР°РєС‚РёРІРЅС‹С… (${inactiveCards.length})`
                    : `РџРѕРєР°Р·Р°С‚СЊ РЅРµР°РєС‚РёРІРЅС‹С… (${inactiveCards.length})`}
                </button>

                {showInactiveStudents && renderStudentGrid(inactiveCards)}
              </div>
            )}
          </div>
        )}
      </section>

      {createModalOpen && (
        <div
          onClick={() => setCreateModalOpen(false)}
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
              padding: 24,
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: 22, marginBottom: 6 }}>РЎРѕР·РґР°С‚СЊ СѓС‡РµРЅРёРєР°</h3>
                <div style={mutedTextStyle}>
                  РќРѕРІС‹Р№ СѓС‡РµРЅРёРє СЃСЂР°Р·Сѓ СЃРѕР·РґР°С‘С‚СЃСЏ Рё РїСЂРёРІСЏР·С‹РІР°РµС‚СЃСЏ Рє РІС‹Р±СЂР°РЅРЅРѕРјСѓ РїСЂРµРґРјРµС‚Сѓ.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none', padding: '10px 14px' }}
              >
                Р—Р°РєСЂС‹С‚СЊ
              </button>
            </div>

            {subjects.length === 0 ? (
              <div
                style={{
                  padding: 16,
                  borderRadius: 16,
                  background: 'rgba(217,111,50,0.1)',
                  color: '#b9551f',
                }}
              >
                РЎРЅР°С‡Р°Р»Р° СЃРѕР·РґР°Р№ РїСЂРµРґРјРµС‚ РЅР° СЃС‚СЂР°РЅРёС†Рµ В«РџСЂРµРґРјРµС‚С‹В».
              </div>
            ) : (
              <>
                <input
                  value={newStudentName}
                  onChange={(event) => setNewStudentName(event.target.value)}
                  placeholder="Р¤РРћ СѓС‡РµРЅРёРєР°"
                />
                <input
                  value={newStudentTelegramId}
                  onChange={(event) => setNewStudentTelegramId(event.target.value)}
                  placeholder="Telegram ID"
                  type="number"
                />
                <input
                  value={newStudentGrade}
                  onChange={(event) => setNewStudentGrade(event.target.value)}
                  placeholder="РљР»Р°СЃСЃ"
                  type="number"
                />
                <input
                  value={newStudentPhone}
                  onChange={(event) => setNewStudentPhone(event.target.value)}
                  placeholder="РўРµР»РµС„РѕРЅ"
                />
                <select
                  value={newStudentSubjectId}
                  onChange={(event) => {
                    const nextSubjectId = event.target.value;
                    const nextSubject = subjects.find((subject) => String(subject.id) === nextSubjectId);
                    setNewStudentSubjectId(nextSubjectId);
                    setNewStudentRate(nextSubject?.default_rate ? String(nextSubject.default_rate) : '');
                  }}
                >
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
                <input
                  value={newStudentRate}
                  onChange={(event) => setNewStudentRate(event.target.value)}
                  placeholder="РЎС‚Р°РІРєР°"
                  type="number"
                />
                <input
                  value={newStudentStartedAt}
                  onChange={(event) => setNewStudentStartedAt(event.target.value)}
                  type="date"
                />
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" onClick={handleCreateStudent} disabled={creatingStudent}>
                    {creatingStudent ? 'РЎРѕР·РґР°С‘Рј...' : 'РЎРѕР·РґР°С‚СЊ СѓС‡РµРЅРёРєР°'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(false)}
                    style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}
                  >
                    РћС‚РјРµРЅР°
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {detailsModalOpen && selectedCard && (
        <div
          onClick={() => setDetailsModalOpen(false)}
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
              width: 'min(760px, 100%)',
              maxHeight: '88vh',
              overflowY: 'auto',
              background: '#fff',
              borderRadius: 24,
              border: '1px solid rgba(24,33,47,0.08)',
              boxShadow: '0 30px 80px rgba(15,23,42,0.18)',
              padding: 24,
              display: 'grid',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: 22, marginBottom: 6 }}>{selectedCard.student.full_name}</h3>
                <div style={mutedTextStyle}>{selectedCard.subject?.name ?? 'РџСЂРµРґРјРµС‚ РЅРµ РїСЂРёРІСЏР·Р°РЅ'}</div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleDeleteTutorStudent}
                  style={{ background: 'rgba(166,63,59,0.92)', boxShadow: 'none', padding: '10px 14px' }}
                >
                  РЈРґР°Р»РёС‚СЊ СЃРІСЏР·СЊ
                </button>
                <button
                  type="button"
                  onClick={() => setDetailsModalOpen(false)}
                  style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none', padding: '10px 14px' }}
                >
                  Р—Р°РєСЂС‹С‚СЊ
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[
                `РўРµР»РµС„РѕРЅ: ${selectedCard.student.phone_number || 'вЂ”'}`,
                `РљР»Р°СЃСЃ: ${selectedCard.student.grade || 'вЂ”'}`,
                `Telegram ID: ${selectedCard.student.telegram_id || 'вЂ”'}`,
                `РљРѕРЅС‚Р°РєС‚РѕРІ: ${selectedCard.contacts.length}`,
              ].map((item) => (
                <span
                  key={item}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: 'rgba(23,32,51,0.06)',
                    color: '#324055',
                    fontSize: 13,
                  }}
                >
                  {item}
                </span>
              ))}
            </div>

            <section style={{ ...panelStyle, padding: 14 }}>
              <div style={{ fontWeight: 800, color: '#1f2a3b', marginBottom: 10 }}>РћСЃРЅРѕРІРЅС‹Рµ РїР°СЂР°РјРµС‚СЂС‹</div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                <label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>
                  РЎС‚Р°РІРєР°
                  <input
                    type="number"
                    value={detailRate}
                    onChange={(event) => setDetailRate(event.target.value)}
                  />
                </label>
                <label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>
                  РЎС‚Р°С‚СѓСЃ
                  <select
                    value={detailStatus}
                    onChange={(event) => setDetailStatus(event.target.value as TutorStudentStatus)}
                  >
                    <option value="active">active</option>
                    <option value="paused">paused</option>
                    <option value="completed">completed</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>
                  Класс
                  <input
                    type="number"
                    min={1}
                    max={11}
                    value={detailGrade}
                    onChange={(event) => setDetailGrade(event.target.value)}
                    placeholder="1-11"
                  />
                </label>
              </div>
              <button type="button" onClick={handleSaveTutorStudent} disabled={savingTutorStudent}>
                {savingTutorStudent ? 'РЎРѕС…СЂР°РЅСЏРµРј...' : 'РЎРѕС…СЂР°РЅРёС‚СЊ РёР·РјРµРЅРµРЅРёСЏ'}
              </button>
            </section>

            <section style={{ ...panelStyle, padding: 14 }}>
              <div style={{ fontWeight: 800, color: '#1f2a3b', marginBottom: 8 }}>РљРѕРЅС‚Р°РєС‚РЅС‹Рµ Р»РёС†Р°</div>
              {selectedCard.contacts.length === 0 ? (
                <p style={{ ...mutedTextStyle, marginBottom: 12 }}>
                  РЈ СЌС‚РѕРіРѕ СѓС‡РµРЅРёРєР° РїРѕРєР° РЅРµС‚ РїСЂРёРІСЏР·Р°РЅРЅС‹С… РєРѕРЅС‚Р°РєС‚РЅС‹С… Р»РёС†.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
                  {selectedCard.contacts.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: 12,
                        borderRadius: 14,
                        background: 'rgba(23,32,51,0.03)',
                        border: '1px solid rgba(24,33,47,0.08)',
                      }}
                    >
                      <div style={{ fontWeight: 700, color: '#243041', marginBottom: 4 }}>
                        {item.contact.full_name}
                      </div>
                      <div style={{ color: '#556173', fontSize: 14 }}>
                        РўРµР»РµС„РѕРЅ: {item.contact.phone_number || 'вЂ”'} вЂў Telegram ID: {item.contact.telegram_id || 'вЂ”'}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => navigate('/contacts')}
                style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}
              >
                РћС‚РєСЂС‹С‚СЊ РєРѕРЅС‚Р°РєС‚РЅСѓСЋ РєРЅРёР¶РєСѓ
              </button>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

