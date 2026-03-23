import { apiClient } from './client';

export type TutorStudentStatus = 'active' | 'paused' | 'completed';

export interface TutorStudent {
  id: number;
  status: TutorStudentStatus;
  hourly_rate: number;
  started_at: string;
  subscription_lessons?: number | null;
  used_lessons?: number | null;
  tutor_id: number;
  student_id: number;
  subject_id: number;
  tutor_name?: string;
  subject_name?: string;
}

export interface CreateTutorStudentPayload {
  student_id: number;
  subject_id: number;
  hourly_rate: number;
  started_at: string;
  subscription_lessons?: number | null;
}

export interface UpdateTutorStudentPayload {
  hourly_rate?: number;
  status?: TutorStudentStatus;
  subscription_lessons?: number | null;
  used_lessons?: number | null;
}

export const getTutorStudents = async (): Promise<TutorStudent[]> => {
  const response = await apiClient.get('/tutor-students');
  return response.data;
};

export const createTutorStudent = async (
  payload: CreateTutorStudentPayload
): Promise<TutorStudent> => {
  const response = await apiClient.post('/tutor-students', payload);
  return response.data;
};

export const updateTutorStudent = async (
  id: number,
  payload: UpdateTutorStudentPayload
): Promise<TutorStudent> => {
  const response = await apiClient.patch(`/tutor-students/${id}`, payload);
  return response.data;
};
