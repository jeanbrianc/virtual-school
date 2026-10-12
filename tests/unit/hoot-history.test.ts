import assert from 'node:assert/strict';
import { test } from 'node:test';
import { finishedBookGreeting } from '../../src/domain/reading/hootHistory';

test('Hoot uses completed progress, including returning readers with no active books', () => {
  assert.match(finishedBookGreeting([]), /first book for this shelf/);
  assert.match(finishedBookGreeting([{ status: 'reading' }, { status: 'up_next' }]), /first book/);
  assert.match(finishedBookGreeting([{ status: 'completed' }]), /another book/);
  assert.match(finishedBookGreeting([{ status: 'completed' }, { status: 'reading' }]), /another book/);
});
test('loading and unavailable history never imply a first or returning book', () => {
  for (const status of ['loading', 'unavailable'] as const) {
    assert.equal(finishedBookGreeting([], status), 'Hoo-ray, you finished a book!');
    assert.equal(finishedBookGreeting([{ status: 'completed' }], status), 'Hoo-ray, you finished a book!');
  }
});
