import { apiClient } from './client';

export interface TheoryTopic {
  id: number;
  title: string;
  description: string | null;
  study_level: string[] | null;
  tutor_id: number;
  subject_id: number;
  parent_topic_id: number | null;
  created_at: string;
}

export interface TopicQuery {
  subject_id?: number;
  parent_topic_id?: number;
}

export interface CreateTopicPayload {
  title: string;
  subject_id: number;
  description?: string | null;
  study_level?: string[] | null;
  parent_topic_id?: number | null;
}

export interface UpdateTopicPayload {
  title?: string;
  description?: string | null;
  study_level?: string[] | null;
  parent_topic_id?: number | null;
}

export const getTopics = async (params?: TopicQuery): Promise<TheoryTopic[]> => {
  const response = await apiClient.get('/theory-topics', { params });
  return response.data;
};

export const createTopic = async (payload: CreateTopicPayload): Promise<TheoryTopic> => {
  const response = await apiClient.post('/theory-topics', payload);
  return response.data;
};

export const updateTopic = async (
  id: number,
  payload: UpdateTopicPayload
): Promise<TheoryTopic> => {
  const response = await apiClient.patch(`/theory-topics/${id}`, payload);
  return response.data;
};

export const deleteTopic = async (id: number): Promise<void> => {
  await apiClient.delete(`/theory-topics/${id}`);
};
