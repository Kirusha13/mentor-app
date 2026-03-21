import client from './client';

export interface Lesson {
  id: number;
  lesson_date: string;
  start_time: string;
  end_time: string;
  conduct_status: 'scheduled' | 'conducted' | 'cancelled' | 'rescheduled' | 'reschedule_pending' | 'reschedule_rejected' | 'booking_pending' | 'booking_rejected';
  payment_status: 'unpaid' | 'paid';
  cost: number | null;
  grade: number | null;
  tutor_student_id: number | null;
  topic_id: number | null;
  original_lesson_id: number | null;
  tutor_name: string | null;
  subject_name: string | null;
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
