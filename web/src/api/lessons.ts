import { apiClient } from './client';

export type ConductStatus =
  | 'scheduled'
  | 'conducted'
  | 'cancelled'
  | 'rescheduled'
  | 'reschedule_pending'
  | 'reschedule_rejected';

export type PaymentStatus = 'unpaid' | 'paid';

export interface Lesson {
  id: number;
  lesson_date: string;
  start_time: string;
  end_time: string;
  conduct_status: ConductStatus;
  payment_status: PaymentStatus;
  cost: number | null;
  grade: number | null;
  tutor_student_id: number | null;
  tutor_id: number | null;
  topic_id: number | null;
  original_lesson_id: number | null;
  created_at: string;
  tutor_name?: string | null;
  subject_name?: string | null;
}

export interface CreateLessonPayload {
  tutor_student_id: number;
  lesson_date: string;
  start_time: string;
  end_time: string;
  cost: number;
  topic_id?: number;
}

export interface UpdateLessonPayload {
  lesson_date?: string;
  start_time?: string;
  end_time?: string;
  conduct_status?: ConductStatus;
  payment_status?: PaymentStatus;
  cost?: number;
  grade?: number;
  topic_id?: number | null;
}

export interface RescheduleLessonPayload {
  new_date: string;
  new_start_time: string;
  new_end_time: string;
}

export interface LessonQuery {
  date_from?: string;
  date_to?: string;
  tutor_student_id?: number;
}

export const getLessons = async (params?: LessonQuery): Promise<Lesson[]> => {
  const response = await apiClient.get('/lessons', { params });
  return response.data;
};

export const createLesson = async (payload: CreateLessonPayload): Promise<Lesson> => {
  const response = await apiClient.post('/lessons', payload);
  return response.data;
};

export const updateLesson = async (
  id: number,
  payload: UpdateLessonPayload
): Promise<Lesson> => {
  const response = await apiClient.patch(`/lessons/${id}`, payload);
  return response.data;
};

export const rescheduleLesson = async (
  id: number,
  payload: RescheduleLessonPayload
): Promise<Lesson> => {
  const response = await apiClient.post(`/lessons/${id}/reschedule`, payload);
  return response.data;
};
