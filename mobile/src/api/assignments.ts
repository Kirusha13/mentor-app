import client from './client';

export interface Assignment {
  id: number;
  title: string | null;
  description: string;
  deadline: string;
  completion_status: 'assigned' | 'in_progress' | 'completed' | 'overdue';
  grade: number | null;
  attachments: Record<string, unknown> | null;
  tutor_student_id: number;
  topic_id: number | null;
}

export async function getAssignments(params?: {
  completion_status?: string;
}): Promise<Assignment[]> {
  const res = await client.get('/student/assignments', { params });
  return res.data;
}

export async function updateAssignmentStatus(
  id: number,
  completion_status: Assignment['completion_status'],
): Promise<Assignment> {
  const res = await client.patch(`/student/assignments/${id}`, { completion_status });
  return res.data;
}
