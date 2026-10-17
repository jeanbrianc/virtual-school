import { weatherLesson } from './weather';
import { patternsLesson } from './patterns';
import { moonRocksLesson } from './moonRocks';
import { lifeCycleLesson } from './lifeCycle';
import { sinkFloatLesson } from './sinkFloat';
import type { LessonDefinition } from './types';

/** Lessons that can be launched directly by a teacher (story chat is book-specific). */
export const LESSONS: Record<string, LessonDefinition> = {
  [patternsLesson.id]: patternsLesson,
  [moonRocksLesson.id]: moonRocksLesson,
  [sinkFloatLesson.id]: sinkFloatLesson,
  [lifeCycleLesson.id]: lifeCycleLesson,
  [weatherLesson.id]: weatherLesson,
};

export const LESSON_TITLES: Record<string, { title: string; childTitle: string; teacherId: string }> = {
  'patterns-shapes': { title: patternsLesson.title, childTitle: patternsLesson.childTitle, teacherId: 'pippa' },
  'keyboard-trail': { title: 'Keyboard trail (letter/key familiarity)', childTitle: 'Keyboard trail', teacherId: 'hoot' },
  'moon-rocks': { title: moonRocksLesson.title, childTitle: moonRocksLesson.childTitle, teacherId: 'digit' },
  'weather-pictures': { title: weatherLesson.title, childTitle: weatherLesson.childTitle, teacherId: 'nova' },
  'life-cycle': { title: lifeCycleLesson.title, childTitle: lifeCycleLesson.childTitle, teacherId: 'nova' },
  'sink-float': { title: sinkFloatLesson.title, childTitle: sinkFloatLesson.childTitle, teacherId: 'nova' },
  'globe-states': { title: 'US State Adventure', childTitle: 'US states', teacherId: 'nova' },
  'globe-countries': { title: 'World Country Adventure', childTitle: 'World countries', teacherId: 'nova' },
  'story-chat': { title: 'Story Chat (book comprehension conversation)', childTitle: 'Story Chat', teacherId: 'hoot' },
};

export function getLesson(id: string): LessonDefinition | undefined {
  return LESSONS[id];
}
