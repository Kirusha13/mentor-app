import type { Lesson, AvailableSlot } from '../api/lessons';

const pad = (value: number) => String(value).padStart(2, '0');

/** YYYY-MM-DD в локальной зоне устройства */
export function lessonDate(item: { starts_at: string }): string {
  const date = new Date(item.starts_at);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** HH:MM в локальной зоне устройства */
export function lessonStartTime(item: { starts_at: string }): string {
  const date = new Date(item.starts_at);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function lessonEndTime(item: { ends_at: string }): string {
  const date = new Date(item.ends_at);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function lessonStartMinutes(item: { starts_at: string }): number {
  const date = new Date(item.starts_at);
  return date.getHours() * 60 + date.getMinutes();
}

export function lessonEndMinutes(item: { ends_at: string }): number {
  const date = new Date(item.ends_at);
  return date.getHours() * 60 + date.getMinutes();
}

/** Собрать ISO строку из YYYY-MM-DD и HH:MM в локальной зоне */
export function buildLocalIso(date: string, time: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, hours ?? 0, minutes ?? 0, 0).toISOString();
}

export type { Lesson, AvailableSlot };
