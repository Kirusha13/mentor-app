import { useEffect, useMemo, useState } from 'react';
import {
  createStudent,
  getStudents,
  type Student,
} from '../api/students';
import {
  createTutorStudent,
  getTutorStudents,
  updateTutorStudent,
  type TutorStudent,
  type TutorStudentStatus,
} from '../api/tutorStudents';
import { getSubjects, type Subject } from '../api/subjects';

interface StudentCardData {
  student: Student;
  tutorStudent?: TutorStudent;
  subject?: Subject;
}

const panelStyle = {
  background: 'rgba(255,255,255,0.88)',
  padding: '20px',
  borderRadius: '22px',
  border: '1px solid rgba(24,33,47,0.08)',
  boxShadow: 'var(--shadow-card)',
} as const;

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [tutorStudents, setTutorStudents] = useState<TutorStudent[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentTelegramId, setNewStudentTelegramId] = useState('');
  const [newStudentGrade, setNewStudentGrade] = useState('');
  const [newStudentPhone, setNewStudentPhone] = useState('');
  const [newStudentSubjectId, setNewStudentSubjectId] = useState('');
  const [newStudentRate, setNewStudentRate] = useState('');
  const [newStudentStartedAt, setNewStudentStartedAt] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [creatingStudent, setCreatingStudent] = useState(false);

  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [creatingTutorStudent, setCreatingTutorStudent] = useState(false);

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
    } catch (error) {
      console.error('Ошибка загрузки учеников:', error);
      alert('Не удалось загрузить данные учеников');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const studentCards = useMemo<StudentCardData[]>(() => {
    return students.map((student) => {
      const tutorStudent = tutorStudents.find((item) => item.student_id === student.id);
      const subject = subjects.find((item) => item.id === tutorStudent?.subject_id);

      return {
        student,
        tutorStudent,
        subject,
      };
    });
  }, [students, tutorStudents, subjects]);

  const filteredCards = studentCards.filter(({ student, subject }) => {
    const text = `${student.full_name} ${subject?.name ?? ''}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const availableStudents = useMemo(() => {
    return students.filter(
      (student) => !tutorStudents.some((item) => item.student_id === student.id)
    );
  }, [students, tutorStudents]);

  useEffect(() => {
    if (!availableStudents.length) {
      setSelectedStudentId('');
      return;
    }

    setSelectedStudentId((current) => {
      if (current && availableStudents.some((student) => String(student.id) === current)) {
        return current;
      }

      return String(availableStudents[0].id);
    });
  }, [availableStudents]);

  useEffect(() => {
    if (!subjects.length) {
      setSelectedSubjectId('');
      setNewStudentSubjectId('');
      setHourlyRate('');
      setNewStudentRate('');
      return;
    }

    setSelectedSubjectId((current) => {
      if (current && subjects.some((subject) => String(subject.id) === current)) {
        return current;
      }

      return String(subjects[0].id);
    });

    setNewStudentSubjectId((current) => {
      if (current && subjects.some((subject) => String(subject.id) === current)) {
        return current;
      }

      return String(subjects[0].id);
    });
  }, [subjects]);

  useEffect(() => {
    const subject = subjects.find((item) => String(item.id) === selectedSubjectId);
    if (!subject) {
      return;
    }

    setHourlyRate((current) => {
      if (current) {
        return current;
      }

      return subject.default_rate ? String(subject.default_rate) : '';
    });
  }, [selectedSubjectId, subjects]);

  useEffect(() => {
    const subject = subjects.find((item) => String(item.id) === newStudentSubjectId);
    if (!subject) {
      return;
    }

    setNewStudentRate((current) => {
      if (current) {
        return current;
      }

      return subject.default_rate ? String(subject.default_rate) : '';
    });
  }, [newStudentSubjectId, subjects]);

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
        grade: newStudentGrade ? Number(newStudentGrade) : undefined,
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

      setNewStudentName('');
      setNewStudentTelegramId('');
      setNewStudentGrade('');
      setNewStudentPhone('');
      setNewStudentRate('');
      setNewStudentStartedAt(new Date().toISOString().slice(0, 10));

      alert('Ученик создан и сразу привязан к предмету');
    } catch (error) {
      console.error('Ошибка создания ученика:', error);
      alert('Не удалось создать ученика');
    } finally {
      setCreatingStudent(false);
    }
  };

  const handleUpdateTutorStudent = async (
    id: number,
    payload: { hourly_rate?: number; status?: TutorStudentStatus }
  ) => {
    try {
      const updated = await updateTutorStudent(id, payload);

      setTutorStudents((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
    } catch (error) {
      console.error('Ошибка обновления связи tutor-student:', error);
      alert('Не удалось обновить тариф или статус');
    }
  };

  const handleCreateTutorStudent = async () => {
    if (!selectedStudentId || !selectedSubjectId || !hourlyRate || !startedAt) {
      alert('Заполни все поля для привязки ученика');
      return;
    }

    try {
      setCreatingTutorStudent(true);

      const created = await createTutorStudent({
        student_id: Number(selectedStudentId),
        subject_id: Number(selectedSubjectId),
        hourly_rate: Number(hourlyRate),
        started_at: startedAt,
      });

      setTutorStudents((prev) => [...prev, created]);
      setHourlyRate('');
      alert('Ученик привязан к предмету');
    } catch (error) {
      console.error('Ошибка создания связи tutor-student:', error);
      alert('Не удалось привязать ученика');
    } finally {
      setCreatingTutorStudent(false);
    }
  };

  return (
    <div>
      <section
        style={{
          ...panelStyle,
          padding: '28px',
          marginBottom: '22px',
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
              Этап 1
            </div>
            <h1
              style={{
                fontSize: 'clamp(2rem, 4vw, 3.2rem)',
                lineHeight: 0.98,
                letterSpacing: '-0.04em',
                marginBottom: 12,
              }}
            >
              Ученики и привязка
              <br />
              к предметам
            </h1>
            <p style={{ color: '#5e6a7b', maxWidth: 760, fontSize: 16, marginBottom: 0 }}>
              Теперь можно создавать ученика прямо здесь и сразу привязывать его к предмету,
              чтобы не блокировать тестирование следующих этапов.
            </p>
          </div>

          <div
            style={{
              minWidth: 220,
              borderRadius: 22,
              padding: 18,
              background: '#172033',
              color: '#fff',
            }}
          >
            <div style={{ color: 'rgba(255,255,255,0.64)', fontSize: 13, marginBottom: 8 }}>
              Всего карточек
            </div>
            <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1, marginBottom: 10 }}>
              {filteredCards.length}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.74)', fontSize: 14 }}>
              Ученики, найденные по текущему фильтру
            </div>
          </div>
        </div>
      </section>

      <div
        style={{
          display: 'grid',
          gap: '18px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          marginBottom: '24px',
        }}
      >
        <section style={panelStyle}>
          <h3 style={{ fontSize: 22, marginBottom: 10 }}>Поиск</h3>
          <p style={{ color: '#687486', marginBottom: 14 }}>
            Быстрый фильтр по имени ученика и названию предмета.
          </p>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Например: Иван или Математика"
          />
        </section>

        <section style={panelStyle}>
          <h3 style={{ fontSize: 22, marginBottom: 10 }}>Создать ученика</h3>
          <p style={{ color: '#687486', marginBottom: 14 }}>
            Новый ученик сразу создаётся и привязывается к выбранному предмету.
          </p>

          {subjects.length === 0 ? (
            <div
              style={{
                padding: 16,
                borderRadius: 16,
                background: 'rgba(217,111,50,0.1)',
                color: '#b9551f',
              }}
            >
              Сначала создай предмет на странице "Предметы".
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              <input
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
                placeholder="ФИО ученика"
              />

              <input
                value={newStudentTelegramId}
                onChange={(e) => setNewStudentTelegramId(e.target.value)}
                placeholder="Telegram ID"
                type="number"
              />

              <input
                value={newStudentGrade}
                onChange={(e) => setNewStudentGrade(e.target.value)}
                placeholder="Класс"
                type="number"
              />

              <input
                value={newStudentPhone}
                onChange={(e) => setNewStudentPhone(e.target.value)}
                placeholder="Телефон"
              />

              <select
                value={newStudentSubjectId}
                onChange={(e) => {
                  const nextSubjectId = e.target.value;
                  const nextSubject = subjects.find(
                    (subject) => String(subject.id) === nextSubjectId
                  );

                  setNewStudentSubjectId(nextSubjectId);
                  setNewStudentRate(
                    nextSubject?.default_rate ? String(nextSubject.default_rate) : ''
                  );
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
                onChange={(e) => setNewStudentRate(e.target.value)}
                placeholder="Ставка для ученика"
                type="number"
              />

              <input
                value={newStudentStartedAt}
                onChange={(e) => setNewStudentStartedAt(e.target.value)}
                type="date"
              />

              <button onClick={handleCreateStudent} disabled={creatingStudent}>
                {creatingStudent ? 'Создаём...' : 'Создать ученика'}
              </button>
            </div>
          )}
        </section>

        <section style={panelStyle}>
          <h3 style={{ fontSize: 22, marginBottom: 10 }}>Привязать ученика</h3>
          <p style={{ color: '#687486', marginBottom: 14 }}>
            Для уже существующих учеников можно создать отдельную связку с предметом.
          </p>

          {students.length === 0 ? (
            <div
              style={{
                padding: 16,
                borderRadius: 16,
                background: 'rgba(23,32,51,0.06)',
                color: '#566173',
              }}
            >
              Пока учеников нет. Создай первого ученика в соседнем блоке.
            </div>
          ) : availableStudents.length === 0 ? (
            <div
              style={{
                padding: 16,
                borderRadius: 16,
                background: 'rgba(58,134,108,0.1)',
                color: '#2f7d63',
              }}
            >
              Все доступные ученики уже привязаны к предметам.
            </div>
          ) : subjects.length === 0 ? (
            <div
              style={{
                padding: 16,
                borderRadius: 16,
                background: 'rgba(217,111,50,0.1)',
                color: '#b9551f',
              }}
            >
              Сначала создай предмет на отдельной странице "Предметы".
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              <select value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)}>
                {availableStudents.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.full_name}
                  </option>
                ))}
              </select>

              <select
                value={selectedSubjectId}
                onChange={(e) => {
                  const nextSubjectId = e.target.value;
                  const nextSubject = subjects.find(
                    (subject) => String(subject.id) === nextSubjectId
                  );

                  setSelectedSubjectId(nextSubjectId);
                  setHourlyRate(
                    nextSubject?.default_rate ? String(nextSubject.default_rate) : ''
                  );
                }}
              >
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>

              <input
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="Ставка для ученика"
                type="number"
              />

              <input value={startedAt} onChange={(e) => setStartedAt(e.target.value)} type="date" />

              <button onClick={handleCreateTutorStudent} disabled={creatingTutorStudent}>
                {creatingTutorStudent ? 'Сохраняем...' : 'Привязать к предмету'}
              </button>
            </div>
          )}
        </section>
      </div>

      <section style={panelStyle}>
        {loading ? (
          <p style={{ color: '#687486', marginBottom: 0 }}>Загрузка...</p>
        ) : filteredCards.length === 0 ? (
          <p style={{ color: '#687486', marginBottom: 0 }}>Ученики не найдены</p>
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            {filteredCards.map(({ student, tutorStudent, subject }) => (
              <article
                key={student.id}
                style={{
                  border: '1px solid rgba(24,33,47,0.08)',
                  borderRadius: '22px',
                  padding: '20px',
                  background:
                    'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.9) 100%)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '18px',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <h3 style={{ marginBottom: '10px', fontSize: 24 }}>{student.full_name}</h3>

                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 10,
                        marginBottom: 14,
                      }}
                    >
                      {[
                        `Телефон: ${student.phone_number || '—'}`,
                        `Класс: ${student.grade || '—'}`,
                        `Предмет: ${subject?.name || '—'}`,
                        `Telegram ID: ${student.telegram_id || '—'}`,
                      ].map((item) => (
                        <span
                          key={item}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 999,
                            background: 'rgba(23,32,51,0.06)',
                            color: '#324055',
                            fontSize: 14,
                          }}
                        >
                          {item}
                        </span>
                      ))}
                    </div>

                    <p style={{ marginBottom: 6, color: '#435066' }}>
                      <strong>Тариф:</strong>{' '}
                      {tutorStudent?.hourly_rate ? `${tutorStudent.hourly_rate} ₽/ч` : '—'}
                    </p>
                    <p style={{ marginBottom: 0, color: '#435066' }}>
                      <strong>Статус:</strong> {tutorStudent?.status || '—'}
                    </p>
                  </div>
                </div>

                {tutorStudent && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 260px))',
                      gap: '12px',
                      marginTop: '18px',
                      paddingTop: '18px',
                      borderTop: '1px solid rgba(24,33,47,0.08)',
                    }}
                  >
                    <label style={{ color: '#566173', fontSize: 14 }}>
                      Тариф
                      <input
                        type="number"
                        defaultValue={tutorStudent.hourly_rate}
                        onBlur={(e) => {
                          const value = Number(e.target.value);
                          if (value && value !== tutorStudent.hourly_rate) {
                            handleUpdateTutorStudent(tutorStudent.id, {
                              hourly_rate: value,
                            });
                          }
                        }}
                        style={{ marginTop: 8 }}
                      />
                    </label>

                    <label style={{ color: '#566173', fontSize: 14 }}>
                      Статус
                      <select
                        value={tutorStudent.status}
                        onChange={(e) =>
                          handleUpdateTutorStudent(tutorStudent.id, {
                            status: e.target.value as TutorStudentStatus,
                          })
                        }
                        style={{ marginTop: 8 }}
                      >
                        <option value="active">active</option>
                        <option value="paused">paused</option>
                        <option value="completed">completed</option>
                      </select>
                    </label>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
