import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { Repositories } from '../../src/data/repositories';
import { SCHEMA_VERSION, TABLES } from '../../src/data/schema';
import { IndexedDbDatabase } from '../../src/data/storage/indexedDb';
import { SyncingDatabase } from '../../src/data/storage/syncing';
import { getSkill, skillsForLesson } from '../../src/domain/curriculum';
import {
  beatCount,
  beatOffsets,
  comfortablePulse,
  matchRhythm,
  rhythmGaps,
  validRhythmRun,
  type BeatCount,
  type RhythmRun,
} from '../../src/domain/music/rhythm';
import { recordRhythm } from '../../src/services/rhythmService';
import { makeContext } from './helpers';

function run(mode: 'copy' | 'recognize' = 'copy'): RhythmRun {
  return {
    id: 'sample-visit',
    childId: 'sample',
    startedAt: '2026-01-01T00:00:00Z',
    beats: 2,
    mode,
    cancelled: false,
    trials: [
      { stage: 'guided', pattern: 'a', supported: true, outcome: 'matched', input: mode === 'copy' ? 'keyboard' : 'choice', presentation: 'visual-only' },
      {
        stage: 'independent',
        pattern: 'b',
        supported: false,
        outcome: 'matched',
        input: mode === 'copy' ? 'touch' : 'choice',
        presentation: 'sound-and-visual',
      },
    ],
  };
}
it('patterns are deterministic, two through four beats, fresh after guided practice, and genuinely distinct', () => {
  for (const beats of [2, 3, 4] as BeatCount[]) {
    assert.equal(rhythmGaps(beats, 'a').length, beats - 1);
    assert.deepEqual(rhythmGaps(beats, 'b'), rhythmGaps(beats, 'b'));
    assert.notDeepEqual(rhythmGaps(beats, 'a'), rhythmGaps(beats, 'b'));
    for (const pattern of ['a', 'b'] as const) {
      for (const pace of [800, 1200, 4000, 30_000]) {
        const times = beatOffsets(beats, pattern, pace);
        assert.ok(matchRhythm(beats, pattern, pace, times));
        // Any constant device/reaction delay cancels. Waiting to start never counts against a learner.
        assert.ok(
          matchRhythm(
            beats,
            pattern,
            pace,
            times.map((t) => t + 10_000_000),
          ),
        );
        assert.equal(matchRhythm(beats, pattern, pace, beatOffsets(beats, pattern === 'a' ? 'b' : 'a', pace)), false);
      }
    }
  }
  assert.equal(beatCount(undefined), 2);
  assert.equal(beatCount(99), 2);
  assert.equal(beatCount(3), 3);
  assert.equal(beatCount(4), 4);
});
it('timing boundaries are inclusive and short/long acceptance windows never overlap at supported paces', () => {
  assert.ok(matchRhythm(2, 'a', 800, [300, 700]));
  assert.ok(matchRhythm(2, 'a', 800, [300, 1500]));
  assert.equal(matchRhythm(2, 'a', 800, [300, 1501]), false);
  assert.ok(matchRhythm(2, 'b', 800, [300, 1620]));
  assert.ok(matchRhythm(2, 'b', 800, [300, 3780]));
  assert.equal(matchRhythm(2, 'b', 800, [300, 1619]), false);
  for (let gap = 1; gap < 5000; gap++) assert.equal(matchRhythm(2, 'a', 800, [0, gap]) && matchRhythm(2, 'b', 800, [0, gap]), false);
  for (const bad of [[0], [0, NaN], [1, 0], [0, 800, 1600], [0, Infinity]]) assert.equal(matchRhythm(2, 'a', 800, bad), false);
  for (const bad of [0, 799, NaN, Infinity, 30001]) assert.equal(matchRhythm(2, 'a', bad, [0, 800]), false);
});
it('optional warm-up uses comfortable pace only, rejects unreliable samples, and never makes play faster than default', () => {
  assert.equal(comfortablePulse([10, 1010, 2010]), 1000);
  assert.equal(comfortablePulse([1000, 1100, 1200]), 800);
  assert.equal(comfortablePulse([0, 4000, 8000]), 4000);
  for (const bad of [[0], [0, 0, 0], [3, 2, 1], [0, NaN, 800], [0, 31000, 62000]]) assert.equal(comfortablePulse(bad), null);
});
it('reviewed music skills do not imply broad music, auditory recognition, reading or math proficiency', () => {
  assert.deepEqual(
    skillsForLesson('rhythm-garden')
      .map((s) => s.id)
      .sort(),
    ['art.rhythm-copy', 'art.rhythm-recognize'],
  );
  for (const skill of skillsForLesson('rhythm-garden')) {
    assert.equal(skill.domainId, 'creativity');
    assert.equal(getSkill(skill.id)?.strandId, 'create.performing');
    assert.equal(skill.standards[0]!.framework, 'Family');
  }
});
for (const adapter of ['memory', 'indexeddb', 'syncing'] as const)
  it(`${adapter}: deduplication, fresh independent/support/modality evidence, child isolation and progress`, async () => {
    const { ctx } = makeContext();
    let db;
    if (adapter !== 'memory') {
      const inner = await IndexedDbDatabase.open(`rhythm-${adapter}`, SCHEMA_VERSION, TABLES);
      db = adapter === 'syncing' ? new SyncingDatabase(inner, 'sample') : inner;
      ctx.repos = new Repositories(db);
    }
    try {
      for (const id of ['sample', 'sample-sibling'])
        await ctx.repos.children.put({
          id,
          householdId: 'sample-household',
          name: id === 'sample' ? 'Sample' : 'Sample sibling',
          status: 'active',
          avatarId: `avatar-${id}`,
          createdAt: '2026-01-01T00:00:00Z',
        });
      const r = run();
      const result = await Promise.all([recordRhythm(ctx, 'sample', r), recordRhythm(ctx, 'sample', r)]);
      assert.equal(result[0]!.id, result[1]!.id);
      assert.equal(await ctx.repos.lessonAttempts.count(), 1);
      let evidence = await ctx.repos.evidence.all();
      assert.equal(evidence.length, 2);
      assert.equal(evidence[0]!.skillId, 'art.rhythm-copy');
      assert.equal(evidence[0]!.trials.supported, 1);
      assert.equal(evidence[1]!.trials.independent, 1);
      assert.match(evidence[0]!.statement, /keyboard and visual-only/);
      assert.match(evidence[1]!.statement, /touch and sound-and-visual/);
      assert.equal((await ctx.repos.forChild(ctx.repos.evidence, 'sample-sibling')).length, 0);
      await assert.rejects(recordRhythm(ctx, 'sample-sibling', r), /another child/);
      await recordRhythm(ctx, 'sample-sibling', { ...r, childId: 'sample-sibling' });
      assert.equal((await ctx.repos.forChild(ctx.repos.evidence, 'sample-sibling')).length, 2);
      const recognized = run('recognize');
      recognized.id = 'sample-recognition';
      recognized.trials[1]!.supported = true;
      await recordRhythm(ctx, 'sample', recognized);
      evidence = await ctx.repos.forChild(ctx.repos.evidence, 'sample');
      assert.equal(evidence.filter((e) => e.skillId === 'art.rhythm-recognize').length, 2);
      assert.ok(evidence.filter((e) => e.skillId === 'art.rhythm-recognize').every((e) => e.trials.supported === 1));
      assert.equal((await ctx.repos.forChild(ctx.repos.mastery, 'sample')).length, 2);
      const serialized = JSON.stringify(await ctx.repos.lessonAttempts.all()) + JSON.stringify(evidence);
      assert.doesNotMatch(serialized, /pulseMs|tapTimes|latencyMs|not_yet/);
    } finally {
      db?.close();
    }
  });
it('exploration, hints, skip and cancellation cannot create independent negative-ability or incomplete records', async () => {
  const { ctx } = makeContext();
  await ctx.repos.children.put({
    id: 'sample',
    householdId: 'sample-household',
    name: 'Sample',
    status: 'active',
    avatarId: 'sample-avatar',
    createdAt: '2026-01-01T00:00:00Z',
  });
  const r = run();
  r.trials[0]!.outcome = 'explored';
  r.trials[1]!.outcome = 'skipped';
  await recordRhythm(ctx, 'sample', r);
  assert.equal(await ctx.repos.evidence.count(), 0);
  assert.equal(await ctx.repos.mastery.count(), 0);
  for (const mutate of [
    (x: RhythmRun) => {
      x.cancelled = true;
    },
    (x: RhythmRun) => {
      x.trials.pop();
    },
    (x: RhythmRun) => {
      x.trials[0]!.supported = false;
    },
    (x: RhythmRun) => {
      x.trials[1]!.pattern = 'a';
    },
    (x: RhythmRun) => {
      x.mode = 'recognize';
    },
    (x: RhythmRun) => {
      x.startedAt = 'bad';
    },
  ]) {
    const bad = run();
    mutate(bad);
    assert.equal(validRhythmRun(bad), false);
    await assert.rejects(recordRhythm(ctx, 'sample', bad));
  }
  assert.equal(await ctx.repos.lessonAttempts.count(), 1);
});

it('unknown children cannot create a completion, evidence, mastery or unlock', async () => {
  const { ctx } = makeContext();
  await assert.rejects(recordRhythm(ctx, 'sample', run()), /Unknown rhythm learner/);
  for (const name of ['lessonAttempts', 'evidence', 'mastery', 'rewardUnlocks'] as const) assert.equal(await ctx.repos[name].count(), 0);
});
