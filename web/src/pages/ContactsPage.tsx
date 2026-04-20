import { useEffect, useMemo, useState } from 'react';
import {
  addStudentContact,
  createContact,
  getStudentContacts,
  removeStudentContact,
  updateContact,
  type RelationshipType,
  type StudentContact,
} from '../api/contacts';
import { getStudents, type Student } from '../api/students';
import { getSubjects, type Subject } from '../api/subjects';
import { getTutorStudents, type TutorStudent } from '../api/tutorStudents';

interface ContactRecord {
  student: Student;
  subject?: Subject;
  tutorStudent?: TutorStudent;
  studentContact: StudentContact;
}

interface ContactDraft {
  full_name: string;
  phone_number: string;
  telegram_id: string;
}

const panelStyle = {
  background: 'rgba(255,255,255,0.9)',
  padding: '16px',
  borderRadius: '18px',
  border: '1px solid rgba(24,33,47,0.08)',
  boxShadow: 'var(--shadow-card)',
} as const;

const relationshipLabels: Record<RelationshipType, string> = {
  parent: 'Родитель',
  guardian: 'Опекун',
  other: 'Другое',
};

const emptyDraft = (): ContactDraft => ({
  full_name: '',
  phone_number: '',
  telegram_id: '',
});

export default function ContactsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [tutorStudents, setTutorStudents] = useState<TutorStudent[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [contactsByStudent, setContactsByStudent] = useState<Record<number, StudentContact[]>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [contactStudentId, setContactStudentId] = useState('');
  const [contactRelationship, setContactRelationship] = useState<RelationshipType>('parent');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactTelegramId, setContactTelegramId] = useState('');
  const [creatingContact, setCreatingContact] = useState(false);

  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState<ContactDraft>(emptyDraft);
  const [savingContactId, setSavingContactId] = useState<number | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);

      const [studentsData, tutorStudentsData, subjectsData] = await Promise.all([
        getStudents(),
        getTutorStudents(),
        getSubjects(),
      ]);

      setStudents(studentsData);
      setTutorStudents(tutorStudentsData);
      setSubjects(subjectsData);

      const contactEntries = await Promise.all(
        studentsData.map(async (student) => {
          const contacts = await getStudentContacts(student.id);
          return [student.id, contacts] as const;
        })
      );

      setContactsByStudent(Object.fromEntries(contactEntries));
    } catch (error) {
      console.error('Ошибка загрузки контактной книжки:', error);
      alert('Не удалось загрузить контактную книжку');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!students.length) {
      setContactStudentId('');
      return;
    }

    setContactStudentId((current) => {
      if (current && students.some((student) => String(student.id) === current)) {
        return current;
      }
      return String(students[0].id);
    });
  }, [students]);

  const records = useMemo<ContactRecord[]>(() => {
    return students.flatMap((student) => {
      const tutorStudent = tutorStudents.find((item) => item.student_id === student.id);
      const subject = subjects.find((item) => item.id === tutorStudent?.subject_id);

      return (contactsByStudent[student.id] ?? []).map((studentContact) => ({
        student,
        tutorStudent,
        subject,
        studentContact,
      }));
    });
  }, [contactsByStudent, students, subjects, tutorStudents]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return records;
    }

    return records.filter((record) => {
      const text = `${record.student.full_name} ${record.subject?.name ?? ''} ${
        record.studentContact.contact.full_name
      } ${record.studentContact.contact.phone_number ?? ''} ${
        record.studentContact.contact.telegram_id ?? ''
      } ${relationshipLabels[record.studentContact.relationship_type]}`.toLowerCase();

      return text.includes(query);
    });
  }, [records, search]);

  const selectedRecord = useMemo(
    () => records.find((record) => record.studentContact.id === selectedRecordId) ?? null,
    [records, selectedRecordId]
  );

  const resetCreateForm = () => {
    setContactRelationship('parent');
    setContactName('');
    setContactPhone('');
    setContactTelegramId('');
  };

  const closeDetails = () => {
    setDetailsOpen(false);
    setEditingContactId(null);
    setEditingDraft(emptyDraft());
  };

  const handleCreateContact = async () => {
    if (!contactStudentId || !contactName.trim()) {
      alert('Выбери ученика и укажи ФИО контактного лица');
      return;
    }

    if (!contactPhone.trim() && !contactTelegramId.trim()) {
      alert('Укажи номер телефона или Telegram ID');
      return;
    }

    try {
      setCreatingContact(true);

      const contact = await createContact({
        full_name: contactName.trim(),
        phone_number: contactPhone.trim() || undefined,
        telegram_id: contactTelegramId.trim() ? Number(contactTelegramId) : undefined,
      });

      const linked = await addStudentContact(Number(contactStudentId), {
        contact_id: contact.id,
        relationship_type: contactRelationship,
      });

      setContactsByStudent((prev) => ({
        ...prev,
        [Number(contactStudentId)]: [...(prev[Number(contactStudentId)] ?? []), linked],
      }));

      resetCreateForm();
      setCreateModalOpen(false);
      alert('Контактное лицо добавлено');
    } catch (error) {
      console.error('Ошибка создания контактного лица:', error);
      alert('Не удалось создать контактное лицо');
    } finally {
      setCreatingContact(false);
    }
  };

  const startEditingContact = (record: ContactRecord) => {
    setEditingContactId(record.studentContact.contact.id);
    setEditingDraft({
      full_name: record.studentContact.contact.full_name,
      phone_number: record.studentContact.contact.phone_number ?? '',
      telegram_id: record.studentContact.contact.telegram_id
        ? String(record.studentContact.contact.telegram_id)
        : '',
    });
  };

  const handleSaveContact = async (record: ContactRecord) => {
    if (!editingDraft.full_name.trim()) {
      alert('Укажи ФИО контактного лица');
      return;
    }

    if (!editingDraft.phone_number.trim() && !editingDraft.telegram_id.trim()) {
      alert('Оставь телефон или Telegram ID');
      return;
    }

    try {
      setSavingContactId(record.studentContact.contact.id);

      const updatedContact = await updateContact(record.studentContact.contact.id, {
        full_name: editingDraft.full_name.trim(),
        phone_number: editingDraft.phone_number.trim() || undefined,
        telegram_id: editingDraft.telegram_id.trim() ? Number(editingDraft.telegram_id) : undefined,
      });

      setContactsByStudent((prev) => ({
        ...prev,
        [record.student.id]: (prev[record.student.id] ?? []).map((item) =>
          item.id === record.studentContact.id ? { ...item, contact: updatedContact } : item
        ),
      }));

      setEditingContactId(null);
      setEditingDraft(emptyDraft());
    } catch (error) {
      console.error('Ошибка обновления контактного лица:', error);
      alert('Не удалось обновить контактное лицо');
    } finally {
      setSavingContactId(null);
    }
  };

  const handleRemoveContact = async (record: ContactRecord) => {
    try {
      await removeStudentContact(record.student.id, record.studentContact.id);

      setContactsByStudent((prev) => ({
        ...prev,
        [record.student.id]: (prev[record.student.id] ?? []).filter(
          (item) => item.id !== record.studentContact.id
        ),
      }));

      if (selectedRecordId === record.studentContact.id) {
        closeDetails();
      }
    } catch (error) {
      console.error('Ошибка отвязки контактного лица:', error);
      alert('Не удалось отвязать контактное лицо');
    }
  };

  return (
    <div>
      <section style={{ ...panelStyle, marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: '1 1 320px' }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#1f2a3b', marginBottom: 6 }}>
              Список контактов
            </div>
            <div style={{ color: '#687486', fontSize: 14 }}>
              Поиск ищет по имени контактного лица, ученику, предмету, телефону и Telegram ID.
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
              width: 'min(100%, 640px)',
            }}
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Например: мама, Иван, математика"
              style={{ flex: '1 1 280px' }}
            />
            <button type="button" onClick={() => setCreateModalOpen(true)}>
              Добавить контакт
            </button>
          </div>
        </div>
      </section>

      <section style={panelStyle}>
        {loading ? (
          <p style={{ color: '#687486', marginBottom: 0 }}>Загрузка...</p>
        ) : filteredRecords.length === 0 ? (
          <p style={{ color: '#687486', marginBottom: 0 }}>Контактные лица не найдены</p>
        ) : (
          <div
            style={{
              display: 'grid',
              gap: 12,
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            }}
          >
            {filteredRecords.map((record) => (
              <button
                key={record.studentContact.id}
                type="button"
                onClick={() => {
                  setSelectedRecordId(record.studentContact.id);
                  setDetailsOpen(true);
                }}
                style={{
                  display: 'grid',
                  gap: 10,
                  padding: 16,
                  textAlign: 'left',
                  borderRadius: 18,
                  background: 'rgba(23,32,51,0.03)',
                  color: '#1f2a3b',
                  border: '1px solid rgba(24,33,47,0.08)',
                  boxShadow: 'none',
                }}
              >
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>
                    {record.studentContact.contact.full_name}
                  </div>
                  <div style={{ color: '#687486', fontSize: 14, marginBottom: 4 }}>
                    {relationshipLabels[record.studentContact.relationship_type]}
                  </div>
                  <div style={{ color: '#687486', fontSize: 14 }}>
                    Ученик: {record.student.full_name}
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 6, color: '#435066', fontSize: 14 }}>
                  <span>Предмет: {record.subject?.name ?? '—'}</span>
                  <span>Телефон: {record.studentContact.contact.phone_number || '—'}</span>
                  <span>Telegram ID: {record.studentContact.contact.telegram_id || '—'}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {createModalOpen && (
        <div
          onClick={() => setCreateModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.48)',
            display: 'grid',
            placeItems: 'center',
            padding: 20,
            zIndex: 40,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(560px, 100%)',
              background: '#fff',
              borderRadius: 24,
              border: '1px solid rgba(24,33,47,0.08)',
              boxShadow: '0 30px 80px rgba(15,23,42,0.18)',
              padding: 24,
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: 22, marginBottom: 6 }}>Добавить контактное лицо</h3>
                <div style={{ color: '#687486', fontSize: 14 }}>
                  Выбери ученика и создай для него контактное лицо.
                </div>
              </div>
              <button
                type="button"
                title="Закрыть"
                onClick={() => setCreateModalOpen(false)}
                style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, background: 'rgba(23,32,51,0.92)', boxShadow: 'none', fontSize: 22 }}
              >
                ×
              </button>
            </div>

            {students.length === 0 ? (
              <div
                style={{
                  padding: 16,
                  borderRadius: 16,
                  background: 'rgba(23,32,51,0.06)',
                  color: '#566173',
                }}
              >
                Сначала создай ученика.
              </div>
            ) : (
              <>
                <select value={contactStudentId} onChange={(e) => setContactStudentId(e.target.value)}>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.full_name}
                    </option>
                  ))}
                </select>
                <select
                  value={contactRelationship}
                  onChange={(e) => setContactRelationship(e.target.value as RelationshipType)}
                >
                  <option value="parent">Родитель</option>
                  <option value="guardian">Опекун</option>
                  <option value="other">Другое</option>
                </select>
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="ФИО контактного лица"
                />
                <input
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="Телефон"
                />
                <input
                  value={contactTelegramId}
                  onChange={(e) => setContactTelegramId(e.target.value)}
                  placeholder="Telegram ID"
                  type="number"
                />
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" onClick={handleCreateContact} disabled={creatingContact}>
                    {creatingContact ? 'Сохраняем...' : 'Создать контакт'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(false)}
                    style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}
                  >
                    Отмена
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {detailsOpen && selectedRecord && (
        <div
          onClick={closeDetails}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.48)',
            display: 'grid',
            placeItems: 'center',
            padding: 20,
            zIndex: 40,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(680px, 100%)',
              maxHeight: '88vh',
              overflowY: 'auto',
              background: '#fff',
              borderRadius: 24,
              border: '1px solid rgba(24,33,47,0.08)',
              boxShadow: '0 30px 80px rgba(15,23,42,0.18)',
              padding: 24,
              display: 'grid',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: 22, marginBottom: 6 }}>
                  {selectedRecord.studentContact.contact.full_name}
                </h3>
                <div style={{ color: '#687486', fontSize: 14 }}>
                  {relationshipLabels[selectedRecord.studentContact.relationship_type]}
                </div>
              </div>
              <button
                type="button"
                title="Закрыть"
                onClick={closeDetails}
                style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, background: 'rgba(23,32,51,0.92)', boxShadow: 'none', fontSize: 22 }}
              >
                ×
              </button>
            </div>

            <section style={{ ...panelStyle, padding: 14 }}>
              <div style={{ fontWeight: 800, color: '#1f2a3b', marginBottom: 10 }}>
                Связь с учеником
              </div>
              <div style={{ display: 'grid', gap: 8, color: '#435066', fontSize: 14 }}>
                <div>Ученик: {selectedRecord.student.full_name}</div>
                <div>Предмет: {selectedRecord.subject?.name ?? '—'}</div>
                <div>
                  Статус связи: {selectedRecord.tutorStudent ? selectedRecord.tutorStudent.status : '—'}
                </div>
              </div>
            </section>

            <section style={{ ...panelStyle, padding: 14 }}>
              <div style={{ fontWeight: 800, color: '#1f2a3b', marginBottom: 10 }}>
                Данные контактного лица
              </div>
              {editingContactId === selectedRecord.studentContact.contact.id ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <input
                    value={editingDraft.full_name}
                    onChange={(e) => setEditingDraft((prev) => ({ ...prev, full_name: e.target.value }))}
                    placeholder="ФИО контактного лица"
                  />
                  <input
                    value={editingDraft.phone_number}
                    onChange={(e) => setEditingDraft((prev) => ({ ...prev, phone_number: e.target.value }))}
                    placeholder="Телефон"
                  />
                  <input
                    value={editingDraft.telegram_id}
                    onChange={(e) => setEditingDraft((prev) => ({ ...prev, telegram_id: e.target.value }))}
                    placeholder="Telegram ID"
                    type="number"
                  />
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleSaveContact(selectedRecord)}
                      disabled={savingContactId === selectedRecord.studentContact.contact.id}
                    >
                      {savingContactId === selectedRecord.studentContact.contact.id
                        ? 'Сохраняем...'
                        : 'Сохранить'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingContactId(null);
                        setEditingDraft(emptyDraft());
                      }}
                      style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div>Телефон: {selectedRecord.studentContact.contact.phone_number || '—'}</div>
                  <div>Telegram ID: {selectedRecord.studentContact.contact.telegram_id || '—'}</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => startEditingContact(selectedRecord)}
                      style={{ background: 'rgba(23,32,51,0.92)', boxShadow: 'none' }}
                    >
                      Редактировать
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveContact(selectedRecord)}
                      style={{ background: 'rgba(166,63,59,0.92)', boxShadow: 'none' }}
                    >
                      Отвязать
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

