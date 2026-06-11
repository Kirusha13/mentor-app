import { apiClient } from './client';

export interface Subscription {
  id: number;
  tutor_student_id: number;
  hours: number;
  price: number;
  start_date: string;   // YYYY-MM-DD
  created_at: string;
}

export interface CreateSubscriptionPayload {
  tutor_student_id: number;
  hours: number;
  price: number;
  start_date?: string | null;  // defaults to today server-side
}

export interface UpdateSubscriptionPayload {
  hours?: number;
  price?: number;
  start_date?: string;
}

export interface BackdateCheckResult {
  covered_paid_lessons: { id: number; starts_at: string }[];
}

export const getSubscriptionsByLink = async (linkId: number): Promise<Subscription[]> => {
  const response = await apiClient.get(`/subscriptions/by-link/${linkId}`);
  return response.data;
};

export const createSubscription = async (
  payload: CreateSubscriptionPayload
): Promise<Subscription> => {
  const response = await apiClient.post('/subscriptions', payload);
  return response.data;
};

export const updateSubscription = async (
  id: number,
  payload: UpdateSubscriptionPayload
): Promise<Subscription> => {
  const response = await apiClient.patch(`/subscriptions/${id}`, payload);
  return response.data;
};

export const deleteSubscription = async (id: number): Promise<void> => {
  await apiClient.delete(`/subscriptions/${id}`);
};

export const backdateCheck = async (
  linkId: number,
  startDate: string
): Promise<BackdateCheckResult> => {
  const response = await apiClient.get('/subscriptions/backdate-check', {
    params: { link_id: linkId, start_date: startDate },
  });
  return response.data;
};
