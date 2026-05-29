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

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow';
  } catch {
    return 'Europe/Moscow';
  }
}

export async function studentLogin(data: TelegramAuthData): Promise<string> {
  const res = await client.post('/student/auth/login', { ...data, client_timezone: detectTimezone() });
  return res.data.access_token;
}

export async function studentRegister(
  data: TelegramAuthData,
  invitation_token: string,
  full_name: string,
  phone_number: string,
  grade?: number,
): Promise<string> {
  const res = await client.post('/student/auth/register', {
    ...data,
    invitation_token,
    full_name,
    phone_number,
    ...(grade !== undefined && { grade }),
    client_timezone: detectTimezone(),
  });
  return res.data.access_token;
}

export interface VKMobileAuthData {
  vk_id: number;
  first_name: string;
  last_name?: string;
  photo_url?: string;
  expires_at: string;
  sign: string;
}

export async function studentLoginVK(data: VKMobileAuthData): Promise<string> {
  const res = await client.post('/student/auth/vk-login', {
    ...data,
    client_timezone: detectTimezone(),
  });
  return res.data.access_token;
}

export async function studentRegisterVK(
  data: VKMobileAuthData,
  invitation_token: string,
  full_name: string,
  phone_number: string,
  grade?: number,
): Promise<string> {
  const res = await client.post('/student/auth/vk-register', {
    ...data,
    invitation_token,
    full_name,
    phone_number,
    ...(grade !== undefined && { grade }),
    client_timezone: detectTimezone(),
  });
  return res.data.access_token;
}
