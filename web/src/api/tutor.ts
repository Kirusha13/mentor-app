import { apiClient } from './client';

export interface TutorProfile {
  id: number;
  full_name: string;
  phone_number: string | null;
  telegram_id: number | null;
  vk_id: number | null;
  registered_at: string;
  last_visited_at: string | null;
  avatar_url: string | null;
}

export interface UpdateTutorProfilePayload {
  full_name?: string;
  phone_number?: string | null;
  avatar_url?: string | null;
}

export const getTutorProfile = async (): Promise<TutorProfile> => {
  const response = await apiClient.get('/tutors/me');
  return response.data;
};

export const updateTutorProfile = async (
  payload: UpdateTutorProfilePayload
): Promise<TutorProfile> => {
  const response = await apiClient.patch('/tutors/me', payload);
  return response.data;
};

export const linkVkAccount = async (params: {
  code: string;
  code_verifier: string;
  device_id: string;
}): Promise<TutorProfile> => {
  const response = await apiClient.post('/tutors/me/link-vk', params);
  return response.data;
};

export const linkTelegramAccount = async (
  params: Record<string, string>
): Promise<TutorProfile> => {
  const response = await apiClient.post('/tutors/me/link-telegram', params);
  return response.data;
};
