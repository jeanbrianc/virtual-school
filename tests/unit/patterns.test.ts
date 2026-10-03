import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { patternsLesson } from '../../src/domain/lessons/patterns';
import { LessonRun, tallyBySkill } from '../../src/domain/lessons/engine';
import { recordLesson } from '../../src/services/lessonService';
import { makeContext } from './helpers';
import { createRng } from '../../src/domain/util/random';
import { Repositories } from '../../src/data/repositories';
import { IndexedDbDatabase } from '../../src/data/storage/indexedDb';
import { SCHEMA_VERSION, TABLES } from '../../src/data/schema';

it('bounded pattern generators have unique choices, correct repeats and deterministic variants', () => {
  const variants = new Set<string>();
  for (let seed = 0; seed < 30; seed++) {
    const rounds = [0, 1, 2].map((i) => patternsLesson.generateRound(0, createRng(seed), i)[0]!);
    assert.deepEqual(
      rounds,
      [0, 1, 2].map((i) => patternsLesson.generateRound(0, createRng(seed), i)[0]!),
    );
    for (const p of rounds.slice(0, 2)) {
      assert.equal(new Set(p.choices.map((c) => c.label)).size, p.choices.length);
      assert.equal(p.choices.filter((c) => c.id === p.answerId).length, 1);
      assert.equal(p.visual.type, 'pattern');
      if (p.visual.type === 'pattern') {
        assert.equal(p.visual.shapes[0], p.visual.shapes[2]);
        assert.equal(p.visual.shapes[1], p.visual.shapes[3]);
        assert.notEqual(p.visual.shapes[0], p.visual.shapes[1]);
        variants.add(p.visual.shapes.join(','));
      }
      const simple = patternsLesson.generateSimpler!(p, createRng(seed));
      assert.equal(simple.choices.find((c) => c.id === simple.answerId)?.id, 'pair');
    }
    assert.equal(rounds[2]!.kind, 'create');
    assert.deepEqual(rounds[2]!.choices, []);
  }
  assert.ok(variants.size >= 4);
});
function completed(hint = false) {
  const run = new LessonRun(patternsLesson, 0, 42);
  if (hint) run.answer('wrong');
  while (run.currentProblem()?.kind === 'answer') run.answer(run.currentProblem()!.answerId);
  assert.throws(() => run.answer('circle'), /four shapes/);
  run.answer('circle square triangle circle');
  return run;
}
for (const adapter of ['memory', 'indexeddb'] as const)
  it(`${adapter}: duplicate saves are atomic and designs remain ungraded child-scoped observations`, async () => {
    const { ctx } = makeContext();
    const db = adapter === 'indexeddb' ? await IndexedDbDatabase.open(`patterns-${adapter}`, SCHEMA_VERSION, TABLES) : null;
    if (db) ctx.repos = new Repositories(db);
    try {
      const run = completed(true);
      const results = await Promise.all([
        recordLesson(ctx, 'synthetic_child', run, '2026-01-01T00:00:00Z', []),
        recordLesson(ctx, 'synthetic_child', run, '2026-01-01T00:00:00Z', []),
      ]);
      assert.equal(results[0]!.attempt.id, results[1]!.attempt.id);
      assert.equal(await ctx.repos.lessonAttempts.count(), 1);
      assert.equal(await ctx.repos.teacherInteractions.count(), 1);
      assert.notEqual(completed().id, run.id);
      const evidence = await ctx.repos.evidence.all();
      assert.equal(evidence.length, 3);
      const design = evidence.find((e) => e.skillId === 'art.shape-design')!;
      assert.equal(design.kind, 'observation');
      assert.deepEqual(design.trials, { independent: 0, supported: 0, notYet: 0 });
      assert.match(design.statement, /circle square triangle circle/);
      assert.deepEqual(run.attempts[2]?.responses, ['circle square triangle circle']);
      const mastery = (await ctx.repos.mastery.all()).find((m) => m.skillId === 'art.shape-design')!;
      assert.equal(mastery.stats.independent + mastery.stats.supported + mastery.stats.notYet, 0);
      assert.match(results[0]!.attempt.summary, /1 of 2 solved on the first try, 1 with a hint/);
      assert.equal((await ctx.repos.forChild(ctx.repos.evidence, 'other_child')).length, 0);
      assert.equal((await ctx.repos.mastery.all()).find((m) => m.skillId === 'art.shape-design')?.computedLevel, 'introduced');
    } finally {
      db?.close();
    }
  });
it('skip gives no performance/creation evidence and interrupted runs cannot save', async () => {
  const { ctx } = makeContext();
  const run = new LessonRun(patternsLesson, 0, 2);
  await assert.rejects(recordLesson(ctx, 'synthetic_child', run, 'start', []), /Incomplete/);
  run.skip();
  run.skip();
  run.skip();
  assert.deepEqual(tallyBySkill(run.attempts, run.problemIndex), []);
  await recordLesson(ctx, 'synthetic_child', run, 'start', []);
  assert.equal(await ctx.repos.evidence.count(), 0);
});
