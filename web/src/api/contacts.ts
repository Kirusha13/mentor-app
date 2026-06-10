import { apiClient } from './client';

export type RelationshipType = 'parent' | 'guardian' | 'other';

export interface Contact {
  id: number;
  full_name: string;
  phone_number: string | null;
  telegram_id: number | null;
  added_at: string;
}

export interface StudentContact {
  id: number;
  relationship_type: RelationshipType;
  student_id: number;
  contact_id: number;
  contact: Contact;
}

export interface CreateContactPayload {
  full_name: string;
  phone_number?: string;
  telegram_id?: number;
}

export interface UpdateContactPayload {
  full_name?: string;
  phone_number?: string;
  telegram_id?: number;
}

export interface CreateStudentContactPayload {
  contact_id: number;
  relationship_type: RelationshipType;
}

export const createContact = async (payload: CreateContactPayload): Promise<Contact> => {
  const response = await apiClient.post('/contacts', payload);
  return response.data;
};

export const updateContact = async (
  contactId: number,
  payload: UpdateContactPayload
): Promise<Contact> => {
  const response = await apiClient.patch(`/contacts/${contactId}`, payload);
  return response.data;
};

export const getStudentContacts = async (studentId: number): Promise<StudentContact[]> => {
  const response = await apiClient.get(`/contacts/student/${studentId}`);
  return response.data;
};

export const addStudentContact = async (
  studentId: number,
  payload: CreateStudentContactPayload
): Promise<StudentContact> => {
  const response = await apiClient.post(`/contacts/student/${studentId}`, payload);
  return response.data;
};

export const removeStudentContact = async (
  studentId: number,
  studentContactId: number
): Promise<void> => {
  await apiClient.delete(`/contacts/student/${studentId}/${studentContactId}`);
};

export interface ContactTelegramLink {
  link: string;
  linked: boolean;
}

export const getContactTelegramLink = async (
  contactId: number
): Promise<ContactTelegramLink> => {
  const response = await apiClient.get(`/contacts/${contactId}/telegram-link`);
  return response.data;
};
