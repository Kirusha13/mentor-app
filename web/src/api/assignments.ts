import { apiClient } from './client';

export type CompletionStatus = 'assigned' | 'in_progress' | 'completed' | 'overdue';

export interface AssignmentLinkAttachment {
  label: string;
  url: string;
}

export interface AssignmentFileAttachment {
  name: string;
  type: string;
  size: number;
  data_url: string;
}

export interface AssignmentAttachments {
  links?: AssignmentLinkAttachment[];
  files?: AssignmentFileAttachment[];
}

export interface Assignment {
  id: number;
  title: string | null;
  description: string;
  deadline: string;
  completion_status: CompletionStatus;
  grade: number | null;
  grade_comment: string | null;
  attachments: AssignmentAttachments | null;
  student_comment: string | null;
  student_files: string[] | null;
  tutor_student_id: number;
  topic_id: number | null;
  created_at: string;
}

export interface AssignmentQuery {
  tutor_student_id?: number;
  completion_status?: CompletionStatus;
}

export interface CreateAssignmentPayload {
  tutor_student_id: number;
  title?: string;
  description: string;
  deadline: string;
  topic_id?: number;
  attachments?: AssignmentAttachments | null;
}

export interface UpdateAssignmentPayload {
  title?: string;
  description?: string;
  deadline?: string;
  completion_status?: CompletionStatus;
  grade?: number;
  grade_comment?: string | null;
  attachments?: AssignmentAttachments | null;
  topic_id?: number | null;
}

export const getAssignments = async (params?: AssignmentQuery): Promise<Assignment[]> => {
  const response = await apiClient.get('/assignments', { params });
  return response.data;
};

export const createAssignment = async (
  payload: CreateAssignmentPayload
): Promise<Assignment> => {
  const response = await apiClient.post('/assignments', payload);
  return response.data;
};

export const updateAssignment = async (
  id: number,
  payload: UpdateAssignmentPayload
): Promise<Assignment> => {
  const response = await apiClient.patch(`/assignments/${id}`, payload);
  return response.data;
};

export const deleteAssignment = async (id: number): Promise<void> => {
  await apiClient.delete(`/assignments/${id}`);
};
