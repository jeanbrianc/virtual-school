import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { LIFE_CYCLES, lifeCycleLesson } from '../../src/domain/lessons/lifeCycle';
import { sinkFloatLesson } from '../../src/domain/lessons/sinkFloat';
import { LessonRun, tallyBySkill } from '../../src/domain/lessons/engine';
import { createRng } from '../../src/domain/util/random';
import { getSkill } from '../../src/domain/curriculum';
import { getLesson } from '../../src/domain/lessons/registry';
import { teacherActivity, TEACHER_REGISTRY } from '../../src/domain/teachers/registry';
import { recordLesson, startTierFor } from '../../src/services/lessonService';
import { Repositories } from '../../src/data/repositories';
import { IndexedDbDatabase } from '../../src/data/storage/indexedDb';
import { MemoryDatabase } from '../../src/data/storage/memory';
import { SyncingDatabase, shareable } from '../../src/data/storage/syncing';
import { SCHEMA_VERSION, TABLES } from '../../src/data/schema';
import { validChange } from '../../src/sync/protocol';
import { makeContext } from './helpers';

it('four seeded picture rounds cover both cycles, unique choices, and two explicit levels', () => {
  const varied = new Set<string>();
  assert.equal(lifeCycleLesson.rounds, 4);
  assert.equal(lifeCycleLesson.manualProgression, true);
  for (let seed = 0; seed < 40; seed++)
    for (const tier of [0, 1]) {
      const rng = createRng(seed);
      const repeat = createRng(seed);
      const stages: string[] = [];
      for (let round = 0; round < 4; round++) {
        const p = lifeCycleLesson.generateRound(tier, rng, round)[0]!;
        assert.deepEqual(p, lifeCycleLesson.generateRound(tier, repeat, round)[0]);
        assert.equal(p.choices.length, tier === 0 ? 2 : 3);
        assert.equal(new Set(p.choices.map((c) => c.id)).size, p.choices.length);
        assert.equal(p.choices.filter((c) => c.id === p.answerId).length, 1);
        assert.equal(p.kind, 'answer');
        assert.equal(p.alsoSkills, undefined);
        assert.ok(getSkill(p.skillId));
        assert.equal(p.visual.type, 'life-cycle');
        if (p.visual.type !== 'life-cycle') throw new Error('Expected life-cycle picture');
        const cycle = LIFE_CYCLES[p.visual.cycle];
        assert.equal(p.visual.cycle, round % 2 === 0 ? 'plant' : 'butterfly');
        assert.equal(p.answerId, tier === 0 ? p.visual.stage : cycle[(cycle.indexOf(p.visual.stage) + 1) % 4]);
        assert.ok(p.choices.every((c) => c.lifeStage && cycle.includes(c.lifeStage)));
        stages.push(p.visual.stage);
        varied.add(JSON.stringify([p.visual, p.choices]));
      }
      assert.equal(new Set(stages).size, 4);
    }
  assert.ok(varied.size > 20);
  assert.equal(getLesson('life-cycle'), lifeCycleLesson);
  assert.equal(getLesson('sink-float'), sinkFloatLesson);
  assert.deepEqual(TEACHER_REGISTRY.nova.activity, { kind: 'lesson', lessonId: 'sink-float' });
  assert.deepEqual(teacherActivity('nova', 'life-cycle')?.activity, { kind: 'lesson', lessonId: 'life-cycle' });
  assert.equal(teacherActivity('digit', 'life-cycle'), undefined);
});

it('model, hint, retry and skip distinguish supported performance from exposure; levels never auto-promote', () => {
  for (const support of ['hint', 'model', 'retry'] as const) {
    const run = new LessonRun(lifeCycleLesson, 1, 7);
    if (support === 'retry') run.answer(run.currentProblem()!.choices.find((c) => c.id !== run.currentProblem()!.answerId)!.id);
    else run[support]();
    assert.equal(run.attempts.length, 0, 'viewing does not create evidence');
    run.answer(run.currentProblem()!.answerId);
    assert.equal(run.attempts[0]!.outcome, 'supported');
    while (!run.isComplete) run.answer(run.currentProblem()!.answerId);
    assert.equal(run.currentTier, 1);
    assert.deepEqual(tallyBySkill(run.attempts, run.problemIndex), [{ skillId: 'sci.life-next-stage', independent: 3, supported: 1, notYet: 0, maxTier: 1 }]);
  }
  const skip = new LessonRun(lifeCycleLesson, 0, 1);
  while (!skip.isComplete) {
    skip.model();
    skip.skip();
  }
  assert.deepEqual(tallyBySkill(skip.attempts, skip.problemIndex), []);
  assert.equal(skip.currentTier, 0);
  const exhausted = new LessonRun(lifeCycleLesson, 1, 9);
  exhausted.answer('not-a-choice');
  exhausted.answer('not-a-choice');
  exhausted.answer('not-a-choice');
  assert.equal(exhausted.attempts[0]!.outcome, 'not_yet');
});

function finished(tier = 0, seed = 42) {
  const run = new LessonRun(lifeCycleLesson, tier, seed);
  run.model();
  run.answer(run.currentProblem()!.answerId);
  run.skip();
  while (!run.isComplete) run.answer(run.currentProblem()!.answerId);
  return run;
}
for (const adapter of ['memory', 'indexeddb'] as const)
  it(`${adapter}: life-cycle saves are idempotent, child-scoped, and preserve old lab evidence`, async () => {
    const { ctx } = makeContext();
    const db = adapter === 'indexeddb' ? await IndexedDbDatabase.open(`life-cycle-${adapter}`, SCHEMA_VERSION, TABLES) : null;
    if (db) ctx.repos = new Repositories(db);
    try {
      const old = new LessonRun(sinkFloatLesson, 0, 3);
      while (!old.isComplete) old.answer(old.currentProblem()!.answerId);
      await recordLesson(ctx, 'sample', old, '2026-01-01T00:00:00Z', []);
      const before = (await ctx.repos.evidence.all()).filter((e) => e.source.label === 'Sink or Float?');
      assert.ok(before.length);
      assert.equal(await startTierFor(ctx, 'sample', lifeCycleLesson), 0);
      const run = finished();
      const result = await Promise.all([
        recordLesson(ctx, 'sample', run, '2026-01-02T00:00:00Z', []),
        recordLesson(ctx, 'sample', run, '2026-01-02T00:00:00Z', []),
      ]);
      assert.equal(result[0]!.attempt.id, result[1]!.attempt.id);
      assert.equal(await ctx.repos.lessonAttempts.count(), 2);
      assert.equal(await ctx.repos.teacherInteractions.count(), 2);
      assert.notEqual(finished().id, run.id, 'replay uses a new run ID');
      assert.deepEqual(
        (await ctx.repos.evidence.all()).filter((e) => e.source.label === 'Sink or Float?'),
        before,
      );
      const evidence = result[0]!.evidence.filter((e) => e.skillId.startsWith('sci.'));
      assert.deepEqual(
        evidence.map((e) => e.skillId),
        ['sci.life-picture-match'],
      );
      assert.deepEqual(evidence[0]!.trials, { independent: 2, supported: 1, notYet: 0 });
      assert.equal((await ctx.repos.forChild(ctx.repos.evidence, 'sample-sibling')).length, 0);
      assert.match(result[0]!.attempt.summary, /Skipped 1 round/);
      const incomplete = new LessonRun(lifeCycleLesson, 0, 0);
      await assert.rejects(recordLesson(ctx, 'sample', incomplete, 'start', []), /Incomplete lesson/);
      assert.equal(await ctx.repos.lessonAttempts.count(), 2);
    } finally {
      db?.close();
    }
  });

it('life-cycle attempts and narrow evidence sync without new schema or duplicate records', async () => {
  const { ctx } = makeContext();
  const a = new SyncingDatabase(new MemoryDatabase(TABLES), 'sample-device');
  const b = new SyncingDatabase(new MemoryDatabase(TABLES), 'sample-phone');
  ctx.repos = new Repositories(a);
  const result = await recordLesson(ctx, 'sample', finished(1), '2026-01-01T00:00:00Z', []);
  const changes = await Promise.all(
    (await a.outbox()).map(async (row) => ({ table: row.table, id: row.id, mod: row.mod, data: shareable(row.table, await a.table(row.table).get(row.id)) })),
  );
  assert.ok(changes.every(validChange));
  await b.applyRemote(changes);
  await b.applyRemote(changes);
  const repos = new Repositories(b);
  assert.equal(await repos.lessonAttempts.count(), 1);
  assert.equal((await repos.lessonAttempts.get(result.attempt.id))!.lessonId, 'life-cycle');
  assert.deepEqual((await repos.forChild(repos.evidence, 'sample')).filter((e) => e.skillId === 'sci.life-next-stage')[0]!.trials, {
    independent: 2,
    supported: 1,
    notYet: 0,
  });
  assert.equal((await repos.forChild(repos.evidence, 'sample-sibling')).length, 0);
});
