import { moonRocksLesson } from './moonRocks';
import { sinkFloatLesson } from './sinkFloat';
import type { LessonDefinition } from './types';

/** Lessons that can be launched directly by a teacher (story chat is book-specific). */
export const LESSONS: Record<string, LessonDefinition> = {
  [moonRocksLesson.id]: moonRocksLesson,
  [sinkFloatLesson.id]: sinkFloatLesson,
};

export const LESSON_TITLES: Record<string, { title: string; childTitle: string; teacherId: string }> = {
  'moon-rocks': { title: moonRocksLesson.title, childTitle: moonRocksLesson.childTitle, teacherId: 'digit' },
  'sink-float': { title: sinkFloatLesson.title, childTitle: sinkFloatLesson.childTitle, teacherId: 'nova' },
  'story-chat': { title: 'Story Chat (book comprehension conversation)', childTitle: 'Story Chat', teacherId: 'hoot' },
};

export function getLesson(id: string): LessonDefinition | undefined {
  return LESSONS[id];
}
