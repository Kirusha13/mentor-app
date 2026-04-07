import { apiClient } from './client';

export type MaterialLevel = 'basic' | 'advanced';
export type MaterialFormat = 'text' | 'pdf' | 'video' | 'presentation' | 'image' | 'link';

export interface Material {
  id: number;
  content_text: string | null;
  content_url: string | null;
  level: MaterialLevel;
  format: MaterialFormat;
  topic_id: number;
  tutor_id: number;
  created_at: string;
}

export interface MaterialsQuery {
  topic_id?: number;
  level?: MaterialLevel;
  format?: MaterialFormat;
}

export interface CreateMaterialPayload {
  topic_id: number;
  level: MaterialLevel;
  format: MaterialFormat;
  content_text?: string | null;
  content_url?: string | null;
}

export interface UpdateMaterialPayload {
  level?: MaterialLevel;
  format?: MaterialFormat;
  content_text?: string | null;
  content_url?: string | null;
}

export const getMaterials = async (params?: MaterialsQuery): Promise<Material[]> => {
  const response = await apiClient.get('/materials', { params });
  return response.data;
};

export const createMaterial = async (
  payload: CreateMaterialPayload
): Promise<Material> => {
  const response = await apiClient.post('/materials', payload);
  return response.data;
};

export const updateMaterial = async (
  id: number,
  payload: UpdateMaterialPayload
): Promise<Material> => {
  const response = await apiClient.patch(`/materials/${id}`, payload);
  return response.data;
};

export const deleteMaterial = async (id: number): Promise<void> => {
  await apiClient.delete(`/materials/${id}`);
};
