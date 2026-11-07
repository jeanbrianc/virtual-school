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

test('state paths stay within the full-map viewBox, including Alaska and Hawaii', () => {
  for (const state of maps.states) {
    for (const pair of state.path.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)) {
      const x = Number(pair[1]);
      const y = Number(pair[2]);
      assert.ok(x >= 0 && x <= 850 && y >= 0 && y <= 490, `${state.name}: ${x},${y}`);
    }
  }
});

test('Michigan keeps both land peninsulas without filling the Great Lakes', () => {
  const michigan = maps.states.find((state) => state.name === 'Michigan')!;
  const rings = michigan.path
    .split('M')
    .filter(Boolean)
    .map((ring) => [...ring.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((pair) => [Number(pair[1]), Number(pair[2])] as const));
  const contains = (x: number, y: number) => {
    let inside = false;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]!;
        const [xj, yj] = ring[j]!;
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    return inside;
  };
  // Geographic samples transformed by generate-geography.py's mainland projection.
  assert.equal(contains(551.7, 89.9), true, 'Lower Peninsula (-84.6, 43.7)');
  assert.equal(contains(529.2, 54.7), true, 'Upper Peninsula (-86.6, 46.2)');
  assert.equal(contains(528.1, 85.7), false, 'Lake Michigan (-86.7, 44)');
  assert.equal(contains(566.4, 75.8), false, 'Lake Huron (-83.3, 44.7)');
  assert.equal(contains(550.0, 60.2), false, 'Straits of Mackinac (-84.75, 45.81)');
});
