import { apiClient } from './client';

export interface TelegramAuthData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
  client_timezone?: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export const loginWithTelegram = async (
  data: TelegramAuthData
): Promise<LoginResponse> => {
  const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const response = await apiClient.post('/auth/login', { ...data, client_timezone: detectedTz });
  return response.data;
};