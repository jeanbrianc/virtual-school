import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  RoutineRun,
  routineTask,
  validateRoutineOrder,
  modelRoutineOrder,
  placeRoutineCard,
  ROUTINE_SKILLS,
  type RoutineSize,
} from '../../src/domain/lessons/routine';
import { recordRoutine } from '../../src/services/routineService';
import { getSkill, skillsForLesson } from '../../src/domain/curriculum';
import { Repositories } from '../../src/data/repositories';
import { MemoryDatabase } from '../../src/data/storage/memory';
import { IndexedDbDatabase } from '../../src/data/storage/indexedDb';
import { SyncingDatabase, shareable } from '../../src/data/storage/syncing';
import { SCHEMA_VERSION, TABLES } from '../../src/data/schema';
import { validChange } from '../../src/sync/protocol';
import { makeContext } from './helpers';
import { DISCOVERABLE_IDS } from '../../src/domain/discovery';
import { TEACHER_REGISTRY } from '../../src/domain/teachers/registry';
import { createTeacher } from '../../src/engine/characters/teachers';

function permutations(ids: string[]): string[][] {
  return ids.length ? ids.flatMap((id) => permutations(ids.filter((other) => other !== id)).map((rest) => [id, ...rest])) : [[]];
}
function finished(size: RoutineSize = 2) {
  const run = new RoutineRun('sample', size, 7);
  while (!run.complete) {
    run.noteModality('touch');
    run.submit(modelRoutineOrder(run.current!));
  }
  return run;
}

it('deterministic routines define complete acyclic precedence and accept every valid topological order', () => {
  const arrangements = new Set<string>();
  for (let seed = 0; seed < 12; seed++)
    for (const size of [2, 3, 4] as const)
      for (const round of [0, 1]) {
        const task = routineTask(size, round, seed);
        assert.deepEqual(task, routineTask(size, round, seed));
        assert.equal(task.cards.length, size);
        assert.equal(new Set(task.cards.map((c) => c.id)).size, size);
        arrangements.add(task.cards.map((c) => c.id).join(','));
        const all = permutations(task.cards.map((c) => c.id));
        const valid = all.filter((order) => validateRoutineOrder(task, order) === 'valid');
        assert.equal(valid.length, size === 4 ? 2 : 1);
        for (const order of all)
          assert.equal(
            validateRoutineOrder(task, order) === 'valid',
            task.edges.every(([a, b]) => order.indexOf(a) < order.indexOf(b)),
          );
        assert.equal(validateRoutineOrder(task, modelRoutineOrder(task)), 'valid');
        assert.equal(task.theme, round === 0 ? 'art' : 'toys');
        assert.equal(validateRoutineOrder(task, []), 'incomplete');
        assert.equal(validateRoutineOrder(task, Array(size).fill(null)), 'incomplete');
        assert.equal(validateRoutineOrder(task, Array(size).fill('open')), 'invalid');
        assert.equal(validateRoutineOrder(task, ['unknown', ...modelRoutineOrder(task).slice(1)]), 'invalid');
      }
  assert.ok(arrangements.size > 5);
});
it('select/move/swap works identically for touch, pointer and keyboard without duplicates', () => {
  const task = routineTask(4, 0, 1);
  let order: (string | null)[] = Array(4).fill(null);
  order = placeRoutineCard(task, order, 'open', 3);
  order = placeRoutineCard(task, order, 'first', 0);
  order = placeRoutineCard(task, order, 'open', 0);
  assert.deepEqual(order, ['open', null, null, 'first']);
  order = placeRoutineCard(task, order, 'second', 1);
  order = placeRoutineCard(task, order, 'close', 3);
  assert.deepEqual(order, ['open', 'second', null, 'close']);
  order = placeRoutineCard(task, order, 'first', 2);
  assert.equal(validateRoutineOrder(task, order), 'valid');
  assert.deepEqual(placeRoutineCard(task, order, 'unknown', 0), order);
  for (const modality of ['touch', 'pointer', 'keyboard-or-assistive'] as const) {
    const run = new RoutineRun('sample', 4, 1);
    run.noteModality(modality);
    assert.equal(run.submit(order), 'valid');
    assert.equal(run.trials[0]!.outcome, 'independent');
    assert.deepEqual(run.trials[0]!.modalities, [modality]);
  }
});
it('support, retry, incomplete, simpler and skip evidence stay honest; progression is bounded and opt-in', () => {
  for (const kind of ['hint', 'model', 'grown-up'] as const) {
    const run = new RoutineRun('sample', 3, 1);
    run.support(kind);
    assert.equal(run.trials.length, 0);
    run.submit(modelRoutineOrder(run.current!));
    assert.equal(run.trials[0]!.outcome, 'supported');
    run.submit(modelRoutineOrder(run.current!));
    assert.equal(run.suggestedSize, null);
    assert.equal(run.size, 3);
  }
  const retry = new RoutineRun('sample', 2, 1);
  assert.equal(retry.submit([null, null]), 'incomplete');
  assert.equal(retry.submit(['first', 'open']), 'invalid');
  retry.submit(['open', 'first']);
  assert.equal(retry.trials[0]!.orders.length, 2);
  assert.equal(retry.trials[0]!.outcome, 'supported');
  const simpler = new RoutineRun('sample', 4, 1);
  simpler.simpler();
  simpler.submit(['open', 'first']);
  assert.equal(simpler.trials[0]!.task.size, 2);
  assert.deepEqual(simpler.trials[0]!.scaffolds, ['simpler']);
  assert.equal(simpler.current!.size, 4);
  simpler.skip();
  assert.equal(simpler.trials[1]!.outcome, 'skipped');
  assert.equal(simpler.suggestedSize, null);
  for (const size of [2, 3, 4] as const) {
    const run = finished(size);
    assert.equal(run.size, size);
    assert.equal(run.suggestedSize, size === 4 ? null : size + 1);
    assert.equal(run.submit([]), 'inactive');
  }
  const cancelled = finished();
  cancelled.cancelled = true;
  assert.equal(cancelled.complete, false);
  assert.equal(cancelled.current, null);
});
it('reviewed Family skills are narrow, legacy sequencing remains untouched, and Tavi is discoverable in a clear scene position', () => {
  assert.deepEqual(
    skillsForLesson('everyday-sequencing')
      .map((s) => s.id)
      .sort(),
    [...ROUTINE_SKILLS].sort(),
  );
  assert.ok(ROUTINE_SKILLS.every((id) => getSkill(id)?.standards.every((s) => s.framework === 'Family')));
  assert.equal(getSkill('reason.sequencing')!.standards[0]!.framework, 'ELOF');
  assert.ok(DISCOVERABLE_IDS.includes('tavi'));
  assert.equal(createTeacher('tavi', 0).id, 'tavi');
  const { x, z } = TEACHER_REGISTRY.tavi.scene;
  assert.ok(Math.abs(x) > 3.5 && z > 5, 'outside dance rug, tables and chalkboard');
  for (const id of ['hoot', 'nova', 'digit', 'pippa'] as const) {
    const old = TEACHER_REGISTRY[id].scene;
    assert.ok(Math.hypot(old.x - x, old.z - z) > 2.5);
  }
});
for (const adapter of ['memory', 'indexeddb'] as const)
  it(`${adapter}: atomic concurrent saves, cancel, reload and child isolation preserve old evidence`, async () => {
    const { ctx } = makeContext();
    let db = adapter === 'indexeddb' ? await IndexedDbDatabase.open(`sample-routine-${adapter}`, SCHEMA_VERSION, TABLES) : null;
    if (db) ctx.repos = new Repositories(db);
    try {
      const legacy = {
        id: 'sample-old',
        childId: 'sample',
        lessonId: 'old-lesson',
        teacherId: 'retired-teacher',
        startedAt: '2026-01-01',
        completedAt: '2026-01-01',
        startTier: 0,
        endTier: 0,
        problems: [],
        summary: 'Sample legacy evidence',
      };
      await ctx.repos.lessonAttempts.put(legacy);
      const run = new RoutineRun('sample', 4, 1);
      run.support('model');
      run.noteModality('keyboard-or-assistive');
      run.submit(['open', 'second', 'first', 'close']);
      run.skip();
      run.reflection = 'different';
      const saved = await Promise.all([recordRoutine(ctx, 'sample', run), recordRoutine(ctx, 'sample', run)]);
      assert.equal(saved[0]!.id, saved[1]!.id);
      assert.equal(await ctx.repos.lessonAttempts.count(), 2);
      assert.equal(await ctx.repos.evidence.count(), 2);
      assert.equal(await ctx.repos.teacherInteractions.count(), 1);
      for (const ev of await ctx.repos.evidence.all()) {
        assert.equal(ev.childId, 'sample');
        assert.deepEqual(ev.trials, { independent: 0, supported: 1, notYet: 0 });
      }
      assert.match(saved[0]!.summary, /1 supported, 1 skipped/);
      assert.match(saved[0]!.summary, /descriptive, not graded/);
      assert.match(saved[0]!.summary, /keyboard-or-assistive/);
      assert.equal((await ctx.repos.forChild(ctx.repos.evidence, 'sample-sibling')).length, 0);
      await assert.rejects(recordRoutine(ctx, 'sample-sibling', run), /wrong-child/);
      await assert.rejects(recordRoutine(ctx, 'sample', new RoutineRun('sample', 2, 1)), /Incomplete/);
      const cancelled = finished();
      cancelled.cancelled = true;
      await assert.rejects(recordRoutine(ctx, 'sample', cancelled), /Incomplete/);
      const before = await ctx.repos.evidence.all();
      if (db) {
        db.close();
        db = await IndexedDbDatabase.open(`sample-routine-${adapter}`, SCHEMA_VERSION, TABLES);
        ctx.repos = new Repositories(db);
      }
      assert.deepEqual(await ctx.repos.evidence.all(), before);
      assert.deepEqual(await ctx.repos.lessonAttempts.get(legacy.id), legacy);
      await recordRoutine(ctx, 'sample', run);
      assert.equal(await ctx.repos.lessonAttempts.count(), 2);
    } finally {
      db?.close();
    }
  });
it('a failed atomic save leaves no partial attempt and remains retryable', async () => {
  const { ctx, db } = makeContext();
  const run = finished();
  const commit = db.commit.bind(db);
  let fail = true;
  db.commit = async (ops) => {
    if (fail) {
      fail = false;
      throw new Error('Sample storage full');
    }
    return commit(ops);
  };
  await assert.rejects(recordRoutine(ctx, 'sample', run), /storage full/);
  assert.equal(await ctx.repos.lessonAttempts.count(), 0);
  assert.equal(await ctx.repos.evidence.count(), 0);
  assert.equal(await ctx.repos.teacherInteractions.count(), 0);
  await recordRoutine(ctx, 'sample', run);
  assert.equal(await ctx.repos.lessonAttempts.count(), 1);
});
it('routine completion and exact evidence sync through the existing protocol with no schema or new reward changes', async () => {
  const { ctx } = makeContext();
  const a = new SyncingDatabase(new MemoryDatabase(TABLES), 'sample-device');
  const b = new SyncingDatabase(new MemoryDatabase(TABLES), 'sample-phone');
  ctx.repos = new Repositories(a);
  const run = finished(4);
  const saved = await recordRoutine(ctx, 'sample', run);
  const changes = await Promise.all(
    (await a.outbox()).map(async (row) => ({ table: row.table, id: row.id, mod: row.mod, data: shareable(row.table, await a.table(row.table).get(row.id)) })),
  );
  assert.ok(changes.every(validChange));
  await b.applyRemote(changes);
  await b.applyRemote(changes);
  const repos = new Repositories(b);
  assert.equal(await repos.lessonAttempts.count(), 1);
  assert.equal(await repos.evidence.count(), 4);
  assert.equal((await repos.lessonAttempts.get(saved.id))!.teacherId, 'tavi');
  assert.equal((await repos.forChild(repos.evidence, 'sample-sibling')).length, 0);
  const skipped = new RoutineRun('sample', 2, 2);
  skipped.skip();
  skipped.skip();
  await recordRoutine(ctx, 'sample', skipped);
  assert.equal(await ctx.repos.evidence.count(), 4, 'skips never create mastery evidence');
});
