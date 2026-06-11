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
import {
  approveTutorStudent,
  rejectTutorStudent,
  getTutorStudents,
  type TutorStudent,
} from '../api/tutorStudents';
import { getApiErrorMessage } from '../utils/apiError';
import { lessonDateRu, lessonStartTime, lessonEndTime } from '../utils/lessonTime';

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
  const [processingConnectionId, setProcessingConnectionId] = useState<number | null>(null);

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

  const pendingConnections = useMemo(
    () => tutorStudents.filter((ts) => ts.status === 'pending'),
    [tutorStudents]
  );

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
        // Сколько ещё заявок на запись претендуют на это же пересекающееся время.
        const competing =
          lesson.conduct_status === 'booking_pending'
            ? requests.filter(
                (other) =>
                  other.id !== lesson.id &&
                  other.conduct_status === 'booking_pending' &&
                  new Date(other.starts_at) < new Date(lesson.ends_at) &&
                  new Date(other.ends_at) > new Date(lesson.starts_at)
              ).length
            : 0;
        return { lesson, relation, student, subject, competing };
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

      setLessons((prev) =>
        prev.map((item) => {
          if (item.id === updated.id) return updated;
          // Подтверждение записи авто-отклоняет конкурирующие заявки на
          // пересекающийся слот (см. approve_booking на бэкенде) — синхронизируем,
          // чтобы «призрачные» заявки не зависали в списке до перезагрузки.
          if (
            action === 'approve-booking' &&
            item.conduct_status === 'booking_pending' &&
            new Date(item.starts_at) < new Date(updated.ends_at) &&
            new Date(item.ends_at) > new Date(updated.starts_at)
          ) {
            return { ...item, conduct_status: 'booking_rejected' as const };
          }
          return item;
        })
      );
    } catch (error) {
      console.error('Ошибка обработки запроса:', error);
      alert(getApiErrorMessage(error, 'Не удалось обработать запрос'));
    } finally {
      setProcessingId(null);
    }
  };

  const handleConnection = async (ts: TutorStudent, action: 'approve' | 'reject') => {
    try {
      setProcessingConnectionId(ts.id);
      if (action === 'approve') {
        const updated = await approveTutorStudent(ts.id);
        setTutorStudents((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        await rejectTutorStudent(ts.id);
        setTutorStudents((prev) => prev.filter((item) => item.id !== ts.id));
      }
    } catch (error) {
      console.error('Ошибка обработки запроса:', error);
      alert(getApiErrorMessage(error, 'Не удалось обработать запрос'));
    } finally {
      setProcessingConnectionId(null);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {pendingConnections.length > 0 && (
        <section style={panelStyle}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1f2a3b', marginBottom: 14 }}>
            Запросы на подключение
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {pendingConnections.map((ts) => {
              const student = students.find((s) => s.id === ts.student_id);
              const subject = subjects.find((s) => s.id === ts.subject_id);
              return (
                <div
                  key={ts.id}
                  style={{
                    padding: 18,
                    borderRadius: 18,
                    background: 'rgba(217,119,6,0.06)',
                    border: '1px solid rgba(217,119,6,0.18)',
                    display: 'grid',
                    gap: 14,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ display: 'inline-flex', padding: '6px 10px', borderRadius: 999, background: 'rgba(217,119,6,0.12)', color: '#d97706', fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
                        Новый ученик
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#1f2a3b', marginBottom: 4 }}>
                        {student?.full_name ?? `Ученик #${ts.student_id}`}
                      </div>
                      <div style={{ color: '#5d6778', fontSize: 14 }}>
                        Предмет: {subject?.name ?? '—'} • Ставка: {ts.hourly_rate} ₽/ч
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => handleConnection(ts, 'approve')}
                      disabled={processingConnectionId === ts.id}
                      className="modal-success"
                    >
                      Принять
                    </button>
                    <button
                      onClick={() => handleConnection(ts, 'reject')}
                      disabled={processingConnectionId === ts.id}
                      className="modal-danger"
                    >
                      Отклонить
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section style={panelStyle}>
        {loading ? (
          <p style={{ color: '#687486', marginBottom: 0 }}>Загрузка запросов...</p>
        ) : withMeta.length === 0 ? (
          <p style={{ color: '#687486', marginBottom: 0 }}>Активных запросов сейчас нет.</p>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {withMeta.map(({ lesson, student, subject, competing }) => (
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
                      {subject?.name ?? 'Без предмета'} • {lessonDateRu(lesson)} • {toTime(lessonStartTime(lesson))} - {toTime(lessonEndTime(lesson))}
                    </div>
                    {competing > 0 && (
                      <div style={{ marginTop: 8, display: 'inline-flex', padding: '5px 10px', borderRadius: 999, background: 'rgba(217,119,6,0.1)', color: '#d97706', fontSize: 12, fontWeight: 700 }}>
                        На это время ещё {competing} {competing === 1 ? 'заявка' : competing < 5 ? 'заявки' : 'заявок'} — подтвердив одну, остальные отклонятся
                      </div>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, color: '#1f2a3b' }}>{lesson.cost ?? '—'} ₽</div>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {lesson.conduct_status === 'booking_pending' && (
                    <>
                      <button onClick={() => handleResolve(lesson, 'approve-booking')} disabled={processingId === lesson.id} className="modal-success">
                        Подтвердить запись
                      </button>
                      <button
                        onClick={() => handleResolve(lesson, 'reject-booking')}
                        disabled={processingId === lesson.id}
                        className="modal-danger"
                      >
                        Отклонить запись
                      </button>
                    </>
                  )}

                  {lesson.conduct_status === 'reschedule_pending' && (
                    <>
                      <button onClick={() => handleResolve(lesson, 'approve-reschedule')} disabled={processingId === lesson.id} className="modal-success">
                        Подтвердить перенос
                      </button>
                      <button
                        onClick={() => handleResolve(lesson, 'reject-reschedule')}
                        disabled={processingId === lesson.id}
                        className="modal-danger"
                      >
                        Отклонить перенос
                      </button>
                    </>
                  )}

                  {lesson.payment_status === 'payment_pending' && (
                    <>
                      <button onClick={() => handleResolve(lesson, 'approve-payment')} disabled={processingId === lesson.id} className="modal-success">
                        Подтвердить оплату
                      </button>
                      <button
                        onClick={() => handleResolve(lesson, 'reject-payment')}
                        disabled={processingId === lesson.id}
                        className="modal-danger"
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

