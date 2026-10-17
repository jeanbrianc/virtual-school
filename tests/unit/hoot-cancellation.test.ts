import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { BOOK_CATALOG } from '../../src/domain/reading/bookCatalog';
import type { TeacherChatReply } from '../../src/domain/teachers/chat';
import type { Book } from '../../src/domain/types';
import { Choices, DialogueShell } from '../../src/ui/child/DialogueShell';
import { MicButton, TalkBar, type Mic } from '../../src/ui/child/Talk';
import { HootFlow, type HootFlowProps } from '../../src/ui/child/flows/HootFlow';
import type { ListenOutcome } from '../../src/voice/SpeechService';

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  window: { matchMedia: () => ({ matches: true }) },
  document: { createElement: () => ({ getContext: () => null }) },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const reply = (text: string): TeacherChatReply => ({ reply: text, intent: 'share', finished: null, source: 'local' });
async function harness(t: TestContext, overrides: Partial<HootFlowProps> = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const saves: Parameters<HootFlowProps['onFinishBook']>[0][] = [];
  let stops = 0;
  const heard = deferred<ListenOutcome>();
  let interim: ((text: string) => void) | undefined;
  const mic: Mic = {
    onDevice: true,
    needsSetup: false,
    blocked: null,
    prepare: async () => 'ready',
    listen: (opts) => {
      interim = opts.onInterim;
      return heard.promise;
    },
    stop: () => {
      stops++;
    },
  };
  const props: HootFlowProps = {
    childName: 'Synthetic',
    books: [],
    mastery: [],
    visitsToday: 0,
    firstMeeting: true,
    speech: { auto: false, canSpeak: false, speak() {} },
    playSfx() {},
    onFinishBook: (input) => {
      saves.push(input);
    },
    onStartBook: async () => 'CURRENT START',
    onReadMore: async () => 'CURRENT PROGRESS',
    onClose() {},
    talk: {
      mic,
      phrases: [],
      autoSpeaks: false,
      speakReply() {},
      chat: { id: 'local', sendsDataOffDevice: false, respond: async () => reply('CURRENT CHAT') },
    },
    ...overrides,
  };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(createElement(HootFlow, props));
  });
  t.after(async () => {
    await act(async () => tree.unmount());
  });
  const pick = async (id: string) => {
    await act(async () => {
      tree.root
        .findAllByType(Choices)
        .find((node) => node.props.items.some((item: { id: string }) => item.id === id))!
        .props.onPick(id);
    });
  };
  const button = (name: string) => tree.root.findAllByType('button').find((node) => node.props.children === name)!;
  const back = async () => {
    await act(async () => button('Back to library').props.onClick());
  };
  const title = async (text: string) => {
    await act(async () => tree.root.findByProps({ 'data-testid': 'new-book-title' }).props.onChange({ target: { value: text } }));
  };
  const submit = async () => {
    await act(async () =>
      tree.root
        .findAllByType('form')
        .find((node) => node.props.className === 'new-book')!
        .props.onSubmit({ preventDefault() {} }),
    );
  };
  const menu = () => tree.root.findAllByType(Choices).some((node) => node.props.items.some((item: { id: string }) => item.id === 'finish'));
  const tick = async (ms: number) => {
    await act(async () => t.mock.timers.tick(ms));
  };
  return { tree, saves, heard, mic, pick, back, title, submit, menu, tick, button, stops: () => stops, interim: (text: string) => interim?.(text) };
}

test('pending start reply cannot replace Back or a new draft; current start reply still works', async (t) => {
  const old = deferred<string>();
  let calls = 0;
  const h = await harness(t, { onStartBook: () => (++calls === 1 ? old.promise : Promise.resolve('CURRENT START')) });
  await h.pick('more');
  await h.title('Old draft');
  await h.submit();
  await h.back();
  assert.ok(h.menu());
  await h.pick('more');
  await h.title('Current draft');
  await act(async () => old.resolve('OBSOLETE START'));
  assert.equal(h.tree.root.findByProps({ 'data-testid': 'new-book-title' }).props.value, 'Current draft');
  assert.doesNotMatch(h.tree.root.findByType(DialogueShell).props.line, /OBSOLETE/);
  await h.submit();
  assert.equal(h.tree.root.findByType(DialogueShell).props.line, 'CURRENT START');
  assert.equal(calls, 2);
});

test('pending progress reply cannot replace the library reset', async (t) => {
  const old = deferred<string>();
  const book: Book = {
    id: 'synthetic',
    childId: 'synthetic-child',
    dateAdded: '2026-10-12',
    title: 'Synthetic book',
    author: '',
    status: 'reading',
    readingMode: 'independent',
    tags: [],
    cover: { background: '#fff', accent: '#000', motif: 'moon' },
  };
  const h = await harness(t, { books: [book], onReadMore: () => old.promise });
  await h.pick('more');
  await act(async () => h.tree.root.findByProps({ 'data-testid': 'pick-book-synthetic' }).props.onClick());
  await act(async () => {
    void h.tree.root
      .findAllByType('button')
      .find((node) => node.props.className === 'btn btn-primary btn-big')!
      .props.onClick();
  });
  await h.back();
  await act(async () => old.resolve('OBSOLETE PROGRESS'));
  assert.ok(h.menu());
  assert.doesNotMatch(h.tree.root.findByType(DialogueShell).props.line, /OBSOLETE/);
});

async function reachFavorite(h: Awaited<ReturnType<typeof harness>>) {
  const catalog = BOOK_CATALOG.find((book) => book.moments.length)!;
  await h.pick('finish');
  await h.title(catalog.title);
  await act(async () => h.tree.root.findByProps({ 'data-testid': `suggest-${catalog.id}` }).props.onClick());
  for (let i = 0; i < 30 && !h.tree.root.findAllByProps({ 'data-testid': 'rating-skip' }).length; i++) {
    const choices = h.tree.root.findByType(Choices);
    const item = choices.props.items.find((choice: { id: string }) => choices.props.state?.[choice.id] !== 'disabled');
    await act(async () => choices.props.onPick(item.id));
    await h.tick(2300);
  }
  await act(async () => h.tree.root.findByProps({ 'data-testid': 'rating-skip' }).props.onClick());
  assert.ok(h.tree.root.findByProps({ 'aria-label': 'Favorite part' }));
}

test('pending favorite microphone cannot save after Back, close, or unmount', async (t) => {
  for (const cancel of ['back', 'close', 'unmount'] as const) {
    await t.test(cancel, async (t) => {
      const h = await harness(t);
      await reachFavorite(h);
      await act(async () => h.tree.root.findByType(MicButton).findByType('button').props.onClick());
      if (cancel === 'back') await h.back();
      else if (cancel === 'close') await act(async () => h.tree.root.findByType(DialogueShell).props.onClose());
      else await act(async () => h.tree.unmount());
      await act(async () => {
        h.interim('OBSOLETE INTERIM');
        h.heard.resolve({ result: { transcript: 'OBSOLETE FAVORITE', confidence: 1, onDevice: true } });
      });
      await h.tick(900);
      assert.equal(h.saves.length, 0);
      assert.ok(h.stops() > 0);
      if (cancel === 'back') assert.ok(h.menu());
    });
  }
});

test('current favorite microphone saves exactly once', async (t) => {
  const h = await harness(t);
  await reachFavorite(h);
  await act(async () => h.tree.root.findByType(MicButton).findByType('button').props.onClick());
  await act(async () => h.heard.resolve({ result: { transcript: 'Synthetic favorite', confidence: 1, onDevice: true } }));
  await h.tick(900);
  assert.equal(h.saves.length, 1);
  assert.equal(h.saves[0]!.favoritePart, 'Synthetic favorite');
});

test('old chat reply, topic, note and spoken reply do not leak into a new conversation', async (t) => {
  const old = deferred<TeacherChatReply>();
  let calls = 0;
  const spoken: string[] = [];
  const h = await harness(t, {
    talk: {
      mic: null,
      phrases: [],
      autoSpeaks: false,
      speakReply: (text) => {
        spoken.push(text);
      },
      chat: { id: 'local', sendsDataOffDevice: false, respond: () => (++calls === 1 ? old.promise : Promise.resolve(reply('CURRENT CHAT'))) },
    },
  });
  await act(async () => h.tree.root.findByType(TalkBar).props.onSay('Old chat', 'voice'));
  await h.back();
  await act(async () => h.tree.root.findByType(TalkBar).props.onSay('Current chat', 'typed'));
  await act(async () => old.resolve({ ...reply('OBSOLETE CHAT'), book: { title: 'Old book' }, parentNote: 'OLD NOTE' }));
  assert.equal(h.tree.root.findByType(DialogueShell).props.line, 'CURRENT CHAT');
  assert.equal(h.tree.root.findAllByProps({ 'data-testid': 'talk-topic' }).length, 0);
  assert.deepEqual(spoken, []);
});

test('captured favorite callback cannot schedule a save into a replacement draft', async (t) => {
  const h = await harness(t);
  await reachFavorite(h);
  const lateHeard = h.tree.root.findByType(MicButton).props.onHeard;
  await h.back();
  await h.pick('finish');
  await h.title('Replacement draft');
  await act(async () => lateHeard('OBSOLETE FAVORITE'));
  await h.tick(900);
  assert.equal(h.saves.length, 0);
  assert.equal(h.tree.root.findByProps({ 'data-testid': 'new-book-title' }).props.value, 'Replacement draft');
});

test('microphone preparation ending after Back does not begin listening', async (t) => {
  const preparation = deferred<'ready'>();
  let listens = 0;
  const mic: Mic = {
    onDevice: true,
    needsSetup: true,
    blocked: null,
    prepare: () => preparation.promise,
    listen: async () => {
      listens++;
      return { result: null };
    },
    stop() {},
  };
  const h = await harness(t, {
    talk: { mic, phrases: [], autoSpeaks: false, speakReply() {}, chat: { id: 'local', sendsDataOffDevice: false, respond: async () => reply('CURRENT') } },
  });
  await h.pick('finish');
  const lateHeard = h.tree.root.findByType(MicButton).props.onHeard;
  await act(async () => h.tree.root.findByType(MicButton).findByType('button').props.onClick());
  await h.back();
  await h.pick('finish');
  await act(async () => {
    preparation.resolve('ready');
    lateHeard('OBSOLETE TITLE');
  });
  assert.equal(listens, 0);
  assert.equal(h.tree.root.findByProps({ 'data-testid': 'new-book-title' }).props.value, '');
});

test('scheduled completion is canceled on close and unmount', async (t) => {
  for (const cancel of ['close', 'unmount'] as const) {
    await t.test(cancel, async (t) => {
      const h = await harness(t);
      await h.pick('finish');
      await h.title('Synthetic canceled save');
      await h.submit();
      await act(async () => h.button('Not sure').props.onClick());
      await act(async () => h.tree.root.findByProps({ 'data-testid': 'rating-skip' }).props.onClick());
      if (cancel === 'close') await act(async () => h.tree.root.findByType(DialogueShell).props.onClose());
      else await act(async () => h.tree.unmount());
      await h.tick(900);
      assert.equal(h.saves.length, 0);
    });
  }
});

test('a current chat failure releases its lock so typing can retry', async (t) => {
  let calls = 0;
  const h = await harness(t, {
    talk: {
      mic: null,
      phrases: [],
      autoSpeaks: false,
      speakReply() {},
      chat: {
        id: 'local',
        sendsDataOffDevice: false,
        respond: () => (++calls === 1 ? Promise.reject(new Error('Synthetic failure')) : Promise.resolve(reply('CURRENT RETRY'))),
      },
    },
  });
  await act(async () => h.tree.root.findByType(TalkBar).props.onSay('First attempt', 'typed'));
  await act(async () => h.tree.root.findByType(TalkBar).props.onSay('Retry', 'typed'));
  assert.equal(h.tree.root.findByType(DialogueShell).props.line, 'CURRENT RETRY');
  assert.equal(calls, 2);
});

test('a ready mic prop refresh during preparation releases setup and can listen on the next tap', async (t) => {
  const preparation = deferred<'ready'>();
  const heard = deferred<ListenOutcome>();
  let listens = 0;
  let stops = 0;
  const statuses: boolean[] = [];
  const oldMic: Mic = {
    onDevice: true,
    needsSetup: true,
    blocked: null,
    prepare: () => preparation.promise,
    listen: async () => {
      assert.fail('obsolete microphone must not listen');
    },
    stop: () => {
      stops++;
    },
  };
  const readyMic: Mic = {
    ...oldMic,
    needsSetup: false,
    listen: () => {
      listens++;
      return heard.promise;
    },
  };
  const props = {
    mic: oldMic,
    label: 'Synthetic microphone',
    onHeard() {},
    onPreparing: (status: boolean) => {
      statuses.push(status);
    },
  };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(createElement(MicButton, props));
  });
  t.after(async () => {
    await act(async () => tree.unmount());
  });
  await act(async () => tree.root.findByType('button').props.onClick());
  assert.equal(tree.root.findByType('button').props['aria-busy'], true);
  await act(async () => tree.update(createElement(MicButton, { ...props, mic: readyMic })));
  await act(async () => preparation.resolve('ready'));
  assert.equal(tree.root.findByType('button').props['aria-busy'], false);
  assert.equal(statuses.at(-1), false);
  assert.equal(listens, 0);
  assert.ok(stops > 0);
  await act(async () => tree.root.findByType('button').props.onClick());
  assert.equal(listens, 1);
  assert.equal(tree.root.findByType('button').props['aria-pressed'], true);
  await act(async () => heard.resolve({ result: null, error: 'no-speech' }));
  await act(async () => tree.root.findByType('button').props.onClick());
  assert.equal(listens, 2, 'subsequent attempts remain available');
});

test('mic replacement while listening resets status and rejects old interim and final results', async (t) => {
  const oldResult = deferred<ListenOutcome>();
  const currentResult = deferred<ListenOutcome>();
  const heard: string[] = [];
  const interim: string[] = [];
  let oldInterim: ((text: string) => void) | undefined;
  let stops = 0;
  let listens = 0;
  const oldMic: Mic = {
    onDevice: true,
    needsSetup: false,
    blocked: null,
    prepare: async () => 'ready',
    listen: (opts) => {
      oldInterim = opts.onInterim;
      return oldResult.promise;
    },
    stop: () => {
      stops++;
    },
  };
  const currentMic: Mic = {
    ...oldMic,
    listen: () => {
      listens++;
      return currentResult.promise;
    },
  };
  const props = {
    mic: oldMic,
    label: 'Synthetic microphone',
    onHeard: (text: string) => {
      heard.push(text);
    },
    onInterim: (text: string) => {
      interim.push(text);
    },
  };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(createElement(MicButton, props));
  });
  t.after(async () => {
    await act(async () => tree.unmount());
  });
  await act(async () => tree.root.findByType('button').props.onClick());
  assert.equal(tree.root.findByType('button').props['aria-pressed'], true);
  await act(async () => tree.update(createElement(MicButton, { ...props, mic: currentMic })));
  assert.equal(tree.root.findByType('button').props['aria-pressed'], false);
  await act(async () => tree.root.findByType('button').props.onClick());
  await act(async () => {
    oldInterim?.('OBSOLETE INTERIM');
    oldResult.resolve({ result: { transcript: 'OBSOLETE RESULT', confidence: 1, onDevice: true } });
  });
  assert.equal(tree.root.findByType('button').props['aria-pressed'], true, 'old result must not clear a new listener');
  assert.ok(!interim.includes('OBSOLETE INTERIM'));
  assert.deepEqual(heard, []);
  await act(async () => currentResult.resolve({ result: { transcript: 'CURRENT RESULT', confidence: 1, onDevice: true } }));
  assert.deepEqual(heard, ['CURRENT RESULT']);
  assert.equal(listens, 1);
  assert.ok(stops > 0);
});

test('TalkBar clears its parent preparation indicator when the mic becomes ready', async (t) => {
  const preparation = deferred<'ready'>();
  let listens = 0;
  const oldMic: Mic = {
    onDevice: true,
    needsSetup: true,
    blocked: null,
    prepare: () => preparation.promise,
    listen: async () => ({ result: null }),
    stop() {},
  };
  const kit: HootFlowProps['talk'] = {
    mic: oldMic,
    phrases: [],
    autoSpeaks: false,
    speakReply() {},
    chat: { id: 'local', sendsDataOffDevice: false, respond: async () => reply('CURRENT') },
  };
  const props = { kit, teacherName: 'Professor Hoot', onSay() {} };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(createElement(TalkBar, props));
  });
  t.after(async () => {
    await act(async () => tree.unmount());
  });
  await act(async () => tree.root.findByType(MicButton).findByType('button').props.onClick());
  assert.equal(tree.root.findAllByProps({ className: 'talk-live' }).length, 1);
  await act(async () =>
    tree.update(
      createElement(TalkBar, {
        ...props,
        kit: {
          ...kit,
          mic: {
            ...oldMic,
            needsSetup: false,
            listen: async () => {
              listens++;
              return { result: null, error: 'no-speech' as const };
            },
          },
        },
      }),
    ),
  );
  await act(async () => preparation.resolve('ready'));
  assert.equal(tree.root.findAllByProps({ className: 'talk-live' }).length, 0);
  assert.equal(tree.root.findByType(MicButton).findByType('button').props['aria-busy'], false);
  await act(async () => tree.root.findByType(MicButton).findByType('button').props.onClick());
  assert.equal(listens, 1);
});

test('parent-selected depth, hint and skip retain supported evidence without claiming narration', async (t) => {
  const h = await harness(t, { conversationDepth: 'deeper' });
  const cat = BOOK_CATALOG.find((b) => b.id === 'tom-kitten')!;
  await h.pick('finish');
  await h.title(cat.title);
  await act(async () => h.tree.root.findByProps({ 'data-testid': 'suggest-tom-kitten' }).props.onClick());
  assert.match(h.tree.root.findByType(DialogueShell).props.line, /climbing difficult/);
  await act(async () => h.tree.root.findByProps({ 'data-testid': 'story-hint' }).props.onClick());
  await h.pick('c0');
  await h.tick(2300);
  await act(async () => h.tree.root.findByProps({ 'data-testid': 'story-skip' }).props.onClick());
  await act(async () => h.tree.root.findByProps({ 'data-testid': 'rating-skip' }).props.onClick());
  await h.pick('__skip');
  await h.tick(900);
  assert.equal(h.saves.length, 1);
  assert.equal(h.saves[0]!.answers[0]!.outcome, 'supported');
  assert.ok(h.saves[0]!.answers[1]!.scaffolds.includes('skipped'));
  assert.equal(h.saves[0]!.narration, undefined);
});

test('custom-book reflections and parent-authored answers save without automatic grading and reset on Back', async (t) => {
  const book: Book = {
    id: 'synthetic',
    childId: 'synthetic-child',
    dateAdded: '2026-10-12',
    title: 'Synthetic kite story',
    author: '',
    status: 'reading',
    readingMode: 'shared',
    tags: [],
    cover: { background: '#fff', accent: '#000', motif: 'moon' },
    storyPrompt: { prompt: 'Who brought the kite?', answer: 'Avery' },
  };
  const h = await harness(t, { books: [book] });
  const choose = async () => {
    await h.pick('finish');
    await act(async () => h.tree.root.findByProps({ 'data-testid': 'pick-book-synthetic' }).props.onClick());
  };
  await choose();
  assert.match(h.tree.root.findByType(DialogueShell).props.line, /don’t have checked/);
  assert.equal(h.tree.root.findByProps({ 'data-testid': 'parent-story-prompt' }).props.children, 'Who brought the kite?');
  await act(async () => h.tree.root.findByProps({ 'data-testid': 'reflection-narration' }).props.onChange({ target: { value: 'Abandoned draft' } }));
  await h.back();
  await choose();
  assert.equal(h.tree.root.findByProps({ 'data-testid': 'reflection-narration' }).props.value, '');
  assert.equal(h.tree.root.findByProps({ 'data-testid': 'parent-story-response' }).props.value, '');
  await act(async () => {
    h.tree.root.findByProps({ 'data-testid': 'reflection-favorite' }).props.onChange({ target: { value: 'The kite' } });
    h.tree.root.findByProps({ 'data-testid': 'reflection-narration' }).props.onChange({ target: { value: 'Synthetic narration with unknown accuracy' } });
    h.tree.root.findByProps({ 'data-testid': 'parent-story-response' }).props.onChange({ target: { value: 'A completely different answer' } });
  });
  await act(async () => h.button('Not sure').props.onClick());
  await act(async () => h.tree.root.findByProps({ 'data-testid': 'rating-skip' }).props.onClick());
  await h.tick(900);
  assert.equal(h.saves.length, 1);
  assert.deepEqual(h.saves[0]!.answers, []);
  assert.equal(h.saves[0]!.favoritePart, 'The kite');
  assert.equal(h.saves[0]!.narration, 'Synthetic narration with unknown accuracy');
  assert.ok(h.saves[0]!.transcript.some((line) => /Parent-authored.*ungraded/.test(line.text)));
});

test('AI replies are visibly unverified and do not create story attempts', async (t) => {
  const h = await harness(t, {
    talk: {
      mic: null,
      phrases: [],
      autoSpeaks: false,
      speakReply() {},
      chat: { id: 'synthetic-ai', sendsDataOffDevice: false, respond: async () => ({ ...reply('Synthetic AI reply'), source: 'ai' }) },
    },
  });
  await act(async () => h.tree.root.findByType(TalkBar).props.onSay('Tell me about an unknown book', 'typed'));
  assert.match(h.tree.root.findByProps({ 'data-testid': 'ai-story-source' }).props.children, /unverified/);
  assert.equal(h.saves.length, 0);
  await h.back();
  assert.equal(h.tree.root.findAllByProps({ 'data-testid': 'ai-story-source' }).length, 0);
});
