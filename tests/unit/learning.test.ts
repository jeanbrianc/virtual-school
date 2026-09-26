/** Lessons, recommendations, capability profiles, reports and catalog integrity. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDomainProfiles } from '../../src/domain/adaptive/profile';
import { chooseStartTier, prerequisitesMet, recommendNext } from '../../src/domain/adaptive/recommendations';
import { SKILLS, validateCatalog } from '../../src/domain/curriculum';
import { LessonRun } from '../../src/domain/lessons/engine';
import { moonRocksLesson } from '../../src/domain/lessons/moonRocks';
import { sinkFloatLesson } from '../../src/domain/lessons/sinkFloat';
import { updateMasteryRecord } from '../../src/domain/mastery/masteryEngine';
import { BOOK_CATALOG } from '../../src/domain/reading/bookCatalog';
import { generateReport, lowerFirst } from '../../src/domain/reports/reportGenerator';
import { personalize, teacherOpening } from '../../src/domain/teachers/teachers';
import type { MasteryRecord } from '../../src/domain/types';
import { ev } from './helpers';

const rec = (skillId: string, evidence: ReturnType<typeof ev>[]): MasteryRecord =>
  updateMasteryRecord(undefined, 'child_izzy', skillId, evidence, '2026-09-20T10:00:00Z');
const proficient = (skillId: string) => rec(skillId, [ev(skillId, '2026-09-01', { independent: 2 }), ev(skillId, '2026-09-03', { independent: 2 })]);
const wrongChoice = (run: LessonRun) => {
  const p = run.currentProblem()!;
  return p.choices.find((c) => c.id !== p.answerId)!.id;
};

describe('adaptive lesson runner', () => {
  it('first-try answers are independent and two in a row step difficulty up', () => {
    const run = new LessonRun(moonRocksLesson, 0, 42);
    const a = run.answer(run.currentProblem()!.answerId);
    assert.equal(a.outcome, 'independent');
    const b = run.answer(run.currentProblem()!.answerId);
    assert.equal(b.tierChange, 'up');
    assert.equal(run.currentTier, 1);
  });

  it('a wrong answer walks the gentle scaffold ladder, never a penalty', () => {
    const run = new LessonRun(moonRocksLesson, 3, 7);
    const first = run.answer(wrongChoice(run));
    assert.equal(first.problemFinished, false);
    assert.equal(first.scaffold?.type, 'hint');
    assert.match(first.message, /Almost|Good thinking|close/);
    assert.doesNotMatch(first.message, /wrong|incorrect|fail/i);
    // Second miss → simpler stepping-stone problem.
    const second = run.answer(wrongChoice(run));
    assert.equal(second.scaffold?.type, 'simpler');
    assert.equal(run.isSteppingStone(), true);
    run.answer(run.currentProblem()!.answerId); // solve the stepping stone
    // Then the original problem, answered right → supported (not independent).
    const done = run.answer(run.currentProblem()!.answerId);
    assert.equal(done.outcome, 'supported');
  });

  it('when the ladder is exhausted the answer is modeled, recorded as not-yet and difficulty eases', () => {
    const run = new LessonRun(moonRocksLesson, 3, 11);
    let fb;
    for (let i = 0; i < 6; i++) {
      fb = run.answer(wrongChoice(run));
      if (fb.problemFinished) break;
    }
    assert.equal(fb!.outcome, 'not_yet');
    assert.equal(fb!.scaffold?.type, 'model');
    assert.equal(fb!.tierChange, 'down');
    assert.equal(run.attempts.at(-1)!.outcome, 'not_yet');
  });

  it('predictions are never wrong in the sink-or-float lab', () => {
    const run = new LessonRun(sinkFloatLesson, 0, 3);
    const p = run.currentProblem()!;
    assert.equal(p.kind, 'predict');
    const fb = run.answer(p.choices[p.choices.length - 1]!.id);
    assert.equal(fb.outcome, 'independent');
  });

  it('completes after the configured number of rounds', () => {
    const run = new LessonRun(moonRocksLesson, 0, 5);
    let guard = 0;
    while (!run.isComplete && guard++ < 50) run.answer(run.currentProblem()!.answerId);
    assert.equal(run.isComplete, true);
    assert.equal(run.attempts.length, moonRocksLesson.rounds);
  });

  it('start tier follows mastery (review skills first, never jump past gaps)', () => {
    const tiers = moonRocksLesson.tiers.map((t) => t.skillId);
    assert.equal(chooseStartTier(tiers, []), 0);
    const records = tiers.slice(0, 3).map(proficient);
    assert.equal(chooseStartTier(tiers, records), 3);
  });

  it('teacher lines are personalized per child', () => {
    assert.equal(personalize('Hello, {name}! {NAME}!', 'Georgia'), 'Hello, Georgia! GEORGIA!');
    const lines = teacherOpening('digit', { childName: 'Georgia', visitsToday: 0, booksCompleted: 0 }, 1);
    assert.ok(lines.join(' ').includes('Georgia') || !lines.join(' ').includes('{name}'));
    assert.ok(!lines.join(' ').includes('Izzy'));
  });
});

describe('recommendations & capability profiles', () => {
  it('recommends skills just beyond mastery with prerequisites met', () => {
    const records = [proficient('math.count-10'), proficient('math.add-10')];
    const recs = recommendNext(records, { domainId: 'math', limit: 10 });
    assert.ok(recs.length > 0);
    const levels = new Map(records.map((r) => [r.skillId, r.computedLevel]));
    for (const r of recs) {
      assert.equal(r.skill.domainId, 'math');
      if (r.reason === 'ready') assert.ok(prerequisitesMet(r.skill, levels), `${r.skillId} prerequisites met`);
    }
    assert.ok(!recs.some((r) => r.skillId === 'math.count-10'), 'proficient skills are not re-recommended as new');
  });

  it('a developing skill is recommended to continue practicing', () => {
    const records = [rec('math.add-20', [ev('math.add-20', '2026-09-10', { supported: 2 })])];
    const recs = recommendNext(records, { domainId: 'math' });
    assert.equal(recs.find((r) => r.skillId === 'math.add-20')?.reason, 'continue');
  });

  it('profiles are per domain: advanced reading can coexist with early math', () => {
    const readingSkills = SKILLS.filter((s) => s.domainId === 'reading' && s.difficulty >= 3).slice(0, 2);
    const profiles = buildDomainProfiles(
      [...readingSkills.map((s) => proficient(s.id)), rec('math.count-10', [ev('math.count-10', '2026-09-01', { supported: 1 })])],
      3.7,
    );
    assert.equal(profiles.find((p) => p.domainId === 'reading')?.descriptor, 'advanced');
    assert.equal(profiles.find((p) => p.domainId === 'math')?.descriptor, 'developing');
    assert.equal(profiles.find((p) => p.domainId === 'science')?.descriptor, 'not yet explored');
  });
});

describe('reports', () => {
  const inputs = () => {
    const evidence = [
      { ...ev('read.inference', '2026-09-10', { independent: 1 }), statement: 'Explained why Wilbur was scared.' },
      { ...ev('math.add-10', '2026-08-01', { independent: 1 }), statement: 'Old evidence outside the period.' },
    ];
    return {
      child: {
        id: 'child_izzy',
        householdId: 'h',
        name: 'Izzy',
        birthDate: '2023-01-01',
        status: 'active' as const,
        avatarId: 'a',
        createdAt: '2026-01-01T00:00:00Z',
      },
      books: [],
      sessions: [],
      activities: [],
      evidence,
      mastery: [rec('read.inference', evidence.slice(0, 1))],
      lessons: [],
      unlocks: [],
      portfolio: [],
    };
  };

  it('parent report includes evidence and standards; only in-period data', () => {
    const r = generateReport(inputs(), { audience: 'parent', start: '2026-09-01', end: '2026-09-30', now: '2026-09-30T12:00:00Z' });
    assert.equal(r.periodLabel, 'September 2026');
    assert.ok(r.highlights.some((h) => h.statement.includes('Wilbur')));
    assert.ok(!JSON.stringify(r).includes('Old evidence'));
    assert.ok(r.domains.find((d) => d.domainId === 'reading')!.standards.length > 0);
    assert.match(r.disclaimer, /estimates/);
  });

  it('family report is jargon-free (kid-facing subject names, no standards codes)', () => {
    const r = generateReport(inputs(), { audience: 'family', start: '2026-09-01', end: '2026-09-30', now: '2026-09-30T12:00:00Z' });
    assert.equal(r.domains[0]!.name, 'Story Adventures');
    assert.ok(!r.stats.some((s) => /evidence/i.test(s.label)));
    assert.ok(!r.narrative.join(' ').match(/RL\.\d|CCSS|NGSS/));
  });

  it('lowercases sentence starts but keeps names', () => {
    assert.equal(lowerFirst('Answered a question'), 'answered a question');
    assert.equal(lowerFirst('Moon Rock Rescue: 3 problems'), 'Moon Rock Rescue: 3 problems');
    assert.equal(lowerFirst('Izzy counted', ['Izzy']), 'Izzy counted');
  });
});

describe('catalog integrity', () => {
  it('curriculum has no duplicate ids, missing prerequisites or cycles', () => {
    assert.deepEqual(validateCatalog(), []);
  });

  it('every skill carries at least one standard alignment and a parent activity idea', () => {
    for (const s of SKILLS) {
      assert.ok(s.standards.length > 0, `${s.id} has standards`);
      assert.ok(s.activityIdea.length > 10, `${s.id} has an idea`);
    }
  });

  it('book questions reference real skills and valid answers', () => {
    const ids = new Set(SKILLS.map((s) => s.id));
    for (const b of BOOK_CATALOG) {
      assert.ok(b.questions.length >= 1, `${b.id} has questions`);
      for (const q of b.questions) {
        assert.ok(ids.has(q.skillId), `${b.id}: ${q.skillId}`);
        assert.ok(q.answerIndex >= 0 && q.answerIndex < q.choices.length, `${b.id}/${q.id}: answer index in range`);
        assert.equal(new Set(q.choices).size, q.choices.length, `${b.id}/${q.id}: distinct choices`);
      }
    }
  });
});
