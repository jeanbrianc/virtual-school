/**
 * Service-level tests over the in-memory database: book completion, activity
 * entry, reward unlocking, and strict separation between children.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { seedDemoData } from '../../src/data/seed/demoSeed';
import { interpretLocally } from '../../src/domain/interpretation';
import type { ProblemAttemptRecord } from '../../src/domain/types';
import { buildInterpretationContext, saveActivity, type ReviewedActivity } from '../../src/services/activityService';
import { deleteChildData, exportChildData } from '../../src/services/householdService';
import { loadChildRecords, snapshotFromRecords } from '../../src/services/learningCore';
import { addBook, completeBook } from '../../src/services/readingService';
import { makeContext, makeFamily } from './helpers';

const answer = (skillId: string, outcome: ProblemAttemptRecord['outcome']): ProblemAttemptRecord => ({
  problemId: `p-${skillId}-${outcome}`,
  skillId,
  tier: 0,
  prompt: `A question about ${skillId}`,
  responses: ['x'],
  scaffolds: outcome === 'independent' ? [] : ['hint'],
  outcome,
});

async function finishNewBook(ctx: Parameters<typeof completeBook>[0], childId: string, title: string, answers: ProblemAttemptRecord[] = []) {
  return completeBook(ctx, childId, {
    newBook: { title, author: 'Test Author' },
    answers,
    rating: 5,
    favoritePart: 'The ending',
    startedAt: ctx.clock.now().toISOString(),
    transcript: [],
    source: 'child',
  });
}

describe('book completion', () => {
  it('puts the book on the shelf, records evidence and unlocks the first-book pet', async () => {
    const { ctx } = makeContext();
    const { children } = await makeFamily(ctx);
    const izzy = children[0]!;
    const res = await finishNewBook(ctx, izzy.id, 'Frog and Toad Are Friends', [
      answer('read.key-details', 'independent'),
      answer('read.inference', 'supported'),
    ]);
    assert.equal(res.shelfIndex, 0);
    assert.equal(res.booksCompleted, 1);
    assert.equal(res.book.status, 'completed');
    assert.deepEqual(res.evidence.map((e) => e.skillId).sort(), ['read.inference', 'read.key-details']);
    const inference = res.evidence.find((e) => e.skillId === 'read.inference')!;
    assert.equal(inference.independence, 'supported', 'hinted answers are recorded honestly as supported');
    assert.deepEqual(
      res.outcome.newRewards.map((r) => r.id),
      ['pet.bookworm'],
    );
    const rec = await loadChildRecords(ctx, izzy.id);
    assert.equal(rec.unlocks.length, 1);
    assert.equal(rec.unlocks[0]!.celebrated, false, 'celebration is pending until the child sees it');
    assert.equal(rec.interactions.length, 1, 'the conversation is kept for the parent');
    assert.ok(rec.portfolio.some((p) => p.kind === 'book' && p.title.includes('Frog and Toad')));
  });

  it('assigns sequential shelf slots and unlocks the second shelf at 10 books', async () => {
    const { ctx } = makeContext();
    const { children } = await makeFamily(ctx);
    const id = children[0]!.id;
    let last;
    for (let i = 0; i < 10; i++) last = await finishNewBook(ctx, id, `Book ${i + 1}`);
    assert.equal(last!.shelfIndex, 9);
    assert.ok(last!.outcome.newRewards.some((r) => r.id === 'shelf.2'));
    assert.equal(last!.outcome.world.shelfUnits, 2);
    const books = await ctx.repos.forChild(ctx.repos.books, id);
    assert.deepEqual(
      books.map((b) => b.shelfIndex).sort((a, b) => (a ?? 0) - (b ?? 0)),
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    );
  });

  it('refuses to complete the same book twice', async () => {
    const { ctx } = makeContext();
    const { children } = await makeFamily(ctx);
    const id = children[0]!.id;
    const book = await addBook(ctx, id, { title: 'Little Bear', status: 'reading' });
    const input = { bookId: book.id, answers: [], startedAt: '2026-09-26T15:00:00Z', transcript: [], source: 'child' as const };
    await completeBook(ctx, id, input);
    await assert.rejects(() => completeBook(ctx, id, input), /already completed/);
  });
});

describe('activity entry', () => {
  it('saves reviewed suggestions as evidence and grows the world (plants → greenhouse)', async () => {
    const { ctx, clock } = makeContext();
    const { children } = await makeFamily(ctx);
    const id = children[0]!.id;
    const narratives = [
      'We planted bean seeds in cups and put one in the dark closet to compare. Izzy predicted the one in the dark would not grow.',
      'Izzy watered the garden and noticed the tomato plant has new flowers.',
      'We read a book about how seeds sprout and Izzy explained that plants need sunlight and water.',
    ];
    let lastOutcome;
    for (const text of narratives) {
      const interp = interpretLocally(text, await buildInterpretationContext(ctx, id));
      assert.ok(interp.topics.includes('plants'), `plants topic detected in: ${text}`);
      const reviewed: ReviewedActivity = {
        narrative: text,
        title: interp.title,
        date: interp.date,
        skills: interp.skills,
        books: [],
        topics: interp.topics,
        natureItems: interp.natureItems,
        mediaIds: [],
        interpretation: { ...interp.provider, totalSuggestions: interp.skills.length },
      };
      const res = await saveActivity(ctx, id, reviewed);
      assert.ok(res.evidence.length > 0);
      lastOutcome = res.outcome;
      clock.advanceDays(1);
    }
    assert.ok(
      lastOutcome!.newRewards.some((r) => r.id === 'room.greenhouse'),
      'third plant activity opens the greenhouse',
    );
    assert.equal(lastOutcome!.world.greenhouseOpen, true);
  });

  it('unchecked suggestions are not saved; exposure-only evidence never counts as mastery', async () => {
    const { ctx } = makeContext();
    const { children } = await makeFamily(ctx);
    const id = children[0]!.id;
    const interp = interpretLocally(
      'Izzy and I baked muffins. She measured the flour herself and asked why the muffins get bigger in the oven.',
      await buildInterpretationContext(ctx, id),
    );
    const skills = interp.skills.map((s) => (s.skillId === 'life.cooking' ? { ...s, accepted: false } : s));
    const res = await saveActivity(ctx, id, {
      narrative: 'muffins',
      title: 'Muffins',
      date: interp.date,
      skills,
      books: [],
      topics: interp.topics,
      natureItems: [],
      mediaIds: [],
      interpretation: { ...interp.provider, totalSuggestions: skills.length },
    });
    assert.ok(!res.evidence.some((e) => e.skillId === 'life.cooking'), 'rejected suggestion was not stored');
    const exposure = res.evidence.filter((e) => e.kind === 'exposure');
    assert.ok(exposure.length > 0, 'the oven observation is recorded as exposure');
    const mastery = await ctx.repos.forChild(ctx.repos.mastery, id);
    for (const e of exposure) {
      const m = mastery.find((x) => x.skillId === e.skillId);
      assert.equal(m?.computedLevel, 'introduced');
    }
  });
});

describe('multiple children', () => {
  it('keeps books, evidence, mastery and rewards completely separate', async () => {
    const { ctx } = makeContext();
    const { children } = await makeFamily(ctx, ['Izzy', 'Georgia']);
    const [izzy, georgia] = children as [(typeof children)[0], (typeof children)[0]];
    await finishNewBook(ctx, izzy.id, 'Owl at Home', [answer('read.key-details', 'independent')]);
    await finishNewBook(ctx, izzy.id, 'Little Bear');
    await finishNewBook(ctx, georgia.id, 'Goodnight Moon');

    const a = await loadChildRecords(ctx, izzy.id);
    const b = await loadChildRecords(ctx, georgia.id);
    assert.equal(snapshotFromRecords(a).booksCompleted, 2);
    assert.equal(snapshotFromRecords(b).booksCompleted, 1);
    assert.ok(a.books.every((x) => x.childId === izzy.id));
    assert.ok(b.evidence.every((x) => x.childId === georgia.id));
    assert.ok(!b.mastery.some((m) => m.skillId === 'read.key-details'), "Izzy's evidence never leaks into Georgia's mastery");
    assert.equal(b.books[0]!.shelfIndex, 0, "Georgia's shelf starts at slot 0");
    assert.equal(b.unlocks.length, 1);
    assert.ok(b.portfolio[0]!.description.includes('Georgia’s rating'), 'personalized to the right child');
  });

  it('refuses to complete another child’s book', async () => {
    const { ctx } = makeContext();
    const { children } = await makeFamily(ctx, ['Izzy', 'Georgia']);
    const book = await addBook(ctx, children[0]!.id, { title: 'Owl at Home', status: 'reading' });
    await assert.rejects(() =>
      completeBook(ctx, children[1]!.id, { bookId: book.id, answers: [], startedAt: '2026-09-26T15:00:00Z', transcript: [], source: 'child' }),
    );
  });

  it('deleting one child’s data leaves the sibling untouched; export is child-scoped', async () => {
    const { ctx } = makeContext();
    const { children } = await makeFamily(ctx, ['Izzy', 'Georgia']);
    await finishNewBook(ctx, children[0]!.id, 'Owl at Home');
    await finishNewBook(ctx, children[1]!.id, 'Goodnight Moon');
    const exported = JSON.parse(await exportChildData(ctx, children[1]!.id)) as { books: { title: string }[] };
    assert.deepEqual(
      exported.books.map((b) => b.title),
      ['Goodnight Moon'],
    );
    await deleteChildData(ctx, children[0]!.id);
    assert.equal((await loadChildRecords(ctx, children[0]!.id)).books.length, 0);
    assert.equal((await loadChildRecords(ctx, children[1]!.id)).books.length, 1);
  });

  it('demo seed: Izzy has history, Georgia is inactive with her own tiny record', async () => {
    const { ctx, repos } = makeContext();
    await seedDemoData(repos, ctx.clock);
    const kids = await repos.children.all();
    const georgia = kids.find((k) => k.name === 'Georgia')!;
    const izzy = kids.find((k) => k.name === 'Izzy')!;
    assert.equal(georgia.status, 'inactive');
    assert.equal(izzy.status, 'active');
    const iz = await loadChildRecords(ctx, izzy.id);
    const ge = await loadChildRecords(ctx, georgia.id);
    assert.equal(snapshotFromRecords(iz).booksCompleted, 9);
    assert.ok(ge.books.length <= 1);
    assert.ok(
      iz.evidence.every((e) => e.isDemo),
      'demo data is labeled',
    );
  });
});
