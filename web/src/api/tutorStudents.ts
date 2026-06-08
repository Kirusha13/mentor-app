import { apiClient } from './client';

export type TutorStudentStatus = 'active' | 'paused' | 'completed' | 'pending';

export interface TutorStudent {
  id: number;
  status: TutorStudentStatus;
  hourly_rate: number;
  started_at: string;
  subscription_hours?: number | null;
  used_hours?: number | null;
  tutor_id: number;
  student_id: number;
  subject_id: number;
  level_ids: number[];
  tutor_name?: string;
  subject_name?: string;
}

export interface CreateTutorStudentPayload {
  student_id: number;
  subject_id: number;
  hourly_rate: number;
  started_at: string;
  subscription_hours?: number | null;
}

export interface UpdateTutorStudentPayload {
  hourly_rate?: number;
  status?: TutorStudentStatus;
  subscription_hours?: number | null;
  used_hours?: number | null;
  level_ids?: number[];
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

export const deleteTutorStudent = async (id: number): Promise<void> => {
  await apiClient.delete(`/tutor-students/${id}`);
};

export const approveTutorStudent = async (id: number): Promise<TutorStudent> => {
  const response = await apiClient.post(`/tutor-students/${id}/approve`);
  return response.data;
};

export const rejectTutorStudent = async (id: number): Promise<void> => {
  await apiClient.delete(`/tutor-students/${id}/reject`);
};
