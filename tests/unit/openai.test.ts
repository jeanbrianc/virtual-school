/**
 * OpenAI through the family's AI helper: teacher replies (Responses API),
 * natural teacher voices, listening, the OpenAI key read from AWS Secrets
 * Manager, and the browser side (natural voices with fallback, helper check).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { apiKeyFromSecretString, regionOfSecretArn, secretKeyReader, signV4 } from '../../scripts/ai-helper/awsSecret';
import { createHelper, type HelperResponse } from '../../scripts/ai-helper/handler';
import {
  buildOpenAiTeacherRequest,
  buildSpeechRequest,
  buildTranscriptionForm,
  cleanKeyword,
  functionArgsFrom,
  parseListenInput,
  parseSpeakInput,
} from '../../scripts/ai-helper/openai';
import { parseTeacherAiInput } from '../../src/domain/teachers/aiPrompt';
import { checkHelper, naturalVoicesOn } from '../../src/domain/teachers/chatRemote';
import { HelperSpeechOutput, RoutingSpeechInput, type HelperListener } from '../../src/voice/helperVoice';
import { silentOutput, talkAvailability, type SpeakOptions, type SpeechInput, type SpeechOutput } from '../../src/voice/SpeechService';

const page = { origin: 'http://127.0.0.1:5173', 'x-izzy-classroom': '1' };
const teacherBody = JSON.stringify({
  teacherId: 'hoot',
  childName: 'Izzy',
  utterance: 'i read daddy the goodnight leelanau book',
  history: [
    { speaker: 'teacher', text: 'Hoo-hoo! Hello, Izzy!' },
    { speaker: 'child', text: 'hi' },
  ],
  bookTitles: ['Goodnight Leelanau'],
});
const text = (r: HelperResponse) => r.body as string;

type Call = { url: string; init: RequestInit };
/** A stand-in for api.openai.com. */
function openai(calls: Call[], status = 200): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    if (status !== 200) return new Response('{"error":{}}', { status });
    if (String(url).endsWith('/responses')) {
      return Response.json({
        output: [
          { type: 'reasoning', summary: [] },
          {
            type: 'function_call',
            name: 'teacher_reply',
            call_id: 'c1',
            arguments: '{"reply":"You read Goodnight Leelanau to Daddy?","intent":"read_to_someone"}',
          },
        ],
      });
    }
    if (String(url).endsWith('/audio/speech')) return new Response(new Uint8Array(2048).fill(7), { headers: { 'content-type': 'audio/mpeg' } });
    if (String(url).endsWith('/audio/transcriptions')) return Response.json({ text: ' I read Daddy the Goodnight Leelanau book. ' });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

describe('OpenAI request bodies', () => {
  it('asks the Responses API for one structured teacher reply, fast and not stored', () => {
    const body = buildOpenAiTeacherRequest(parseTeacherAiInput(JSON.parse(teacherBody))!) as Record<string, unknown> & {
      input: { role: string; content: string }[];
      tools: { type: string; name: string; strict: boolean }[];
    };
    assert.equal(body.model, 'gpt-6-luna');
    assert.equal(body.store, false);
    assert.deepEqual(body.reasoning, { effort: 'none' });
    assert.deepEqual(body.tool_choice, { type: 'function', name: 'teacher_reply' });
    assert.equal(body.tools[0]!.type, 'function');
    assert.equal(body.tools[0]!.strict, false);
    assert.match(String(body.instructions), /Safety rules/);
    assert.match(String(body.instructions), /Goodnight Leelanau/);
    assert.deepEqual(
      body.input.map((m) => m.role),
      ['assistant', 'user', 'user'],
    );
    assert.equal(body.input.at(-1)!.content, 'i read daddy the goodnight leelanau book');
  });

  it('reads the function call out of a Responses result', () => {
    assert.deepEqual(functionArgsFrom({ output: [{ type: 'function_call', name: 'x', arguments: '{"a":1}' }] }, 'x'), { a: 1 });
    assert.equal(functionArgsFrom({ output: [{ type: 'function_call', name: 'y', arguments: '{"a":1}' }] }, 'x'), null);
    assert.equal(functionArgsFrom({ output: [{ type: 'function_call', name: 'x', arguments: 'not json' }] }, 'x'), null);
    assert.equal(functionArgsFrom({ output: [{ type: 'message', content: [] }] }, 'x'), null);
    assert.equal(functionArgsFrom(null, 'x'), null);
  });

  it('gives each teacher their own natural voice and way of speaking', () => {
    const hoot = buildSpeechRequest({ teacherId: 'hoot', text: 'Hoo-hoo! Hello, Izzee!' });
    const digit = buildSpeechRequest({ teacherId: 'digit', text: 'Beep boop!' });
    assert.equal(hoot.model, 'gpt-4o-mini-tts');
    assert.equal(hoot.input, 'Hoo-hoo! Hello, Izzee!');
    assert.equal(hoot.response_format, 'mp3');
    assert.notEqual(hoot.voice, digit.voice);
    assert.match(String(hoot.instructions), /owl/);
    assert.match(String(digit.instructions), /robot/);
    assert.equal(parseSpeakInput({ teacherId: 'nobody', text: 'hi' }), null);
    assert.equal(parseSpeakInput({ teacherId: 'nova', text: '   ' }), null);
    assert.equal(parseSpeakInput({ teacherId: 'nova', text: 'x'.repeat(5000) })!.text.length, 1200);
  });

  it('checks recordings and sends her book titles as listening hints', async () => {
    const audio = Buffer.alloc(4000, 1).toString('base64');
    assert.deepEqual(parseListenInput({ audio, mime: 'video/x-flv' }), { error: 'Unsupported audio type.' });
    assert.deepEqual(parseListenInput({ audio: Buffer.alloc(10).toString('base64'), mime: 'audio/webm' }), { error: 'Recording too short.' });
    assert.deepEqual(parseListenInput({ audio: Buffer.alloc(1_600_000).toString('base64'), mime: 'audio/webm' }), { error: 'Recording too long.' });
    const input = parseListenInput({ audio, mime: 'audio/webm;codecs=opus', keywords: ['Goodnight Leelanau', 'Bad <tag>\nbook'], childName: 'Izzy' });
    assert.ok(!('error' in input));
    const form = buildTranscriptionForm(input);
    assert.equal(form.get('model'), 'gpt-transcribe');
    assert.deepEqual(form.getAll('languages[]'), ['en']);
    const keywords = form.getAll('keywords[]');
    assert.ok(keywords.includes('Izzy') && keywords.includes('Goodnight Leelanau') && keywords.includes('Professor Hoot'));
    assert.ok(keywords.every((k) => !/[<>\n]/.test(String(k))));
    assert.equal(cleanKeyword('A <b>\r\nbook'), 'A b book');
    const file = form.get('file') as File;
    assert.equal(file.type, 'audio/webm');
    assert.equal(file.name, 'speech.webm');
    assert.equal((await file.arrayBuffer()).byteLength, 4000);
    // Older transcription models take a single language instead.
    const legacy = buildTranscriptionForm(input, 'gpt-4o-mini-transcribe');
    assert.equal(legacy.get('language'), 'en');
    assert.equal(legacy.getAll('keywords[]').length, 0);
  });
});

describe('the helper with an OpenAI key', () => {
  it('reports OpenAI with natural voices and listening', async () => {
    const handle = createHelper({ openaiKey: 'sk-openai', apiKey: 'sk-ant' });
    const health = JSON.parse(text(await handle({ method: 'GET', path: '/health', headers: page })));
    assert.deepEqual(health, {
      ok: true,
      keyConfigured: true,
      provider: 'openai',
      model: 'gpt-6-luna',
      voices: true,
      listening: true,
      sync: false,
      voiceModel: 'gpt-4o-mini-tts',
      listenModel: 'gpt-transcribe',
    });
  });

  it('writes teacher replies with OpenAI (bearer key, Responses API)', async () => {
    const calls: Call[] = [];
    const handle = createHelper({ openaiKey: 'sk-openai', apiKey: 'sk-ant', fetchImpl: openai(calls) });
    const res = await handle({ method: 'POST', path: '/v1/teacher', headers: page, body: teacherBody });
    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(text(res)), { reply: 'You read Goodnight Leelanau to Daddy?', intent: 'read_to_someone' });
    assert.equal(calls[0]!.url, 'https://api.openai.com/v1/responses');
    assert.equal((calls[0]!.init.headers as Record<string, string>).authorization, 'Bearer sk-openai');
  });

  it('speaks a teacher line and returns audio', async () => {
    const calls: Call[] = [];
    const handle = createHelper({ openaiKey: 'sk-openai', fetchImpl: openai(calls) });
    const res = await handle({
      method: 'POST',
      path: '/v1/speak',
      headers: page,
      body: JSON.stringify({ teacherId: 'digit', text: 'Beep boop! Hello, Izzee!' }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers['Content-Type'], 'audio/mpeg');
    assert.ok(res.body instanceof Uint8Array && res.body.length === 2048);
    assert.equal(calls[0]!.url, 'https://api.openai.com/v1/audio/speech');
    const sent = JSON.parse(String(calls[0]!.init.body)) as { voice: string; input: string };
    assert.equal(sent.input, 'Beep boop! Hello, Izzee!');
    assert.equal(sent.voice, 'verse');
    assert.equal((await handle({ method: 'POST', path: '/v1/speak', headers: page, body: '{"teacherId":"x","text":"hi"}' })).status, 400);
  });

  it('turns her recording into words', async () => {
    const calls: Call[] = [];
    const handle = createHelper({ openaiKey: 'sk-openai', fetchImpl: openai(calls) });
    const body = JSON.stringify({ audio: Buffer.alloc(5000, 3).toString('base64'), mime: 'audio/webm', keywords: ['Goodnight Leelanau'], childName: 'Izzy' });
    const res = await handle({ method: 'POST', path: '/v1/listen', headers: page, body });
    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(text(res)), { text: 'I read Daddy the Goodnight Leelanau book.' });
    assert.equal(calls[0]!.url, 'https://api.openai.com/v1/audio/transcriptions');
    assert.ok(calls[0]!.init.body instanceof FormData);
    assert.equal((await handle({ method: 'POST', path: '/v1/listen', headers: page, body: 'x'.repeat(2_200_000) })).status, 413);
  });

  it('keeps voices and listening to OpenAI, and limits them separately', async () => {
    const claudeOnly = createHelper({ apiKey: 'sk-ant', fetchImpl: openai([]) });
    assert.equal((await claudeOnly({ method: 'POST', path: '/v1/speak', headers: page, body: '{"teacherId":"hoot","text":"hi"}' })).status, 501);
    const calls: Call[] = [];
    const handle = createHelper({ openaiKey: 'sk-openai', speakPerDay: 2, perDay: 1, fetchImpl: openai(calls) });
    const speak = () => handle({ method: 'POST', path: '/v1/speak', headers: page, body: '{"teacherId":"hoot","text":"hi"}' });
    assert.equal((await speak()).status, 200);
    assert.equal((await speak()).status, 200);
    assert.equal((await speak()).status, 429);
    assert.equal((await handle({ method: 'POST', path: '/v1/teacher', headers: page, body: teacherBody })).status, 200, 'replies have their own limit');
  });

  it('fetches the key only when needed, and copes when it can’t', async () => {
    let asked = 0;
    const handle = createHelper({
      openaiKey: async () => {
        asked += 1;
        throw new Error('AccessDeniedException');
      },
      log: () => undefined,
    });
    assert.equal(asked, 0);
    const health = JSON.parse(text(await handle({ method: 'GET', path: '/health', headers: page })));
    assert.equal(health.keyConfigured, false);
    assert.equal((await handle({ method: 'POST', path: '/v1/teacher', headers: page, body: teacherBody })).status, 503);
    assert.ok(asked >= 1);
  });

  it('turns a rejected OpenAI key into a clear message', async () => {
    const handle = createHelper({ openaiKey: 'bad', fetchImpl: openai([], 401) });
    const res = await handle({ method: 'POST', path: '/v1/teacher', headers: page, body: teacherBody });
    assert.equal(res.status, 502);
    assert.match(JSON.parse(text(res)).error, /key was rejected/);
  });
});

describe('the OpenAI key in AWS Secrets Manager', () => {
  const creds = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' };
  it('signs requests exactly like AWS Signature Version 4 (AWS test suite vectors)', () => {
    const sign = (method: string) =>
      signV4({
        method,
        host: 'example.amazonaws.com',
        path: '/',
        headers: {},
        body: '',
        region: 'us-east-1',
        service: 'service',
        credentials: creds,
        amzDate: '20150830T123600Z',
      }).Authorization;
    assert.equal(
      sign('GET'),
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
    assert.equal(
      sign('POST'),
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5da7c1a2acd57cee7505fc6676e4e544621c30862966e37dddb68e92efbe5d6b',
    );
  });

  it('finds the key in a plain or JSON secret', () => {
    assert.equal(apiKeyFromSecretString(' sk-proj-abc \n'), 'sk-proj-abc');
    assert.equal(apiKeyFromSecretString('{"OPENAI_API_KEY":"sk-1"}'), 'sk-1');
    assert.equal(apiKeyFromSecretString('{"api_key":"sk-2","org":"org-x"}'), 'sk-2');
    assert.equal(apiKeyFromSecretString('{"whatever":"sk-3","note":"hello"}'), 'sk-3');
    assert.equal(apiKeyFromSecretString('{"only":"k-4"}'), 'k-4');
    assert.equal(apiKeyFromSecretString('{"a":"x","b":"y"}'), null);
    assert.equal(apiKeyFromSecretString('{broken'), null);
    assert.equal(apiKeyFromSecretString(''), null);
    assert.equal(regionOfSecretArn('arn:aws:secretsmanager:us-east-2:111122223333:secret:openai/api-key-AbC123'), 'us-east-2');
    assert.equal(regionOfSecretArn('openai/api-key'), null);
  });

  it('reads the secret from its own region with the Lambda role, once an hour', async () => {
    const calls: Call[] = [];
    let t = Date.parse('2026-09-29T12:00:00Z');
    const read = secretKeyReader({
      arn: 'arn:aws:secretsmanager:us-east-2:111122223333:secret:openai/api-key-AbC123',
      credentials: () => ({ ...creds, sessionToken: 'session-token' }),
      now: () => t,
      fetchImpl: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return Response.json({ SecretString: '{"OPENAI_API_KEY":"sk-from-secrets"}' });
      }) as unknown as typeof fetch,
    });
    assert.equal(await read(), 'sk-from-secrets');
    assert.equal(await read(), 'sk-from-secrets');
    assert.equal(calls.length, 1, 'cached');
    assert.equal(calls[0]!.url, 'https://secretsmanager.us-east-2.amazonaws.com/');
    const headers = calls[0]!.init.headers as Record<string, string>;
    assert.equal(headers['x-amz-target'], 'secretsmanager.GetSecretValue');
    assert.equal(headers['x-amz-security-token'], 'session-token');
    assert.match(headers.Authorization!, /Credential=AKIDEXAMPLE\/20260929\/us-east-2\/secretsmanager\/aws4_request/);
    assert.equal(JSON.parse(String(calls[0]!.init.body)).SecretId, 'arn:aws:secretsmanager:us-east-2:111122223333:secret:openai/api-key-AbC123');
    t += 61 * 60 * 1000;
    await read();
    assert.equal(calls.length, 2, 'refreshed after an hour');
  });

  it('says why it failed without echoing the secret or the response', async () => {
    const read = secretKeyReader({
      arn: 'arn:aws:secretsmanager:us-east-2:111122223333:secret:openai/api-key-AbC123',
      credentials: () => creds,
      fetchImpl: (async () =>
        new Response('{"Message":"User arn:aws:sts::111122223333:assumed-role/x is not authorized"}', {
          status: 400,
          headers: { 'x-amzn-errortype': 'AccessDeniedException:http://internal' },
        })) as unknown as typeof fetch,
    });
    await assert.rejects(read(), (err: Error) => err.message === 'Secrets Manager refused (AccessDeniedException)');
    const noCreds = secretKeyReader({ arn: 'arn:aws:secretsmanager:us-east-2:111122223333:secret:x', credentials: () => null });
    await assert.rejects(noCreds(), /no AWS credentials/);
  });
});

describe('natural voices and listening in the browser', () => {
  class FakeDevice implements SpeechOutput {
    spoken: { text: string; opts?: SpeakOptions }[] = [];
    cancels = 0;
    available = true;
    speak = async (text: string, opts?: SpeakOptions) => {
      this.spoken.push({ text, ...(opts ? { opts } : {}) });
    };
    cancel = () => {
      this.cancels += 1;
    };
    voices = () => [];
    voiceFor = () => undefined;
    onVoicesChanged = () => () => undefined;
  }
  class FakeAudio {
    static played: { src: string; volume: number }[] = [];
    static fail = false;
    volume = 1;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public src: string) {}
    play() {
      if (FakeAudio.fail) return Promise.reject(new Error('NotAllowedError'));
      FakeAudio.played.push({ src: this.src, volume: this.volume });
      setTimeout(() => this.onended?.(), 5);
      return Promise.resolve();
    }
    pause() {}
  }
  const g = globalThis as unknown as Record<string, unknown>;

  it('plays the helper’s voice, remembers repeated lines, and falls back to the computer’s voice', async () => {
    g.Audio = FakeAudio;
    g.location = { origin: 'http://127.0.0.1:5173' };
    try {
      const calls: Call[] = [];
      let fail = false;
      const fetchImpl = (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return fail ? new Response('{}', { status: 429 }) : new Response(new Uint8Array(4096).fill(1), { headers: { 'content-type': 'audio/mpeg' } });
      }) as unknown as typeof fetch;
      const device = new FakeDevice();
      const out = new HelperSpeechOutput(device, fetchImpl);
      const natural = { endpoint: '/api/', teacher: 'nova' as const };
      await out.speak('Hi hi! Want to discover something amazing?', { volume: 0.5, natural });
      assert.equal(calls.length, 1);
      assert.equal(calls[0]!.url, '/api/v1/speak');
      assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), { teacherId: 'nova', text: 'Hi hi! Want to discover something amazing?' });
      assert.equal(FakeAudio.played.length, 1);
      assert.equal(FakeAudio.played[0]!.volume, 0.5);
      assert.equal(device.spoken.length, 0);
      await out.speak('Hi hi! Want to discover something amazing?', { natural });
      assert.equal(calls.length, 1, 'a repeated line comes from memory');
      assert.equal(FakeAudio.played.length, 2);

      fail = true;
      await out.speak('A new line', { pitch: 1.2, natural });
      assert.deepEqual(
        device.spoken.map((s) => s.text),
        ['A new line'],
      );
      assert.equal(device.spoken[0]!.opts?.natural, undefined, 'the computer’s voice gets no helper settings');
      fail = false;
      FakeAudio.fail = true;
      await out.speak('Autoplay blocked', { natural });
      assert.equal(device.spoken.at(-1)!.text, 'Autoplay blocked');

      // Without natural voices, nothing goes to the helper.
      const before = calls.length;
      await out.speak('Just the computer', {});
      assert.equal(calls.length, before);
      assert.equal(device.spoken.at(-1)!.text, 'Just the computer');
    } finally {
      delete g.Audio;
      delete g.location;
      FakeAudio.fail = false;
    }
  });

  it('uses the helper for listening only in helper mode', async () => {
    const browserCalls: string[] = [];
    const browser: SpeechInput = {
      available: true,
      canProbe: true,
      probe: async () => 'available',
      check: (mode, known) => talkAvailability(mode, true, known),
      install: async () => true,
      listen: async (mode) => {
        browserCalls.push(mode);
        return { result: { transcript: 'browser', confidence: 1, onDevice: true } };
      },
      stop: () => undefined,
    };
    let helperOpts: unknown = null;
    const helper = {
      available: true,
      listen: async (h: unknown) => {
        helperOpts = h;
        return { result: { transcript: 'helper words', confidence: 0.9, onDevice: false } };
      },
      stop: () => undefined,
    } as unknown as HelperListener;
    const input = new RoutingSpeechInput(browser, helper);
    assert.deepEqual(input.check('helper', 'unknown'), { state: 'ready', onDevice: false });
    assert.equal((await input.listen('device', 'available')).result?.transcript, 'browser');
    assert.equal((await input.listen('helper', 'unknown')).error, 'unavailable', 'needs a helper address');
    const out = await input.listen('helper', 'unknown', { helper: { endpoint: '/api', childName: 'Izzy' } });
    assert.equal(out.result?.transcript, 'helper words');
    assert.deepEqual(helperOpts, { endpoint: '/api', childName: 'Izzy' });
    assert.deepEqual(browserCalls, ['device']);
    const noMic = new RoutingSpeechInput(browser, { available: false } as unknown as HelperListener);
    assert.equal(noMic.check('helper', 'unknown').state, 'unsupported');
  });

  it('knows what the helper can do', async () => {
    const health = (body: unknown) => (async () => Response.json(body)) as unknown as typeof fetch;
    const openaiStatus = await checkHelper(
      '/api',
      health({ ok: true, keyConfigured: true, provider: 'openai', model: 'gpt-6-luna', voices: true, listening: true }),
    );
    assert.equal(openaiStatus.ok, true);
    assert.equal(openaiStatus.provider, 'openai');
    assert.equal(openaiStatus.voices, true);
    assert.match(openaiStatus.message, /OpenAI \(gpt-6-luna\).*Natural voices and listening/);
    const claude = await checkHelper('/api', health({ ok: true, keyConfigured: true, model: 'claude-haiku-4-5-20251001' }));
    assert.equal(claude.voices, false);
    const none = await checkHelper('/api', health({ ok: true, keyConfigured: false }));
    assert.match(none.message, /--openai-secret/);
    assert.equal(naturalVoicesOn({ enabled: false, consentToSend: false, endpoint: '/api', naturalVoices: true }), true);
    assert.equal(naturalVoicesOn({ enabled: false, consentToSend: false, endpoint: 'http://evil.example', naturalVoices: true }), false);
    assert.equal(naturalVoicesOn(undefined), false);
    assert.equal(silentOutput.voices().length, 0);
  });
});
