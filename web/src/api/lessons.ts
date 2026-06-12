import { apiClient } from './client';

export type ConductStatus =
  | 'scheduled'
  | 'conducted'
  | 'cancelled'
  | 'rescheduled'
  | 'reschedule_pending'
  | 'reschedule_rejected'
  | 'booking_pending'
  | 'booking_rejected';

export type PaymentStatus = 'unpaid' | 'payment_pending' | 'paid';

export interface Lesson {
  id: number;
  starts_at: string;
  ends_at: string;
  conduct_status: ConductStatus;
  payment_status: PaymentStatus;
  cost: number | null;
  grade: number | null;
  tutor_note: string | null;
  grade_comment: string | null;
  student_note: string | null;
  tutor_student_id: number | null;
  tutor_id: number | null;
  topic_id: number | null;
  original_lesson_id: number | null;
  created_at: string;
  tutor_name?: string | null;
  subject_name?: string | null;
  subscription_covered?: boolean;
  attendance_confirmed?: boolean;
}

export interface CreateLessonPayload {
  tutor_student_id: number;
  starts_at: string;
  ends_at: string;
  cost?: number;
  topic_id?: number;
}

export interface UpdateLessonPayload {
  starts_at?: string;
  ends_at?: string;
  conduct_status?: ConductStatus;
  payment_status?: PaymentStatus;
  cost?: number;
  grade?: number;
  tutor_note?: string | null;
  grade_comment?: string | null;
  topic_id?: number | null;
}

export interface RescheduleLessonPayload {
  new_starts_at: string;
  new_ends_at: string;
}

export interface ConfirmPaymentPayload {
  confirm: boolean;
}

export interface LessonQuery {
  date_from?: string;
  date_to?: string;
  tutor_student_id?: number;
}

export interface PendingCountResponse {
  count: number;
}

export const getLessons = async (params?: LessonQuery): Promise<Lesson[]> => {
  const response = await apiClient.get('/lessons', { params });
  return response.data;
};

export const getPendingCount = async (): Promise<PendingCountResponse> => {
  const response = await apiClient.get('/lessons/pending-count');
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

export const approveBooking = async (id: number): Promise<Lesson> => {
  const response = await apiClient.post(`/lessons/${id}/approve-booking`);
  return response.data;
};

export const rejectBooking = async (id: number): Promise<Lesson> => {
  const response = await apiClient.post(`/lessons/${id}/reject-booking`);
  return response.data;
};

export const approveReschedule = async (id: number): Promise<Lesson> => {
  const response = await apiClient.post(`/lessons/${id}/approve-reschedule`);
  return response.data;
};

export const rejectReschedule = async (id: number): Promise<Lesson> => {
  const response = await apiClient.post(`/lessons/${id}/reject-reschedule`);
  return response.data;
};

export const confirmPayment = async (
  id: number,
  payload: ConfirmPaymentPayload
): Promise<Lesson> => {
  const response = await apiClient.post(`/lessons/${id}/confirm-payment`, payload);
  return response.data;
};

export const deleteLesson = async (id: number): Promise<void> => {
  await apiClient.delete(`/lessons/${id}`);
};
