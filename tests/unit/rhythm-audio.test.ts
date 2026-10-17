import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RhythmPlayer } from '../../src/audio/RhythmPlayer';

test('visual-only playback creates no audio and uses numbered nonmoving pulses', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const player = new RhythmPlayer(),
    pulses: number[] = [];
  const result = player.play(2, 'a', 800, false, 0, (i) => pulses.push(i));
  for (let i = 0; i < 28; i++) {
    now += 50;
    t.mock.timers.tick(50);
  }
  assert.deepEqual(await result, { reliable: true, presentation: 'visual-only' });
  assert.deepEqual(pulses, [0, -1, 1, -1]);
  player.dispose();
});
test('blocked output falls back visually, while stalled callbacks are unreliable', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const player = new RhythmPlayer();
  const result = player.play(2, 'a', 800, true, 0.5, () => {});
  now = 5000;
  t.mock.timers.tick(5000);
  assert.deepEqual(await result, { reliable: false, presentation: 'visual-only' });
  player.dispose();
});
test('stop cancels every pending pulse and cannot later complete reliable playback', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const pulses: number[] = [],
    player = new RhythmPlayer();
  const pending = player.play(4, 'b', 800, false, 0, (i) => pulses.push(i));
  player.stop();
  now = 10000;
  t.mock.timers.tick(10000);
  assert.deepEqual(await pending, { reliable: false, presentation: 'visual-only' });
  assert.deepEqual(pulses, []);
});
test('synthesis uses original oscillators, applies output-latency estimate, and disposes nodes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const starts: number[] = [];
  let stops = 0,
    closes = 0;
  class FakeAudio {
    state = 'running';
    currentTime = 0;
    outputLatency = 0.02;
    baseLatency = 0.01;
    destination = {};
    async resume() {}
    async close() {
      closes++;
    }
    createOscillator() {
      return {
        type: '',
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        disconnect() {},
        start(t: number) {
          starts.push(t);
        },
        stop() {
          stops++;
        },
        onended: null,
      };
    }
    createGain() {
      return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} };
    }
  }
  const old = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: FakeAudio });
  t.after(() => {
    if (old) Object.defineProperty(globalThis, 'AudioContext', old);
    else Reflect.deleteProperty(globalThis, 'AudioContext');
  });
  const pulses: number[] = [],
    player = new RhythmPlayer();
  const pending = player.play(2, 'a', 800, true, 0.5, (i) => pulses.push(i));
  await Promise.resolve();
  now = 119;
  t.mock.timers.tick(119);
  assert.deepEqual(pulses, []);
  now = 120;
  t.mock.timers.tick(1);
  assert.deepEqual(pulses, [0]);
  assert.deepEqual(starts, [0.1, 0.9]);
  player.dispose();
  assert.equal((await pending).reliable, false);
  assert.equal(closes, 1);
  assert.ok(stops >= 2);
});
