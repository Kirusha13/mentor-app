import type { TheoryTopic } from '../api/topics';
import type { TutorLevel } from '../api/tutorLevels';

export function normalizeLevelValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function topicMatchesStudentLevel(
  topic: Pick<TheoryTopic, 'level_ids' | 'study_level'>,
  gradeOrLevelIds: number | null | undefined | number[]
) {
  if (Array.isArray(gradeOrLevelIds)) {
    const topicLevelIds = topic.level_ids ?? [];
    if (!topicLevelIds.length) return true;
    if (!gradeOrLevelIds.length) return true;
    return topicLevelIds.some((levelId) => gradeOrLevelIds.includes(levelId));
  }

  const grade = gradeOrLevelIds;
  if (topic.level_ids?.length) {
    return true;
  }

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

export function formatTopicLevels(
  topicOrStudyLevel: Pick<TheoryTopic, 'level_ids' | 'study_level'> | string[] | null | undefined,
  tutorLevels: TutorLevel[] = []
) {
  if (Array.isArray(topicOrStudyLevel) || !topicOrStudyLevel) {
    return topicOrStudyLevel && topicOrStudyLevel.length ? topicOrStudyLevel.join(', ') : 'Все уровни';
  }

  const levelIds = topicOrStudyLevel.level_ids ?? [];
  if (!levelIds.length) return 'Все уровни';

  const levelMap = new Map(tutorLevels.map((level) => [level.id, level.name]));
  return levelIds.map((levelId) => levelMap.get(levelId) ?? `Уровень #${levelId}`).join(', ');
}
