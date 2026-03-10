import client from './client';

export interface StudentProfile {
  id: number;
  full_name: string;
  grade: number | null;
  phone_number: string | null;
  telegram_id: number;
  started_at: string;
  last_visited_at: string | null;
  avatar_url: string | null;
}

export async function getStudentMe(): Promise<StudentProfile> {
  const res = await client.get('/student/me');
  return res.data;
}
