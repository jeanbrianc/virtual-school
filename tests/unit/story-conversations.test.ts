import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Repositories } from '../../src/data/repositories';
import { SCHEMA_VERSION, TABLES } from '../../src/data/schema';
import { IndexedDbDatabase } from '../../src/data/storage/indexedDb';
import { LessonRun, tallyBySkill } from '../../src/domain/lessons/engine';
import { questionToProblem, storyChatLesson } from '../../src/domain/lessons/storyChat';
import { computeMastery, updateMasteryRecord } from '../../src/domain/mastery/masteryEngine';
import { BOOK_CATALOG, getCatalogBook, selectQuestions } from '../../src/domain/reading/bookCatalog';
import { catalogQuestionMarker, recentStoryQuestionIds, storyQuestionMarker } from '../../src/domain/reading/storySelection';
import { normalizeSettings } from '../../src/domain/settings';
import type { Book, Evidence } from '../../src/domain/types';
import { sequentialIds } from '../../src/domain/util/ids';
import { updateSettings } from '../../src/services/householdService';
import { loadChildRecords } from '../../src/services/learningCore';
import { addBook, completeBook, logReading, updateBook } from '../../src/services/readingService';
import { validChange } from '../../src/sync/protocol';
import { ev, makeContext, makeFamily, mutableClock } from './helpers';

const newIds = ['tom-kitten', 'benjamin-bunny', 'mrs-tiggy-winkle', 'squirrel-nutkin', 'jemima-puddle-duck'];
const tom = getCatalogBook('tom-kitten')!;

test('reviewed expansion adds five stable titles and 20 original, internally consistent questions', () => {
  assert.equal(BOOK_CATALOG.length, 20);
  assert.equal(
    BOOK_CATALOG.reduce((n, b) => n + b.questions.length, 0),
    49,
  );
  assert.equal(new Set(BOOK_CATALOG.map((b) => b.id)).size, 20);
  const allQuestions = BOOK_CATALOG.flatMap((b) => b.questions);
  assert.equal(new Set(allQuestions.map((q) => q.id)).size, 49);
  assert.deepEqual(
    BOOK_CATALOG.slice(0, 15).map((b) => b.id),
    [
      'peter-rabbit',
      'frog-and-toad',
      'hungry-caterpillar',
      'mercy-watson',
      'henry-and-mudge',
      'little-bear',
      'owl-at-home',
      'amelia-bedelia',
      'dinosaurs-before-dark',
      'charlottes-web',
      'my-fathers-dragon',
      'velveteen-rabbit',
      'winnie-the-pooh',
      'nate-the-great',
      'boxcar-children',
    ],
  );
  for (const id of newIds) {
    const book = getCatalogBook(id)!;
    assert.equal(book.questions.length, 4);
    for (const type of ['detail', 'sequence', 'inference']) assert.ok(book.questions.some((q) => q.type === type));
    assert.match(book.provenance!.sourceUrl, /^https:\/\/www\.gutenberg\.org\/cache\/epub\/\d+\/pg\d+-images\.html$/);
    assert.ok(book.provenance!.contentNote);
    assert.equal(book.totalPages, undefined, 'edition-dependent length is not guessed');
    for (const q of book.questions) {
      assert.ok(q.prompt && q.hint && q.explain);
      assert.equal(new Set(q.choices).size, q.choices.length);
      assert.ok(q.answerIndex >= 0 && q.answerIndex < q.choices.length);
    }
  }
});

test('parent depth, practiced skills, and exact recent IDs select deterministic fresh questions', () => {
  assert.equal(selectQuestions(tom, { depth: 'gentler' })[0]!.type, 'detail');
  assert.equal(selectQuestions(tom, { depth: 'deeper' })[0]!.type, 'inference');
  const practiced = updateMasteryRecord(undefined, 'child', 'read.retell', [ev('read.retell', '2026-10-01', { supported: 1 })], '2026-10-01');
  assert.equal(selectQuestions(tom, { depth: 'gentler', mastery: [practiced] })[0]!.type, 'sequence');
  const first = selectQuestions(tom, { depth: 'gentler' });
  const second = selectQuestions(tom, { depth: 'gentler', recentQuestionIds: first.map((q) => q.id) });
  assert.equal(new Set([...first, ...second].map((q) => q.id)).size, 4);
  const third = selectQuestions(tom, { depth: 'gentler', recentQuestionIds: [...second, ...first].map((q) => q.id) });
  assert.deepEqual(new Set(third.map((q) => q.id)), new Set(first.map((q) => q.id)));
  assert.equal(selectQuestions(tom, { depth: 'deeper' }, 0).length, 0);
});

test('legacy adaptive depth respects proficiency and parent overrides', () => {
  const proficient = updateMasteryRecord(
    undefined,
    'child',
    'read.key-details',
    [ev('read.key-details', '2026-10-01', { independent: 2 }), ev('read.key-details', '2026-10-02', { independent: 2 })],
    '2026-10-02',
  );
  assert.equal(selectQuestions(tom, { depth: 'adaptive', mastery: [proficient] })[0]!.type, 'inference');
  assert.ok(['detail', 'sequence'].includes(selectQuestions(tom, { depth: 'gentler', mastery: [proficient] })[0]!.type));
  assert.equal(normalizeSettings({}).storyConversationDepth, 'adaptive');
  assert.equal(normalizeSettings({ storyConversationDepth: 'deeper' }).storyConversationDepth, 'deeper');
  assert.equal(normalizeSettings({ storyConversationDepth: 'invalid' as never }).storyConversationDepth, 'adaptive');
});

test('history uses explicit catalog IDs and child/book/skill scope, never title or quoted prompt guesses', () => {
  const q = tom.questions[0]!;
  const book = { id: 'book', childId: 'child', catalogId: tom.id } as Book;
  const item: Evidence = {
    ...ev(q.skillId, '2026-10-01', { independent: 1 }, { childId: 'child' }),
    source: { type: 'book', id: 'book', label: tom.title },
    excerpt: `${storyQuestionMarker(q.id)} “${q.prompt}”`,
  };
  assert.deepEqual(recentStoryQuestionIds([book], [item]), [q.id]);
  for (const patch of [
    { childId: 'sibling' },
    { skillId: 'read.inference' },
    { createdBy: 'parent' as const },
    { excerpt: `“${q.prompt}”` },
    { excerpt: '[story-question:peter-rabbit.q1]' },
    { source: { type: 'activity' as const, id: 'book', label: tom.title } },
  ])
    assert.deepEqual(recentStoryQuestionIds([book], [{ ...item, ...patch }]), []);
  assert.equal(catalogQuestionMarker(q.id, q.skillId, 'invented prompt', tom.id), '');
  assert.equal(catalogQuestionMarker(q.id, q.skillId, q.prompt, 'peter-rabbit'), '');
});

test('sequence choice is only sequence evidence; hinted answers are supported and skip has zero trials', () => {
  const sequence = tom.questions.find((q) => q.type === 'sequence')!;
  const p = questionToProblem(sequence, [0, 1, 2]);
  assert.equal(p.alsoSkills, undefined);
  const run = new LessonRun(storyChatLesson(tom, [sequence, tom.questions[0]!]), 0, 1);
  run.hint();
  run.answer(run.currentProblem()!.answerId);
  run.skip();
  assert.deepEqual(
    tallyBySkill(run.attempts, run.problemIndex).map((t) => ({ skillId: t.skillId, independent: t.independent, supported: t.supported })),
    [{ skillId: 'read.retell', independent: 0, supported: 1 }],
  );
});

test('arbitrary narration is an ungraded zero-trial observation, with old evidence left untouched', async () => {
  const { ctx } = makeContext();
  const { children } = await makeFamily(ctx, ['Synthetic']);
  const childId = children[0]!.id;
  const old = { ...ev('read.narration', '2026-09-01', { independent: 1 }, { childId }), kind: 'observation' as const };
  await ctx.repos.evidence.put(old);
  const result = await completeBook(ctx, childId, {
    newBook: { title: 'Unknown synthetic story' },
    answers: [],
    narration: 'The moon turned into a noodle.',
    favoritePart: 'The moon',
    feeling: 'Funny',
    startedAt: '2026-10-01',
    transcript: [],
    source: 'child',
  });
  const narration = result.evidence.find((e) => e.skillId === 'read.narration')!;
  assert.equal(narration.kind, 'observation');
  assert.deepEqual(narration.trials, { independent: 0, supported: 0, notYet: 0 });
  assert.match(narration.statement, /ungraded.*not assessed/);
  assert.equal(computeMastery([narration]).stats.independent, 0);
  assert.deepEqual(await ctx.repos.evidence.get(old.id), old);
  assert.equal(result.book.favoritePart, 'The moon');
});

test('book progress, prompts, depth and exact history survive reload and sync payload validation without reassessment', async () => {
  const name = `story-history-${Date.now()}`;
  let db = await IndexedDbDatabase.open(name, SCHEMA_VERSION, TABLES);
  const clock = mutableClock();
  let ctx = { repos: new Repositories(db), clock, ids: sequentialIds('story') };
  const { children } = await makeFamily(ctx, ['Synthetic', 'Sibling']);
  const childId = children[0]!.id;
  const book = await addBook(ctx, childId, { title: tom.title, catalogId: tom.id, totalPages: 32, status: 'reading' });
  await logReading(ctx, childId, { bookId: book.id, pagesRead: 5, source: 'child' });
  const run = new LessonRun(storyChatLesson(tom, selectQuestions(tom, false)), 0, 2);
  while (!run.isComplete) run.answer(run.currentProblem()!.answerId);
  const finished = await completeBook(ctx, childId, {
    bookId: book.id,
    answers: [...run.attempts],
    problems: run.problemIndex,
    rating: 4,
    startedAt: clock.now().toISOString(),
    transcript: [],
    source: 'child',
  });
  const custom = await addBook(ctx, childId, { title: 'Synthetic custom story' });
  const storyPrompt = { prompt: 'Who brought the kite?', answer: 'Avery' };
  await updateBook(ctx, { ...custom, storyPrompt });
  await updateSettings(ctx, { storyConversationDepth: 'deeper' });
  db.close();
  db = await IndexedDbDatabase.open(name, SCHEMA_VERSION, TABLES);
  ctx = { ...ctx, repos: new Repositories(db) };
  try {
    const records = await loadChildRecords(ctx, childId);
    assert.deepEqual(new Set(recentStoryQuestionIds(records.books, records.evidence)), new Set(run.attempts.map((a) => a.problemId)));
    assert.equal(records.books.find((b) => b.id === book.id)!.pagesRead, 32);
    assert.equal(records.books.find((b) => b.id === book.id)!.childRating, 4);
    assert.deepEqual(records.books.find((b) => b.id === custom.id)!.storyPrompt, storyPrompt);
    assert.equal((await ctx.repos.households.all())[0]!.settings.storyConversationDepth, 'deeper');
    const sibling = await loadChildRecords(ctx, children[1]!.id);
    assert.deepEqual(recentStoryQuestionIds(sibling.books, records.evidence), []);
    for (const [table, data] of [
      ['books', records.books.find((b) => b.id === custom.id)!],
      ['evidence', records.evidence[0]!],
      ['households', (await ctx.repos.households.all())[0]!],
    ] as const)
      assert.deepEqual(validChange({ table, id: data.id, mod: '1790000000000.0000.test', data })?.data, data);
    await assert.rejects(
      () => completeBook(ctx, childId, { bookId: book.id, answers: [], startedAt: clock.now().toISOString(), transcript: [], source: 'child' }),
      /already completed/,
    );
    assert.equal((await ctx.repos.rewardUnlocks.all()).length, finished.outcome.newRewards.length);
    const reread = await logReading(ctx, childId, { bookId: book.id, pagesRead: 1, source: 'child' });
    assert.equal(reread.book.status, 'completed');
    assert.equal(reread.book.shelfIndex, finished.shelfIndex);
    assert.deepEqual(reread.outcome.newRewards, []);
  } finally {
    db.close();
  }
});
