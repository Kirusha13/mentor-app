export function lessonDate(slot: { lesson_date: string }): string {
  return slot.lesson_date;
}

export function lessonStartTime(slot: { start_time: string }): string {
  return slot.start_time.slice(0, 5);
}

export function lessonEndTime(slot: { end_time: string }): string {
  return slot.end_time.slice(0, 5);
}
