import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { patternProgressionLesson } from '../../src/domain/lessons/patternProgression';
import { Choices, DialogueShell } from '../../src/ui/child/DialogueShell';
import { LessonFlow, type LessonFlowProps } from '../../src/ui/child/flows/LessonFlow';
import { PatternProgressionStage, PatternLevelChoices, PatternProgressionChoices } from '../../src/ui/child/lesson/PatternProgression';

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
    teacher: 'pippa',
    lesson: patternProgressionLesson,
    startTier: 4,
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
      if (id === 'go' || id === 'challenge') tree.root.findByType(PatternLevelChoices).props.onStart(id === 'go' ? 0 : 4);
      else await choices().props.onPick(id);
    });
  };
  const answer = async () => {
    const stage = tree.root.findByType(PatternProgressionChoices).props.problem.answerId;
    await act(async () => tree.root.findByProps({ 'data-testid': `choice-${stage}` }).props.onClick());
    await act(async () => tree.root.findByProps({ 'data-testid': 'pattern-next' }).props.onClick());
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
  assert.equal(h.tree.root.findByType(PatternProgressionStage).props.matching, true);
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
  const stage = h.tree.root.findByType(PatternProgressionChoices).props.problem.answerId;
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
  assert.equal(h.tree.root.findAllByProps({ 'aria-label': 'Worked shape pattern model' }).length, 1);
  await h.answer();
  assert.equal(h.tree.root.findAllByProps({ 'aria-label': 'Worked shape pattern model' }).length, 0);
  await act(async () => h.button('Skip this round').props.onClick());
  await h.answer();
  await h.answer();
  await h.pick('replay');
  assert.equal(h.saves.length, 1);
  assert.equal(h.tree.root.findByType(PatternProgressionStage).props.matching, true);
  await h.complete();
  await h.pick('choose-pattern');
  await h.pick('challenge');
  assert.equal(h.saves.length, 2);
  assert.notEqual(h.saves[0], h.saves[1]);
  assert.equal(h.tree.root.findByType(PatternProgressionStage).props.matching, false);
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
  assert.equal(h.tree.root.findByType(PatternProgressionStage).props.matching, true);
});

test('pattern feedback is child-paced and Next round advances only once', async (t) => {
  const h = await harness(t);
  await h.pick('challenge');
  const stage = h.tree.root.findByType(PatternProgressionChoices).props.problem.answerId;
  await act(async () => h.button('Show the model').props.onClick());
  const selected = h.tree.root.findAllByType('button').find((n) => String(n.props.className).includes('pattern-supported'))!;
  await act(async () => selected.props.onClick());
  const feedback = h.tree.root.findByType(DialogueShell).props.line;
  await act(async () => t.mock.timers.tick(60000));
  assert.equal(h.tree.root.findByType(DialogueShell).props.line, feedback);
  assert.equal(h.tree.root.findByType(PatternProgressionChoices).props.problem.answerId, stage);
  const next = h.tree.root.findByProps({ 'data-testid': 'pattern-next' }).props.onClick;
  await act(async () => {
    next();
    next();
  });
  assert.equal(h.tree.root.findByProps({ className: 'lesson-progress' }).props['aria-label'], 'Round 2 of 4');
  assert.equal(h.saves.length, 0);
});

test('all four challenges are explicit and an in-play return abandons the unfinished run', async (t) => {
  const h = await harness(t);
  const levels = h.tree.root.findByType(PatternLevelChoices);
  assert.equal(h.tree.root.findAllByProps({ className: 'pattern-level' }).length, 5);
  await act(async () => levels.props.onStart(3));
  assert.equal(h.tree.root.findByType(PatternProgressionChoices).props.problem.meta.rule, 'ABB');
  await h.answer();
  await act(async () => h.tree.root.findByProps({ 'data-testid': 'pattern-return-matching' }).props.onClick());
  assert.equal(h.saves.length, 0);
  assert.equal(h.tree.root.findByProps({ className: 'lesson-progress' }).props['aria-label'], 'Round 1 of 4');
  assert.equal(h.tree.root.findByType(PatternProgressionStage).props.matching, true);
  await h.complete();
  await h.pick('replay');
  assert.equal(h.saves.length, 1);
  assert.equal(h.tree.root.findByType(PatternProgressionStage).props.matching, true);
});

test('double skip advances once, and stale Next cannot advance a replacement run', async (t) => {
  const h = await harness(t);
  await h.pick('challenge');
  const skip = h.button('Skip this round').props.onClick;
  await act(async () => {
    skip();
    skip();
  });
  assert.equal(h.tree.root.findByProps({ className: 'lesson-progress' }).props['aria-label'], 'Round 2 of 4');
  const problem = h.tree.root.findByType(PatternProgressionChoices).props.problem;
  await act(async () => h.tree.root.findByProps({ 'data-testid': `choice-${problem.answerId}` }).props.onClick());
  const oldNext = h.tree.root.findByProps({ 'data-testid': 'pattern-next' }).props.onClick;
  await act(async () => h.tree.root.findByProps({ 'data-testid': 'pattern-return-matching' }).props.onClick());
  const replacement = h.tree.root.findByType(PatternProgressionChoices).props.problem;
  await act(async () => h.tree.root.findByProps({ 'data-testid': `choice-${replacement.answerId}` }).props.onClick());
  await act(async () => oldNext());
  assert.equal(h.tree.root.findByProps({ className: 'lesson-progress' }).props['aria-label'], 'Round 1 of 4');
});

test('completed challenge saves once before matching and stale completion cannot resave an old run', async (t) => {
  const h = await harness(t);
  await h.pick('challenge');
  await h.complete();
  const stale = h.choices().props.onPick;
  await act(async () => {
    await Promise.all([stale('match'), stale('match')]);
  });
  assert.equal(h.saves.length, 1);
  assert.equal(h.tree.root.findByType(PatternProgressionStage).props.matching, true);
  await act(async () => stale('replay'));
  assert.equal(h.saves.length, 1);
});

test('final answered challenge requires the completed save-and-matching action rather than an unsaved restart', async (t) => {
  const h = await harness(t);
  await h.pick('challenge');
  for (let i = 0; i < 3; i++) await h.answer();
  const final = h.tree.root.findByType(PatternProgressionChoices).props.problem;
  await act(async () => h.tree.root.findByProps({ 'data-testid': `choice-${final.answerId}` }).props.onClick());
  assert.equal(h.tree.root.findAllByProps({ 'data-testid': 'pattern-return-matching' }).length, 0);
  await act(async () => h.tree.root.findByProps({ 'data-testid': 'pattern-next' }).props.onClick());
  await h.pick('match');
  assert.equal(h.saves.length, 1);
  assert.equal(h.tree.root.findByType(PatternProgressionStage).props.matching, true);
});
