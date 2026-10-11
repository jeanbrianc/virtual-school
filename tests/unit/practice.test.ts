import assert from 'node:assert/strict';
import { it } from 'node:test';
import { recordPractice, type PracticeProgress } from '../../src/services/practiceService';
import type { ProblemAttemptRecord } from '../../src/domain/types';
import { generateReport } from '../../src/domain/reports/reportGenerator';
import { makeContext, makeFamily } from './helpers';

const round = (n: number): ProblemAttemptRecord => ({
  problemId: `r${n}`,
  skillId: 'geo.states',
  tier: 0,
  prompt: `Find state ${n}`,
  responses: ['answer'],
  scaffolds: [],
  outcome: 'independent',
});
const progress = (n: number, complete = false): PracticeProgress => ({
  id: 'test-globe',
  lessonId: 'globe-states',
  startedAt: '2026-10-11T00:00:00Z',
  problems: Array.from({ length: n }, (_, i) => round(i)),
  complete,
});

it('stale and repeated saves preserve all five rounds and completion without granting mastery', async () => {
  const { ctx, repos } = makeContext();
  await recordPractice(ctx, 'test-child', progress(5, true));
  const revisionCount = await repos.meta.count();
  await recordPractice(ctx, 'test-child', progress(1));
  await recordPractice(ctx, 'test-child', progress(5, true));
  const saved = await repos.lessonAttempts.get('test-globe');
  assert.equal(saved?.problems.length, 5);
  assert.equal(saved?.complete, true);
  assert.equal(saved?.teacherId, 'nova');
  assert.equal(await repos.lessonAttempts.count(), 1);
  assert.equal(await repos.meta.count(), revisionCount);
  assert.equal(await repos.evidence.count(), 0);
  assert.equal(await repos.mastery.count(), 0);
});

it('concurrent tabs merge disjoint rounds atomically', async () => {
  const { ctx, repos } = makeContext();
  await Promise.all(Array.from({ length: 5 }, (_, i) => recordPractice(ctx, 'test-child', { ...progress(0), problems: [round(i)] })));
  assert.equal((await repos.lessonAttempts.get('test-globe'))?.problems.length, 5);
});

it('records hints, retries and skipped rounds honestly and cannot hide reported support', async () => {
  const { ctx, repos } = makeContext();
  const p = progress(3);
  p.problems[0]!.scaffolds = ['map labels'];
  p.problems[1]!.responses = ['miss', 'answer'];
  p.problems[2]!.outcome = 'skipped';
  await recordPractice(ctx, 'test-child', p);
  await recordPractice(ctx, 'test-child', progress(1));
  const saved = await repos.lessonAttempts.get(p.id);
  assert.deepEqual(
    saved?.problems.map((x) => x.outcome),
    ['supported', 'supported', 'skipped'],
  );
  assert.match(saved!.summary, /1 skipped or not yet/);
  assert.equal(saved?.complete, false);
});

it('rejects cross-child and cross-adventure session reuse', async () => {
  const { ctx } = makeContext();
  await recordPractice(ctx, 'test-child', progress(1));
  await assert.rejects(recordPractice(ctx, 'other-child', progress(2)), /another child/);
  await assert.rejects(recordPractice(ctx, 'test-child', { ...progress(2), lessonId: 'globe-countries' }), /adventure/);
  await assert.rejects(recordPractice(ctx, 'test-child', { ...progress(1), childId: 'other-child' }), /another child/);
});

it('two IndexedDB connections cannot overwrite each other’s cumulative progress', async () => {
  const { indexedDB } = await import('fake-indexeddb');
  const { IndexedDbDatabase } = await import('../../src/data/storage/indexedDb');
  const { TABLES } = await import('../../src/data/schema');
  const { Repositories } = await import('../../src/data/repositories');
  const previous = globalThis.indexedDB;
  globalThis.indexedDB = indexedDB;
  const name = `test-globe-races-${Date.now()}`;
  const first = await IndexedDbDatabase.open(name, 1, TABLES);
  const second = await IndexedDbDatabase.open(name, 1, TABLES);
  const { ctx } = makeContext();
  try {
    const a = { ...ctx, repos: new Repositories(first) };
    const b = { ...ctx, repos: new Repositories(second) };
    await Promise.all([recordPractice(a, 'test-child', progress(5, true)), recordPractice(b, 'test-child', progress(1))]);
    const saved = await a.repos.lessonAttempts.get('test-globe');
    assert.equal(saved?.problems.length, 5);
    assert.equal(saved?.complete, true);
    assert.equal(await a.repos.lessonAttempts.count(), 1);
  } finally {
    first.close();
    second.close();
    indexedDB.deleteDatabase(name);
    globalThis.indexedDB = previous;
  }
});

it('reports exclude cancelled partial adventures but retain completed and historical attempts', async () => {
  const { ctx, repos, clock } = makeContext('2026-09-26T15:05:00.000Z');
  const { children } = await makeFamily(ctx, ['Synthetic']);
  const child = children[0]!;
  const run = { ...progress(1), id: 'synthetic-partial', startedAt: '2026-09-26T15:00:00.000Z' };
  await recordPractice(ctx, child.id, run);
  const input = {
    child,
    books: [],
    sessions: [],
    activities: [],
    evidence: [],
    mastery: [],
    lessons: await repos.lessonAttempts.all(),
    unlocks: [],
    portfolio: [],
  };
  const request = { audience: 'parent' as const, start: '2026-09-01', end: '2026-09-30', now: clock.now().toISOString() };
  const partial = generateReport(input, request);
  assert.equal(partial.stats.find((s) => s.label === 'Lessons')!.value, '0');
  assert.equal(partial.stats.find((s) => s.label === 'Recorded time')!.value, '—');
  assert.match(partial.narrative.join(' '), /0 in-app lessons/);
  assert.equal(generateReport(input, { ...request, audience: 'family' }).stats.find((s) => s.label === 'Adventures')!.value, '0');

  await recordPractice(ctx, child.id, { ...run, id: 'synthetic-completed', problems: progress(5).problems, complete: true });
  const completed = (await repos.lessonAttempts.get('synthetic-completed'))!;
  const { complete: _complete, ...historical } = completed;
  await repos.lessonAttempts.put({ ...historical, id: 'synthetic-legacy', lessonId: 'retired-unknown' });
  await repos.lessonAttempts.put({ ...completed, id: 'synthetic-outside', completedAt: '2026-08-26T15:05:00.000Z' });
  input.lessons = await repos.lessonAttempts.all();
  const report = generateReport(input, request);
  assert.equal(report.stats.find((s) => s.label === 'Lessons')!.value, '2');
  assert.match(report.narrative.join(' '), /2 in-app lessons/);
  assert.equal(generateReport(input, { ...request, audience: 'family' }).stats.find((s) => s.label === 'Adventures')!.value, '2');
  assert.equal(report.stats.find((s) => s.label === 'Recorded time')!.value, '10 minutes');
  assert.equal((await repos.lessonAttempts.get(run.id))!.complete, false);
});
