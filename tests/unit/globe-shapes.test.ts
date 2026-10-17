import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { STARTER_STATES, stateShapeAdventure, stateShapeViewBox } from '../../src/domain/geography/stateChoices';
import { createRng } from '../../src/domain/util/random';
import type { PracticeProgress } from '../../src/services/practiceService';
import { Choices, DialogueShell } from '../../src/ui/child/DialogueShell';
import { GlobeFlow } from '../../src/ui/child/flows/GlobeFlow';

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  window: { matchMedia: () => ({ matches: true }) },
  document: { createElement: () => ({ getContext: () => null }) },
});

test('beginner adventures have five distinct targets and exactly three unique valid silhouettes', () => {
  const positions = new Set<number>();
  for (let seed = 0; seed < 100; seed++) {
    const rounds = stateShapeAdventure(createRng(seed));
    assert.deepEqual(rounds, stateShapeAdventure(createRng(seed)));
    assert.equal(rounds.length, 5);
    assert.equal(new Set(rounds.map((round) => round.target)).size, 5);
    assert.equal(rounds[0]!.target, 'Florida');
    for (const round of rounds) {
      assert.equal(round.choices.length, 3);
      assert.equal(new Set(round.choices.map((choice) => choice.name)).size, 3);
      assert.equal(round.choices.filter((choice) => choice.name === round.target).length, 1);
      positions.add(round.choices.findIndex((choice) => choice.name === round.target));
      for (const choice of round.choices) {
        assert.ok((STARTER_STATES as readonly string[]).includes(choice.name));
        const viewBox = stateShapeViewBox(choice.path).split(' ').map(Number);
        assert.equal(viewBox.length, 4);
        assert.ok(viewBox.every(Number.isFinite));
        assert.ok(viewBox[2]! > 0 && viewBox[3]! > 0);
      }
    }
  }
  assert.equal(positions.size, 3, 'correct answer is not fixed to one button');
});

async function harness(t: TestContext, onRecord?: (progress: PracticeProgress) => Promise<void>) {
  const saved: PracticeProgress[] = [];
  const spoken: string[] = [];
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      createElement(GlobeFlow, {
        speech: { auto: false, canSpeak: true, speak: (line) => spoken.push(line) },
        onClose() {},
        onRecord:
          onRecord ??
          (async (progress) => {
            saved.push(progress);
          }),
      }),
    );
  });
  t.after(async () => {
    await act(async () => tree.unmount());
  });
  const shapes = () => tree.root.findAllByType('button').filter((button) => typeof button.props['data-state'] === 'string');
  const press = async (name: string) => {
    await act(async () =>
      tree.root
        .findAllByType('button')
        .find((button) => button.props.children === name)!
        .props.onClick(),
    );
  };
  const choice = async (id: string) => {
    await act(async () => tree.root.findByType(Choices).props.onPick(id));
  };
  const select = async (name: string) => {
    await act(async () =>
      shapes()
        .find((button) => button.props['data-state'] === name)!
        .props.onClick(),
    );
  };
  return { tree, saved, spoken, shapes, press, choice, select };
}

test('opens directly in beginner shapes, preserves original question replay, and records help honestly', async (t) => {
  const h = await harness(t);
  assert.equal(h.shapes().length, 3);
  assert.match(h.tree.root.findByType(DialogueShell).props.line, /Which state is Florida/);
  assert.equal(h.tree.root.findAllByType('select').length, 0);
  const wrong = h.shapes().find((button) => button.props['data-state'] !== 'Florida')!.props['data-state'];
  await h.select(wrong);
  assert.equal(h.saved.length, 0);
  await h.press('Read the question again');
  assert.match(h.spoken[0]!, /^Which state is Florida/);
  await h.press('Show state names for help');
  await h.select('Florida');
  assert.equal(h.saved.length, 1);
  assert.equal(h.saved[0]!.lessonId, 'globe-states');
  assert.equal(h.saved[0]!.complete, false);
  assert.equal(h.saved[0]!.problems[0]!.skillId, 'geography.state-shapes');
  assert.equal(h.saved[0]!.problems[0]!.outcome, 'supported');
  assert.deepEqual(h.saved[0]!.problems[0]!.scaffolds, ['state names shown']);
  assert.ok(h.shapes().every((button) => button.props.disabled));
});

test('full US map is explicit level two and countries stay available without unlocks', async (t) => {
  const h = await harness(t);
  await h.press('Choose another level or map');
  await h.choice('states');
  assert.equal(h.shapes().length, 0);
  const select = h.tree.root.findByType('select');
  assert.equal(select.findAllByType('option').length, 51);
  await act(async () => select.props.onChange({ target: { value: 'Michigan' } }));
  assert.equal(h.saved[0]!.problems[0]!.skillId, 'geography.states');
  assert.equal(h.saved[0]!.problems[0]!.tier, 1);
  await h.press('Choose another level or map');
  await h.choice('countries');
  assert.equal(h.tree.root.findByType('select').findAllByType('option').length, 12);
  await h.press('Choose another level or map');
  await h.choice('shapes');
  assert.equal(h.shapes().length, 3);
  assert.equal(h.saved.length, 1, 'changing maps does not save exposure');
});

test('five rounds have stable cumulative saves, skips, replay and no duplicate rapid save', async (t) => {
  const h = await harness(t);
  for (let round = 0; round < 5; round++) {
    if (round === 1) await h.choice('skip');
    else {
      const line = h.tree.root.findByType(DialogueShell).props.line as string;
      const target = /Which state is (.*?)\?/.exec(line)![1]!;
      const button = h.shapes().find((node) => node.props['data-state'] === target)!;
      await act(async () => {
        button.props.onClick();
        button.props.onClick();
      });
    }
    assert.equal(h.saved.length, round + 1);
    assert.equal(h.saved[round]!.problems.length, round + 1);
    await h.choice('next');
  }
  assert.equal(h.saved[4]!.complete, true);
  assert.deepEqual(
    h.saved[4]!.problems.map((problem) => problem.outcome),
    ['independent', 'skipped', 'independent', 'independent', 'independent'],
  );
  assert.equal(new Set(h.saved.map((save) => save.id)).size, 1);
  await h.choice('shapes');
  await h.select('Florida');
  assert.notEqual(h.saved[5]!.id, h.saved[4]!.id);
});

test('failed saves retain the same round for retry without fabricating a learning error', async (t) => {
  const attempts: PracticeProgress[] = [];
  const h = await harness(t, async (progress) => {
    attempts.push(progress);
    if (attempts.length === 1) throw new Error('synthetic storage failure');
  });
  await h.select('Florida');
  assert.match(h.tree.root.findByType(DialogueShell).props.line, /could not be saved/);
  await h.select('Florida');
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0]!.id, attempts[1]!.id);
  assert.equal(attempts[1]!.problems[0]!.outcome, 'independent');
  assert.deepEqual(attempts[1]!.problems[0]!.responses, ['Florida']);
});
