import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BrowserSpeechInput } from '../../src/voice/SpeechService';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const devicesList = [
  { kind: 'audioinput', deviceId: 'default', label: 'Default - Synthetic iPhone' },
  { kind: 'audioinput', deviceId: 'phone', label: 'Synthetic iPhone' },
  { kind: 'audioinput', deviceId: 'built-in', label: 'Built-in Microphone' },
] as MediaDeviceInfo[];
function fixture(devices?: Partial<MediaDevices>) {
  const created: Rec[] = [];
  const starts: (MediaStreamTrack | undefined)[] = [];
  let onStart: ((rec: Rec) => void) | undefined;
  class Rec {
    static available = async () => 'available';
    lang = '';
    interimResults = false;
    continuous = false;
    maxAlternatives = 1;
    processLocally = false;
    phrases: unknown[] = [];
    onresult: ((event: unknown) => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    constructor() {
      created.push(this);
    }
    start(track?: MediaStreamTrack) {
      starts.push(track);
      onStart?.(this);
    }
    stop() {
      this.onend?.();
    }
    abort() {
      this.onend?.();
    }
    hear(text: string, final = true) {
      this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text, confidence: 0.9 }], { isFinal: final })] });
    }
  }
  const win = {
    SpeechRecognition: Rec,
    SpeechRecognitionPhrase: class {},
    setTimeout,
    clearTimeout,
    navigator: { mediaDevices: devices },
  } as unknown as Window;
  const input = new BrowserSpeechInput(win);
  return {
    input,
    created,
    starts,
    onStart: (callback: (rec: Rec) => void) => {
      onStart = callback;
    },
  };
}
function fakeStream() {
  let stops = 0;
  const track = {
    stop: () => {
      stops++;
    },
  } as MediaStreamTrack;
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  return { stream, stops: () => stops };
}

test('stopping pending enumeration never constructs recognition or opens a microphone', async () => {
  const enumeration = deferred<MediaDeviceInfo[]>();
  let opens = 0;
  const f = fixture({
    enumerateDevices: () => enumeration.promise,
    getUserMedia: async () => {
      opens++;
      return fakeStream().stream;
    },
  });
  const pending = f.input.listen('device', 'available');
  f.input.stop();
  enumeration.resolve(devicesList);
  assert.deepEqual(await pending, { result: null, error: 'aborted' });
  assert.equal(f.created.length, 0);
  assert.equal(f.starts.length, 0);
  assert.equal(opens, 0);
});

test('a stream acquired after cancellation is closed without starting recognition', async () => {
  const acquisition = deferred<MediaStream>();
  const opened = deferred<void>();
  const late = fakeStream();
  const f = fixture({
    enumerateDevices: async () => devicesList,
    getUserMedia: () => {
      opened.resolve();
      return acquisition.promise;
    },
  });
  const pending = f.input.listen('device', 'available');
  await opened.promise;
  f.input.stop();
  acquisition.resolve(late.stream);
  assert.deepEqual(await pending, { result: null, error: 'aborted' });
  assert.equal(late.stops(), 1);
  assert.equal(f.created.length, 0);
});

test('a replacement listen owns its sentence even if old enumeration finishes last', async () => {
  const old = deferred<MediaDeviceInfo[]>();
  const current = deferred<MediaDeviceInfo[]>();
  let enumerations = 0;
  const queue = ['Synthetic current sentence'];
  const f = fixture({ enumerateDevices: () => (++enumerations === 1 ? old.promise : current.promise) });
  f.onStart((rec) => {
    rec.hear(queue.shift()!);
    rec.onend?.();
  });
  const first = f.input.listen('device', 'available');
  const second = f.input.listen('device', 'available');
  current.resolve([]);
  assert.equal((await second).result?.transcript, 'Synthetic current sentence');
  old.resolve([]);
  assert.deepEqual(await first, { result: null, error: 'aborted' });
  assert.equal(f.starts.length, 1);
  assert.deepEqual(queue, []);
});

test('canceled acquisition never opens the default-device fallback', async () => {
  const acquisition = deferred<MediaStream>();
  const opened = deferred<void>();
  let opens = 0;
  const f = fixture({
    enumerateDevices: async () => devicesList,
    getUserMedia: () => {
      opens++;
      opened.resolve();
      return acquisition.promise;
    },
  });
  const pending = f.input.listen('device', 'available');
  await opened.promise;
  f.input.stop();
  acquisition.reject(Object.assign(new Error('Synthetic missing microphone'), { name: 'NotFoundError' }));
  assert.deepEqual(await pending, { result: null, error: 'aborted' });
  assert.equal(opens, 1);
  assert.equal(f.starts.length, 0);
});

test('stop prevents phrase and track rejection from starting fallback recognition', async () => {
  for (const kind of ['phrase', 'track'] as const) {
    const stream = fakeStream();
    const f = fixture(kind === 'track' ? { enumerateDevices: async () => devicesList, getUserMedia: async () => stream.stream } : undefined);
    f.onStart((rec) => {
      rec.onerror?.({ error: kind === 'phrase' ? 'phrases-not-supported' : 'audio-capture' });
      f.input.stop();
    });
    assert.deepEqual(await f.input.listen('device', 'available', { phrases: ['Synthetic sentence'] }), { result: null, error: 'aborted' });
    assert.equal(f.starts.length, 1, kind);
    assert.equal(stream.stops(), kind === 'track' ? 1 : 0);
  }
});

test('normal stop of active recognition still returns the heard transcript', async () => {
  const f = fixture();
  const pending = f.input.listen('device', 'available');
  assert.equal(f.starts.length, 1);
  f.created[0]!.hear('Synthetic final words');
  f.input.stop();
  assert.equal((await pending).result?.transcript, 'Synthetic final words');
});
