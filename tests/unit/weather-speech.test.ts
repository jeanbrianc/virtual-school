import assert from 'node:assert/strict';
import { it } from 'node:test';
import { HelperSpeechOutput } from '../../src/voice/helperVoice';
import { weatherSpeech } from '../../src/voice/weatherSpeech';
import { BrowserSpeechOutput, silentOutput, type SpeakOptions } from '../../src/voice/SpeechService';
it('weather read-aloud requires a confirmed local voice, rechecks it and never requests helper speech', () => {
  let available = false;
  const calls: SpeakOptions[] = [];
  const output = {
    ...silentOutput,
    available: true,
    voiceFor: () => (available ? { name: 'Sample local voice', lang: 'en-US', isDefault: false } : undefined),
    speak: async (_text: string, options: SpeakOptions = {}) => {
      calls.push(options);
    },
  };
  const settings = { auto: true, muted: false, volume: 0.7 };
  const none = weatherSpeech(output, settings.auto, settings.muted, settings.volume);
  assert.equal(none.canSpeak, false);
  assert.equal(none.auto, false);
  none.speak('Sample picture');
  assert.equal(calls.length, 0);
  available = true;
  const speech = weatherSpeech(output, settings.auto, settings.muted, settings.volume);
  speech.speak('Sample picture');
  assert.equal(calls[0]!.voiceName, 'Sample local voice');
  assert.equal(calls[0]!.natural, undefined);
  assert.equal(calls[0]!.localOnly, true);
  available = false;
  speech.speak('Sample picture');
  assert.equal(calls.length, 1);
  available = true;
  weatherSpeech(output, settings.auto, true, settings.volume).speak('Sample picture');
  assert.equal(calls.length, 1);
});

// Canonical localOnly browser contract from safety containment 0d72b0c.
it('contained browser speech uses a verified local voice or remains text-only', async (t) => {
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

it('explicitly local helper output bypasses hashing, cache and network before playback', async (t) => {
  t.mock.method(globalThis.crypto.subtle, 'digest', async () => {
    assert.fail('local-only text must not enter cache keys');
  });
  const calls: { text: string; opts?: SpeakOptions }[] = [];
  const output = new HelperSpeechOutput(
    {
      ...silentOutput,
      speak: async (text, opts) => {
        calls.push({ text, opts });
      },
    },
    async () => {
      assert.fail('must not dispatch helper speech');
    },
  );
  await output.speak('Sample picture', { natural: { endpoint: '/api', teacher: 'nova' }, localOnly: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.opts?.localOnly, true);
  assert.equal(calls[0]!.opts?.natural, undefined);
});
