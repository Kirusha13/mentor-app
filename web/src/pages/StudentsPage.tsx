import { useEffect, useMemo, useState } from 'react';
import { getStudents, type Student } from '../api/students';
import {
  getTutorStudents,
  updateTutorStudent,
  type TutorStudent,
  type TutorStudentStatus,
} from '../api/tutorStudents';
import {
  createSubject,
  getSubjects,
  type Subject,
} from '../api/subjects';

interface StudentCardData {
  student: Student;
  tutorStudent?: TutorStudent;
  subject?: Subject;
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [tutorStudents, setTutorStudents] = useState<TutorStudent[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectRate, setNewSubjectRate] = useState('');
  const [creatingSubject, setCreatingSubject] = useState(false);

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

  const handleCreateSubject = async () => {
    if (!newSubjectName.trim() || !newSubjectRate.trim()) {
      alert('Заполни название предмета и ставку');
      return;
    }

    try {
      setCreatingSubject(true);

      const subject = await createSubject({
        name: newSubjectName.trim(),
        default_rate: Number(newSubjectRate),
        color: '#2563eb',
      });

      setSubjects((prev) => [...prev, subject]);
      setNewSubjectName('');
      setNewSubjectRate('');

      alert(`Предмет "${subject.name}" создан`);
    } catch (error) {
      console.error('Ошибка создания предмета:', error);
      alert('Не удалось создать предмет');
    } finally {
      setCreatingSubject(false);
    }
  };

  const handleCopyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      alert('Invitation token скопирован');
    } catch (error) {
      console.error('Ошибка копирования токена:', error);
      alert('Не удалось скопировать токен');
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

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Ученики</h2>

      <div
        style={{
          display: 'grid',
          gap: '16px',
          gridTemplateColumns: '1fr 1fr',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            background: '#fff',
            padding: '16px',
            borderRadius: '16px',
            border: '1px solid #e5e7eb',
          }}
        >
          <h3 style={{ marginTop: 0 }}>Поиск</h3>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по ученику или предмету"
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '10px',
              border: '1px solid #d1d5db',
            }}
          />
        </div>

        <div
          style={{
            background: '#fff',
            padding: '16px',
            borderRadius: '16px',
            border: '1px solid #e5e7eb',
          }}
        >
          <h3 style={{ marginTop: 0 }}>Создать предмет</h3>

          <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
            <input
              value={newSubjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
              placeholder="Название предмета"
              style={{
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid #d1d5db',
              }}
            />

            <input
              value={newSubjectRate}
              onChange={(e) => setNewSubjectRate(e.target.value)}
              placeholder="Ставка по умолчанию"
              type="number"
              style={{
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid #d1d5db',
              }}
            />

            <button onClick={handleCreateSubject} disabled={creatingSubject}>
              {creatingSubject ? 'Создание...' : 'Создать предмет'}
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          background: '#fff',
          padding: '16px',
          borderRadius: '16px',
          border: '1px solid #e5e7eb',
        }}
      >
        {loading ? (
          <p>Загрузка...</p>
        ) : filteredCards.length === 0 ? (
          <p>Ученики не найдены</p>
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            {filteredCards.map(({ student, tutorStudent, subject }) => (
              <div
                key={student.id}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '16px',
                  padding: '16px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '16px',
                    alignItems: 'flex-start',
                  }}
                >
                  <div>
                    <h3 style={{ margin: '0 0 8px 0' }}>{student.full_name}</h3>
                    <p style={{ margin: '4px 0' }}>
                      <strong>Телефон:</strong> {student.phone_number || '—'}
                    </p>
                    <p style={{ margin: '4px 0' }}>
                      <strong>Класс:</strong> {student.grade || '—'}
                    </p>
                    <p style={{ margin: '4px 0' }}>
                      <strong>Предмет:</strong> {subject?.name || '—'}
                    </p>
                    <p style={{ margin: '4px 0' }}>
                      <strong>Тариф:</strong>{' '}
                      {tutorStudent?.hourly_rate ? `${tutorStudent.hourly_rate} ₽/ч` : '—'}
                    </p>
                    <p style={{ margin: '4px 0' }}>
                      <strong>Статус:</strong> {tutorStudent?.status || '—'}
                    </p>
                  </div>

                  {subject?.invitation_token && (
                    <button onClick={() => handleCopyToken(subject.invitation_token)}>
                      Скопировать token
                    </button>
                  )}
                </div>

                {tutorStudent && (
                  <div
                    style={{
                      display: 'flex',
                      gap: '12px',
                      marginTop: '16px',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <label>
                      Тариф:{' '}
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
                        style={{
                          padding: '8px',
                          borderRadius: '8px',
                          border: '1px solid #d1d5db',
                          width: '120px',
                        }}
                      />
                    </label>

                    <label>
                      Статус:{' '}
                      <select
                        value={tutorStudent.status}
                        onChange={(e) =>
                          handleUpdateTutorStudent(tutorStudent.id, {
                            status: e.target.value as TutorStudentStatus,
                          })
                        }
                        style={{
                          padding: '8px',
                          borderRadius: '8px',
                          border: '1px solid #d1d5db',
                        }}
                      >
                        <option value="active">active</option>
                        <option value="paused">paused</option>
                        <option value="completed">completed</option>
                      </select>
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}