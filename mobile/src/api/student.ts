import client from './client';
import { VKMobileAuthData } from './auth';

export interface TutorLevel {
  id: number;
  name: string;
  sort_order: number;
}

export interface StudentProfile {
  id: number;
  full_name: string;
  grade: number | null;
  phone_number: string | null;
  telegram_id: number | null;
  vk_id: number | null;
  started_at: string;
  last_visited_at: string | null;
  avatar_url: string | null;
}

export interface TelegramLinkData {
  id: number;
  hash: string;
  auth_date: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

export interface TutorStudent {
  id: number;
  tutor_id: number;
  student_id: number;
  subject_id: number;
  status: 'active' | 'paused' | 'completed' | 'pending';
  hourly_rate: number;
  started_at: string;
  subscription_hours: number | null;
  used_hours: number | null;
  tutor_name: string | null;
  subject_name: string | null;
  level_ids: number[];
}

export async function getStudentMe(): Promise<StudentProfile> {
  const res = await client.get('/student/me');
  return res.data;
}

export async function getTutors(): Promise<TutorStudent[]> {
  const res = await client.get('/student/tutors');
  return res.data;
}

export async function getLevels(): Promise<TutorLevel[]> {
  const res = await client.get('/student/levels');
  return res.data;
}

export async function updateStudentMe(data: { full_name?: string; phone_number?: string | null; grade?: number | null }): Promise<StudentProfile> {
  const res = await client.patch('/student/me', data);
  return res.data;
}

export async function linkVkStudent(data: VKMobileAuthData): Promise<StudentProfile> {
  const res = await client.post('/student/me/link-vk', data);
  return res.data;
}

export async function linkTelegramStudent(data: TelegramLinkData): Promise<StudentProfile> {
  const res = await client.post('/student/me/link-telegram', data);
  return res.data;
}

export async function uploadStudentAvatar(uri: string): Promise<StudentProfile> {
  const formData = new FormData();
  const filename = uri.split('/').pop() ?? 'avatar.jpg';
  const ext = filename.split('.').pop() ?? 'jpg';
  formData.append('file', { uri, name: filename, type: `image/${ext}` } as any);
  const res = await client.post('/student/me/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}
