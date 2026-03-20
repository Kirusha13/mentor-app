import { apiClient } from './client';

export interface Subject {
  id: number;
  name: string;
  tutor_id: number;
  invitation_token: string;
  default_rate: number;
  color?: string | null;
}

export interface CreateSubjectPayload {
  name: string;
  default_rate: number;
  color?: string;
}

export interface UpdateSubjectPayload {
  name?: string;
  default_rate?: number;
  color?: string;
}

export const getSubjects = async (): Promise<Subject[]> => {
  const response = await apiClient.get('/subjects');
  return response.data;
};

export const createSubject = async (
  payload: CreateSubjectPayload
): Promise<Subject> => {
  const response = await apiClient.post('/subjects', payload);
  return response.data;
};

export const updateSubject = async (
  id: number,
  payload: UpdateSubjectPayload
): Promise<Subject> => {
  const response = await apiClient.patch(`/subjects/${id}`, payload);
  return response.data;
};

export const deleteSubject = async (id: number): Promise<void> => {
  await apiClient.delete(`/subjects/${id}`);
};
