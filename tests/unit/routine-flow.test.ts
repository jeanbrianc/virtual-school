import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { RoutineFlow } from '../../src/ui/child/flows/RoutineFlow';
import { DialogueShell } from '../../src/ui/child/DialogueShell';
import type { RoutineRun } from '../../src/domain/lessons/routine';

const events = new Map<string, () => void>();
Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  window: {
    matchMedia: () => ({ matches: true }),
    addEventListener: (name: string, callback: () => void) => events.set(name, callback),
    removeEventListener: (name: string) => events.delete(name),
  },
  document: {
    hidden: false,
    addEventListener: (name: string, callback: () => void) => events.set(name, callback),
    removeEventListener: (name: string) => events.delete(name),
  },
});
async function harness(t: TestContext, save?: (run: RoutineRun) => Promise<void>) {
  let tree!: ReactTestRenderer;
  const saves: RoutineRun[] = [];
  let closes = 0;
  await act(async () => {
    tree = create(
      createElement(RoutineFlow, {
        childId: 'sample',
        speech: {
          canSpeak: false,
          auto: false,
          speak() {
            throw new Error('No sound expected');
          },
        },
        onClose: () => {
          closes++;
        },
        onSave:
          save ??
          (async (run) => {
            saves.push(run);
          }),
      }),
    );
  });
  t.after(async () => {
    await act(async () => tree.unmount());
  });
  const button = (text: string) => tree.root.findAllByType('button').find((node) => String(node.props.children).includes(text))!;
  const pick = async (id: string) => {
    await act(async () => {
      await tree.root.findByProps({ 'data-testid': id }).props.onClick({ detail: 0 });
    });
  };
  const click = async (text: string) => {
    await act(async () => {
      await button(text).props.onClick({ detail: 0 });
    });
  };
  const solve = async (ids = ['open', 'first']) => {
    for (let i = 0; i < ids.length; i++) {
      await pick(`routine-card-${ids[i]}`);
      await pick(`routine-slot-${i}`);
    }
    await pick('routine-check');
  };
  const finish = async () => {
    await solve();
    await pick('routine-next');
    await solve();
    await pick('routine-next');
  };
  return { tree, button, pick, click, solve, finish, saves, closes: () => closes };
}
test('two-card default, no-audio keyboard choices, child-paced feedback and duplicate Next/save guards', async (t) => {
  const h = await harness(t);
  await h.pick('routine-start-2');
  await h.solve();
  assert.equal(h.tree.root.findByProps({ 'data-testid': 'routine-round' }).props.children.join(''), 'Round 1 of 2 · 2 pictures');
  const next = h.tree.root.findByProps({ 'data-testid': 'routine-next' }).props.onClick;
  await act(async () => {
    next();
    next();
  });
  assert.equal(h.tree.root.findByProps({ 'data-testid': 'routine-round' }).props.children.join(''), 'Round 2 of 2 · 2 pictures');
  await h.solve();
  await h.pick('routine-next');
  assert.ok(h.tree.root.findByProps({ 'data-testid': 'routine-next-level' }));
  const save = h.tree.root.findByProps({ 'data-testid': 'routine-save' }).props.onClick;
  await act(async () => {
    save();
    save();
  });
  assert.equal(h.saves.length, 1);
  assert.equal(h.closes(), 1);
  assert.deepEqual(
    h.saves[0]!.trials.map((trial) => trial.modalities),
    [['keyboard-or-assistive'], ['keyboard-or-assistive']],
  );
});
test('hint/model and explicit simpler reset stay supported; skip never pretends a larger task was solved', async (t) => {
  const h = await harness(t);
  await h.click('Learner / grown-up');
  await h.pick('routine-start-4');
  await h.click('Hint');
  await h.click('Show a model');
  assert.equal(h.tree.root.findAllByProps({ 'aria-label': 'One valid picture model' }).length, 1);
  await h.click('Simpler');
  assert.match(h.tree.root.findByType(DialogueShell).props.line, /left the unfinished bigger task/);
  await h.solve();
  await h.pick('routine-next');
  await h.click('Skip this round');
  await h.pick('routine-next');
  assert.equal(h.tree.root.findAllByProps({ 'data-testid': 'routine-next-level' }).length, 0);
  await h.pick('routine-save');
  assert.equal(h.saves[0]!.trials[0]!.task.size, 2);
  assert.equal(h.saves[0]!.trials[0]!.outcome, 'supported');
  assert.equal(h.saves[0]!.trials[1]!.outcome, 'skipped');
});
test('blur pauses actions, resume preserves pictures, cancel blocks stale save and replay discards unfinished work', async (t) => {
  const h = await harness(t);
  await h.pick('routine-start-2');
  await h.pick('routine-card-open');
  await h.pick('routine-slot-0');
  await act(async () => events.get('blur')?.());
  assert.ok(h.button('Resume pictures'));
  await h.pick('routine-check');
  assert.equal(h.saves.length, 0);
  await h.click('Resume pictures');
  assert.match(h.tree.root.findByProps({ 'data-testid': 'routine-slot-0' }).props['aria-label'], /Open the art box/);
  await h.click('Replay');
  assert.match(h.tree.root.findByProps({ 'data-testid': 'routine-slot-0' }).props['aria-label'], /empty/);
  await h.finish();
  const stale = h.tree.root.findByProps({ 'data-testid': 'routine-save' }).props.onClick;
  await act(async () => h.tree.root.findByType(DialogueShell).props.onClose());
  await act(async () => stale());
  assert.equal(h.saves.length, 0);
  assert.equal(h.closes(), 1);
});
test('save failure leaves completed work retryable; successful earned offer starts a fresh bounded run', async (t) => {
  let tries = 0;
  const runs: RoutineRun[] = [];
  const h = await harness(t, async (run) => {
    tries++;
    if (tries === 1) throw new Error('Sample temporary failure');
    runs.push(run);
  });
  await h.pick('routine-start-2');
  await h.finish();
  await h.pick('routine-next-level');
  assert.match(h.tree.root.findByType(DialogueShell).props.line, /Saving did not finish/);
  await h.pick('routine-next-level');
  assert.equal(tries, 2);
  assert.equal(runs.length, 1);
  assert.equal(h.tree.root.findByProps({ 'data-testid': 'routine-round' }).props.children.join(''), 'Round 1 of 2 · 3 pictures');
  assert.equal(runs[0]!.size, 2);
});
