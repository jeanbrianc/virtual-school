import assert from 'node:assert/strict';
import { it } from 'node:test';
import { Repositories } from '../../src/data/repositories';
import { MemoryDatabase } from '../../src/data/storage/memory';
import { TABLES } from '../../src/data/schema';
import { validChange } from '../../src/sync/protocol';
import { SyncingDatabase } from '../../src/data/storage/syncing';
import { BASE_TEN_ID, BASE_TEN_TIERS, baseTenEntry, baseTenProblem, baseTenRecord, type BaseTenProgress } from '../../src/domain/lessons/baseTen';
import { getSkill } from '../../src/domain/curriculum';
import { moonRocksLesson } from '../../src/domain/lessons/moonRocks';
import { updateMasteryRecord } from '../../src/domain/mastery/masteryEngine';
import { recordBaseTen } from '../../src/services/baseTenService';
import { snapshotFromRecords, loadChildRecords, worldFromRecords } from '../../src/services/learningCore';
import { ev, makeContext, makeFamily } from './helpers';

function session(childId: string, mode: BaseTenProgress['mode'] = 'learning', tier = 0, seed = 42): BaseTenProgress {
  return { id: `synthetic-${mode}-${tier}-${seed}`, childId, startedAt: '2026-10-17T10:00:00.000Z', seed, tier, mode, rounds: [] };
}
const solved = (s: BaseTenProgress, round: number) => ({ responses: [baseTenProblem(s.seed, s.tier, round).answerId], scaffolds: [] });

it('place value generates deterministic, varied, uniquely answerable 20–99 examples and complete models', () => {
  for (let seed = 0; seed < 200; seed++)
    for (let tier = 0; tier < 3; tier++) {
      const values = new Set();
      for (let round = 0; round < 5; round++) {
        const p = baseTenProblem(seed, tier, round);
        assert.deepEqual(p, baseTenProblem(seed, tier, round));
        assert.equal(p.skillId, BASE_TEN_TIERS[tier]!.skillId);
        const value = Number(p.meta!.value),
          tens = Number(p.meta!.tens),
          ones = Number(p.meta!.ones);
        assert.ok(value >= 20 && value <= 99);
        assert.equal(tens * 10 + ones, value);
        assert.equal(p.choices.length, 3);
        assert.equal(new Set(p.choices.map((c) => c.id)).size, 3);
        assert.equal(new Set(p.choices.map((c) => c.label)).size, 3);
        assert.equal(p.choices.filter((c) => c.id === p.answerId).length, 1);
        assert.equal(Number(p.answerId), tier === 0 ? (p.meta!.part === 'tens' ? tens : ones) : value);
        assert.match(p.model, new RegExp(`${tens * 10} \\+ ${ones} = ${value}`));
        assert.equal(p.hints.length, 2);
        if (ones === 0) assert.match(p.model, /no extra ones/);
        const small = baseTenProblem(seed, tier, round, true);
        assert.ok(Number(small.meta!.value) <= 24);
        values.add(value);
      }
      assert.equal(values.size, 5);
    }
  assert.throws(() => baseTenProblem(1, 3, 0));
  assert.throws(() => baseTenProblem(1, 0, 5));
  assert.equal(moonRocksLesson.tiers.length, 7);
  for (const tier of BASE_TEN_TIERS) assert.ok(getSkill(tier.skillId)?.lessonIds.includes(BASE_TEN_ID));
});

it('entry uses mathematical evidence and cross-day proficiency, with review at the ceiling', () => {
  assert.deepEqual(baseTenEntry([]), { ready: false, atCeiling: false, tier: 0, mode: 'review' });
  const proficient = (id: string) =>
    updateMasteryRecord(undefined, 'child', id, [ev(id, '2026-10-15', { independent: 2 }), ev(id, '2026-10-17', { independent: 2 })], '2026-10-17T10:00:00Z');
  assert.equal(baseTenEntry([proficient('read.chapter-stamina')]).ready, false);
  const counting = proficient('math.count-20');
  assert.deepEqual(baseTenEntry([counting]), { ready: true, atCeiling: false, tier: 0, mode: 'learning' });
  assert.equal(baseTenEntry([counting, proficient(BASE_TEN_TIERS[0].skillId)]).tier, 1);
  const all = [counting, ...BASE_TEN_TIERS.map((goal) => proficient(goal.skillId))];
  assert.deepEqual(baseTenEntry(all), { ready: true, atCeiling: true, tier: 0, mode: 'review' });
  all[2]!.needsReview = true;
  assert.equal(baseTenEntry(all).tier, 1);
  assert.equal(baseTenEntry(all).mode, 'review');
});

it('support, retries, worked models and skips stay distinct; unfinished or unknown choices cannot be saved', () => {
  const p = baseTenProblem(42, 0, 0);
  const wrong = p.choices.find((c) => c.id !== p.answerId)!.id;
  assert.equal(baseTenRecord(42, 0, 0, { responses: [p.answerId], scaffolds: [] }).outcome, 'independent');
  assert.equal(baseTenRecord(42, 0, 0, { responses: [wrong, p.answerId], scaffolds: [] }).outcome, 'supported');
  for (const support of ['hint', 'simpler'] as const)
    assert.equal(baseTenRecord(42, 0, 0, { responses: [p.answerId], scaffolds: [support] }).outcome, 'supported');
  assert.equal(baseTenRecord(42, 0, 0, { responses: [p.answerId], scaffolds: ['model'] }).outcome, 'not_yet');
  assert.equal(baseTenRecord(42, 0, 0, { responses: [], scaffolds: [], skipped: true }).outcome, 'skipped');
  assert.throws(() => baseTenRecord(42, 0, 0, { responses: [wrong], scaffolds: [] }), /not finished/);
  assert.throws(() => baseTenRecord(42, 0, 0, { responses: ['unknown'], scaffolds: [] }), /Unknown answer/);
});

it('incremental saves are exactly once, append-only, child-scoped, recoverable, and never grow the moon rocket', async () => {
  const { ctx, repos, db } = makeContext();
  const { children } = await makeFamily(ctx, ['First', 'Second']);
  const child = children[0]!.id;
  const s = session(child);
  s.rounds.push(solved(s, 0));
  await Promise.all([recordBaseTen(ctx, child, s), recordBaseTen(ctx, child, s)]);
  assert.equal(await repos.lessonAttempts.count(), 1);
  assert.equal((await repos.evidence.all()).length, 1);
  assert.equal((await repos.lessonAttempts.all())[0]!.complete, false);
  const firstSnapshot = structuredClone(s);
  s.rounds.push({ ...solved(s, 1), scaffolds: ['hint'] });
  s.rounds.push({ responses: [], scaffolds: ['model'] });
  s.rounds.push({ responses: [], scaffolds: [], skipped: true });
  s.rounds.push(solved(s, 4));
  await Promise.all([recordBaseTen(ctx, child, s), recordBaseTen(ctx, child, firstSnapshot)]);
  const saved = (await repos.lessonAttempts.all())[0]!;
  assert.equal(saved.complete, true);
  assert.deepEqual(
    saved.problems.map((p) => p.outcome),
    ['independent', 'supported', 'not_yet', 'skipped', 'independent'],
  );
  assert.equal((await repos.evidence.all()).length, 4);
  const records = await loadChildRecords(ctx, child);
  assert.equal(snapshotFromRecords(records).lessonCompletions['moon-rocks'], undefined);
  assert.equal(worldFromRecords(records).rocketStage, 0);
  assert.notEqual(records.mastery[0]!.computedLevel, 'proficient');
  const reloaded = new Repositories(db);
  assert.deepEqual(await reloaded.lessonAttempts.all(), [saved]);
  await assert.rejects(recordBaseTen(ctx, children[1]!.id, s), /another child/);
  await assert.rejects(recordBaseTen(ctx, child, { ...s, mode: 'review' }), /identity/);
  const tampered = structuredClone(s);
  tampered.rounds[0]!.scaffolds.push('hint');
  await assert.rejects(recordBaseTen(ctx, child, tampered), /cannot change/);
  assert.equal((await repos.forChild(repos.evidence, children[1]!.id)).length, 0);
});

it('optional review retains dated responses without advancing new-skill mastery and enters existing sync', async () => {
  const { ctx, db, clock } = makeContext();
  const { children } = await makeFamily(ctx);
  const child = children[0]!.id;
  const syncing = new SyncingDatabase(db, 'synthetic-device', () => clock.now().getTime());
  const repos = new Repositories(syncing);
  const s = session(child, 'review');
  s.rounds.push(solved(s, 0));
  await recordBaseTen({ ...ctx, repos }, child, s);
  assert.equal(await repos.evidence.count(), 0);
  assert.equal(await repos.mastery.count(), 0);
  const attempt = (await repos.lessonAttempts.all())[0]!;
  assert.equal(attempt.practiceMode, 'review');
  assert.equal(attempt.problems[0]!.outcome, 'independent');
  assert.ok((await syncing.outbox()).some((change) => change.table === 'lessonAttempts' && change.id === attempt.id));
  const remote = new SyncingDatabase(new MemoryDatabase(TABLES), 'other-synthetic-device');
  const changes = await Promise.all((await syncing.outbox()).map((entry) => syncing.changeFor(entry)));
  for (const change of changes) {
    assert.ok(validChange(change));
    await remote.applyRemote([change!]);
  }
  const remoteRepos = new Repositories(remote);
  assert.equal((await remoteRepos.lessonAttempts.get(attempt.id))!.practiceMode, 'review');
  assert.deepEqual((await remoteRepos.lessonAttempts.get(attempt.id))!.problems, attempt.problems);
});

it('a failed atomic save leaves no partial learning, and retry preserves an independent response', async () => {
  const { ctx, repos } = makeContext();
  const { children } = await makeFamily(ctx);
  const child = children[0]!.id;
  const s = session(child);
  s.rounds.push(solved(s, 0));
  const commit = repos.commit.bind(repos);
  repos.commit = async () => {
    throw new Error('synthetic disk failure');
  };
  await assert.rejects(recordBaseTen(ctx, child, s), /synthetic disk/);
  assert.equal(await repos.lessonAttempts.count(), 0);
  assert.equal(await repos.evidence.count(), 0);
  repos.commit = commit;
  await recordBaseTen(ctx, child, s);
  assert.equal((await repos.lessonAttempts.all())[0]!.problems[0]!.outcome, 'independent');
});

it('varied new-learning evidence across days can advance the suggested goal; completion count and optional revisit cannot', async () => {
  const { ctx, repos, clock } = makeContext();
  const { children } = await makeFamily(ctx);
  const child = children[0]!.id;
  const first = session(child, 'learning', 0, 101);
  first.rounds = Array.from({ length: 5 }, (_, i) => solved(first, i));
  await recordBaseTen(ctx, child, first);
  let mastery = await repos.forChild(repos.mastery, child);
  assert.equal(mastery.find((m) => m.skillId === BASE_TEN_TIERS[0].skillId)!.computedLevel, 'developing');
  assert.equal(baseTenEntry(mastery).tier, 0);
  clock.advanceDays(1);
  const second = session(child, 'learning', 0, 202);
  second.startedAt = clock.now().toISOString();
  second.rounds = [solved(second, 0)];
  await recordBaseTen(ctx, child, second);
  mastery = await repos.forChild(repos.mastery, child);
  assert.equal(mastery.find((m) => m.skillId === BASE_TEN_TIERS[0].skillId)!.computedLevel, 'proficient');
  assert.equal(baseTenEntry(mastery).tier, 1);
  const before = structuredClone(mastery);
  clock.advanceDays(1);
  const revisit = session(child, 'review', 0, 303);
  revisit.startedAt = clock.now().toISOString();
  revisit.rounds = [solved(revisit, 0)];
  await recordBaseTen(ctx, child, revisit);
  assert.deepEqual(await repos.forChild(repos.mastery, child), before);
  assert.ok((await repos.lessonAttempts.all()).some((attempt) => attempt.practiceMode === 'review' && attempt.startedAt === revisit.startedAt));
});
