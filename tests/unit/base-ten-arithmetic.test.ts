import assert from 'node:assert/strict';
import { it } from 'node:test';
import { Repositories } from '../../src/data/repositories';
import { MemoryDatabase } from '../../src/data/storage/memory';
import { TABLES } from '../../src/data/schema';
import { validChange } from '../../src/sync/protocol';
import { SyncingDatabase } from '../../src/data/storage/syncing';
import {
  ARITHMETIC_ID,
  ARITHMETIC_CHALLENGES,
  arithmeticEntry,
  arithmeticProblem,
  arithmeticRecord,
  type ArithmeticProgress,
} from '../../src/domain/lessons/baseTenArithmetic';
import { getSkill } from '../../src/domain/curriculum';
import { moonRocksLesson } from '../../src/domain/lessons/moonRocks';
import { updateMasteryRecord } from '../../src/domain/mastery/masteryEngine';
import { recordArithmetic } from '../../src/services/arithmeticService';
import { snapshotFromRecords, loadChildRecords, worldFromRecords } from '../../src/services/learningCore';
import { ev, makeContext, makeFamily } from './helpers';

function session(childId: string, mode: ArithmeticProgress['mode'] = 'learning', tier = 0, seed = 42): ArithmeticProgress {
  return { id: `synthetic-${mode}-${tier}-${seed}`, childId, startedAt: '2026-10-17T10:00:00.000Z', seed, tier, mode, rounds: [] };
}
const solved = (s: ArithmeticProgress, round: number) => ({ responses: [arithmeticProblem(s.seed, s.tier, round).answerId], scaffolds: [] });

it('four deterministic unique arithmetic targets stay within 100 without regrouping or teaching-answer leaks', () => {
  const correctRanks = new Set<number>();
  let noSharedOnes = 0;
  let noSharedTens = 0;
  for (let seed = 0; seed < 500; seed++)
    for (let tier = 0; tier < 2; tier++) {
      const answers = new Set<string>();
      for (let round = 0; round < 4; round++) {
        const p = arithmeticProblem(seed, tier, round);
        assert.deepEqual(p, arithmeticProblem(seed, tier, round));
        const answer = Number(p.answerId);
        assert.ok(p.left >= 20 && p.left <= 99 && p.right >= 10 && p.right <= 99);
        assert.ok(answer >= 0 && answer <= 99);
        assert.equal(answer, p.operation === 'add' ? p.left + p.right : p.left - p.right);
        assert.ok(p.operation === 'add' ? (p.left % 10) + (p.right % 10) < 10 : p.left % 10 >= p.right % 10);
        assert.equal(p.operation, tier === 1 && round % 2 === 1 ? 'subtract' : 'add');
        assert.equal(p.skillId, ARITHMETIC_CHALLENGES[p.operation === 'add' ? 0 : 1].skillId);
        assert.equal(new Set(p.choices.map((c) => c.id)).size, 3);
        assert.equal(new Set(p.choices.map((c) => c.label)).size, 3);
        assert.equal(p.choices.filter((c) => c.id === p.answerId).length, 1);
        correctRanks.add(
          p.choices
            .map((c) => Number(c.id))
            .sort((a, b) => a - b)
            .indexOf(answer),
        );
        assert.ok(
          p.choices.some((c) => Number(c.id) % 10 !== answer % 10),
          'ones errors must be distinguishable',
        );

        assert.ok(p.choices.every((c) => Number(c.id) >= 0 && Number(c.id) <= 99));
        const wrong = p.choices.filter((c) => c.id !== p.answerId).map((c) => Number(c.id));
        if (wrong.every((n) => n % 10 !== answer % 10)) noSharedOnes++;
        if (wrong.every((n) => Math.floor(n / 10) !== Math.floor(answer / 10))) noSharedTens++;
        assert.ok(![13, 23, 34, 37].includes(answer), 'worked-example answers cannot become targets');
        assert.match(p.model, /No trading is needed/);
        assert.match(p.model, new RegExp(`make ${answer}\\.`));
        assert.equal(p.hints.length, 2);
        assert.notEqual(arithmeticProblem(seed, tier, round, true).answerId, p.answerId);
        answers.add(p.answerId);
      }
      assert.equal(answers.size, 4);
    }
  assert.deepEqual([...correctRanks].sort(), [0, 1, 2], 'correct choices span smallest, middle and largest values');
  assert.ok(noSharedOnes > 500 && noSharedTens > 500, 'many targets defeat the digit-intersection shortcut in each dimension');
  assert.throws(() => arithmeticProblem(1, 2, 0));
  assert.throws(() => arithmeticProblem(1, 0, 4));
  assert.throws(() => arithmeticProblem(NaN, 0, 0));
  assert.equal(moonRocksLesson.tiers.length, 7);
  for (const goal of ARITHMETIC_CHALLENGES) assert.ok(getSkill(goal.skillId)?.lessonIds.includes(ARITHMETIC_ID));
});

it('readiness is mathematical, advisory, and separate for addition and mixed practice', () => {
  const proficient = (id: string) =>
    updateMasteryRecord(undefined, 'child', id, [ev(id, '2026-10-15', { independent: 2 }), ev(id, '2026-10-17', { independent: 2 })], '2026-10-17T10:00:00Z');
  assert.deepEqual(arithmeticEntry([proficient('read.chapter-stamina')]), { readyAdd: false, readyMixed: false, atCeiling: false });
  const add = ['math.tens-ones-20-99', 'math.compose-20-99', 'math.decompose-20-99', 'math.add-20'].map(proficient);
  assert.deepEqual(arithmeticEntry(add), { readyAdd: true, readyMixed: false, atCeiling: false });
  const mixed = [...add, proficient('math.sub-10')];
  assert.deepEqual(arithmeticEntry(mixed), { readyAdd: true, readyMixed: true, atCeiling: false });
  assert.equal(arithmeticEntry([...mixed, ...ARITHMETIC_CHALLENGES.map((g) => proficient(g.skillId))]).atCeiling, true);
  add[0]!.needsReview = true;
  assert.equal(arithmeticEntry(add).readyAdd, false);
});

it('support, retries, worked models and skips stay distinct; unfinished or unknown choices cannot be saved', () => {
  const p = arithmeticProblem(42, 0, 0);
  const wrong = p.choices.find((c) => c.id !== p.answerId)!.id;
  assert.equal(arithmeticRecord(42, 0, 0, { responses: [p.answerId], scaffolds: [] }).outcome, 'independent');
  assert.equal(arithmeticRecord(42, 0, 0, { responses: [wrong, p.answerId], scaffolds: [] }).outcome, 'supported');
  for (const support of ['hint', 'simpler'] as const)
    assert.equal(arithmeticRecord(42, 0, 0, { responses: [p.answerId], scaffolds: [support] }).outcome, 'supported');
  assert.equal(arithmeticRecord(42, 0, 0, { responses: [p.answerId], scaffolds: ['model'] }).outcome, 'not_yet');
  assert.equal(arithmeticRecord(42, 0, 0, { responses: [], scaffolds: [], skipped: true }).outcome, 'skipped');
  assert.throws(() => arithmeticRecord(42, 0, 0, { responses: [wrong], scaffolds: [] }), /not finished/);
  assert.throws(() => arithmeticRecord(42, 0, 0, { responses: ['unknown'], scaffolds: [] }), /Unknown or excess answer/);
});

it('incremental saves are exactly once, append-only, child-scoped, recoverable, and never grow the moon rocket', async () => {
  const { ctx, repos, db } = makeContext();
  const { children } = await makeFamily(ctx, ['First', 'Second']);
  const child = children[0]!.id;
  const s = session(child);
  s.rounds.push(solved(s, 0));
  await Promise.all([recordArithmetic(ctx, child, s), recordArithmetic(ctx, child, s)]);
  assert.equal(await repos.lessonAttempts.count(), 1);
  assert.equal((await repos.evidence.all()).length, 1);
  assert.equal((await repos.lessonAttempts.all())[0]!.complete, false);
  const firstSnapshot = structuredClone(s);
  s.rounds.push({ ...solved(s, 1), scaffolds: ['hint'] });
  s.rounds.push({ responses: [], scaffolds: ['model'] });
  s.rounds.push({ responses: [], scaffolds: [], skipped: true });
  await Promise.all([recordArithmetic(ctx, child, s), recordArithmetic(ctx, child, firstSnapshot)]);
  const saved = (await repos.lessonAttempts.all())[0]!;
  assert.equal(saved.complete, true);
  assert.deepEqual(
    saved.problems.map((p) => p.outcome),
    ['independent', 'supported', 'model_only', 'skipped'],
  );
  assert.equal((await repos.evidence.all()).length, 2);
  const records = await loadChildRecords(ctx, child);
  assert.equal(snapshotFromRecords(records).lessonCompletions['moon-rocks'], undefined);
  assert.equal(worldFromRecords(records).rocketStage, 0);
  assert.notEqual(records.mastery[0]!.computedLevel, 'proficient');
  const reloaded = new Repositories(db);
  assert.deepEqual(await reloaded.lessonAttempts.all(), [saved]);
  await assert.rejects(recordArithmetic(ctx, children[1]!.id, s), /another child/);
  await assert.rejects(recordArithmetic(ctx, child, { ...s, mode: 'review' }), /identity/);
  const tampered = structuredClone(s);
  tampered.rounds[0]!.scaffolds.push('hint');
  await assert.rejects(recordArithmetic(ctx, child, tampered), /cannot change/);
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
  await recordArithmetic({ ...ctx, repos }, child, s);
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
  await assert.rejects(recordArithmetic(ctx, child, s), /synthetic disk/);
  assert.equal(await repos.lessonAttempts.count(), 0);
  assert.equal(await repos.evidence.count(), 0);
  repos.commit = commit;
  await recordArithmetic(ctx, child, s);
  assert.equal((await repos.lessonAttempts.all())[0]!.problems[0]!.outcome, 'independent');
});

it('new-learning evidence is narrow, mixed skills are separate, and same-session success does not establish mastery', async () => {
  const { ctx, repos, clock } = makeContext();
  const { children } = await makeFamily(ctx);
  const child = children[0]!.id;
  const first = session(child, 'learning', 1, 101);
  first.rounds = Array.from({ length: 4 }, (_, i) => solved(first, i));
  await recordArithmetic(ctx, child, first);
  const evidence = await repos.evidence.all();
  assert.equal(evidence.length, 4);
  assert.equal(evidence.filter((e) => e.skillId === ARITHMETIC_CHALLENGES[0].skillId).length, 2);
  assert.equal(evidence.filter((e) => e.skillId === ARITHMETIC_CHALLENGES[1].skillId).length, 2);
  assert.ok(evidence.every((e) => /manipulation, decomposition, regrouping and algorithm use were not observed/.test(e.statement)));
  assert.ok((await repos.mastery.all()).every((m) => m.computedLevel === 'developing'));
  const before = await repos.mastery.all();
  clock.advanceDays(1);
  const review = session(child, 'review', 1, 202);
  review.startedAt = clock.now().toISOString();
  review.rounds = Array.from({ length: 4 }, (_, i) => solved(review, i));
  await recordArithmetic(ctx, child, review);
  assert.deepEqual(await repos.mastery.all(), before);
  assert.equal(await repos.evidence.count(), 4);
});

it('concurrent arithmetic sessions for one child retain both aggregate mastery observations', async () => {
  const { ctx, repos } = makeContext();
  const { children } = await makeFamily(ctx);
  const child = children[0]!.id;
  const a = session(child, 'learning', 0, 1),
    b = session(child, 'learning', 0, 2);
  a.rounds = [solved(a, 0)];
  b.rounds = [solved(b, 0)];
  await Promise.all([recordArithmetic(ctx, child, a), recordArithmetic(ctx, child, b)]);
  assert.equal(await repos.evidence.count(), 2);
  assert.equal(await repos.lessonAttempts.count(), 2);
  const mastery = (await repos.mastery.all()).find((m) => m.skillId === ARITHMETIC_CHALLENGES[0].skillId)!;
  assert.equal(mastery.stats.independent, 2);
});

it('viewing a model before any answer is ungraded; an unsuccessful answer followed by a model stays not yet', async () => {
  const { ctx, repos } = makeContext();
  const { children } = await makeFamily(ctx);
  const child = children[0]!.id;
  const s = session(child, 'learning', 0, 707);
  s.rounds = [{ responses: [], scaffolds: ['model'] }];
  await recordArithmetic(ctx, child, s);
  assert.equal((await repos.lessonAttempts.all())[0]!.problems[0]!.outcome, 'model_only');
  assert.match((await repos.lessonAttempts.all())[0]!.summary, /1 model-only \(ungraded\)/);
  assert.equal(await repos.evidence.count(), 0);
  assert.equal(await repos.mastery.count(), 0);
  const p = arithmeticProblem(s.seed, s.tier, 1);
  s.rounds.push({ responses: [p.choices.find((c) => c.id !== p.answerId)!.id], scaffolds: ['hint', 'model'] });
  await recordArithmetic(ctx, child, s);
  assert.equal((await repos.lessonAttempts.all())[0]!.problems[1]!.outcome, 'not_yet');
  assert.equal(await repos.evidence.count(), 1);
  assert.equal((await repos.evidence.all())[0]!.trials.notYet, 1);
});
