import { apiClient } from './client';

export interface AvailabilityRule {
  id: number;
  weekday: number; // 0=Пн
  start_time: string; // "14:00:00"
  end_time: string;
  effective_from: string;
  effective_until: string | null;
}

export interface DayWindow {
  start_time: string;
  end_time: string;
}

export interface DayOverride {
  date: string;
  overridden: boolean;
  closed: boolean;
  windows: DayWindow[];
}

export interface ComputedWindow {
  date: string;
  start_time: string;
  end_time: string;
}

export interface SaveResult {
  conflicts: { lesson_id: number; starts_at: string; student_name: string | null }[];
  rejected_bookings: number;
}

export const listRules = async (): Promise<AvailabilityRule[]> => {
  const response = await apiClient.get('/availability/rules');
  return response.data;
};

export const replaceRules = async (
  rules: { weekday: number; start_time: string; end_time: string }[]
): Promise<SaveResult> => {
  const response = await apiClient.put('/availability/rules', rules);
  return response.data;
};

export const getDay = async (day: string): Promise<DayOverride> => {
  const response = await apiClient.get(`/availability/day/${day}`);
  return response.data;
};

export const saveDay = async (
  day: string,
  payload: { closed: boolean; windows: DayWindow[] }
): Promise<SaveResult> => {
  const response = await apiClient.put(`/availability/day/${day}`, payload);
  return response.data;
};

export const getWindows = async (from: string, to: string): Promise<ComputedWindow[]> => {
  const response = await apiClient.get('/availability/windows', {
    params: { date_from: from, date_to: to },
  });
  return response.data;
};
