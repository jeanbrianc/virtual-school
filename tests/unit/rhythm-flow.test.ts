import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { RhythmPlayer } from '../../src/audio/RhythmPlayer';
import type { RhythmRun } from '../../src/domain/music/rhythm';
import { RhythmFlow } from '../../src/ui/child/flows/RhythmFlow';

const listeners = new Map<string, () => void>();
Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  window: { addEventListener: (key: string, fn: () => void) => listeners.set(key, fn), removeEventListener: (key: string) => listeners.delete(key) },
  document: {
    hidden: false,
    addEventListener: (key: string, fn: () => void) => listeners.set(key, fn),
    removeEventListener: (key: string) => listeners.delete(key),
  },
});
async function harness(t: TestContext, save?: (r: RhythmRun) => Promise<void>) {
  t.mock.method(RhythmPlayer.prototype, 'play', async () => ({ reliable: true, presentation: 'visual-only' as const }));
  let tree!: ReactTestRenderer;
  const saves: RhythmRun[] = [];
  let closes = 0;
  await act(async () => {
    tree = create(
      createElement(RhythmFlow, {
        childId: 'sample',
        muted: true,
        volume: 0,
        onSave:
          save ??
          (async (r) => {
            saves.push(r);
          }),
        onClose: () => {
          closes++;
        },
      }),
    );
  });
  t.after(async () => {
    await act(async () => tree.unmount());
  });
  const button = (label: string) => tree.root.findAllByType('button').find((b) => b.props.children === label)!;
  const click = async (label: string) => {
    assert.ok(button(label), label);
    await act(async () => button(label).props.onClick());
  };
  const choose = async (choice: 'a' | 'b') => {
    await act(async () => tree.root.findByProps({ 'data-testid': `rhythm-choice-${choice}` }).props.onClick());
  };
  const finishRecognition = async () => {
    await click('Choose matching pictures');
    await click('Try together');
    await choose('a');
    await click('Explore a fresh pattern');
    await click('Try this pattern');
    await choose('b');
    await click('Finish visit');
  };
  return { tree, button, click, choose, finishRecognition, saves, closes: () => closes };
}
test('untimed matching never requires playback and fresh pattern evidence is separate from guided support', async (t) => {
  const h = await harness(t);
  await h.finishRecognition();
  const fn = h.button('Save visit').props.onClick;
  await act(async () => {
    fn();
    fn();
  });
  assert.equal(h.saves.length, 1);
  assert.equal(h.saves[0]!.mode, 'recognize');
  assert.deepEqual(
    h.saves[0]!.trials.map((x) => [x.pattern, x.supported, x.input, x.presentation]),
    [
      ['a', true, 'choice', 'visual-only'],
      ['b', false, 'choice', 'visual-only'],
    ],
  );
  await h.click('Play again');
  await h.click('Try together');
  await h.choose('a');
  await h.click('Explore a fresh pattern');
  await h.click('Try this pattern');
  await h.click('Hint: show the spaces');
  await h.choose('b');
  await h.click('Finish visit');
  await h.click('Save visit');
  assert.equal(h.saves.length, 2);
  assert.notEqual(h.saves[0]!.id, h.saves[1]!.id);
  assert.equal(h.saves[1]!.trials[1]!.supported, true);
});
test('blur clears unfinished copy input, resume requires a new model, close blocks stale save', async (t) => {
  const h = await harness(t);
  await h.click('Tap a rhythm');
  await h.click('Skip warm-up');
  assert.equal(h.button('Try together').props.disabled, true);
  await h.click('Play / watch pattern');
  await h.click('Try together');
  await act(async () => listeners.get('blur')!());
  await h.click('Resume rhythm');
  assert.equal(h.button('Try together').props.disabled, true);
  await h.click('Choose pictures instead, no timing');
  await h.click('Try together');
  await h.choose('a');
  await h.click('Explore a fresh pattern');
  await h.click('Try this pattern');
  await h.choose('b');
  await h.click('Finish visit');
  const staleSave = h.button('Save visit').props.onClick;
  await h.click('Close without saving');
  await act(async () => staleSave());
  assert.equal(h.closes(), 1);
  assert.equal(h.saves.length, 0);
});
test('failed saves keep the stable completion ID; replay is unavailable until saved', async (t) => {
  const ids: string[] = [];
  const h = await harness(t, async (r) => {
    ids.push(r.id);
    if (ids.length === 1) throw new Error('Sample save failure');
  });
  await h.finishRecognition();
  assert.equal(h.button('Play again').props.disabled, true);
  await h.click('Save visit');
  await h.click('Retry save');
  assert.equal(ids.length, 2);
  assert.equal(ids[0], ids[1]);
  assert.equal(h.button('Play again').props.disabled, false);
});
test('native keyboard repeat/modified input cannot inflate a copy attempt', async (t) => {
  const h = await harness(t);
  await h.click('Tap a rhythm');
  await h.click('Skip warm-up');
  await h.click('Play / watch pattern');
  await h.click('Try together');
  const tap = h.tree.root.findByProps({ 'data-testid': 'rhythm-tap' });
  const event = {
    key: ' ',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    nativeEvent: { isComposing: false },
    timeStamp: performance.now(),
    preventDefault() {},
    repeat: true,
  };
  await act(async () => tap.props.onKeyDown(event));
  assert.equal(h.tree.root.findByProps({ 'data-testid': 'rhythm-tap' }).findByType('span').props.children[0], 0);
  await h.click('Skip this pattern');
  await h.click('Explore a fresh pattern');
  await h.click('Play / watch pattern');
  await h.click('Try this pattern');
  await h.click('Skip this pattern');
  await h.click('Finish visit');
  await h.click('Save visit');
  assert.ok(h.saves[0]!.trials.every((x) => x.outcome === 'skipped'));
});

test('final feedback protects completed work from stale alternate-mode and replay callbacks', async (t) => {
  let resolveSave!: () => void;
  const h = await harness(
    t,
    async () =>
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
  );
  await h.click('Tap a rhythm');
  await h.click('Skip warm-up');
  const staleAlternative = h.button('Choose pictures instead, no timing').props.onClick;
  await h.click('Play / watch pattern');
  await h.click('Try together');
  await h.click('Skip this pattern');
  await h.click('Explore a fresh pattern');
  await h.click('Play / watch pattern');
  await h.click('Try this pattern');
  await h.click('Skip this pattern');
  assert.equal(h.button('Choose pictures instead, no timing'), undefined);
  await act(async () => staleAlternative());
  assert.ok(h.button('Finish visit'));
  await h.click('Finish visit');
  const staleReplay = h.button('Play again').props.onClick;
  await act(async () => {
    staleAlternative();
    staleReplay();
  });
  assert.ok(h.button('Save visit'));
  await h.click('Save visit');
  await act(async () => {
    staleAlternative();
    staleReplay();
  });
  assert.ok(h.button('Saving…'));
  await act(async () => resolveSave());
  assert.ok(h.button('Visit saved'));
});
