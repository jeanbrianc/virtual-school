import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { PATTERN_RULES, PATTERN_UNITS, PATTERN_SKILLS, patternProgressionLesson } from '../../src/domain/lessons/patternProgression';
import { patternsLesson } from '../../src/domain/lessons/patterns';
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

it('four original seeded rounds have distinct examples, unique valid choices and exactly the chosen shape rule', () => {
  assert.equal(patternProgressionLesson.rounds, 4);
  assert.equal(patternProgressionLesson.manualProgression, true);
  for (let seed = 0; seed < 60; seed++)
    for (let tier = 0; tier < 5; tier++) {
      const rng = createRng(seed),
        repeat = createRng(seed),
        examples = new Set<string>();
      for (let round = 0; round < 4; round++) {
        const p = patternProgressionLesson.generateRound(tier, rng, round)[0]!;
        assert.deepEqual(p, patternProgressionLesson.generateRound(tier, repeat, round)[0]);
        assert.equal(p.kind, 'answer');
        assert.equal(p.alsoSkills, undefined);
        assert.equal(p.skillId, PATTERN_SKILLS[tier]);
        assert.ok(getSkill(p.skillId));
        assert.equal(p.choices.length, tier === 0 ? 2 : 3);
        assert.equal(new Set(p.choices.map((c) => c.id)).size, p.choices.length);
        assert.equal(p.choices.filter((c) => c.id === p.answerId).length, 1);
        assert.ok(p.choices.every((c) => c.shapes?.length === 1 && c.shapes[0] === c.id));
        assert.equal(p.visual.type, 'pattern-progression');
        if (p.visual.type !== 'pattern-progression') throw new Error('Expected pattern');
        const { shapes, unitLength } = p.visual;
        const structure = PATTERN_UNITS[PATTERN_RULES[tier]!];
        const unit = shapes.slice(0, unitLength);
        for (let a = 0; a < unitLength; a++) for (let b = 0; b < unitLength; b++) assert.equal(unit[a] === unit[b], structure[a] === structure[b]);
        assert.ok(shapes.every((shape, i) => shape === unit[i % unitLength]));
        assert.equal(p.answerId, unit[shapes.length % unitLength]);
        assert.equal(p.visual.matching, tier === 0);
        assert.ok(p.hints.length >= 2 && p.model.includes(p.answerId));
        examples.add(JSON.stringify(shapes));
      }
      assert.equal(examples.size, tier === 0 ? 3 : 4);
    }
  assert.equal(getLesson('pattern-progression'), patternProgressionLesson);
  assert.equal(getLesson('patterns-shapes'), patternsLesson);
  assert.deepEqual(TEACHER_REGISTRY.pippa.activity, { kind: 'lesson', lessonId: 'patterns-shapes' });
  assert.equal(teacherActivity('pippa', 'pattern-progression')?.activity.kind, 'lesson');
  assert.equal(teacherActivity('nova', 'pattern-progression'), undefined);
});

it('each continuation skill stays distinct, supported hints/models count honestly and tiers never promote', () => {
  for (let tier = 0; tier < 5; tier++)
    for (const support of ['hint', 'model', 'retry'] as const) {
      const run = new LessonRun(patternProgressionLesson, tier, 7);
      if (support === 'retry') run.answer(run.currentProblem()!.choices.find((c) => c.id !== run.currentProblem()!.answerId)!.id);
      else run[support]();
      assert.equal(run.attempts.length, 0);
      run.answer(run.currentProblem()!.answerId);
      assert.equal(run.attempts[0]!.outcome, 'supported');
      while (!run.isComplete) run.answer(run.currentProblem()!.answerId);
      assert.equal(run.currentTier, tier);
      assert.deepEqual(tallyBySkill(run.attempts, run.problemIndex), [
        { skillId: PATTERN_SKILLS[tier], independent: 3, supported: 1, notYet: 0, maxTier: tier },
      ]);
    }
  const skip = new LessonRun(patternProgressionLesson, 4, 1);
  while (!skip.isComplete) {
    skip.model();
    skip.skip();
  }
  assert.deepEqual(tallyBySkill(skip.attempts, skip.problemIndex), []);
  const exhausted = new LessonRun(patternProgressionLesson, 2, 9);
  for (let i = 0; i < 3; i++) exhausted.answer('not-a-choice');
  assert.equal(exhausted.attempts[0]!.outcome, 'not_yet');
});
function finished(tier = 2) {
  const run = new LessonRun(patternProgressionLesson, tier, 42);
  run.model();
  run.answer(run.currentProblem()!.answerId);
  run.skip();
  while (!run.isComplete) run.answer(run.currentProblem()!.answerId);
  return run;
}
for (const adapter of ['memory', 'indexeddb'] as const)
  it(`${adapter}: saves and reload preserve legacy designs, isolate siblings and create no artworks`, async () => {
    const { ctx } = makeContext();
    let db = adapter === 'indexeddb' ? await IndexedDbDatabase.open(`pattern-progression-${adapter}`, SCHEMA_VERSION, TABLES) : null;
    if (db) ctx.repos = new Repositories(db);
    try {
      const old = new LessonRun(patternsLesson, 1, 3);
      while (old.currentProblem()?.kind === 'answer') old.answer(old.currentProblem()!.answerId);
      old.answer('circle square triangle circle');
      const legacy = await recordLesson(ctx, 'sample', old, '2026-01-01T00:00:00Z', []);
      const before = await ctx.repos.evidence.all();
      assert.ok(before.some((e) => e.skillId === 'reason.visual-patterns'));
      assert.ok(!before.some((e) => PATTERN_SKILLS.slice(1).includes(e.skillId as (typeof PATTERN_SKILLS)[1])));
      assert.equal(await startTierFor(ctx, 'sample', patternProgressionLesson), 0);
      const run = finished();
      const results = await Promise.all([
        recordLesson(ctx, 'sample', run, '2026-01-02T00:00:00Z', []),
        recordLesson(ctx, 'sample', run, '2026-01-02T00:00:00Z', []),
      ]);
      assert.equal(results[0]!.attempt.id, results[1]!.attempt.id);
      assert.equal(await ctx.repos.lessonAttempts.count(), 2);
      assert.equal(await ctx.repos.teacherInteractions.count(), 2);
      assert.notEqual(finished().id, run.id);
      const evidence = results[0]!.evidence.filter((e) => e.skillId !== 'reason.persistence');
      assert.deepEqual(
        evidence.map((e) => e.skillId),
        ['reason.pattern-continue-aab'],
      );
      assert.deepEqual(evidence[0]!.trials, { independent: 2, supported: 1, notYet: 0 });
      assert.equal(await ctx.repos.portfolio.count(), 0);
      assert.equal(results[0]!.outcome.snapshot.artworks, 0);
      assert.equal((await ctx.repos.forChild(ctx.repos.evidence, 'sample-sibling')).length, 0);
      assert.match(results[0]!.attempt.summary, /Skipped 1 round/);
      await assert.rejects(recordLesson(ctx, 'sample', new LessonRun(patternProgressionLesson, 0, 0), 'start', []), /Incomplete/);
      if (db) {
        db.close();
        db = await IndexedDbDatabase.open(`pattern-progression-${adapter}`, SCHEMA_VERSION, TABLES);
        ctx.repos = new Repositories(db);
      }
      assert.equal(await ctx.repos.lessonAttempts.count(), 2);
      assert.deepEqual(await ctx.repos.lessonAttempts.get(legacy.attempt.id), legacy.attempt);
      assert.deepEqual(
        (await ctx.repos.evidence.all()).filter((e) => e.source.id === legacy.attempt.id),
        before,
      );
      const design = before.find((e) => e.skillId === 'art.shape-design')!;
      assert.equal(design.kind, 'observation');
      assert.deepEqual(design.trials, { independent: 0, supported: 0, notYet: 0 });
    } finally {
      db?.close();
    }
  });
it('new continuation records sync repeatedly without schema changes, duplicates or advanced legacy claims', async () => {
  const { ctx } = makeContext();
  const a = new SyncingDatabase(new MemoryDatabase(TABLES), 'sample-device');
  const b = new SyncingDatabase(new MemoryDatabase(TABLES), 'sample-phone');
  ctx.repos = new Repositories(a);
  const result = await recordLesson(ctx, 'sample', finished(4), '2026-01-01T00:00:00Z', []);
  const changes = await Promise.all(
    (await a.outbox()).map(async (row) => ({ table: row.table, id: row.id, mod: row.mod, data: shareable(row.table, await a.table(row.table).get(row.id)) })),
  );
  assert.ok(changes.every(validChange));
  await b.applyRemote(changes);
  await b.applyRemote(changes);
  const repos = new Repositories(b);
  assert.equal(await repos.lessonAttempts.count(), 1);
  assert.equal((await repos.lessonAttempts.get(result.attempt.id))!.lessonId, 'pattern-progression');
  assert.deepEqual(
    (await repos.forChild(repos.evidence, 'sample')).filter((e) => e.skillId !== 'reason.persistence').map((e) => e.skillId),
    ['reason.pattern-continue-abc'],
  );
  assert.equal((await repos.forChild(repos.evidence, 'sample-sibling')).length, 0);
  assert.equal(await repos.portfolio.count(), 0);
});
