import { apiClient } from './client';

export interface LessonSeries {
  id: number;
  tutor_student_id: number;
  weekday: number;
  start_time: string;
  duration_minutes: number;
  starts_on: string;
  ends_on: string | null;
  is_active: boolean;
}

export const listSeriesByLink = async (linkId: number): Promise<LessonSeries[]> => {
  const response = await apiClient.get(`/series/by-link/${linkId}`);
  return response.data;
};

export const createSeries = async (payload: {
  tutor_student_id: number;
  weekday: number;
  start_time: string;
  duration_minutes: number;
  starts_on?: string;
  ends_on?: string | null;
}): Promise<LessonSeries> => {
  const response = await apiClient.post('/series', payload);
  return response.data;
};

export const updateSeries = async (
  id: number,
  payload: Partial<Omit<LessonSeries, 'id' | 'tutor_student_id'>>
): Promise<LessonSeries> => {
  const response = await apiClient.patch(`/series/${id}`, payload);
  return response.data;
};

export const deleteSeries = async (id: number): Promise<void> => {
  await apiClient.delete(`/series/${id}`);
};
