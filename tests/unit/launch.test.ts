/** First launch, fresh starts, sample data, and first-day discovery. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { seedDemoData } from '../../src/data/seed/demoSeed';
import { SEED_META_KEY, loadSampleData, prepareDatabase, startFresh, type SeedMeta } from '../../src/data/seed/launch';
import { DISCOVERABLE_IDS, TEACHER_DISCOVERIES, describeDiscovery, undiscovered, welcomeDiscovery } from '../../src/domain/discovery';
import { emptySnapshot } from '../../src/domain/progress/snapshot';
import { TEACHERS, teacherOpening, type TeacherId } from '../../src/domain/teachers/teachers';
import { deriveWorldState } from '../../src/domain/world/worldState';
import { markExplored, updateSettings } from '../../src/services/householdService';
import { loadChildRecords } from '../../src/services/learningCore';
import { addBook } from '../../src/services/readingService';
import { makeContext } from './helpers';

const learningCounts = async (ctx: ReturnType<typeof makeContext>['ctx'], childId: string) => {
  const r = await loadChildRecords(ctx, childId);
  return { books: r.books.length, evidence: r.evidence.length, unlocks: r.unlocks.length, interactions: r.interactions.length, portfolio: r.portfolio.length };
};
const empty = { books: 0, evidence: 0, unlocks: 0, interactions: 0, portfolio: 0 };

describe('first launch', () => {
  it('creates an empty school: Izzy active, Georgia not started, no books or history', async () => {
    const { ctx, repos } = makeContext();
    assert.equal(await prepareDatabase(repos, ctx.clock), 'seeded-fresh');
    const kids = await repos.children.all();
    const izzy = kids.find((k) => k.name === 'Izzy')!;
    const georgia = kids.find((k) => k.name === 'Georgia')!;
    assert.equal(izzy.status, 'active');
    assert.equal(izzy.birthDate, '2023-01-01');
    assert.equal(georgia.status, 'inactive');
    assert.equal(georgia.birthDate, undefined, 'no invented birthdays');
    assert.ok(!izzy.isDemo && !izzy.activePetId && !izzy.explored?.length);
    assert.deepEqual(await learningCounts(ctx, izzy.id), empty);
    assert.equal((await repos.avatars.all()).length, 2);
    assert.equal(await prepareDatabase(repos, ctx.clock), 'existing', 'second launch leaves it alone');
  });

  it('upgrades an automatically seeded sample (older builds) to a fresh start, keeping avatar and settings', async () => {
    const { ctx, repos } = makeContext();
    await seedDemoData(repos, ctx.clock); // what older builds did on first launch
    const avatar = (await repos.avatars.get('avatar_izzy'))!;
    await repos.avatars.put({ ...avatar, hairStyle: 'buns' });
    await updateSettings(ctx, { parentPin: '2468' });
    assert.equal(await prepareDatabase(repos, ctx.clock), 'upgraded-to-fresh');
    assert.deepEqual(await learningCounts(ctx, 'child_izzy'), empty);
    assert.equal((await repos.avatars.get('avatar_izzy'))!.hairStyle, 'buns');
    assert.equal((await repos.households.all())[0]!.settings.parentPin, '2468');
    const georgia = (await repos.children.get('child_georgia'))!;
    assert.equal(georgia.birthDate, undefined, 'sample birthday removed');
    assert.equal(georgia.isDemo, undefined);
  });

  it('never erases anything a family actually recorded', async () => {
    const { ctx, repos } = makeContext();
    await seedDemoData(repos, ctx.clock);
    await addBook(ctx, 'child_izzy', { title: 'Our Real Book', status: 'reading' });
    assert.equal(await prepareDatabase(repos, ctx.clock), 'existing');
    assert.ok((await loadChildRecords(ctx, 'child_izzy')).books.some((b) => b.title === 'Our Real Book'));
  });

  it('keeps sample data the parent chose on purpose', async () => {
    const { ctx, repos } = makeContext();
    await loadSampleData(repos, ctx.clock);
    const meta = (await repos.meta.get(SEED_META_KEY))!.value as SeedMeta;
    assert.deepEqual([meta.kind, meta.chosenByParent], ['demo', true]);
    assert.equal(await prepareDatabase(repos, ctx.clock), 'existing');
    assert.ok((await learningCounts(ctx, 'child_izzy')).books > 0);
  });

  it('"Start fresh" clears learning records but keeps names, avatars, parents and PIN', async () => {
    const { ctx, repos } = makeContext();
    await prepareDatabase(repos, ctx.clock);
    await addBook(ctx, 'child_izzy', { title: 'Owl at Home', status: 'reading' });
    await markExplored(ctx, 'child_izzy', ['hoot', 'bookshelf']);
    await updateSettings(ctx, { parentPin: '1357' });
    await startFresh(repos, ctx.clock);
    assert.deepEqual(await learningCounts(ctx, 'child_izzy'), empty);
    const izzy = (await repos.children.get('child_izzy'))!;
    assert.equal(izzy.name, 'Izzy');
    assert.equal(izzy.explored, undefined, 'discoveries reset too');
    assert.equal((await repos.parents.all()).length, 2);
    assert.equal((await repos.households.all())[0]!.settings.parentPin, '1357');
  });
});

describe('first-day discovery', () => {
  const ctxFor = (books = 0) => ({
    name: 'Izzy',
    world: deriveWorldState({ ...emptySnapshot(), booksCompleted: books }, new Set()),
    snapshot: { ...emptySnapshot(), booksCompleted: books },
  });

  it('every object explains itself; teachers introduce themselves instead', () => {
    for (const id of DISCOVERABLE_IDS) {
      const d = describeDiscovery(id, ctxFor());
      if ((TEACHER_DISCOVERIES as readonly string[]).includes(id)) assert.equal(d, null);
      else {
        assert.ok(d, `${id} has a card`);
        assert.ok(d!.text.length > 20 && d!.title.length > 3);
      }
    }
  });

  it('the empty bookshelf says it is empty; locked rooms show honest progress', () => {
    assert.match(describeDiscovery('bookshelf', ctxFor())!.text, /empty/);
    assert.match(describeDiscovery('bookshelf', ctxFor(3))!.text, /3 books/);
    assert.deepEqual(describeDiscovery('greenhouse', ctxFor())!.progress, { current: 0, target: 3 });
    assert.deepEqual(describeDiscovery('nook', ctxFor())!.progress, { current: 0, target: 25 });
  });

  it('counts only what exists and is not yet found', () => {
    assert.deepEqual(undiscovered(['hoot', 'bookshelf', 'nature', 'unknown'], ['hoot']), ['bookshelf', 'nature']);
    assert.equal(welcomeDiscovery('Izzy').title, 'Welcome to your school, Izzy!');
  });

  it('first meetings are introductions — no "welcome back" or remembered history', () => {
    for (const id of Object.keys(TEACHERS) as TeacherId[]) {
      const first = teacherOpening(
        id,
        { childName: 'Izzy', firstMeeting: true, visitsToday: 0, booksCompleted: 0, lastLessonSummary: 'Thanks for last time!' },
        1,
      ).join(' ');
      assert.match(first, /I’m (Professor Hoot|Digit|Nova)/);
      assert.doesNotMatch(first, /back|again|last time|favorite reader/i);
      assert.ok(first.includes('Izzy'));
    }
  });

  it('remembers discoveries per child, without duplicates', async () => {
    const { ctx, repos } = makeContext();
    await prepareDatabase(repos, ctx.clock);
    await markExplored(ctx, 'child_izzy', ['hoot']);
    const saved = await markExplored(ctx, 'child_izzy', ['hoot', 'bookshelf']);
    assert.deepEqual(saved, ['hoot', 'bookshelf']);
    assert.equal((await repos.children.get('child_georgia'))!.explored, undefined);
  });
});
