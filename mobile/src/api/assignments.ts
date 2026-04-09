import client from './client';

export interface AssignmentLinkAttachment {
  label: string;
  url: string;
}

export interface AssignmentFileAttachment {
  name: string;
  type: string;
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
  completion_status: 'assigned' | 'in_progress' | 'completed' | 'overdue';
  grade: number | null;
  attachments: AssignmentAttachments | null;
  student_comment: string | null;
  student_files: string[] | null;
  tutor_student_id: number;
  topic_id: number | null;
  topic_title: string | null;
  updated_at: string;
}

export async function getAssignments(params?: {
  completion_status?: string;
}): Promise<Assignment[]> {
  const res = await client.get('/student/assignments', { params });
  return res.data;
}

export async function updateAssignment(
  id: number,
  data: { completion_status?: Assignment['completion_status']; student_comment?: string },
): Promise<Assignment> {
  const res = await client.patch(`/student/assignments/${id}`, data);
  return res.data;
}

export async function uploadAssignmentPhoto(
  id: number,
  uri: string,
  filename: string,
): Promise<Assignment> {
  const formData = new FormData();
  formData.append('file', {
    uri,
    name: filename,
    type: 'image/jpeg',
  } as unknown as Blob);
  const res = await client.post(`/student/assignments/${id}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function deleteAssignmentPhoto(
  id: number,
  fileUrl: string,
): Promise<Assignment> {
  const res = await client.delete(`/student/assignments/${id}/upload`, {
    params: { file_url: fileUrl },
  });
  return res.data;
}
