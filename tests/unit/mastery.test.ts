import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeMastery, effectiveLevel, updateMasteryRecord } from '../../src/domain/mastery/masteryEngine';
import { ev } from './helpers';

const SKILL = 'math.add-10';

describe('mastery engine', () => {
  it('no evidence → not started', () => {
    assert.equal(computeMastery([]).level, 'not_started');
  });

  it('exposure alone introduces a skill but never advances it', () => {
    const exposures = Array.from({ length: 12 }, (_, i) => ev(SKILL, `2026-09-${String(i + 1).padStart(2, '0')}`, {}, { kind: 'exposure' }));
    const r = computeMastery(exposures);
    assert.equal(r.level, 'introduced');
    assert.equal(r.stats.exposures, 12);
    assert.equal(r.stats.independent, 0);
  });

  it('exposure evidence is ignored even if it (wrongly) carries trial counts', () => {
    const bogus = [1, 2, 3, 4].map((d) => ev(SKILL, `2026-09-0${d}`, { independent: 5 }, { kind: 'exposure' }));
    assert.equal(computeMastery(bogus).level, 'introduced');
  });

  it('supported success → developing', () => {
    assert.equal(computeMastery([ev(SKILL, '2026-09-01', { supported: 2 })]).level, 'developing');
  });

  it('three independent successes on a single day are not yet proficient (needs 2+ days)', () => {
    const r = computeMastery([ev(SKILL, '2026-09-01', { independent: 3 })]);
    assert.equal(r.level, 'developing');
    assert.equal(r.stats.independentDays, 1);
  });

  it('three independent successes across two days → proficient', () => {
    const r = computeMastery([ev(SKILL, '2026-09-01', { independent: 2 }), ev(SKILL, '2026-09-03', { independent: 1 })]);
    assert.equal(r.level, 'proficient');
  });

  it('proficiency requires recent accuracy ≥ 70%', () => {
    const r = computeMastery([ev(SKILL, '2026-09-01', { independent: 2, notYet: 3 }), ev(SKILL, '2026-09-03', { independent: 1, notYet: 2 })]);
    assert.equal(r.level, 'developing');
    assert.ok(r.stats.recentScore < 0.7);
  });

  it('six independent across three days with a clean recent streak → mastered', () => {
    const r = computeMastery([
      ev(SKILL, '2026-09-01', { independent: 2 }),
      ev(SKILL, '2026-09-04', { independent: 2 }),
      ev(SKILL, '2026-09-08', { independent: 2 }),
    ]);
    assert.equal(r.level, 'mastered');
    assert.equal(r.confidence, 'medium');
  });

  it('a not-yet as the most recent attempt blocks mastery (streak rule)', () => {
    const r = computeMastery([
      ev(SKILL, '2026-09-01', { independent: 3 }),
      ev(SKILL, '2026-09-04', { independent: 3 }),
      ev(SKILL, '2026-09-08', { independent: 3 }),
      ev(SKILL, '2026-09-09', { notYet: 1 }),
    ]);
    assert.equal(r.level, 'proficient');
  });

  it('records history on level changes and keeps parent overrides separate', () => {
    const first = updateMasteryRecord(undefined, 'child_izzy', SKILL, [ev(SKILL, '2026-09-01', { supported: 1 })], '2026-09-01T10:00:00Z');
    assert.equal(first.computedLevel, 'developing');
    const withOverride = { ...first, override: { level: 'mastered' as const, note: 'Knows it cold', at: '2026-09-02T10:00:00Z' } };
    assert.equal(effectiveLevel(withOverride), 'mastered');
    const next = updateMasteryRecord(
      withOverride,
      'child_izzy',
      SKILL,
      [ev(SKILL, '2026-09-01', { supported: 1 }), ev(SKILL, '2026-09-02', { independent: 2 }), ev(SKILL, '2026-09-05', { independent: 1 })],
      '2026-09-05T10:00:00Z',
    );
    assert.equal(next.computedLevel, 'proficient');
    assert.equal(next.override?.level, 'mastered', 'override survives recomputation');
    assert.deepEqual(
      next.history.map((h) => h.level),
      ['developing', 'proficient'],
    );
  });

  it('flags a skill for review when performance drops after proficiency', () => {
    const good = [ev(SKILL, '2026-09-01', { independent: 2 }), ev(SKILL, '2026-09-03', { independent: 2 })];
    const rec = updateMasteryRecord(undefined, 'child_izzy', SKILL, good, '2026-09-03T10:00:00Z');
    assert.equal(rec.computedLevel, 'proficient');
    const dropped = updateMasteryRecord(rec, 'child_izzy', SKILL, [...good, ev(SKILL, '2026-09-10', { notYet: 8 })], '2026-09-10T10:00:00Z');
    assert.equal(dropped.computedLevel, 'developing');
    assert.equal(dropped.needsReview, true);
  });
});
