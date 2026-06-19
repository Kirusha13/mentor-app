import { apiClient } from './client';

export interface HomeworkQueueItem {
  lesson_id: number;
  tutor_student_id: number;
  student_name: string;
  starts_at: string;
  topic_id: number | null;
}

export interface HomeworkStats {
  total: number;
  assigned: number;
  skipped: number;
  pending: number;
  rate: number;
}

export const getHomeworkQueue = async (): Promise<HomeworkQueueItem[]> => {
  const response = await apiClient.get('/homework/queue');
  return response.data;
};

export const skipHomework = async (lessonId: number): Promise<void> => {
  await apiClient.post(`/homework/lessons/${lessonId}/skip`);
};

export const getHomeworkStats = async (): Promise<HomeworkStats> => {
  const response = await apiClient.get('/homework/stats');
  return response.data;
};
