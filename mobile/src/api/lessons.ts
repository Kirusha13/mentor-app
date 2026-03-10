import client from './client';

export interface Lesson {
  id: number;
  lesson_date: string;
  start_time: string;
  end_time: string;
  conduct_status: 'scheduled' | 'conducted' | 'cancelled' | 'rescheduled';
  payment_status: 'unpaid' | 'paid';
  cost: number;
  grade: number | null;
  tutor_student_id: number;
  topic_id: number | null;
  tutor_name: string | null;
  subject_name: string | null;
}

export async function getLessons(params?: {
  date_from?: string;
  date_to?: string;
}): Promise<Lesson[]> {
  const res = await client.get('/student/lessons', { params });
  return res.data;
}
