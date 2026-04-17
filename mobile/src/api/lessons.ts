import client from './client';

export interface Lesson {
  id: number;
  lesson_date: string;
  start_time: string;
  end_time: string;
  conduct_status: 'scheduled' | 'conducted' | 'cancelled' | 'rescheduled' | 'reschedule_pending' | 'reschedule_rejected' | 'booking_pending' | 'booking_rejected';
  payment_status: 'unpaid' | 'payment_pending' | 'paid';
  cost: number | null;
  grade: number | null;
  grade_comment: string | null;
  student_note: string | null;
  tutor_student_id: number | null;
  topic_id: number | null;
  original_lesson_id: number | null;
  tutor_name: string | null;
  subject_name: string | null;
  topic_title: string | null;
}

export interface AvailableSlot {
  lesson_date: string;
  start_time: string;
  end_time: string;
  tutor_id: number;
  tutor_name: string | null;
}

export async function getLessons(params?: {
  date_from?: string;
  date_to?: string;
}): Promise<Lesson[]> {
  const res = await client.get('/student/lessons', { params });
  return res.data;
}

export async function getAvailableWindows(): Promise<AvailableSlot[]> {
  const res = await client.get('/student/windows');
  return res.data;
}

export async function bookLesson(data: {
  tutor_student_id: number;
  lesson_date: string;
  start_time: string;
  end_time: string;
}): Promise<Lesson> {
  const res = await client.post('/student/lessons', data);
  return res.data;
}

export async function requestReschedule(
  lessonId: number,
  data: { lesson_date: string; start_time: string; end_time: string }
): Promise<Lesson> {
  const res = await client.post(`/student/reschedule/${lessonId}`, data);
  return res.data;
}

export async function reportPayment(lessonId: number): Promise<Lesson> {
  const res = await client.post(`/student/lessons/${lessonId}/report-payment`);
  return res.data;
}

export async function updateLessonNote(lessonId: number, note: string | null): Promise<Lesson> {
  const res = await client.patch(`/student/lessons/${lessonId}/note`, { student_note: note });
  return res.data;
}
