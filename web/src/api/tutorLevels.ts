import { apiClient } from './client';

export interface TutorLevel {
  id: number;
  tutor_id: number;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface CreateTutorLevelPayload {
  name: string;
  sort_order?: number;
}

export interface UpdateTutorLevelPayload {
  name?: string;
  sort_order?: number;
}

export const getTutorLevels = async (): Promise<TutorLevel[]> => {
  const response = await apiClient.get('/tutor-levels');
  return response.data;
};

export const createTutorLevel = async (
  payload: CreateTutorLevelPayload
): Promise<TutorLevel> => {
  const response = await apiClient.post('/tutor-levels', payload);
  return response.data;
};

export const updateTutorLevel = async (
  id: number,
  payload: UpdateTutorLevelPayload
): Promise<TutorLevel> => {
  const response = await apiClient.patch(`/tutor-levels/${id}`, payload);
  return response.data;
};

export const deleteTutorLevel = async (id: number): Promise<void> => {
  await apiClient.delete(`/tutor-levels/${id}`);
};
