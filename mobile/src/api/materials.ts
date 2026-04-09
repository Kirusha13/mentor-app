import client from './client';

export interface TheoryTopic {
  id: number;
  title: string;
  description: string | null;
  study_level: string[] | null;
  subject_id: number;
  parent_topic_id: number | null;
}

export interface Material {
  id: number;
  content_text: string | null;
  content_url: string | null;
  level: 'basic' | 'advanced';
  format: 'text' | 'pdf' | 'video' | 'presentation' | 'image' | 'link';
  topic_id: number;
}

export async function getTopics(params?: { subject_id?: number }): Promise<TheoryTopic[]> {
  const res = await client.get('/student/topics', { params });
  return res.data;
}

export async function getTopicContext(topicId: number): Promise<{ topic: TheoryTopic; allTopics: TheoryTopic[] }> {
  // Загружаем тему и все темы того же предмета для навигации
  const allTopics = await getTopics();
  const topic = allTopics.find(t => t.id === topicId);
  if (!topic) throw new Error('Тема не найдена');
  const subjectTopics = allTopics.filter(t => t.subject_id === topic.subject_id);
  return { topic, allTopics: subjectTopics };
}

export async function getMaterials(params?: { topic_id?: number }): Promise<Material[]> {
  const res = await client.get('/student/materials', { params });
  return res.data;
}
