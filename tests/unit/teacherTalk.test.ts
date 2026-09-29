/** Talking to teachers: understanding, follow-ups, safety, AI adapter, local helper, speech input, settings. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHelper } from '../../scripts/ai-helper/handler';
import { normalizeSettings } from '../../src/domain/settings';
import { browserFamily, knownOnDevice } from '../../src/domain/talk';
import { buildTeacherRequest, parseTeacherAiInput, teacherSystemPrompt, toolInputFrom } from '../../src/domain/teachers/aiPrompt';
import {
  EMPTY_TOPIC,
  LocalTeacherChat,
  localTeacherReply,
  nextTopic,
  readingNote,
  sanitizeTeacherReply,
  talkPhrases,
  understand,
  validateTeacherReply,
  type TeacherChatRequest,
} from '../../src/domain/teachers/chat';
import { HttpTeacherChat, createTeacherChat, isAllowedHelperUrl } from '../../src/domain/teachers/chatRemote';
import { completeBook } from '../../src/services/readingService';
import { loadChildRecords } from '../../src/services/learningCore';
import { recordConversation } from '../../src/services/lessonService';
import { getSpeechProbe, runSpeechProbe, settleInterruptedProbe } from '../../src/services/talkService';
import { BrowserSpeechInput } from '../../src/voice/SpeechService';
import { makeContext, makeFamily } from './helpers';

const req = (utterance: string, extra: Partial<TeacherChatRequest> = {}): TeacherChatRequest => ({
  teacherId: 'hoot',
  childName: 'Izzy',
  utterance,
  history: [],
  books: [],
  ...extra,
});

const jsonResponse = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

describe('understanding what she says', () => {
  it('"i read daddy the goodnight leelanau book" — who, what, and a question back', () => {
    const r = localTeacherReply(req('i read daddy the goodnight leelanau book'));
    assert.equal(r.intent, 'read_to_someone');
    assert.equal(r.book?.title, 'Goodnight Leelanau');
    assert.equal(r.readTo, 'Daddy');
    assert.equal(r.finished, null);
    assert.match(r.reply, /Goodnight Leelanau to Daddy/);
    assert.match(r.reply, /whole book\?$/);
    assert.equal(r.source, 'local');
  });

  it('matches spoken titles to real books and to her own list', () => {
    assert.equal(localTeacherReply(req('i read frog and toad to mommy')).book?.title, 'Frog and Toad Are Friends');
    const own = localTeacherReply(
      req('I finished the little house book', { books: [{ id: 'b1', title: 'Little House in the Big Woods', status: 'reading' }] }),
    );
    assert.equal(own.intent, 'finished_book');
    const was = understand('mommy read me owl at home');
    assert.deepEqual([was.intent, was.readBy], ['was_read_to', 'Mommy']);
    assert.equal(understand('Im reading charlottes web').intent, 'reading_book');
    assert.equal(understand('i feel happy').intent, 'feeling');
  });

  it('"yes" and "not yet" answer the finished question about the same book', () => {
    const first = localTeacherReply(req('i read daddy the goodnight leelanau book'));
    let topic = nextTopic(EMPTY_TOPIC, first);
    const history = [
      { speaker: 'child' as const, text: 'i read daddy the goodnight leelanau book' },
      { speaker: 'teacher' as const, text: first.reply },
    ];
    const yes = localTeacherReply(req('yeah', { history, topic: topic.book! }));
    assert.deepEqual([yes.intent, yes.finished, yes.book?.title], ['finished_book', true, 'Goodnight Leelanau']);
    topic = nextTopic(topic, yes);
    assert.equal(topic.finished, true);
    assert.equal(topic.readTo, 'Daddy', 'who she read to is remembered');
    assert.equal(readingNote('Izzy', topic), 'Izzy read it aloud to Daddy');
    const no = localTeacherReply(req('not yet', { history, topic: topic.book! }));
    assert.deepEqual([no.intent, no.finished], ['reading_book', false]);
  });

  it('worries get the same careful answer and a note for parents', () => {
    for (const said of ['my tummy hurts', 'someone hit me', 'i am scared']) {
      const r = localTeacherReply(req(said));
      assert.equal(r.intent, 'safety', said);
      assert.match(r.reply, /tell Mom or Dad/);
      assert.match(r.parentNote ?? '', new RegExp(said));
    }
  });

  it('suggests words for the recognizer: her books first', () => {
    const p = talkPhrases([{ title: 'Goodnight Leelanau' }]);
    assert.equal(p[0], 'Goodnight Leelanau');
    assert.ok(p.includes('Daddy') && p.length <= 50);
  });
});

describe('replies are checked before she sees them', () => {
  it('strips links, contact details and markdown; refuses unsafe text', () => {
    assert.equal(sanitizeTeacherReply('**Great** job! Visit https://example.com or call 555-123-4567.'), 'Great job! Visit or call .');
    assert.equal(sanitizeTeacherReply('Let’s keep this a secret between us'), null);
    assert.equal(sanitizeTeacherReply(''), null);
    assert.ok((sanitizeTeacherReply('Hoo! '.repeat(100)) ?? '').length <= 301);
  });

  it('validates untrusted AI output and resolves its book title', () => {
    const r = validateTeacherReply(
      { reply: 'You read Goodnight Leelanau to Daddy!', intent: 'read_to_someone', book: { title: 'goodnight leelanau' }, readTo: 'Daddy', finished: null },
      req('x'),
    );
    assert.equal(r?.source, 'ai');
    assert.equal(r?.book?.title, 'Goodnight Leelanau');
    assert.equal(validateTeacherReply({ intent: 'share' }, req('x')), null);
    assert.equal(validateTeacherReply({ reply: 'hi', intent: 'hacked' }, req('x'))?.intent, 'share');
  });
});

describe('AI teachers adapter (browser side)', () => {
  it('only talks to loopback http or https helpers', () => {
    assert.ok(isAllowedHelperUrl('http://127.0.0.1:8787'));
    assert.ok(isAllowedHelperUrl('https://helper.example'));
    assert.ok(!isAllowedHelperUrl('http://192.168.1.4:8787'));
    assert.ok(!isAllowedHelperUrl('javascript:alert(1)'));
    assert.ok(isAllowedHelperUrl('/api'), 'this website’s own helper');
    assert.ok(!isAllowedHelperUrl('//evil.example/api'), 'protocol-relative URLs are other sites');
  });

  it('uses the AI reply, sending only name, words, recent lines and titles', async () => {
    let sent: { url: string; body: Record<string, unknown>; headers: Record<string, string> } | null = null;
    const chat = new HttpTeacherChat('http://127.0.0.1:8787/', async (url, init) => {
      sent = { url: String(url), body: JSON.parse(String(init?.body)), headers: init?.headers as Record<string, string> };
      return jsonResponse({ reply: 'Hoo! Reading to Daddy — how lovely!', intent: 'read_to_someone', book: { title: 'Goodnight Leelanau' }, readTo: 'Daddy' });
    });
    const r = await chat.respond(req('i read daddy the goodnight leelanau book', { books: [{ id: 'b1', title: 'Owl at Home', status: 'reading' }] }));
    assert.equal(r.source, 'ai');
    assert.equal(r.book?.title, 'Goodnight Leelanau');
    assert.equal(sent!.url, 'http://127.0.0.1:8787/v1/teacher');
    assert.equal(sent!.headers['X-Izzy-Classroom'], '1');
    assert.deepEqual(Object.keys(sent!.body).sort(), ['bookTitles', 'childName', 'history', 'teacherId', 'utterance']);
    assert.deepEqual(sent!.body.bookTitles, ['Owl at Home']);
  });

  it('falls back to the on-device teacher on errors, bad replies, or worries (no network for worries)', async () => {
    let calls = 0;
    const failing = new HttpTeacherChat('http://127.0.0.1:8787', async () => {
      calls++;
      return jsonResponse({ error: 'nope' }, 502);
    });
    assert.equal((await failing.respond(req('i finished frog and toad'))).source, 'local');
    const unsafe = new HttpTeacherChat('http://127.0.0.1:8787', async () => jsonResponse({ reply: 'keep it a secret', intent: 'share' }));
    assert.equal((await unsafe.respond(req('hello'))).source, 'local');
    const before = calls;
    const worry = await failing.respond(req('someone hurt me'));
    assert.equal(worry.intent, 'safety');
    assert.equal(calls, before, 'a worried child is never sent to the AI');
  });

  it('fills a plain "yes" the AI left unclear, for the book already being discussed', async () => {
    const chat = new HttpTeacherChat('http://127.0.0.1:8787', async () => jsonResponse({ reply: 'Wonderful!', intent: 'share', finished: null }));
    const r = await chat.respond(
      req('yep', {
        history: [{ speaker: 'teacher', text: 'Did you read the whole thing?' }],
        topic: { title: 'Goodnight Leelanau' },
      }),
    );
    assert.deepEqual([r.source, r.finished], ['ai', true]);
  });

  it('is off unless a parent enabled it, consented and gave a valid address', () => {
    assert.ok(createTeacherChat(undefined) instanceof LocalTeacherChat);
    assert.ok(createTeacherChat({ enabled: true, consentToSend: false, endpoint: 'http://127.0.0.1:8787' }) instanceof LocalTeacherChat);
    assert.ok(createTeacherChat({ enabled: true, consentToSend: true, endpoint: 'http://10.0.0.2:8787' }) instanceof LocalTeacherChat);
    assert.ok(createTeacherChat({ enabled: true, consentToSend: true, endpoint: 'http://127.0.0.1:8787' }) instanceof HttpTeacherChat);
  });
});

describe('teacher prompts (built by the helper)', () => {
  it('keeps the safety rules, her books and a clean name in the system prompt', () => {
    const sys = teacherSystemPrompt({ teacherId: 'hoot', childName: 'Izzy<script>', bookTitles: ['Owl at Home'] });
    assert.match(sys, /You are Professor Hoot/);
    assert.match(sys, /talking with Izzyscript/);
    assert.match(sys, /Never ask for or repeat personal details/);
    assert.match(sys, /- Owl at Home/);
  });

  it('builds an alternating conversation that starts with her and forces the reply tool', () => {
    const input = parseTeacherAiInput({
      teacherId: 'digit',
      childName: 'Izzy',
      utterance: 'why is the moon round',
      history: [
        { speaker: 'teacher', text: 'Beep boop! Hello!' },
        { speaker: 'child', text: 'hi' },
        { speaker: 'child', text: 'digit' },
        { speaker: 'teacher', text: 'Yes?' },
      ],
      bookTitles: ['A', 3],
    })!;
    const body = buildTeacherRequest(input, 'test-model') as { messages: { role: string; content: string }[]; tool_choice: unknown; model: string };
    assert.deepEqual(
      body.messages.map((m) => m.role),
      ['user', 'assistant', 'user'],
    );
    assert.equal(body.messages[0]!.content, 'hi\ndigit');
    assert.equal(body.messages[2]!.content, 'why is the moon round');
    assert.deepEqual(body.tool_choice, { type: 'tool', name: 'teacher_reply' });
    assert.equal(body.model, 'test-model');
    assert.deepEqual(input.bookTitles, ['A']);
    assert.equal(parseTeacherAiInput({ teacherId: 'evil', utterance: 'x' }), null);
    assert.equal(parseTeacherAiInput({ teacherId: 'hoot', utterance: '  ' }), null);
  });

  it('reads the tool input from a Messages API response', () => {
    const res = {
      content: [
        { type: 'text', text: 'x' },
        { type: 'tool_use', name: 'teacher_reply', input: { reply: 'Hi!' } },
      ],
    };
    assert.deepEqual(toolInputFrom(res, 'teacher_reply'), { reply: 'Hi!' });
    assert.equal(toolInputFrom({ content: [] }, 'teacher_reply'), null);
  });
});

describe('local AI helper', () => {
  const page = { origin: 'http://127.0.0.1:5173', 'x-izzy-classroom': '1' };
  const teacherBody = JSON.stringify({
    teacherId: 'hoot',
    childName: 'Izzy',
    utterance: 'i read daddy the goodnight leelanau book',
    history: [],
    bookTitles: [],
  });
  const claude = (calls: { url: string; init: RequestInit }[], status = 200) =>
    (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return jsonResponse(
        status === 200 ? { content: [{ type: 'tool_use', name: 'teacher_reply', input: { reply: 'Hoo-hoo!', intent: 'read_to_someone' } }] } : { error: {} },
        status,
      );
    }) as typeof fetch;

  it('answers health checks and CORS preflights only for pages on this computer', async () => {
    const handle = createHelper({ apiKey: 'sk-test' });
    const health = await handle({ method: 'GET', path: '/health', headers: page });
    assert.equal(health.status, 200);
    assert.deepEqual(JSON.parse(health.body as string), {
      ok: true,
      keyConfigured: true,
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      voices: false,
      listening: false,
    });
    assert.equal(health.headers['Access-Control-Allow-Origin'], 'http://127.0.0.1:5173');
    assert.equal((await handle({ method: 'OPTIONS', path: '/v1/teacher', headers: { origin: 'http://localhost:4173' } })).status, 204);
    assert.equal((await handle({ method: 'OPTIONS', path: '/v1/teacher', headers: { origin: 'https://evil.example' } })).status, 403);
    assert.equal((await handle({ method: 'GET', path: '/health', headers: { origin: 'https://evil.example', 'x-izzy-classroom': '1' } })).status, 403);
    assert.equal((await handle({ method: 'GET', path: '/health', headers: { origin: 'http://127.0.0.1:5173' } })).status, 400, 'needs the app header');
  });

  it('calls Claude with the key it keeps, and returns only the tool input', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const handle = createHelper({ apiKey: 'sk-test', fetchImpl: claude(calls) });
    const res = await handle({ method: 'POST', path: '/v1/teacher', headers: page, body: teacherBody });
    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(res.body as string), { reply: 'Hoo-hoo!', intent: 'read_to_someone' });
    assert.equal(calls[0]!.url, 'https://api.anthropic.com/v1/messages');
    const headers = calls[0]!.init.headers as Record<string, string>;
    assert.equal(headers['x-api-key'], 'sk-test');
    const sent = JSON.parse(String(calls[0]!.init.body)) as { system: string; messages: unknown[] };
    assert.match(sent.system, /Safety rules/);
  });

  it('refuses without a key, with bad input, when too large, and past its limits', async () => {
    assert.equal((await createHelper({ apiKey: undefined })({ method: 'POST', path: '/v1/teacher', headers: page, body: teacherBody })).status, 503);
    const calls: { url: string; init: RequestInit }[] = [];
    let t = Date.parse('2026-09-28T12:00:00Z');
    const handle = createHelper({ apiKey: 'k', perMinute: 2, perDay: 3, fetchImpl: claude(calls), now: () => t });
    assert.equal((await handle({ method: 'POST', path: '/v1/teacher', headers: page, body: '{"teacherId":"x"}' })).status, 400);
    assert.equal((await handle({ method: 'POST', path: '/v1/teacher', headers: page, body: 'x'.repeat(40_000) })).status, 413);
    const send = () => handle({ method: 'POST', path: '/v1/teacher', headers: page, body: teacherBody });
    assert.equal((await send()).status, 200);
    assert.equal((await send()).status, 429, 'per-minute limit (the bad request above counted)');
    t += 61_000;
    assert.equal((await send()).status, 200, 'a minute later');
    t += 61_000;
    assert.equal((await send()).status, 429, 'daily limit');
    t += 86_400_000;
    assert.equal((await send()).status, 200, 'a new day');
  });

  it('turns a rejected key into a clear message', async () => {
    const handle = createHelper({ apiKey: 'bad', fetchImpl: claude([], 401) });
    const res = await handle({ method: 'POST', path: '/v1/teacher', headers: page, body: teacherBody });
    assert.equal(res.status, 502);
    assert.match(JSON.parse(res.body as string).error, /key was rejected/);
  });
});

describe('speech-to-text (browser recognizer)', () => {
  class FakeRecognition {
    static answer: 'available' | 'downloadable' | 'unavailable' = 'available';
    static last: FakeRecognition | null = null;
    static script: (r: FakeRecognition) => void = () => undefined;
    static available = async () => FakeRecognition.answer;
    static install = async () => true;
    lang = '';
    interimResults = false;
    continuous = true;
    maxAlternatives = 5;
    processLocally = false;
    phrases: unknown[] = [];
    onresult: ((e: unknown) => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    start() {
      FakeRecognition.last = this;
      queueMicrotask(() => FakeRecognition.script(this));
    }
    stop() {
      this.onend?.();
    }
    abort() {}
  }
  class FakePhrase {
    constructor(
      public phrase: string,
      public boost: number,
    ) {}
  }
  const fakeWindow = { SpeechRecognition: FakeRecognition, SpeechRecognitionPhrase: FakePhrase, setTimeout, clearTimeout } as unknown as Window;
  const result = (text: string, isFinal: boolean) => ({
    resultIndex: 0,
    results: Object.assign([Object.assign([{ transcript: text, confidence: 0.9 }], { isFinal })], {}),
  });

  it('prefers on-device recognition and only uses the browser service when a parent allowed it', async () => {
    const input = new BrowserSpeechInput(fakeWindow);
    assert.ok(input.canProbe);
    FakeRecognition.answer = 'available';
    assert.equal(await input.probe(), 'available');
    assert.deepEqual(input.check('device', 'available'), { state: 'ready', onDevice: true });
    assert.deepEqual(input.check('device', 'downloadable'), { state: 'needs-download', onDevice: true });
    assert.deepEqual(input.check('browser', 'downloadable'), { state: 'ready', onDevice: false });
    assert.deepEqual(input.check('device', 'unknown'), { state: 'needs-check', onDevice: false }, 'nobody asked yet');
    assert.equal(input.check('device', 'unavailable').state, 'unsupported');
    assert.equal(input.check('off', 'available').state, 'off');
    const noStatic = new BrowserSpeechInput({ webkitSpeechRecognition: class {} } as unknown as Window);
    assert.equal(noStatic.canProbe, false);
    assert.equal(noStatic.check('device', 'unknown').state, 'unsupported', 'nothing to ask: no on-device recognizer');
    assert.equal(noStatic.check('browser', 'unknown').state, 'ready');
    assert.equal(new BrowserSpeechInput({} as Window).check('browser', 'unknown').state, 'unsupported');
    const listened = await input.listen('device', 'unavailable');
    assert.equal(listened.error, 'unavailable', 'device-only never falls back to the cloud');
  });

  it('asks the browser only behind a crash marker, and remembers a crash', async () => {
    const { ctx } = makeContext();
    let seenDuringAsk: string | undefined;
    const answer = await runSpeechProbe(ctx, 'Chrome', async () => {
      seenDuringAsk = (await getSpeechProbe(ctx))?.answer;
      return 'downloadable';
    });
    assert.equal(seenDuringAsk, 'pending');
    assert.equal(answer, 'downloadable');
    assert.equal(knownOnDevice(await getSpeechProbe(ctx), 'Chrome'), 'downloadable');
    assert.equal(knownOnDevice(await getSpeechProbe(ctx), 'Safari'), 'unknown', 'another browser asks for itself');
    // The tab died while asking: the marker is still pending next time.
    await ctx.repos.meta.put({ key: 'speechProbe', value: { answer: 'pending', browser: 'Chrome', at: 'x' } });
    assert.equal((await settleInterruptedProbe(ctx))?.answer, 'crashed');
    assert.equal(knownOnDevice(await getSpeechProbe(ctx), 'Chrome'), 'unavailable');
    assert.equal(browserFamily('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/141.0 Safari/537.36'), 'Chrome');
    assert.equal(browserFamily('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/19.0 Safari/605.1.15'), 'Safari');
  });

  it('listens on-device with her book titles, shows live words, and returns the final words', async () => {
    FakeRecognition.answer = 'available';
    FakeRecognition.script = (r) => {
      r.onresult?.(result('i read daddy', false));
      r.onresult?.(result('i read daddy the goodnight leelanau book', true));
      r.onend?.();
    };
    const live: string[] = [];
    const out = await new BrowserSpeechInput(fakeWindow).listen('device', 'available', { phrases: ['Goodnight Leelanau'], onInterim: (t) => live.push(t) });
    assert.equal(out.result?.transcript, 'i read daddy the goodnight leelanau book');
    assert.equal(out.result?.onDevice, true);
    assert.equal(FakeRecognition.last?.processLocally, true);
    assert.equal(FakeRecognition.last?.continuous, false);
    assert.deepEqual((FakeRecognition.last?.phrases[0] as FakePhrase).phrase, 'Goodnight Leelanau');
    assert.equal(live[0], 'i read daddy');
  });

  it('explains problems in a way the UI can use', async () => {
    FakeRecognition.answer = 'available';
    FakeRecognition.script = (r) => r.onerror?.({ error: 'not-allowed' });
    assert.equal((await new BrowserSpeechInput(fakeWindow).listen('device', 'available')).error, 'not-allowed');
    FakeRecognition.script = (r) => r.onend?.();
    assert.equal((await new BrowserSpeechInput(fakeWindow).listen('device', 'available')).error, 'no-speech');
  });
});

describe('settings and records', () => {
  it('upgrades older saved settings', () => {
    const legacy = { ...normalizeSettings({}), talkMode: undefined, teacherAi: undefined } as unknown as Parameters<typeof normalizeSettings>[0];
    assert.equal(normalizeSettings({ ...legacy, speechInput: true }).talkMode, 'browser');
    assert.equal(normalizeSettings({ ...legacy, speechInput: false }).talkMode, 'device');
    const n = normalizeSettings(legacy);
    assert.deepEqual(n.teacherAi, { enabled: false, endpoint: 'http://127.0.0.1:8787', consentToSend: false, naturalVoices: false });
    assert.equal('speechInput' in n, false);
  });

  it('keeps who she read with on the reading log, and notes for parents on the conversation', async () => {
    const { ctx } = makeContext();
    const { children } = await makeFamily(ctx);
    const childId = children[0]!.id;
    await completeBook(ctx, childId, {
      newBook: { title: 'Goodnight Leelanau' },
      answers: [],
      sessionNote: 'Izzy read it aloud to Daddy',
      startedAt: '2026-09-26T15:00:00.000Z',
      transcript: [{ speaker: 'child', text: 'i read daddy the goodnight leelanau book', at: '2026-09-26T15:00:00.000Z', via: 'voice' }],
      source: 'child',
    });
    await recordConversation(
      ctx,
      childId,
      'hoot',
      'talk',
      '2026-09-26T15:10:00.000Z',
      [{ speaker: 'child', text: 'my tummy hurts', at: '2026-09-26T15:10:00.000Z' }],
      'Talked',
      ['Izzy said: “my tummy hurts”'],
    );
    const r = await loadChildRecords(ctx, childId);
    assert.equal(r.books[0]!.status, 'completed');
    assert.match(r.sessions[0]!.notes ?? '', /read it aloud to Daddy/);
    assert.match(r.interactions.find((i) => i.context.flow === 'finish-book')!.outcome, /Daddy/);
    assert.deepEqual(r.interactions.find((i) => i.context.flow === 'talk')!.parentNotes, ['Izzy said: “my tummy hurts”']);
  });
});
