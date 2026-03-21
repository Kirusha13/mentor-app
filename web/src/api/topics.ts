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

export const getTopics = async (params?: TopicQuery): Promise<TheoryTopic[]> => {
  const response = await apiClient.get('/theory-topics', { params });
  return response.data;
};
