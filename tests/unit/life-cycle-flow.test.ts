import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { lifeCycleLesson } from '../../src/domain/lessons/lifeCycle';
import { Choices, DialogueShell } from '../../src/ui/child/DialogueShell';
import { LessonFlow, type LessonFlowProps } from '../../src/ui/child/flows/LessonFlow';
import { LifeCycleStage } from '../../src/ui/child/lesson/LifeCyclePicture';

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  window: {
    matchMedia: () => ({ matches: true }),
    setTimeout: (fn: () => void, delay: number) => globalThis.setTimeout(fn, delay),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(id),
  },
  document: { createElement: () => ({ getContext: () => null }) },
});
async function harness(t: TestContext, overrides: Partial<LessonFlowProps> = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const saves: string[] = [];
  let closes = 0;
  const props: LessonFlowProps = {
    teacher: 'nova',
    lesson: lifeCycleLesson,
    startTier: 1,
    visitsToday: 0,
    childName: 'Sample',
    firstMeeting: true,
    speech: { auto: false, canSpeak: false, speak() {} },
    playSfx() {},
    onSaveContinue: async (run) => {
      saves.push(run.id);
    },
    onComplete: (run) => {
      saves.push(run.id);
    },
    onClose: () => {
      closes++;
    },
    talk: {
      mic: null,
      phrases: [],
      autoSpeaks: false,
      speakReply() {},
      chat: { id: 'local', sendsDataOffDevice: false, respond: async () => ({ reply: 'Sample reply', intent: 'share', finished: null, source: 'local' }) },
    },
    ...overrides,
  };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(createElement(LessonFlow, props));
  });
  t.after(async () => {
    await act(async () => tree.unmount());
  });
  const choices = () => tree.root.findByType(Choices);
  const pick = async (id: string) => {
    await act(async () => {
      await choices().props.onPick(id);
    });
  };
  const answer = async () => {
    const stage = tree.root.findByType(LifeCycleStage).props.stage;
    await act(async () => tree.root.findByProps({ 'data-testid': `choice-${stage}` }).props.onClick());
    await act(async () => tree.root.findByProps({ 'data-testid': 'life-next' }).props.onClick());
  };
  const button = (text: string) => tree.root.findAllByType('button').find((n) => String(n.props.children).includes(text))!;
  const complete = async () => {
    for (let i = 0; i < 4; i++) await answer();
  };
  return { tree, saves, pick, answer, complete, button, choices, closes: () => closes };
}

test('matching remains chosen even with an advanced start tier; final double-submit saves once', async (t) => {
  const h = await harness(t);
  await h.pick('go');
  assert.equal(h.tree.root.findByType(LifeCycleStage).props.next, false);
  await h.complete();
  const pick = h.choices().props.onPick;
  await act(async () => {
    await Promise.all([pick('yay'), pick('yay')]);
  });
  assert.equal(h.saves.length, 1);
});

test('close during feedback saves no unfinished work', async (t) => {
  const h = await harness(t);
  await h.pick('go');
  const stage = h.tree.root.findByType(LifeCycleStage).props.stage;
  await act(async () => h.tree.root.findByProps({ 'data-testid': `choice-${stage}` }).props.onClick());
  await act(async () => h.tree.root.findByType(DialogueShell).props.onClose());
  await act(async () => t.mock.timers.tick(10000));
  assert.equal(h.closes(), 1);
  assert.equal(h.saves.length, 0);
});

test('a stale completion callback cannot save after close', async (t) => {
  const second = await harness(t);
  await second.pick('go');
  await second.complete();
  const stale = second.choices().props.onPick;
  await act(async () => second.tree.root.findByType(DialogueShell).props.onClose());
  await act(async () => stale('replay'));
  assert.equal(second.saves.length, 0);
});

test('model and skip are usable without audio/AI; replay saves first and starts a fresh run', async (t) => {
  const h = await harness(t);
  await h.pick('go');
  await act(async () => h.button('Show the model').props.onClick());
  assert.equal(h.tree.root.findAllByProps({ 'aria-label': 'Worked life-cycle model' }).length, 1);
  await h.answer();
  assert.equal(h.tree.root.findAllByProps({ 'aria-label': 'Worked life-cycle model' }).length, 0);
  await act(async () => h.button('Skip this round').props.onClick());
  await h.answer();
  await h.answer();
  await h.pick('replay');
  assert.equal(h.saves.length, 1);
  assert.equal(h.tree.root.findByType(LifeCycleStage).props.next, false);
  await h.complete();
  await h.pick('switch-level');
  assert.equal(h.saves.length, 2);
  assert.notEqual(h.saves[0], h.saves[1]);
  assert.equal(h.tree.root.findByType(LifeCycleStage).props.next, true);
});

test('failed replay save keeps completed work available for retry', async (t) => {
  let tries = 0;
  const h = await harness(t, {
    onSaveContinue: async () => {
      if (++tries === 1) throw new Error('Sample temporary write failure');
    },
  });
  await h.pick('go');
  await h.complete();
  await h.pick('replay');
  assert.match(h.tree.root.findByType(DialogueShell).props.line, /try saving/);
  assert.ok(h.choices().props.items.some((c: { id: string }) => c.id === 'replay'));
  await h.pick('replay');
  assert.equal(tries, 2);
  assert.equal(h.tree.root.findByType(LifeCycleStage).props.next, false);
});

test('life-cycle feedback is child-paced and Next picture advances only once', async (t) => {
  const h = await harness(t);
  await h.pick('challenge');
  const stage = h.tree.root.findByType(LifeCycleStage).props.stage;
  await act(async () => h.button('Show the model').props.onClick());
  const selected = h.tree.root.findAllByType('button').find((n) => String(n.props.className).includes('life-supported'))!;
  await act(async () => selected.props.onClick());
  const feedback = h.tree.root.findByType(DialogueShell).props.line;
  await act(async () => t.mock.timers.tick(60000));
  assert.equal(h.tree.root.findByType(DialogueShell).props.line, feedback);
  assert.equal(h.tree.root.findByType(LifeCycleStage).props.stage, stage);
  const next = h.tree.root.findByProps({ 'data-testid': 'life-next' }).props.onClick;
  await act(async () => {
    next();
    next();
  });
  assert.equal(h.tree.root.findByProps({ className: 'lesson-progress' }).props['aria-label'], 'Round 2 of 4');
  assert.equal(h.saves.length, 0);
});
