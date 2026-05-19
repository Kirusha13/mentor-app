import { useEffect, useMemo, useState } from 'react';
import {
  approveBooking,
  approveReschedule,
  confirmPayment,
  getLessons,
  rejectBooking,
  rejectReschedule,
  type Lesson,
} from '../api/lessons';
import { getStudents, type Student } from '../api/students';
import { getSubjects, type Subject } from '../api/subjects';
import { getTutorStudents, type TutorStudent } from '../api/tutorStudents';
import { getApiErrorMessage } from '../utils/apiError';
import { lessonDate, lessonStartTime, lessonEndTime } from '../utils/lessonTime';

const panelStyle = {
  background: 'rgba(255,255,255,0.88)',
  padding: '20px',
  borderRadius: '22px',
  border: '1px solid rgba(24,33,47,0.08)',
  boxShadow: 'var(--shadow-card)',
} as const;

function toTime(value: string) {
  return value.slice(0, 5);
}

function requestTitle(lesson: Lesson) {
  if (lesson.payment_status === 'payment_pending') return 'Подтверждение оплаты';
  if (lesson.conduct_status === 'booking_pending') return 'Запрос на запись';
  if (lesson.conduct_status === 'reschedule_pending') return 'Запрос на перенос';
  return 'Запрос';
}

export default function RequestsPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [tutorStudents, setTutorStudents] = useState<TutorStudent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [lessonData, tutorStudentData, studentData, subjectData] = await Promise.all([
          getLessons(),
          getTutorStudents(),
          getStudents(),
          getSubjects(),
        ]);
        setLessons(lessonData);
        setTutorStudents(tutorStudentData);
        setStudents(studentData);
        setSubjects(subjectData);
      } catch (error) {
        console.error('Ошибка загрузки запросов:', error);
        alert(getApiErrorMessage(error, 'Не удалось загрузить запросы'));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const requests = useMemo(
    () =>
      lessons.filter(
        (lesson) =>
          lesson.conduct_status === 'booking_pending' ||
          lesson.conduct_status === 'reschedule_pending' ||
          lesson.payment_status === 'payment_pending'
      ),
    [lessons]
  );

  const withMeta = useMemo(
    () =>
      requests.map((lesson) => {
        const relation = tutorStudents.find((item) => item.id === lesson.tutor_student_id);
        const student = students.find((item) => item.id === relation?.student_id);
        const subject = subjects.find((item) => item.id === relation?.subject_id);
        return { lesson, relation, student, subject };
      }),
    [requests, tutorStudents, students, subjects]
  );

  const handleResolve = async (
    lesson: Lesson,
    action: 'approve-booking' | 'reject-booking' | 'approve-reschedule' | 'reject-reschedule' | 'approve-payment' | 'reject-payment'
  ) => {
    try {
      setProcessingId(lesson.id);
      let updated: Lesson;

      if (action === 'approve-booking') updated = await approveBooking(lesson.id);
      else if (action === 'reject-booking') updated = await rejectBooking(lesson.id);
      else if (action === 'approve-reschedule') updated = await approveReschedule(lesson.id);
      else if (action === 'reject-reschedule') updated = await rejectReschedule(lesson.id);
      else if (action === 'approve-payment') updated = await confirmPayment(lesson.id, { confirm: true });
      else updated = await confirmPayment(lesson.id, { confirm: false });

      setLessons((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      console.error('Ошибка обработки запроса:', error);
      alert(getApiErrorMessage(error, 'Не удалось обработать запрос'));
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div>
      <section style={panelStyle}>
        {loading ? (
          <p style={{ color: '#687486', marginBottom: 0 }}>Загрузка запросов...</p>
        ) : withMeta.length === 0 ? (
          <p style={{ color: '#687486', marginBottom: 0 }}>Активных запросов сейчас нет.</p>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {withMeta.map(({ lesson, student, subject }) => (
              <div
                key={lesson.id}
                style={{
                  padding: 18,
                  borderRadius: 18,
                  background: 'rgba(23,32,51,0.04)',
                  border: '1px solid rgba(24,33,47,0.06)',
                  display: 'grid',
                  gap: 14,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'inline-flex', padding: '6px 10px', borderRadius: 999, background: 'rgba(42,171,238,0.12)', color: '#2AABEE', fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
                      {requestTitle(lesson)}
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#1f2a3b', marginBottom: 6 }}>
                      {student?.full_name ?? 'Ученик'}
                    </div>
                    <div style={{ color: '#5d6778' }}>
                      {subject?.name ?? 'Без предмета'} • {lessonDate(lesson)} • {toTime(lessonStartTime(lesson))} - {toTime(lessonEndTime(lesson))}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, color: '#1f2a3b' }}>{lesson.cost ?? '—'} ₽</div>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {lesson.conduct_status === 'booking_pending' && (
                    <>
                      <button onClick={() => handleResolve(lesson, 'approve-booking')} disabled={processingId === lesson.id}>
                        Подтвердить запись
                      </button>
                      <button
                        onClick={() => handleResolve(lesson, 'reject-booking')}
                        disabled={processingId === lesson.id}
                        style={{ background: '#F44336', boxShadow: 'none' }}
                      >
                        Отклонить запись
                      </button>
                    </>
                  )}

                  {lesson.conduct_status === 'reschedule_pending' && (
                    <>
                      <button onClick={() => handleResolve(lesson, 'approve-reschedule')} disabled={processingId === lesson.id}>
                        Подтвердить перенос
                      </button>
                      <button
                        onClick={() => handleResolve(lesson, 'reject-reschedule')}
                        disabled={processingId === lesson.id}
                        style={{ background: '#F44336', boxShadow: 'none' }}
                      >
                        Отклонить перенос
                      </button>
                    </>
                  )}

                  {lesson.payment_status === 'payment_pending' && (
                    <>
                      <button onClick={() => handleResolve(lesson, 'approve-payment')} disabled={processingId === lesson.id}>
                        Подтвердить оплату
                      </button>
                      <button
                        onClick={() => handleResolve(lesson, 'reject-payment')}
                        disabled={processingId === lesson.id}
                        style={{ background: '#F44336', boxShadow: 'none' }}
                      >
                        Отклонить оплату
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
