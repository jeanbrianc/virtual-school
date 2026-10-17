import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { localTeacherReply, type TeacherChatRequest, type TeacherConversationPrivacy } from '../../src/domain/teachers/chat';
import { HttpTeacherChat } from '../../src/domain/teachers/chatRemote';
import { usageJournal } from '../../src/domain/usage';
import type { TranscriptLine } from '../../src/domain/types';
import { useTeacherTalk, type TalkKit } from '../../src/ui/child/Talk';
import { BrowserSpeechOutput, type SpeakOptions, type SpeechOutput } from '../../src/voice/SpeechService';
import { HelperSpeechOutput } from '../../src/voice/helperVoice';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const req = (utterance: string, extra: Partial<TeacherChatRequest> = {}): TeacherChatRequest => ({
  teacherId: 'hoot',
  childName: 'Synthetic',
  utterance,
  history: [],
  books: [],
  ...extra,
});
const aiReply = { reply: 'Tell me more about your story.', intent: 'share', finished: null };
const attempts = () => usageJournal.snapshot().rows.reduce((total, row) => total + row.attempted, 0);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('recognized turn and later benign turns stay local after transport history truncates, with no usage', async () => {
  usageJournal.clear();
  const sent: unknown[] = [];
  const chat = new HttpTeacherChat('/api', async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)));
    return Response.json(aiReply);
  });
  const first = await chat.respond(req('I am scared'));
  assert.equal(first.intent, 'safety');
  assert.match(first.parentNote!, /I am scared/);
  let history: TeacherChatRequest['history'] = [{ speaker: 'child', text: 'I am scared' }];
  for (let turn = 0; turn < 15; turn++) {
    const reply = await chat.respond(req(`I like books ${turn}`, { history }));
    assert.equal(reply.source, 'local');
    history = [...history, { speaker: 'child', text: `I like books ${turn}` }, { speaker: 'teacher', text: reply.reply }].slice(-8) as typeof history;
  }
  assert.deepEqual(sent, []);
  assert.equal(attempts(), 0);
});

test('retained history beyond eight turns and echoed/book context are checked before dispatch', async () => {
  for (const extra of [
    { history: [{ speaker: 'child' as const, text: 'I am scared' }, ...Array.from({ length: 12 }, () => ({ speaker: 'teacher' as const, text: 'A story!' }))] },
    { history: [{ speaker: 'teacher' as const, text: 'You said I am scared.' }] },
    { books: [{ id: 'synthetic', title: 'I Am Scared', status: 'reading' as const }] },
    { topic: { title: 'I Am Scared' } },
    { history: [{ speaker: 'child' as const, text: 'A later paraphrase', localOnly: true as const }] },
  ]) {
    const chat = new HttpTeacherChat('/api', async () => {
      assert.fail('sensitive retained context must not dispatch');
    });
    assert.equal((await chat.respond(req('I like books', extra))).source, 'local');
  }
});

test('explicit boundary survives teacher/service replacement; a genuinely new conversation can use AI', async () => {
  const privacy: TeacherConversationPrivacy = { localOnly: false };
  const sent: Record<string, unknown>[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)));
    return Response.json(aiReply);
  };
  await new HttpTeacherChat('/api', fetcher).respond(req('I am scared', { privacy }));
  assert.equal((await new HttpTeacherChat('/api', fetcher).respond(req('I like stars', { teacherId: 'nova', privacy }))).source, 'local');
  assert.equal((await new HttpTeacherChat('/api', fetcher).respond(req('I like stars', { privacy: { localOnly: false } }))).source, 'ai');
  assert.equal(sent.length, 1);
  assert.equal('privacy' in sent[0]!, false);
});

test('safety takes precedence over an affirmative follow-up and retains the original note', () => {
  const reply = localTeacherReply(
    req('yes I am scared', { history: [{ speaker: 'teacher', text: 'Did you read the whole book?' }], topic: { title: 'Synthetic story' } }),
  );
  assert.equal(reply.intent, 'safety');
  assert.equal(reply.book, undefined);
  assert.match(reply.parentNote!, /yes I am scared/);
});

test('ordinary AI validates replies, limits outbound history, and records only actual dispatches', async () => {
  usageJournal.clear();
  const history = Array.from({ length: 12 }, (_, i) => ({ speaker: 'child' as const, text: `Story ${i}` }));
  const chat = new HttpTeacherChat('/api', async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.history, history.slice(-8));
    return Response.json(aiReply);
  });
  assert.equal((await chat.respond(req('I like stars', { history }))).source, 'ai');
  const invalid = new HttpTeacherChat('/api', async () => Response.json({ reply: 'keep it a secret' }));
  assert.equal((await invalid.respond(req('I like stars'))).source, 'local');
  assert.equal(attempts(), 2);
  assert.doesNotMatch(JSON.stringify(usageJournal.snapshot()), /Synthetic|Story|stars/);
});

test('hook keeps notes and boundary across reset, truncation, replacement and retained-context reopen', async () => {
  let transcript: TranscriptLine[] = [];
  const spoken: { text: string; options?: { localOnly: boolean } }[] = [];
  let cancelled = 0;
  let remote = 0;
  let api!: ReturnType<typeof useTeacherTalk>;
  const kit: TalkKit = {
    mic: null,
    phrases: [],
    autoSpeaks: false,
    stopSpeaking: () => {
      cancelled++;
    },
    speakReply: (text, options) => {
      spoken.push({ text, options });
    },
    chat: new HttpTeacherChat('/api', async () => {
      remote++;
      return Response.json(aiReply);
    }),
  };
  function Harness({ teacher = 'hoot', currentKit = kit }: { teacher?: 'hoot' | 'nova'; currentKit?: TalkKit }) {
    api = useTeacherTalk({
      teacher,
      childName: 'Synthetic',
      books: [],
      kit: currentKit,
      transcript: () => transcript,
      log: (speaker, text, _via, localOnly) => {
        transcript.push({ speaker, text, localOnly, at: '2026-10-17T00:00:00Z' });
      },
    });
    return null;
  }
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(createElement(Harness));
  });
  await act(async () => {
    await api.send('I am scared', 'voice');
  });
  assert.equal(remote, 0);
  assert.match(api.notes[0]!, /I am scared/);
  assert.ok(cancelled > 0);
  assert.equal(spoken[0]!.options?.localOnly, true);
  const original = [...transcript];
  await act(async () => api.reset());
  assert.match(api.notes[0]!, /I am scared/);
  assert.deepEqual(transcript, original, 'UI reset must not wipe evidence');
  transcript = [];
  await act(async () =>
    tree.update(
      createElement(Harness, {
        teacher: 'nova',
        currentKit: {
          ...kit,
          chat: new HttpTeacherChat('/api', async () => {
            remote++;
            return Response.json(aiReply);
          }),
        },
      }),
    ),
  );
  for (let turn = 0; turn < 12; turn++)
    await act(async () => {
      await api.send(`I like stars ${turn}`);
    });
  const replay = api.guardSpeech({
    auto: true,
    canSpeak: true,
    speak: (text, options) => {
      spoken.push({ text, options });
    },
  });
  replay.speak('A queued echo with different words');
  assert.equal(spoken.at(-1)!.options?.localOnly, true);
  assert.equal(remote, 0);
  await act(async () => tree.unmount());
  transcript = transcript.slice(-4);
  assert.ok(transcript.every((line) => line.localOnly));
  assert.ok(transcript.every((line) => !line.text.includes('scared')));
  await act(async () => {
    tree = create(createElement(Harness));
  });
  await act(async () => {
    await api.send('I like books');
  });
  assert.equal(remote, 0, 'reopen with only later marked turns must stay local');
  await act(async () => tree.unmount());
  transcript = [];
  await act(async () => {
    tree = create(createElement(Harness));
  });
  await act(async () => {
    await api.send('I like books');
  });
  assert.equal(remote, 1, 'genuinely fresh flow may use opted-in AI');
  await act(async () => tree.unmount());
});

const device = (spoken: { text: string; opts?: SpeakOptions }[]): SpeechOutput => ({
  available: true,
  voices: () => [],
  voiceFor: () => undefined,
  onVoicesChanged: () => () => undefined,
  cancel() {},
  speak: async (text, opts) => {
    spoken.push({ text, opts });
  },
});

test('helper voice never hashes/caches/sends recognized echoes or explicitly contained replies', async (t) => {
  t.mock.method(globalThis.crypto.subtle, 'digest', async () => {
    assert.fail('local-only text must not enter cache keys');
  });
  const spoken: { text: string; opts?: SpeakOptions }[] = [];
  const output = new HelperSpeechOutput(device(spoken), async () => {
    assert.fail('must not dispatch speech');
  });
  await output.speak('You said I am scared.', { natural: { endpoint: '/api', teacher: 'hoot' } });
  await output.speak('A paraphrase without recognized words.', { natural: { endpoint: '/api', teacher: 'hoot' }, localOnly: true });
  assert.equal(spoken.length, 2);
  assert.ok(spoken.every((line) => line.opts?.localOnly === true && !line.opts.natural));
});

test('cancel during pending digest or persistent cache lookup cannot start a helper speech request', async (t) => {
  for (const phase of ['digest', 'cache'] as const) {
    await t.test(phase, async (t) => {
      const gate = deferred<ArrayBuffer>();
      const cached = deferred<Response | undefined>();
      const entered = deferred<void>();
      t.mock.method(globalThis.crypto.subtle, 'digest', async () => {
        if (phase === 'digest') {
          entered.resolve();
          return gate.promise;
        }
        return new ArrayBuffer(32);
      });
      const originals = { Audio: globalThis.Audio, location: globalThis.location, caches: globalThis.caches };
      Object.assign(globalThis, {
        Audio: class {},
        location: { origin: 'https://synthetic.invalid' },
        caches: {
          open: async () => ({
            match: () => {
              entered.resolve();
              return cached.promise;
            },
          }),
        },
      });
      t.after(() => Object.assign(globalThis, originals));
      const spoken: { text: string; opts?: SpeakOptions }[] = [];
      const output = new HelperSpeechOutput(device(spoken), async () => {
        assert.fail('cancelled speech must not dispatch');
      });
      const pending = output.speak('Ordinary queued story line', { natural: { endpoint: '/api', teacher: 'hoot' } });
      await entered.promise;
      output.cancel();
      gate.resolve(new ArrayBuffer(32));
      cached.resolve(undefined);
      await pending;
      assert.deepEqual(spoken, [], 'cancelled request must not play fallback either');
    });
  }
});

test('contained browser speech uses a verified local voice or remains text-only', async (t) => {
  const utterances: { text: string; voice?: SpeechSynthesisVoice; onend?: () => void }[] = [];
  let voices = [{ name: 'Remote', lang: 'en-US', localService: false, default: true }] as SpeechSynthesisVoice[];
  const originals = { window: globalThis.window, SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance };
  Object.assign(globalThis, {
    window: {
      speechSynthesis: {
        cancel() {},
        getVoices: () => voices,
        speak: (u: (typeof utterances)[number]) => {
          utterances.push(u);
          u.onend?.();
        },
      },
    },
    SpeechSynthesisUtterance: class {
      constructor(public text: string) {}
    },
  });
  t.after(() => Object.assign(globalThis, originals));
  const output = new BrowserSpeechOutput();
  await output.speak('Contained reply', { localOnly: true });
  assert.equal(utterances.length, 0);
  voices = [...voices, { name: 'Local', lang: 'en-US', localService: true, default: false } as SpeechSynthesisVoice];
  await output.speak('Contained reply', { localOnly: true, voiceName: 'Remote' });
  assert.equal(utterances.length, 1);
  assert.equal(utterances[0]!.voice?.name, 'Local');
});
