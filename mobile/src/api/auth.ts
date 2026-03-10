import client from './client';

export interface TelegramAuthData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export async function studentLogin(data: TelegramAuthData): Promise<string> {
  const res = await client.post('/student/auth/login', data);
  return res.data.access_token;
}

export async function studentRegister(
  data: TelegramAuthData,
  invitation_token: string,
  full_name: string,
  phone_number: string,
): Promise<string> {
  const res = await client.post('/student/auth/register', {
    ...data,
    invitation_token,
    full_name,
    phone_number,
  });
  return res.data.access_token;
}
