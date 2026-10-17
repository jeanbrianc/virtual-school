import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { arithmeticRecord, type ArithmeticProgress } from '../../src/domain/lessons/baseTenArithmetic';
import { Choices, DialogueShell } from '../../src/ui/child/DialogueShell';
import { ArithmeticStage } from '../../src/ui/child/lesson/ArithmeticStage';
import { ArithmeticFlow } from '../../src/ui/child/flows/ArithmeticFlow';
import { ParentGate } from '../../src/ui/child/Overlays';

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  window: { matchMedia: () => ({ matches: true }) },
  document: { createElement: () => ({ getContext: () => null }) },
});
function button(tree: ReactTestRenderer, name: string) {
  return tree.root.findAllByType('button').find((b) => b.props.children === name)!;
}
function answer(tree: ReactTestRenderer) {
  const p = tree.root.findByType(ArithmeticStage).props;
  return String(p.operation === 'add' ? p.left + p.right : p.left - p.right);
}
async function start(tree: ReactTestRenderer, tier = '0') {
  await act(async () => button(tree, 'Grown-up: choose challenge').props.onClick());
  await act(async () => tree.root.findByType(ParentGate).props.onPass());
  await act(async () => tree.root.findByType(Choices).props.onPick(tier));
  if (tier === '1') await act(async () => button(tree, 'See the taking-away example next').props.onClick());
  await act(async () => button(tree, 'Try four fresh problems').props.onClick());
}

test('parent chooses explicitly; initial targets conceal answers; failed-save retry and repeated clicks preserve independent evidence', async (t) => {
  const saved: ArithmeticProgress[] = [];
  let attempts = 0;
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      createElement(ArithmeticFlow, {
        childId: 'synthetic',
        mastery: [],
        parentPin: '1234',
        onClose() {},
        onChooseActivity() {},
        onSave: async (progress) => {
          saved.push(structuredClone(progress));
          if (attempts++ === 0) throw new Error('synthetic');
        },
      }),
    );
  });
  t.after(async () => {
    await act(async () => tree.unmount());
  });
  assert.equal(tree.root.findAllByType(Choices).length, 0, 'no default start before parent choice');
  assert.equal(tree.root.findByType(ArithmeticStage).props.showResult, true);
  assert.equal(tree.root.findByType(DialogueShell).props.speech.canSpeak, false, 'no voice/provider fallback');
  await start(tree);
  assert.equal(tree.root.findByType(ArithmeticStage).props.showResult, false);
  const target = answer(tree);
  assert.notEqual(target, '37');
  assert.match(tree.root.findByProps({ className: 'arithmetic-equation' }).props['aria-label'], /equals how many$/);
  assert.equal(tree.root.findAllByProps({ className: 'arithmetic-result' }).length, 0);
  const pick = tree.root.findByType(Choices).props.onPick;
  await act(async () => {
    pick(target);
    pick(target);
  });
  assert.equal(saved.length, 1);
  await act(async () => button(tree, 'Try saving again').props.onClick());
  assert.deepEqual(saved[0], saved[1]);
  assert.equal(arithmeticRecord(saved[1]!.seed, 0, 0, saved[1]!.rounds[0]!).outcome, 'independent');
  const next = button(tree, 'Try a fresh problem').props.onClick;
  await act(async () => {
    next();
    next();
  });
  assert.match(tree.root.findByProps({ className: 'base-ten-goal' }).props.children.join(''), /Round 2 of 4/);
  assert.equal(tree.root.findByType(ArithmeticStage).props.showResult, false);
  await act(async () => button(tree, 'Show a hint').props.onClick());
  await act(async () => tree.root.findByType(Choices).props.onPick(answer(tree)));
  assert.equal(arithmeticRecord(saved[2]!.seed, 0, 1, saved[2]!.rounds[1]!).outcome, 'supported');
});

test('mixed practice covers smaller example, worked answer, skip and explicit fresh-item replay', async (t) => {
  const saved: ArithmeticProgress[] = [];
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      createElement(ArithmeticFlow, {
        childId: 'synthetic',
        mastery: [],
        parentPin: '1234',
        onClose() {},
        onChooseActivity() {},
        onSave: async (progress) => {
          saved.push(structuredClone(progress));
        },
      }),
    );
  });
  t.after(async () => {
    await act(async () => tree.unmount());
  });
  await start(tree, '1');
  await act(async () => button(tree, 'Smaller example').props.onClick());
  assert.equal(tree.root.findByType(ArithmeticStage).props.showResult, true);
  await act(async () => button(tree, 'Back to my problem').props.onClick());
  assert.equal(tree.root.findByType(ArithmeticStage).props.showResult, false);
  await act(async () => tree.root.findByType(Choices).props.onPick(answer(tree)));
  await act(async () => button(tree, 'Try a fresh problem').props.onClick());
  assert.equal(tree.root.findByType(ArithmeticStage).props.operation, 'subtract');
  await act(async () => button(tree, 'Work it out together').props.onClick());
  await act(async () => button(tree, 'Try a fresh problem').props.onClick());
  await act(async () => button(tree, 'Skip this round').props.onClick());
  await act(async () => button(tree, 'Try a fresh problem').props.onClick());
  await act(async () => tree.root.findByType(Choices).props.onPick(answer(tree)));
  await act(async () => button(tree, 'Finish mission').props.onClick());
  const s = saved.at(-1)!;
  assert.deepEqual(
    s.rounds.map((r, i) => arithmeticRecord(s.seed, s.tier, i, r).outcome),
    ['supported', 'model_only', 'skipped', 'independent'],
  );
  await act(async () => button(tree, 'Fresh-item review again').props.onClick());
  await act(async () => button(tree, 'Skip this round').props.onClick());
  assert.notEqual(saved.at(-1)!.id, s.id);
  assert.equal(saved.at(-1)!.mode, 'review');
});
