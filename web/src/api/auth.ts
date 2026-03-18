import { apiClient } from './client';

export interface TelegramAuthData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export const loginWithTelegram = async (data: TelegramAuthData) => {
  const response = await apiClient.post('/api/v1/auth/login', data);
  return response.data;
};