import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { WeatherFlow, type WeatherFlowProps } from '../../src/ui/child/flows/WeatherFlow';
import { Choices, DialogueShell } from '../../src/ui/child/DialogueShell';
import { WeatherStage } from '../../src/ui/child/lesson/WeatherPicture';
import type { WeatherRun } from '../../src/domain/lessons/weather';
const events = new Map<string, () => void>();
Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  window: {
    matchMedia: () => ({ matches: true }),
    addEventListener: (n: string, fn: () => void) => events.set(n, fn),
    removeEventListener: (n: string) => events.delete(n),
  },
  document: { createElement: () => ({ getContext: () => null }) },
});
async function harness(t: TestContext, overrides: Partial<WeatherFlowProps> = {}) {
  const saves: WeatherRun[] = [];
  let closes = 0,
    cancels = 0;
  const props: WeatherFlowProps = {
    childId: 'child_sample',
    speech: {
      auto: false,
      canSpeak: false,
      speak() {},
      cancel() {
        cancels++;
      },
    },
    onSave: async (run) => {
      saves.push(run);
    },
    onClose: () => {
      closes++;
    },
    onChooseActivity() {},
    ...overrides,
  };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(createElement(WeatherFlow, props));
  });
  t.after(async () => {
    await act(async () => tree.unmount());
  });
  const pick = async (id: string) => {
    await act(async () => tree.root.findByType(Choices).props.onPick(id));
  };
  const button = (text: string) => tree.root.findAllByType('button').find((n) => String(n.props.children).includes(text))!;
  const answer = async () => {
    const pictures = tree.root.findByType(WeatherStage).props.pictures as string[];
    const counts = new Map<string, number>();
    pictures.forEach((p) => counts.set(p, (counts.get(p) ?? 0) + 1));
    const target = [...counts].sort((a, b) => b[1] - a[1])[0]![0];
    await act(async () => tree.root.findByProps({ 'data-testid': `weather-choice-${target}` }).props.onClick());
    await act(async () => tree.root.findByProps({ 'data-testid': 'weather-next' }).props.onClick());
  };
  const complete = async () => {
    for (let i = 0; i < 4; i++) await answer();
  };
  const close = async () => {
    await act(async () => tree.root.findByType(DialogueShell).props.onClose());
  };
  return { tree, props, saves, pick, button, answer, complete, close, closes: () => closes, cancels: () => cancels };
}
for (const tier of [0, 1])
  test(`level ${tier + 1} is explicit and child-paced with exactly-once final action`, async (t) => {
    const h = await harness(t);
    await h.pick(`weather-level-${tier}`);
    assert.equal(h.tree.root.findByType(WeatherStage).props.chart, tier === 1);
    await h.complete();
    const pick = h.tree.root.findByType(Choices).props.onPick;
    await act(async () => {
      await Promise.all([pick('weather-finish'), pick('weather-finish')]);
    });
    assert.equal(h.saves.length, 1);
    assert.equal(h.saves[0]!.childId, 'child_sample');
    assert.equal(h.closes(), 1);
  });
test('hints can repeat without dead controls; model, skip, replay preserve honest evidence', async (t) => {
  const h = await harness(t);
  await h.pick('weather-level-0');
  for (let i = 0; i < 3; i++) await act(async () => h.button('Hint').props.onClick());
  await act(async () => h.button('Show the model').props.onClick());
  await h.answer();
  await act(async () => h.button('Skip this round').props.onClick());
  await h.answer();
  await h.answer();
  await h.pick('weather-replay');
  assert.equal(h.saves.length, 1);
  assert.deepEqual(
    h.saves[0]!.attempts.map((a) => a.outcome),
    ['supported', 'not_yet', 'independent', 'independent'],
  );
  assert.equal(h.saves[0]!.attempts[1]!.scaffolds.includes('skipped'), true);
  await h.complete();
  await h.pick('weather-level');
  assert.equal(h.saves.length, 2);
  assert.notEqual(h.saves[0]!.id, h.saves[1]!.id);
  assert.equal(h.tree.root.findByType(WeatherStage).props.chart, true);
});
test('unfinished level changes and close disclose discard; stale callbacks cannot act after restart or close', async (t) => {
  const h = await harness(t);
  await h.pick('weather-level-0');
  const stale = h.tree.root.findAllByType('button').find((n) => String(n.props['data-testid']).startsWith('weather-choice-'))!.props.onClick;
  await act(async () => h.button('Change level').props.onClick());
  assert.match(h.tree.root.findByType(DialogueShell).props.line, /discarded/);
  await h.pick('weather-discard');
  await act(async () => stale());
  assert.equal(h.tree.root.findByType(WeatherStage).props.chart, true);
  await h.close();
  await h.pick('weather-keep');
  assert.equal(h.closes(), 0);
  await h.close();
  await h.pick('weather-discard');
  await act(async () => stale());
  assert.equal(h.closes(), 1);
  assert.equal(h.saves.length, 0);
});
test('blur cancels speech without answering; duplicate Next cannot skip a picture', async (t) => {
  const h = await harness(t);
  await h.pick('weather-level-0');
  const target = h.tree.root.findByType(WeatherStage).props.pictures[0];
  await act(async () => h.tree.root.findByProps({ 'data-testid': `weather-choice-${target}` }).props.onClick());
  const next = h.tree.root.findByProps({ 'data-testid': 'weather-next' }).props.onClick;
  const before = h.cancels();
  events.get('blur')!();
  assert.ok(h.cancels() > before);
  await act(async () => {
    next();
    next();
  });
  assert.equal(h.tree.root.findByProps({ className: 'weather-progress' }).props['aria-label'], 'Round 2 of 4');
});
for (const action of ['weather-finish', 'weather-replay', 'weather-level'])
  test(`${action} failure retains completed work and supports retry`, async (t) => {
    let tries = 0;
    const saved: WeatherRun[] = [];
    const h = await harness(t, {
      onSave: async (run) => {
        saved.push(run);
        if (++tries === 1) throw new Error('Synthetic write failure');
      },
    });
    await h.pick('weather-level-0');
    await h.complete();
    await h.pick(action);
    assert.match(h.tree.root.findByType(DialogueShell).props.line, /finished work is still here/);
    assert.equal(h.closes(), 0);
    await h.pick(action);
    assert.equal(tries, 2);
    assert.equal(saved[0], saved[1]);
  });
test('completion close saves first; late save completion cannot reopen an unmounted flow', async (t) => {
  let release!: () => void;
  const h = await harness(t, {
    onSave: () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  });
  await h.pick('weather-level-0');
  await h.complete();
  await act(async () => h.tree.root.findByType(Choices).props.onPick('weather-replay'));
  assert.equal(h.tree.root.findByType(DialogueShell).props.closeDisabled, true);
  await act(async () => h.tree.unmount());
  await act(async () => release());
  assert.equal(h.closes(), 0);
});

test('replacing speech props cancels old narration while answers and saving stay live', async (t) => {
  const h = await harness(t);
  await h.pick('weather-level-0');
  const before = h.cancels();
  let cancels = 0;
  const replacement = {
    auto: false,
    canSpeak: false,
    speak() {},
    cancel() {
      cancels++;
    },
  };
  await act(async () => h.tree.update(createElement(WeatherFlow, { ...h.props, speech: replacement })));
  assert.ok(h.cancels() > before);
  await h.complete();
  await h.pick('weather-finish');
  assert.equal(h.saves.length, 1);
  assert.equal(h.closes(), 1);
  assert.ok(cancels > 0);
});
for (const feedback of [false, true])
  test(`repeated close preserves ${feedback ? 'feedback' : 'play'} when Keep playing is chosen`, async (t) => {
    const h = await harness(t);
    await h.pick('weather-level-0');
    if (feedback) {
      const target = h.tree.root.findByType(WeatherStage).props.pictures[0];
      await act(async () => h.tree.root.findByProps({ 'data-testid': `weather-choice-${target}` }).props.onClick());
    }
    const line = h.tree.root.findByType(DialogueShell).props.line;
    await h.close();
    await h.close();
    await h.pick('weather-keep');
    assert.equal(h.tree.root.findByType(DialogueShell).props.line, line);
    assert.equal(h.tree.root.findAllByProps({ 'data-testid': 'weather-next' }).length, feedback ? 1 : 0);
    assert.equal(h.closes(), 0);
  });
test('last-round feedback hides unfinished discard wording and Close saves completed work', async (t) => {
  const h = await harness(t);
  await h.pick('weather-level-0');
  for (let i = 0; i < 3; i++) await h.answer();
  const target = h.tree.root.findByType(WeatherStage).props.pictures[0];
  await act(async () => h.tree.root.findByProps({ 'data-testid': `weather-choice-${target}` }).props.onClick());
  assert.equal(h.tree.root.findAllByProps({ className: 'btn weather-switch' }).length, 0);
  await h.close();
  assert.equal(h.saves.length, 1);
  assert.equal(h.closes(), 1);
});
