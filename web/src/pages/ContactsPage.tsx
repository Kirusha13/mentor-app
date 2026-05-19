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
  const [roleFilter, setRoleFilter] = useState<RelationshipType | 'all'>('all');
  const [studentFilter, setStudentFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<'all' | 'telegram' | 'phone'>('all');
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

    return records.filter((record) => {
      const text = `${record.student.full_name} ${record.subject?.name ?? ''} ${
        record.studentContact.contact.full_name
      } ${record.studentContact.contact.phone_number ?? ''} ${
        record.studentContact.contact.telegram_id ?? ''
      } ${relationshipLabels[record.studentContact.relationship_type]}`.toLowerCase();

      const bySearch = !query || text.includes(query);
      const byRole = roleFilter === 'all' || record.studentContact.relationship_type === roleFilter;
      const byStudent = studentFilter === 'all' || String(record.student.id) === studentFilter;
      const byChannel =
        channelFilter === 'all' ||
        (channelFilter === 'telegram' && Boolean(record.studentContact.contact.telegram_id)) ||
        (channelFilter === 'phone' && Boolean(record.studentContact.contact.phone_number));

      return bySearch && byRole && byStudent && byChannel;
    });
  }, [channelFilter, records, roleFilter, search, studentFilter]);

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

  const getInitials = (name: string) =>
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');

  const parentCount = records.filter((record) => record.studentContact.relationship_type === 'parent').length;
  const guardianCount = records.filter((record) => record.studentContact.relationship_type === 'guardian').length;
  const telegramCount = records.filter((record) => Boolean(record.studentContact.contact.telegram_id)).length;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 className="page-heading">Контакты</h1>

      <section className="mentor-panel toolbar-panel" style={{ gridTemplateColumns: 'minmax(280px, 1.25fr) minmax(150px, 0.45fr) minmax(190px, 0.55fr) minmax(170px, 0.5fr) auto' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по имени, ученику, телефону или Telegram..."
        />
        <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as RelationshipType | 'all')}>
          <option value="all">Все роли</option>
          <option value="parent">Родитель</option>
          <option value="guardian">Опекун</option>
          <option value="other">Другое</option>
        </select>
        <select value={studentFilter} onChange={(event) => setStudentFilter(event.target.value)}>
          <option value="all">Все ученики</option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.full_name}
            </option>
          ))}
        </select>
        <select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value as 'all' | 'telegram' | 'phone')}>
          <option value="all">Способ связи: все</option>
          <option value="telegram">Telegram</option>
          <option value="phone">Телефон</option>
        </select>
        <button
          type="button"
          title="Добавить контакт"
          onClick={() => setCreateModalOpen(true)}
          className="add-trigger"
        >
          +
        </button>
      </section>

      <section className="metric-grid">
        <div className="metric-card">
          <span className="metric-icon" style={{ background: 'rgba(42,171,238,0.12)', color: '#2AABEE' }}>☷</span>
          <div><div className="metric-value">{records.length} контактов</div><div className="metric-label">Всего в базе</div></div>
        </div>
        <div className="metric-card">
          <span className="metric-icon" style={{ background: 'rgba(47,125,99,0.12)', color: '#4CAF50' }}>○</span>
          <div><div className="metric-value">{parentCount} родителей</div><div className="metric-label">Мамы и папы учеников</div></div>
        </div>
        <div className="metric-card">
          <span className="metric-icon" style={{ background: 'rgba(42,171,238,0.12)', color: '#2AABEE' }}>◇</span>
          <div><div className="metric-value">{guardianCount} опекунов</div><div className="metric-label">Ответственные лица</div></div>
        </div>
        <div className="metric-card">
          <span className="metric-icon" style={{ background: 'rgba(123,97,200,0.12)', color: '#9C27B0' }}>✉</span>
          <div><div className="metric-value">{telegramCount} Telegram</div><div className="metric-label">Есть Telegram ID</div></div>
        </div>
      </section>

      <section className="mentor-panel" style={{ padding: 16 }}>
        {loading ? (
          <p style={{ color: '#687486', marginBottom: 0 }}>Загрузка...</p>
        ) : filteredRecords.length === 0 ? (
          <p style={{ color: '#687486', marginBottom: 0 }}>Контактные лица не найдены</p>
        ) : (
          <div style={{ display: 'grid', border: '1px solid rgba(24,33,47,0.08)', borderRadius: 20, overflow: 'hidden' }}>
            {filteredRecords.map((record) => (
              <article
                key={record.studentContact.id}
                onClick={() => {
                  setSelectedRecordId(record.studentContact.id);
                  setDetailsOpen(true);
                }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(260px, 1.05fr) minmax(190px, 0.7fr) minmax(180px, 0.6fr) auto',
                  gap: 16,
                  alignItems: 'center',
                  padding: '18px 16px',
                  textAlign: 'left',
                  background: '#fff',
                  color: '#1f2a3b',
                  borderBottom: '1px solid rgba(24,33,47,0.06)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
                  <span style={{ width: 58, height: 58, borderRadius: 22, background: 'rgba(42,171,238,0.13)', color: '#2AABEE', display: 'inline-grid', placeItems: 'center', fontSize: 17, fontWeight: 900, flex: '0 0 auto' }}>
                    {getInitials(record.studentContact.contact.full_name) || 'К'}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {record.studentContact.contact.full_name}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 7, color: '#435066', fontSize: 14 }}>
                  <span>☎ {record.studentContact.contact.phone_number || '—'}</span>
                  <span>Telegram ID: {record.studentContact.contact.telegram_id || '—'}</span>
                </div>

                <div>
                  <div style={{ color: '#768294', fontSize: 13, marginBottom: 6 }}>Связан с учеником</div>
                  <div style={{ color: '#1f2a3b', fontWeight: 800 }}>{record.student.full_name}</div>
                  <div style={{ color: '#687486', fontSize: 13 }}>{record.subject?.name ?? 'Без предмета'}</div>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    title="Отвязать контакт"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleRemoveContact(record);
                    }}
                    className="icon-button ghost-button"
                    style={{ color: '#F44336' }}
                  >
                    🗑
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="mentor-panel" style={{ padding: '12px 16px', color: '#687486', fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span>Показано {filteredRecords.length} из {records.length} контактов.</span>
        <span>Контактные данные используются только для учебного взаимодействия.</span>
      </div>

      {createModalOpen && (
        <div onClick={() => setCreateModalOpen(false)} className="modal-overlay">
          <div onClick={(event) => event.stopPropagation()} className="app-modal">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Добавить контактное лицо</h3>
                <p className="modal-subtitle">
                  Выбери ученика и создай для него контактное лицо.
                </p>
              </div>
              <button
                type="button"
                title="Закрыть"
                onClick={() => setCreateModalOpen(false)}
                className="modal-close"
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
              <div className="modal-form-grid">
                <label className="modal-field">
                  Ученик
                  <select value={contactStudentId} onChange={(e) => setContactStudentId(e.target.value)}>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="modal-field">
                  Тип контакта
                  <select
                    value={contactRelationship}
                    onChange={(e) => setContactRelationship(e.target.value as RelationshipType)}
                  >
                    <option value="parent">Родитель</option>
                    <option value="guardian">Опекун</option>
                    <option value="other">Другое</option>
                  </select>
                </label>
                <label className="modal-field">
                  ФИО контактного лица
                  <input
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="ФИО контактного лица"
                  />
                </label>
                <label className="modal-field">
                  Телефон
                  <input
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="Телефон"
                  />
                </label>
                <label className="modal-field">
                  Telegram ID
                  <input
                    value={contactTelegramId}
                    onChange={(e) => setContactTelegramId(e.target.value)}
                    placeholder="Telegram ID"
                    type="number"
                  />
                </label>
                <div className="modal-actions">
                  <button type="button" onClick={handleCreateContact} disabled={creatingContact} className="modal-primary">
                    {creatingContact ? 'Сохраняем...' : 'Создать контакт'}
                  </button>
                </div>
              </div>
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
                      title="Редактировать контакт"
                      onClick={() => startEditingContact(selectedRecord)}
                      style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, background: 'rgba(23,32,51,0.92)', boxShadow: 'none', fontSize: 18, display: 'inline-grid', placeItems: 'center' }}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      title="Отвязать контакт"
                      onClick={() => handleRemoveContact(selectedRecord)}
                      style={{ minWidth: 42, width: 42, height: 42, padding: 0, borderRadius: 999, background: 'rgba(166,63,59,0.92)', boxShadow: 'none', fontSize: 18, display: 'inline-grid', placeItems: 'center' }}
                    >
                      🗑
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

