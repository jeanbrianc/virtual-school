import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { BaseTenProgress } from '../../src/domain/lessons/baseTen';
import { Choices, DialogueShell } from '../../src/ui/child/DialogueShell';
import { BaseTenFlow } from '../../src/ui/child/flows/BaseTenFlow';

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  window: { matchMedia: () => ({ matches: true }) },
  document: { createElement: () => ({ getContext: () => null }) },
});

test('round save retry preserves independence, locks repeated answers, and next cannot skip a round', async (t) => {
  const saved: BaseTenProgress[] = [];
  let attempts = 0;
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      createElement(BaseTenFlow, {
        childId: 'synthetic',
        mastery: [],
        parentPin: '1234',
        speech: { auto: false, canSpeak: false, speak() {} },
        onClose() {},
        onChooseActivity() {},
        onSave: async (progress) => {
          saved.push(structuredClone(progress));
          if (attempts++ === 0) throw new Error('synthetic save failure');
        },
      }),
    );
  });
  t.after(async () => {
    await act(async () => tree.unmount());
  });
  await act(async () => tree.root.findByType(Choices).props.onPick('start'));
  const line = tree.root.findByType(DialogueShell).props.line as string;
  const value = Number(/Look at (\d+)/.exec(line)![1]);
  const answer = String(line.includes('How many tens') ? Math.floor(value / 10) : value % 10);
  const pick = tree.root.findByType(Choices).props.onPick;
  await act(async () => {
    pick(answer);
    pick(answer);
  });
  assert.equal(saved.length, 1);
  assert.equal(saved[0]!.rounds[0]!.responses.length, 1);
  const retry = tree.root.findAllByType('button').find((b) => b.props.children === 'Try saving again')!;
  await act(async () => retry.props.onClick());
  assert.equal(saved.length, 2);
  assert.deepEqual(saved[0], saved[1]);
  assert.equal(saved[1]!.rounds[0]!.scaffolds.length, 0);
  const next = tree.root.findAllByType('button').find((b) => b.props.children === 'Try a new number')!;
  await act(async () => {
    next.props.onClick();
    next.props.onClick();
  });
  assert.match(tree.root.findByProps({ className: 'base-ten-goal' }).props.children.join(''), /Round 2 of 5/);
  const skip = tree.root.findAllByType('button').find((b) => b.props.children === 'Skip this round')!;
  await act(async () => skip.props.onClick());
  assert.equal(saved[2]!.rounds.length, 2);
  assert.equal(saved[2]!.rounds[1]!.skipped, true);
});
