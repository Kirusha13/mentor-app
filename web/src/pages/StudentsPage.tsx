import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStudentContacts, type StudentContact } from '../api/contacts';
import { createStudent, getStudents, type Student } from '../api/students';
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
  active: 'Активен',
  paused: 'На паузе',
  completed: 'Завершён',
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
      console.error('Ошибка загрузки учеников:', error);
      alert('Не удалось загрузить список учеников');
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
    if (!query) {
      return studentCards;
    }

    return studentCards.filter(({ student, subject, contacts }) => {
      const haystack = [
        student.full_name,
        subject?.name ?? '',
        student.phone_number ?? '',
        student.telegram_id ?? '',
        ...contacts.map((item) => item.contact.full_name),
        ...contacts.map((item) => item.contact.phone_number ?? ''),
        ...contacts.map((item) => item.contact.telegram_id ?? ''),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [search, studentCards]);

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
      return;
    }

    setDetailRate(String(selectedCard.tutorStudent.hourly_rate));
    setDetailStatus(selectedCard.tutorStudent.status);
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
      alert('Заполни обязательные поля для создания ученика');
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
      alert('Ученик создан и привязан к предмету');
    } catch (error) {
      console.error('Ошибка создания ученика:', error);
      alert(getApiErrorMessage(error, 'Не удалось создать ученика'));
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
      alert('Ставка должна быть числом больше нуля');
      return;
    }

    try {
      setSavingTutorStudent(true);

      const updated = await updateTutorStudent(selectedCard.tutorStudent.id, {
        hourly_rate: rate,
        status: detailStatus,
      });

      setTutorStudents((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      alert('Параметры ученика обновлены');
    } catch (error) {
      console.error('Ошибка обновления связи tutor-student:', error);
      alert(getApiErrorMessage(error, 'Не удалось сохранить изменения'));
    } finally {
      setSavingTutorStudent(false);
    }
  };

  const handleDeleteTutorStudent = async () => {
    if (!selectedCard?.tutorStudent) {
      return;
    }

    const confirmed = window.confirm(
      `Удалить связь с учеником "${selectedCard.student.full_name}"? Ученик останется в системе, но исчезнет из твоего списка по этому предмету.`
    );

    if (!confirmed) {
      return;
    }

    try {
      await deleteTutorStudent(selectedCard.tutorStudent.id);

      setTutorStudents((prev) => prev.filter((item) => item.id !== selectedCard.tutorStudent?.id));
      setDetailsModalOpen(false);
      setSelectedTutorStudentId(null);
      alert('Связь с учеником удалена');
    } catch (error) {
      console.error('Ошибка удаления связи tutor-student:', error);
      alert(
        getApiErrorMessage(
          error,
          'Не удалось удалить связь. Если по ней уже есть занятия или задания, историю нужно сохранить.'
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
            <div style={{ color: '#687486', fontSize: 14 }}>{card.subject?.name ?? 'Предмет не привязан'}</div>
          </div>

          <div
            style={{
              display: 'grid',
              gap: 6,
              color: '#435066',
              fontSize: 14,
            }}
          >
            <span>Тариф: {`${card.tutorStudent.hourly_rate} ₽/ч`}</span>
            <span>Статус: {statusLabels[card.tutorStudent.status]}</span>
            <span>Контактов: {card.contacts.length}</span>
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
              Этап 1
            </div>
            <h1
              style={{
                fontSize: 'clamp(1.8rem, 3vw, 2.5rem)',
                lineHeight: 0.98,
                letterSpacing: '-0.04em',
                marginBottom: 12,
              }}
            >
              Ученики
            </h1>
            <p style={{ color: '#5e6a7b', maxWidth: 760, fontSize: 14, marginBottom: 0 }}>
              Перед тобой только список учеников. Подробная информация, ставка, статус и удаление
              связи открываются по клику на карточку ученика.
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
              Найдено учеников
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1, marginBottom: 8 }}>
              {filteredCards.length}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.74)', fontSize: 14 }}>
              Активных: {activeCards.length} • Неактивных: {inactiveCards.length}
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
              Список учеников
            </div>
            <div style={mutedTextStyle}>
              Поиск работает по ученику, предмету, телефону, Telegram ID и привязанным контактным лицам.
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
              width: 'min(100%, 560px)',
            }}
          >
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Например: Иван, математика, мама"
              style={{ flex: '1 1 260px' }}
            />
            <button type="button" onClick={() => setCreateModalOpen(true)}>
              Создать ученика
            </button>
          </div>
        </div>
      </section>

      <section style={panelStyle}>
        {loading ? (
          <p style={{ ...mutedTextStyle, marginBottom: 0 }}>Загрузка...</p>
        ) : filteredCards.length === 0 ? (
          <p style={{ ...mutedTextStyle, marginBottom: 0 }}>Ученики не найдены</p>
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
                Активных учеников по текущему фильтру нет.
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
                    ? `Скрыть неактивных (${inactiveCards.length})`
                    : `Показать неактивных (${inactiveCards.length})`}
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
                <h3 style={{ fontSize: 22, marginBottom: 6 }}>Создать ученика</h3>
                <div style={mutedTextStyle}>
                  Новый ученик сразу создаётся и привязывается к выбранному предмету.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none', padding: '10px 14px' }}
              >
                Закрыть
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
                Сначала создай предмет на странице «Предметы».
              </div>
            ) : (
              <>
                <input
                  value={newStudentName}
                  onChange={(event) => setNewStudentName(event.target.value)}
                  placeholder="ФИО ученика"
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
                  placeholder="Класс"
                  type="number"
                />
                <input
                  value={newStudentPhone}
                  onChange={(event) => setNewStudentPhone(event.target.value)}
                  placeholder="Телефон"
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
                  placeholder="Ставка"
                  type="number"
                />
                <input
                  value={newStudentStartedAt}
                  onChange={(event) => setNewStudentStartedAt(event.target.value)}
                  type="date"
                />
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" onClick={handleCreateStudent} disabled={creatingStudent}>
                    {creatingStudent ? 'Создаём...' : 'Создать ученика'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(false)}
                    style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}
                  >
                    Отмена
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
                <div style={mutedTextStyle}>{selectedCard.subject?.name ?? 'Предмет не привязан'}</div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleDeleteTutorStudent}
                  style={{ background: 'rgba(166,63,59,0.92)', boxShadow: 'none', padding: '10px 14px' }}
                >
                  Удалить связь
                </button>
                <button
                  type="button"
                  onClick={() => setDetailsModalOpen(false)}
                  style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none', padding: '10px 14px' }}
                >
                  Закрыть
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[
                `Телефон: ${selectedCard.student.phone_number || '—'}`,
                `Класс: ${selectedCard.student.grade || '—'}`,
                `Telegram ID: ${selectedCard.student.telegram_id || '—'}`,
                `Контактов: ${selectedCard.contacts.length}`,
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
              <div style={{ fontWeight: 800, color: '#1f2a3b', marginBottom: 10 }}>Основные параметры</div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                <label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>
                  Ставка
                  <input
                    type="number"
                    value={detailRate}
                    onChange={(event) => setDetailRate(event.target.value)}
                  />
                </label>
                <label style={{ display: 'grid', gap: 6, color: '#556173', fontSize: 14 }}>
                  Статус
                  <select
                    value={detailStatus}
                    onChange={(event) => setDetailStatus(event.target.value as TutorStudentStatus)}
                  >
                    <option value="active">active</option>
                    <option value="paused">paused</option>
                    <option value="completed">completed</option>
                  </select>
                </label>
              </div>
              <button type="button" onClick={handleSaveTutorStudent} disabled={savingTutorStudent}>
                {savingTutorStudent ? 'Сохраняем...' : 'Сохранить изменения'}
              </button>
            </section>

            <section style={{ ...panelStyle, padding: 14 }}>
              <div style={{ fontWeight: 800, color: '#1f2a3b', marginBottom: 8 }}>Контактные лица</div>
              {selectedCard.contacts.length === 0 ? (
                <p style={{ ...mutedTextStyle, marginBottom: 12 }}>
                  У этого ученика пока нет привязанных контактных лиц.
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
                        Телефон: {item.contact.phone_number || '—'} • Telegram ID: {item.contact.telegram_id || '—'}
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
                Открыть контактную книжку
              </button>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
