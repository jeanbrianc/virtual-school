import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { Repositories } from '../../src/data/repositories';
import { SCHEMA_VERSION, TABLES } from '../../src/data/schema';
import { IndexedDbDatabase } from '../../src/data/storage/indexedDb';
import { SyncingDatabase } from '../../src/data/storage/syncing';
import { acceptedLetter, answerTrail, skipTrail, trailLetters, type KeyboardTrail } from '../../src/domain/lessons/keyboardTrail';
import { recordKeyboardTrail } from '../../src/services/keyboardService';
import { makeContext } from './helpers';

const run = (): KeyboardTrail => ({
  id: 'test-run',
  startedAt: '2026-01-01T00:00:00Z',
  letters: trailLetters(0, 31),
  trials: [],
  hinted: false,
  cancelled: false,
});
it('rounds are deterministic, distinct, bounded and expand to A–Z', () => {
  assert.deepEqual(trailLetters(0, 31), trailLetters(0, 31));
  assert.equal(new Set(trailLetters(0, 31)).size, 5);
  assert.ok(trailLetters(0, 31).every((l) => 'ABCDE'.includes(l)));
  const observed = new Set(Array.from({ length: 100 }, (_, i) => trailLetters(5, i)).flat());
  assert.equal(observed.size, 26);
});
it('accepts case/Caps Lock and excludes repeat/modifiers/IME/non-Latin keys', () => {
  const event = { key: 'a', repeat: false, ctrlKey: false, metaKey: false, altKey: false, isComposing: false };
  assert.equal(acceptedLetter(event), 'A');
  assert.equal(acceptedLetter({ ...event, key: 'A' }), 'A');
  for (const field of ['repeat', 'ctrlKey', 'metaKey', 'altKey', 'isComposing']) assert.equal(acceptedLetter({ ...event, [field]: true }), null);
  for (const key of ['Dead', 'é', 'Enter']) assert.equal(acceptedLetter({ ...event, key }), null);
});
it('hint stays supported after a miss; skips/cancel never become matches', () => {
  const r = run();
  r.hinted = true;
  assert.equal(answerTrail(r, 'Z', 'physical'), false);
  answerTrail(r, r.letters[0]!, 'physical');
  assert.equal(r.trials[0]!.outcome, 'supported');
  skipTrail(r);
  assert.equal(r.trials[1]!.modality, 'skipped');
  r.cancelled = true;
  assert.equal(answerTrail(r, r.letters[2]!, 'touch'), false);
});
for (const adapter of ['memory', 'indexeddb', 'syncing'] as const)
  it(`${adapter}: atomic duplicate completion, modality evidence and child isolation`, async () => {
    const { ctx } = makeContext();
    let db;
    if (adapter !== 'memory') {
      const inner = await IndexedDbDatabase.open(`keyboard-${adapter}`, SCHEMA_VERSION, TABLES);
      db = adapter === 'syncing' ? new SyncingDatabase(inner, 'test') : inner;
      ctx.repos = new Repositories(db);
    }
    try {
      const r = run();
      answerTrail(r, r.letters[0]!, 'physical');
      r.hinted = true;
      answerTrail(r, r.letters[1]!, 'physical');
      answerTrail(r, r.letters[2]!, 'touch');
      skipTrail(r);
      skipTrail(r);
      const saved = await Promise.all([recordKeyboardTrail(ctx, 'child_test', r), recordKeyboardTrail(ctx, 'child_test', r)]);
      assert.equal(saved[0]!.id, saved[1]!.id);
      assert.equal(await ctx.repos.lessonAttempts.count(), 1);
      const evidence = await ctx.repos.evidence.all();
      assert.equal(evidence.length, 3);
      assert.equal(evidence.filter((e) => e.skillId === 'reason.keyboard-match').length, 2);
      assert.equal(evidence.filter((e) => e.skillId === 'reason.letter-match').length, 1);
      assert.equal((await ctx.repos.forChild(ctx.repos.evidence, 'other_child')).length, 0);
      await recordKeyboardTrail(ctx, 'child_test', r);
      assert.equal(await ctx.repos.evidence.count(), 3);
      const cancelled = run();
      cancelled.cancelled = true;
      await assert.rejects(recordKeyboardTrail(ctx, 'child_test', cancelled));
      assert.equal(await ctx.repos.lessonAttempts.count(), 1);
    } finally {
      db?.close();
    }
  });

it('world input clears held/queued state and all shortcut intents while disabled', async () => {
  const { InputManager } = await import('../../src/engine/systems/input');
  const input = new InputManager();
  const internals = input as unknown as { keys: Set<string>; interactQueued: boolean; backQueued: boolean; padButtons: boolean[] };
  for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyQ', 'KeyR']) internals.keys.add(k);
  internals.interactQueued = true;
  internals.backQueued = true;
  internals.padButtons = [true];
  input.enabled = false;
  assert.deepEqual(input.poll(), { moveX: 0, moveY: 0, cameraYaw: 0, cameraZoom: 0 });
  assert.equal(input.consumeInteract(), false);
  assert.equal(input.consumeBack(), false);
  assert.equal(internals.keys.size, 0);
  assert.deepEqual(internals.padButtons, []);
  input.enabled = true;
  assert.equal(internals.keys.size, 0);
});
