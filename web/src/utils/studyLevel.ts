import type { TheoryTopic } from '../api/topics';

export function normalizeLevelValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function topicMatchesStudentLevel(
  topic: Pick<TheoryTopic, 'study_level'>,
  grade: number | null | undefined
) {
  const levels = (topic.study_level ?? [])
    .map((item) => normalizeLevelValue(String(item)))
    .filter(Boolean);

  if (!levels.length) {
    return true;
  }

  if (!grade) {
    return true;
  }

  const gradeLabel = normalizeLevelValue(`${grade} класс`);
  if (levels.includes(gradeLabel) || levels.includes(String(grade))) {
    return true;
  }

  if (grade <= 9 && levels.includes('огэ')) return true;
  if (grade >= 10 && levels.includes('егэ')) return true;

  return false;
}

export function formatTopicLevels(studyLevel: string[] | null | undefined) {
  return studyLevel && studyLevel.length ? studyLevel.join(', ') : 'Все уровни';
}
