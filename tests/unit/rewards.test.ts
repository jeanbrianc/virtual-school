import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emptySnapshot, type ProgressSnapshot } from '../../src/domain/progress/snapshot';
import { REWARDS, SHELF_CAPACITIES } from '../../src/domain/rewards/catalog';
import { evaluateNewRewards, ruleProgress, upcomingRewards } from '../../src/domain/rewards/engine';
import { buildMilestonePreview } from '../../src/domain/world/previews';
import { deriveWorldState, shelfSlot } from '../../src/domain/world/worldState';

const snap = (patch: Partial<ProgressSnapshot>): ProgressSnapshot => ({ ...emptySnapshot(), ...patch });
const ids = (list: { id: string }[]) => list.map((r) => r.id);

describe('reward catalog', () => {
  it('has unique ids and only positive, learning-based rules', () => {
    const seen = new Set<string>();
    for (const r of REWARDS) {
      assert.ok(!seen.has(r.id), `duplicate ${r.id}`);
      seen.add(r.id);
      assert.ok(r.rule.count > 0);
      assert.ok(['books', 'topic', 'lesson', 'artworks', 'masteredInDomain'].includes(r.rule.type));
    }
  });

  it('shelf capacities hold exactly 100 books (the dragon milestone)', () => {
    assert.equal(
      SHELF_CAPACITIES.reduce((a, b) => a + b, 0),
      100,
    );
    assert.deepEqual(shelfSlot(0), { unit: 0, slot: 0 });
    assert.deepEqual(shelfSlot(10), { unit: 1, slot: 0 });
    assert.deepEqual(shelfSlot(99), { unit: 3, slot: 49 });
  });
});

describe('reward unlocking', () => {
  it('first book → bookworm pet; nothing else', () => {
    assert.deepEqual(ids(evaluateNewRewards(snap({ booksCompleted: 1 }), new Set())), ['pet.bookworm']);
  });

  it('10 books → second shelf + trophy; already-unlocked rewards are not repeated', () => {
    const unlocked = new Set(['pet.bookworm', 'decor.reading-lamp']);
    assert.deepEqual(ids(evaluateNewRewards(snap({ booksCompleted: 10 }), unlocked)).sort(), ['shelf.2', 'trophy.books-10']);
  });

  it('25 / 50 / 100 books unlock the reading nook, grand library and dragon', () => {
    const at = (n: number) => ids(evaluateNewRewards(snap({ booksCompleted: n }), new Set()));
    assert.ok(at(25).includes('room.reading-nook'));
    assert.ok(!at(24).includes('room.reading-nook'));
    assert.ok(at(50).includes('room.grand-library'));
    assert.ok(at(100).includes('pet.dragon'));
    assert.ok(!at(99).includes('pet.dragon'));
  });

  it('topic, lesson, art and mastery rules', () => {
    assert.deepEqual(ids(evaluateNewRewards(snap({ topicCounts: { plants: 3 } }), new Set())), ['room.greenhouse']);
    assert.deepEqual(ids(evaluateNewRewards(snap({ topicCounts: { dinosaurs: 1 } }), new Set())), ['exhibit.fossil']);
    assert.deepEqual(ids(evaluateNewRewards(snap({ lessonCompletions: { 'moon-rocks': 1 } }), new Set())), ['decor.rocket']);
    assert.deepEqual(ids(evaluateNewRewards(snap({ artworks: 1 }), new Set())), ['decor.art-line']);
    assert.deepEqual(ids(evaluateNewRewards(snap({ masteredByDomain: { math: 3 } }), new Set())), ['trophy.number-star']);
  });

  it('progress toward a rule is reported honestly', () => {
    const p = ruleProgress({ type: 'topic', topic: 'plants', count: 3 }, snap({ topicCounts: { plants: 2 } }));
    assert.deepEqual(p, { current: 2, target: 3, fraction: 2 / 3, met: false });
  });

  it('upcoming rewards are sorted by closeness and exclude earned ones', () => {
    const up = upcomingRewards(snap({ booksCompleted: 9, topicCounts: { plants: 1 } }), new Set(['pet.bookworm', 'decor.reading-lamp']), 3);
    assert.equal(up[0]?.reward.id === 'shelf.2' || up[0]?.reward.id === 'trophy.books-10', true);
    assert.ok(up.every((u) => !u.progress.met));
  });
});

describe('world state', () => {
  it('the school grows only from unlocked rewards and progress', () => {
    const empty = deriveWorldState(emptySnapshot(), new Set());
    assert.equal(empty.shelfUnits, 1);
    assert.equal(empty.greenhouseOpen, false);
    assert.deepEqual(empty.pets, []);

    const grown = deriveWorldState(
      snap({ booksCompleted: 26, topicCounts: { plants: 5 }, lessonCompletions: { 'moon-rocks': 2 } }),
      new Set(['pet.bookworm', 'shelf.2', 'shelf.3', 'room.reading-nook', 'room.greenhouse', 'decor.rocket']),
    );
    assert.equal(grown.shelfUnits, 3);
    assert.equal(grown.readingNookOpen, true);
    assert.equal(grown.greenhouseOpen, true);
    assert.equal(grown.plantCount, 5);
    assert.equal(grown.rocketStage, 2);
    assert.ok(grown.pets.includes('pet.bookworm'));
  });
});

describe('milestone previews', () => {
  it('build a hypothetical world without mutating the real snapshot', () => {
    const real = snap({ booksCompleted: 9 });
    const books = Array.from({ length: 9 }, (_, i) => ({
      id: `b${i}`,
      title: `Book ${i}`,
      author: 'A',
      cover: { background: '#000', accent: '#fff', motif: 'star' as const },
      shelfIndex: i,
    }));
    const p = buildMilestonePreview('books-100', real, new Set(['pet.bookworm']), books);
    assert.equal(real.booksCompleted, 9, 'real snapshot untouched');
    assert.equal(p.world.preview, true);
    assert.equal(p.books.length, 100);
    assert.equal(p.world.shelfUnits, 4);
    assert.ok(p.celebrate.includes('pet.dragon'));
    assert.ok(!p.celebrate.includes('pet.bookworm'), 'already-earned rewards are not re-celebrated');
    assert.equal(new Set(p.books.map((b) => b.shelfIndex)).size, 100, 'every book has its own slot');
  });

  it('"everything" unlocks every reward in the catalog', () => {
    const p = buildMilestonePreview('everything', emptySnapshot(), new Set(), []);
    assert.equal(p.unlocked.size, REWARDS.length);
  });
});
