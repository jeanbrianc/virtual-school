import { test } from 'node:test';
import assert from 'node:assert/strict';
import maps from '../../src/domain/geography/maps.json';
import { COUNTRY_TARGETS, GEOGRAPHY_OBJECTIVES } from '../../src/domain/geography/objectives';
import { LESSON_TITLES } from '../../src/domain/lessons/registry';
import { buildSnapshot } from '../../src/domain/progress/snapshot';
import type { LessonAttempt } from '../../src/domain/types';

test('reviewed geography target sets have usable unique paths and compatible Nova IDs', () => {
  assert.equal(maps.states.length, 50);
  assert.equal(new Set(maps.states.map((r) => r.name)).size, 50);
  for (const r of [...maps.states, ...maps.countries]) assert.match(r.path, /^M/);
  for (const country of COUNTRY_TARGETS) assert.equal(maps.countries.filter((r) => r.name === country).length, 1);
  assert.ok(GEOGRAPHY_OBJECTIVES['geography.states'].includes('named US state'));
  assert.equal(LESSON_TITLES['globe-states']!.teacherId, 'nova');
  assert.equal(LESSON_TITLES['globe-countries']!.teacherId, 'nova');
});
test('unfinished geography is not a completion; historical unknown lesson IDs remain readable', () => {
  const lesson = {
    id: 'synthetic',
    childId: 'synthetic',
    lessonId: 'globe-states',
    teacherId: 'nova',
    startedAt: '2026-01-01',
    completedAt: '2026-01-01',
    startTier: 0,
    endTier: 0,
    problems: [],
    summary: 'Synthetic',
  } satisfies LessonAttempt;
  const snap = buildSnapshot(
    {
      books: [],
      evidence: [],
      activities: [],
      portfolio: [],
      mastery: [],
      lessons: [
        { ...lesson, complete: false },
        { ...lesson, id: 'legacy', lessonId: 'retired-unknown' },
      ],
    },
    () => undefined,
  );
  assert.equal(snap.totalLessons, 1);
  assert.equal(snap.lessonCompletions['globe-states'], undefined);
  assert.equal(snap.lessonCompletions['retired-unknown'], 1);
  assert.equal(snap.masteredSkills, 0);
});
