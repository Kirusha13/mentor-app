import type { Lesson } from '../api/lessons';

const pad = (value: number) => String(value).padStart(2, '0');

/** YYYY-MM-DD в локальной зоне пользователя */
export function lessonDate(lesson: Pick<Lesson, 'starts_at'>): string {
  const date = new Date(lesson.starts_at);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Человекочитаемая дата «25 июня 2026» в локальной зоне пользователя */
export function lessonDateRu(lesson: Pick<Lesson, 'starts_at'>): string {
  return formatDateRuLong(new Date(lesson.starts_at));
}

/** «25 июня 2026» — день + месяц словами + год */
export function formatDateRuLong(date: Date): string {
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** HH:MM:SS в локальной зоне пользователя */
export function lessonStartTime(lesson: Pick<Lesson, 'starts_at'>): string {
  const date = new Date(lesson.starts_at);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

export function lessonEndTime(lesson: Pick<Lesson, 'ends_at'>): string {
  const date = new Date(lesson.ends_at);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

/** Минут от полуночи в локальной зоне */
export function lessonStartMinutes(lesson: Pick<Lesson, 'starts_at'>): number {
  const date = new Date(lesson.starts_at);
  return date.getHours() * 60 + date.getMinutes();
}

export function lessonEndMinutes(lesson: Pick<Lesson, 'ends_at'>): number {
  const date = new Date(lesson.ends_at);
  return date.getHours() * 60 + date.getMinutes();
}

/** Собрать ISO строку из YYYY-MM-DD и HH:MM в локальной зоне */
export function buildLocalIso(date: string, time: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, hours ?? 0, minutes ?? 0, 0).toISOString();
}

export function buildLocalDayStartIso(date: string): string {
  return buildLocalIso(date, '00:00');
}

export function buildLocalDayEndIso(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, 23, 59, 59, 999).toISOString();
}
