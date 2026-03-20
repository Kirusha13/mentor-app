import { apiClient } from './client';

export interface Student {
  id: number;
  full_name: string;
  phone_number?: string | null;
  grade?: number | null;
  telegram_id?: number | null;
  avatar_url?: string | null;
  started_at?: string | null;
  last_visited_at?: string | null;
}

export const getStudents = async (): Promise<Student[]> => {
  const response = await apiClient.get('/students');
  return response.data;
};