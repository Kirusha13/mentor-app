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

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export const loginWithTelegram = async (
  data: TelegramAuthData
): Promise<LoginResponse> => {
  const response = await apiClient.post('/auth/login', data);
  return response.data;
};