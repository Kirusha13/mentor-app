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

export interface CreateStudentPayload {
  full_name: string;
  telegram_id: number;
  grade?: number;
  phone_number?: string;
}

export interface UpdateStudentPayload {
  full_name?: string;
  grade?: number;
  phone_number?: string;
  avatar_url?: string;
}

export const getStudents = async (): Promise<Student[]> => {
  const response = await apiClient.get('/students');
  return response.data;
};

export const createStudent = async (
  payload: CreateStudentPayload
): Promise<Student> => {
  const response = await apiClient.post('/students', payload);
  return response.data;
};

export const updateStudent = async (
  id: number,
  payload: UpdateStudentPayload
): Promise<Student> => {
  const response = await apiClient.patch(`/students/${id}`, payload);
  return response.data;
};
