import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { readFileSync } from 'node:fs';
import { WeatherRun, weatherLesson, WEATHER_PICTURES } from '../../src/domain/lessons/weather';
import { lifeCycleLesson } from '../../src/domain/lessons/lifeCycle';
import { sinkFloatLesson } from '../../src/domain/lessons/sinkFloat';
import { LessonRun, tallyBySkill } from '../../src/domain/lessons/engine';
import { createRng } from '../../src/domain/util/random';
import { getSkill } from '../../src/domain/curriculum';
import { getLesson } from '../../src/domain/lessons/registry';
import { teacherActivity, TEACHER_REGISTRY } from '../../src/domain/teachers/registry';
import { recordLesson } from '../../src/services/lessonService';
import { recordWeatherLesson } from '../../src/services/weatherService';
import { Repositories } from '../../src/data/repositories';
import { IndexedDbDatabase } from '../../src/data/storage/indexedDb';
import { MemoryDatabase } from '../../src/data/storage/memory';
import { SyncingDatabase, shareable } from '../../src/data/storage/syncing';
import { SCHEMA_VERSION, TABLES } from '../../src/data/schema';
import { validChange } from '../../src/sync/protocol';
import { makeContext, makeFamily } from './helpers';

it('each level produces deterministic, varied four-round content with one unambiguous answer', () => {
  const varied = new Set<string>();
  for (let seed = 0; seed < 80; seed++)
    for (const tier of [0, 1]) {
      const rng = createRng(seed),
        repeat = createRng(seed);
      const targets = new Set<string>();
      for (let round = 0; round < 4; round++) {
        const p = weatherLesson.generateRound(tier, rng, round)[0]!;
        assert.deepEqual(p, weatherLesson.generateRound(tier, repeat, round)[0]);
        assert.equal(p.kind, 'answer');
        assert.equal(p.alsoSkills, undefined);
        assert.equal(p.choices.length, 2);
        assert.equal(new Set(p.choices.map((c) => c.id)).size, 2);
        assert.equal(p.choices.filter((c) => c.id === p.answerId).length, 1);
        assert.equal(p.visual.type, 'weather');
        if (p.visual.type !== 'weather') throw new Error('Wrong visual');
        assert.equal(p.visual.chart, tier > 0);
        const counts = p.choices.map((c) => (p.visual.type === 'weather' ? p.visual.pictures.filter((w) => w === c.id).length : 0));
        if (tier === 0) assert.deepEqual(p.visual.pictures, [p.answerId]);
        else {
          assert.ok([3, 4].includes(p.visual.pictures.length));
          assert.ok(counts.includes(1));
          assert.ok(counts.includes(round % 2 === 0 ? 3 : 2));
          assert.equal(p.visual.pictures.filter((w) => w === p.answerId).length, Math.max(...counts));
          assert.match(p.prompt, /made-up chart/);
          assert.match(p.model, /not tomorrow’s forecast/);
        }
        targets.add(p.answerId);
        varied.add(JSON.stringify([p.visual, p.choices]));
      }
      assert.ok([...targets].every((target) => WEATHER_PICTURES.includes(target as (typeof WEATHER_PICTURES)[number])));
    }
  assert.ok(varied.size > 60);
});
it('routing and curriculum preserve old labs; only narrow skills map to this fictional lab', () => {
  assert.equal(getLesson('weather-pictures'), weatherLesson);
  assert.equal(getLesson('life-cycle'), lifeCycleLesson);
  assert.equal(getLesson('sink-float'), sinkFloatLesson);
  assert.equal(TEACHER_REGISTRY.nova.activity.lessonId, 'sink-float');
  assert.equal(teacherActivity('nova', 'weather-pictures')?.activity.kind, 'lesson');
  assert.equal(teacherActivity('digit', 'weather-pictures'), undefined);
  const match = getSkill('sci.weather-picture-match')!,
    chart = getSkill('sci.weather-chart-compare')!;
  assert.match(JSON.stringify(match.standards), /not real weather observation/);
  assert.match(JSON.stringify(chart.standards), /Partial practice/);
  assert.match(JSON.stringify(chart.standards), /K-ESS2-1/);
  assert.deepEqual(getSkill('sci.weather')!.lessonIds, []);
  const docs = readFileSync(new URL('../../docs/nova-weather-review.md', import.meta.url), 'utf8');
  assert.match(docs, /nextgenscience.org\/topic-arrangement\/kweather-and-climate/);
  assert.match(docs, /2026-10-17/);
  assert.match(docs, /not full standard mastery/);
});
it('hint, model and retry remain supported; skip and viewing are not performance; no automatic promotion', () => {
  for (const tier of [0, 1])
    for (const support of ['hint', 'model', 'retry'] as const) {
      const run = new WeatherRun('child_sample', tier, 12);
      if (support === 'retry') run.answer(run.currentProblem()!.choices.find((c) => c.id !== run.currentProblem()!.answerId)!.id);
      else run[support]();
      assert.equal(run.attempts.length, 0);
      run.answer(run.currentProblem()!.answerId);
      run.skip();
      while (!run.isComplete) run.answer(run.currentProblem()!.answerId);
      assert.equal(run.currentTier, tier);
      assert.deepEqual(tallyBySkill(run.attempts, run.problemIndex), [
        { skillId: weatherLesson.tiers[tier]!.skillId, independent: 2, supported: 1, notYet: 0, maxTier: tier },
      ]);
    }
});
function finish(tier = 0, child = 'child_sample') {
  const run = new WeatherRun(child, tier, 12);
  run.model();
  run.answer(run.currentProblem()!.answerId);
  run.skip();
  while (!run.isComplete) run.answer(run.currentProblem()!.answerId);
  return run;
}
for (const adapter of ['memory', 'indexeddb'] as const)
  it(`${adapter}: child-bound saves are atomic, exactly-once, retryable, and preserve old records`, async (t) => {
    const { ctx } = makeContext();
    const name = `weather-${adapter}`;
    const db = adapter === 'indexeddb' ? await IndexedDbDatabase.open(name, SCHEMA_VERSION, TABLES) : new MemoryDatabase(TABLES);
    ctx.repos = new Repositories(db);
    await makeFamily(ctx, ['Sample', 'Sibling']);
    const old = new LessonRun(sinkFloatLesson, 0, 3);
    while (!old.isComplete) old.answer(old.currentProblem()!.answerId);
    await recordLesson(ctx, 'child_sample', old, '2026-01-01T00:00:00Z', []);
    const before = await ctx.repos.evidence.all(),
      unlocks = await ctx.repos.rewardUnlocks.all();
    const run = finish();
    await assert.rejects(recordWeatherLesson(ctx, 'child_sibling', run, 'start', []), /another child/);
    await assert.rejects(recordWeatherLesson(ctx, 'missing', finish(0, 'missing'), 'start', []), /Unknown/);
    await assert.rejects(recordWeatherLesson(ctx, 'child_sample', new WeatherRun('child_sample', 0, 1), 'start', []), /Incomplete/);
    const commit = db.commit.bind(db);
    const child = (await ctx.repos.children.get('child_sample'))!;
    const mock = t.mock.method(db, 'commit', (ops: import('../../src/data/storage/types').WriteOp[]) =>
      commit([...ops, { table: 'children', type: 'add', value: child }]),
    );
    await assert.rejects(recordWeatherLesson(ctx, 'child_sample', run, '2026-01-02T00:00:00Z', []));
    assert.equal(await ctx.repos.lessonAttempts.count(), 1);
    assert.deepEqual(await ctx.repos.evidence.all(), before);
    mock.mock.restore();
    const results = await Promise.all(Array.from({ length: 3 }, () => recordWeatherLesson(ctx, 'child_sample', run, '2026-01-02T00:00:00Z', [])));
    assert.equal(new Set(results.map((r) => r.attempt.id)).size, 1);
    assert.equal(await ctx.repos.lessonAttempts.count(), 2);
    assert.equal(await ctx.repos.teacherInteractions.count(), 2);
    assert.notEqual(finish().id, run.id);
    for (const row of before) assert.deepEqual(await ctx.repos.evidence.get(row.id), row);
    for (const row of unlocks) assert.deepEqual(await ctx.repos.rewardUnlocks.get(row.id), row);
    assert.deepEqual(
      results[0]!.evidence.filter((e) => e.skillId.startsWith('sci.')).map((e) => e.skillId),
      ['sci.weather-picture-match'],
    );
    assert.equal((await ctx.repos.forChild(ctx.repos.evidence, 'child_sibling')).length, 0);
    if (adapter === 'indexeddb') {
      db.close();
      const again = await IndexedDbDatabase.open(name, SCHEMA_VERSION, TABLES);
      ctx.repos = new Repositories(again);
      await recordWeatherLesson(ctx, 'child_sample', run, '2026-01-02T00:00:00Z', []);
      assert.equal(await ctx.repos.lessonAttempts.count(), 2);
      again.close();
    } else db.close();
  });
it('weather rows and narrow evidence survive sync/repeated remote delivery without sibling leakage', async () => {
  const { ctx } = makeContext();
  const a = new SyncingDatabase(new MemoryDatabase(TABLES), 'sample-desktop'),
    b = new SyncingDatabase(new MemoryDatabase(TABLES), 'sample-phone');
  ctx.repos = new Repositories(a);
  await makeFamily(ctx, ['Sample', 'Sibling']);
  await recordWeatherLesson(ctx, 'child_sample', finish(1), '2026-01-01T00:00:00Z', []);
  const changes = await Promise.all(
    (await a.outbox()).map(async (row) => ({ table: row.table, id: row.id, mod: row.mod, data: shareable(row.table, await a.table(row.table).get(row.id)) })),
  );
  assert.ok(changes.every(validChange));
  await b.applyRemote(changes);
  await b.applyRemote(changes);
  const repos = new Repositories(b);
  assert.equal(await repos.lessonAttempts.count(), 1);
  assert.deepEqual((await repos.evidence.all()).filter((e) => e.skillId === 'sci.weather-chart-compare')[0]!.trials, {
    independent: 2,
    supported: 1,
    notYet: 0,
  });
  assert.equal((await repos.forChild(repos.evidence, 'child_sibling')).length, 0);
});

it('first-round target varies by seed, preventing round-index answer memorization', () => {
  for (const tier of [0, 1]) {
    const targets = new Set(Array.from({ length: 60 }, (_, seed) => weatherLesson.generateRound(tier, createRng(seed), 0)[0]!.answerId));
    assert.deepEqual([...targets].sort(), [...WEATHER_PICTURES].sort());
  }
});
