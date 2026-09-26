import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createInterpretationService,
  HttpInterpretationService,
  interpretLocally,
  validateInterpretation,
  type InterpretationContext,
} from '../../src/domain/interpretation';
import { parseNumber } from '../../src/domain/interpretation/numbers';

const ctx: InterpretationContext = {
  childName: 'Izzy',
  pronoun: 'she',
  today: '2026-09-26',
  knownBooks: [
    { id: 'book_cw', title: 'Charlotte’s Web', author: 'E. B. White', status: 'reading', chaptersRead: 12, totalChapters: 22, catalogId: 'charlottes-web' },
  ],
} as InterpretationContext;

const skillIds = (text: string) => interpretLocally(text, ctx).skills.map((s) => s.skillId);

describe('local activity interpreter', () => {
  it('classifies the spec example (Charlotte’s Web + baking bread)', () => {
    const r = interpretLocally(
      'Izzy read two chapters of Charlotte’s Web this morning. She summarized what happened without help and correctly explained why Wilbur was scared. Later we baked bread and she measured 2 cups of flour and 1 tablespoon of yeast.',
      ctx,
    );
    const ids = r.skills.map((s) => s.skillId);
    for (const expected of ['read.retell', 'read.feelings', 'read.chapter-stamina', 'math.measure-units', 'life.cooking'])
      assert.ok(ids.includes(expected), `expected ${expected} in ${ids.join(', ')}`);
    const retell = r.skills.find((s) => s.skillId === 'read.retell')!;
    assert.equal(retell.independence, 'independent', '“without help” is detected per clause');
    assert.deepEqual(
      r.measurements.map((m) => m.text),
      ['2 cups of flour', '1 tablespoon of yeast'],
    );
    const book = r.books.find((b) => b.existingBookId === 'book_cw');
    assert.ok(book, 'links to the book already on her list');
    assert.equal(book!.chaptersRead, 2);
    assert.ok(!ids.some((id) => id.startsWith('sci.animals')), 'story characters (a pig) are not science evidence');
  });

  it('classifies the spec muffin example with honest counting and an oven question', () => {
    const r = interpretLocally(
      'Izzy and I baked muffins. She counted 12 cups, measured the flour herself, read several steps of the recipe, and asked why the muffins get bigger in the oven.',
      ctx,
    );
    const by = new Map(r.skills.map((s) => [s.skillId, s]));
    assert.ok(by.get('math.count-20')?.statement.includes('12'));
    assert.ok(by.has('math.measure-units'));
    assert.ok(by.has('read.procedural'));
    assert.ok(by.has('sci.questions'));
    assert.equal(by.get('sci.changes')?.outcome, 'exposure', 'noticing a change is exposure, not mastery');
    assert.equal(r.measurements.length, 0, '“counted 12 cups” is counting, not measuring');
  });

  it('does not mistake containers for measurements', () => {
    assert.ok(!skillIds('We planted bean seeds in cups by the window.').includes('math.measure-units'));
    assert.ok(skillIds('She poured half a cup of water into each pot.').includes('math.measure-units'));
  });

  it('detects nature finds, topics and duration', () => {
    const r = interpretLocally('Nature walk at the pond for about 45 minutes. She collected three acorns, a feather and a pinecone.', ctx);
    assert.equal(r.durationMinutes, 45);
    assert.ok(r.topics.includes('nature'));
    assert.ok(r.natureItems.includes('acorn') && r.natureItems.includes('feather') && r.natureItems.includes('pinecone'));
  });

  it('marks struggle as not-yet and adult help as support/exposure — never as mastery', () => {
    const r = interpretLocally('Izzy tried to subtract 13 minus 5 but got stuck, so we used blocks together.', ctx);
    const outcomes = r.skills.map((s) => s.outcome);
    assert.ok(!outcomes.includes('demonstrated'), `got ${JSON.stringify(r.skills.map((s) => [s.skillId, s.outcome]))}`);
  });

  it('reading about a topic counts toward that topic', () => {
    assert.ok(interpretLocally('We read a book about how seeds sprout.', ctx).topics.includes('plants'));
  });

  it('parses number words', () => {
    assert.equal(parseNumber('twelve'), 12);
    assert.equal(parseNumber('twenty-one'), 21);
    assert.equal(parseNumber('a dozen'), 12);
  });
});

describe('optional AI interpreter', () => {
  it('is only used with an endpoint AND explicit consent', () => {
    assert.equal(createInterpretationService({ provider: 'local', consentToSend: false }).sendsDataOffDevice, false);
    assert.equal(createInterpretationService({ provider: 'http', endpoint: 'https://x.example', consentToSend: false }).sendsDataOffDevice, false);
    assert.equal(createInterpretationService({ provider: 'http', consentToSend: true }).sendsDataOffDevice, false);
    assert.equal(createInterpretationService({ provider: 'http', endpoint: 'https://x.example', consentToSend: true }).sendsDataOffDevice, true);
  });

  it('validates model output: unknown skills are dropped, confidences clamped', () => {
    const v = validateInterpretation(
      {
        title: 'Garden',
        skills: [
          { skillId: 'sci.plants', confidence: 3, kind: 'observation', independence: 'independent', outcome: 'demonstrated', statement: 'Planted seeds.' },
          { skillId: 'made.up', confidence: 0.9, statement: 'nope' },
        ],
      },
      ctx,
      'test',
    );
    assert.ok(v);
    assert.deepEqual(
      v!.skills.map((s) => s.skillId),
      ['sci.plants'],
    );
    assert.equal(v!.skills[0]!.confidence, 1);
    assert.equal(validateInterpretation('garbage', ctx, 'test'), null);
  });

  it('falls back to on-device rules when the endpoint fails', async () => {
    const failing = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const svc = new HttpInterpretationService('https://x.example', failing, 1000);
    const r = await svc.interpret('We planted bean seeds.', ctx);
    assert.ok(r.skills.some((s) => s.skillId === 'sci.plants'));
    assert.match(r.provider.id, /local/);
  });
});
