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
