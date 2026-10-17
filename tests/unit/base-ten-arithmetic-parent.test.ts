import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LessonAttempt, TeacherInteraction } from '../../src/domain/types';
import { findConversationLesson } from '../../src/ui/parent/pages/ConversationsPage';

const at = '2026-10-17T10:00:00.000Z';
const lesson = (id: string, childId = 'sample'): LessonAttempt => ({
  id,
  childId,
  teacherId: 'digit',
  lessonId: 'base-ten-arithmetic',
  startedAt: at,
  completedAt: at,
  startTier: 0,
  endTier: 0,
  problems: [],
  summary: 'Synthetic arithmetic record',
});
const interaction = (id: string, childId = 'sample'): TeacherInteraction => ({
  id,
  childId,
  teacherId: 'digit',
  startedAt: at,
  endedAt: at,
  context: { flow: 'lesson', lessonId: 'base-ten-arithmetic' },
  transcript: [],
  outcome: 'Synthetic model viewing',
});

test('nearby Digit interactions use exact run IDs instead of another lesson in the same five-minute window', () => {
  const placeValue = { ...lesson('base-ten:sample:first'), lessonId: 'base-ten-mission' };
  const arithmetic = lesson('base-ten-arithmetic:sample:second');
  assert.equal(findConversationLesson([placeValue, arithmetic], interaction(`${arithmetic.id}:talk`)), arithmetic);
  assert.equal(findConversationLesson([arithmetic, placeValue], interaction(`${placeValue.id}:talk`)), placeValue);
  assert.equal(
    findConversationLesson([placeValue], interaction(`${arithmetic.id}:talk`)),
    undefined,
    'missing modern synced run does not borrow nearby evidence',
  );
});

test('legacy temporal fallback remains child and teacher scoped', () => {
  const own = lesson('legacy-run');
  const sibling = lesson('sibling-run', 'sample-sibling');
  assert.equal(findConversationLesson([sibling, own], interaction('legacy-interaction')), own);
  assert.equal(findConversationLesson([sibling], interaction('legacy-interaction')), undefined);
  assert.equal(findConversationLesson([{ ...own, teacherId: 'nova' }], interaction('legacy-interaction')), undefined);
  assert.equal(findConversationLesson([{ ...own, completedAt: '2026-10-17T09:00:00.000Z' }], interaction('legacy-interaction')), undefined);
});
