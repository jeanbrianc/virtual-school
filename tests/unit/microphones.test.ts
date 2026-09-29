/**
 * Choosing the microphone: skip a Mac's iPhone (Continuity) microphone, honor a
 * parent's choice, and hand the chosen microphone to the recognizer.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chooseMicrophone, isPhoneMic, microphonesFrom, openMicrophone, resolveMicrophone } from '../../src/voice/microphones';
import { BrowserSpeechInput } from '../../src/voice/SpeechService';

// What Chrome on a Mac lists when the iPhone is the default input.
const macWithIphone = [
  { kind: 'audioinput', deviceId: 'default', label: 'Default - Brian’s iPhone Microphone', groupId: 'g1' },
  { kind: 'audioinput', deviceId: 'iphone', label: 'Brian’s iPhone Microphone', groupId: 'g1' },
  { kind: 'audioinput', deviceId: 'mbp', label: 'MacBook Pro Microphone (Built-in)', groupId: 'g2' },
  { kind: 'audioinput', deviceId: 'usb', label: 'Yeti Stereo Microphone', groupId: 'g3' },
  { kind: 'audiooutput', deviceId: 'spk', label: 'MacBook Pro Speakers', groupId: 'g2' },
  { kind: 'videoinput', deviceId: 'cam', label: 'FaceTime HD Camera', groupId: 'g4' },
];

/** navigator.mediaDevices stand-in that records what was opened. */
function fakeDevices(list: typeof macWithIphone, opts: { failExact?: boolean } = {}) {
  const opened: (MediaTrackConstraints | boolean | undefined)[] = [];
  const stopped: string[] = [];
  return {
    opened,
    stopped,
    enumerateDevices: async () => list as unknown as MediaDeviceInfo[],
    getUserMedia: async (c?: MediaStreamConstraints) => {
      opened.push(c?.audio);
      const wanted = typeof c?.audio === 'object' ? (c.audio.deviceId as { exact?: string } | undefined)?.exact : undefined;
      if (wanted && opts.failExact) throw Object.assign(new Error('gone'), { name: 'OverconstrainedError' });
      const track = { kind: 'audio', id: wanted ?? 'default', stop: () => stopped.push(wanted ?? 'default') };
      return { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    },
  };
}

describe('choosing the microphone', () => {
  it('lists real microphones once, and knows which is the default', () => {
    const list = microphonesFrom(macWithIphone);
    assert.deepEqual(
      list.map((m) => [m.deviceId, m.isDefault]),
      [
        ['iphone', true],
        ['mbp', false],
        ['usb', false],
      ],
    );
    assert.ok(isPhoneMic('Brian’s iPhone Microphone'));
    assert.ok(isPhoneMic("Izzy's iPad Microphone"));
    assert.ok(!isPhoneMic('MacBook Pro Microphone'));
  });

  it('skips an iPhone default for the built-in microphone', () => {
    assert.equal(chooseMicrophone(microphonesFrom(macWithIphone))?.deviceId, 'mbp');
    const noBuiltIn = macWithIphone.filter((d) => d.deviceId !== 'mbp');
    assert.equal(chooseMicrophone(microphonesFrom(noBuiltIn))?.deviceId, 'usb');
    const onlyPhone = macWithIphone.filter((d) => d.deviceId === 'default' || d.deviceId === 'iphone');
    assert.equal(chooseMicrophone(microphonesFrom(onlyPhone)), null, 'nothing better: use the default');
  });

  it('leaves a normal default alone, and honors a parent’s choice', () => {
    const normal = [
      { kind: 'audioinput', deviceId: 'default', label: 'Default - MacBook Pro Microphone (Built-in)', groupId: 'g2' },
      ...macWithIphone.filter((d) => d.deviceId !== 'default'),
    ];
    assert.equal(chooseMicrophone(microphonesFrom(normal)), null);
    assert.equal(chooseMicrophone(microphonesFrom(normal), { deviceId: 'usb', label: 'Yeti Stereo Microphone' })?.deviceId, 'usb');
    assert.equal(chooseMicrophone(microphonesFrom(normal), { deviceId: 'old-id', label: 'Yeti Stereo Microphone' })?.deviceId, 'usb', 'by name');
    assert.equal(chooseMicrophone(microphonesFrom(normal), { deviceId: 'gone', label: 'Unplugged Mic' }), null);
  });

  it('chooses nothing before the site may use the microphone (names are hidden)', async () => {
    const hidden = macWithIphone.map((d) => ({ ...d, label: '' }));
    assert.equal(await resolveMicrophone(null, fakeDevices(hidden)), null);
    assert.equal((await resolveMicrophone(null, fakeDevices(macWithIphone)))?.deviceId, 'mbp');
  });

  it('opens the chosen microphone, or the default if it has gone', async () => {
    const devices = fakeDevices(macWithIphone);
    await openMicrophone('mbp', devices);
    assert.deepEqual((devices.opened[0] as MediaTrackConstraints).deviceId, { exact: 'mbp' });
    assert.equal((devices.opened[0] as MediaTrackConstraints).echoCancellation, true);
    const gone = fakeDevices(macWithIphone, { failExact: true });
    await openMicrophone('mbp', gone);
    assert.equal(gone.opened.length, 2);
    assert.equal((gone.opened[1] as MediaTrackConstraints).deviceId, undefined);
  });
});

describe('the recognizer listens to the chosen microphone', () => {
  class Rec {
    static starts: unknown[] = [];
    static rejectTrack = false;
    lang = '';
    interimResults = false;
    continuous = false;
    maxAlternatives = 1;
    processLocally = false;
    onresult: ((e: unknown) => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    start(track?: { id: string }) {
      Rec.starts.push(track?.id ?? null);
      if (track && Rec.rejectTrack) throw new TypeError('start() takes no track here');
      queueMicrotask(() => {
        this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'i read daddy a book', confidence: 0.9 }], { isFinal: true })] });
        this.onend?.();
      });
    }
    stop() {}
    abort() {}
  }
  const win = (devices: ReturnType<typeof fakeDevices>) =>
    ({ SpeechRecognition: Rec, setTimeout, clearTimeout, navigator: { mediaDevices: devices } }) as unknown as Window;

  it('passes the built-in microphone instead of an iPhone default, then releases it', async () => {
    Rec.starts = [];
    const devices = fakeDevices(macWithIphone);
    const out = await new BrowserSpeechInput(win(devices)).listen('browser', 'unknown');
    assert.equal(out.result?.transcript, 'i read daddy a book');
    assert.deepEqual(Rec.starts, ['mbp']);
    assert.deepEqual(devices.stopped, ['mbp'], 'the microphone is released afterwards');
  });

  it('uses the default microphone when it’s fine, and falls back if a track is refused', async () => {
    Rec.starts = [];
    const normal = [
      { kind: 'audioinput', deviceId: 'default', label: 'Default - MacBook Pro Microphone', groupId: 'g2' },
      { kind: 'audioinput', deviceId: 'mbp', label: 'MacBook Pro Microphone', groupId: 'g2' },
    ];
    const devices = fakeDevices(normal);
    await new BrowserSpeechInput(win(devices)).listen('browser', 'unknown');
    assert.deepEqual(Rec.starts, [null]);
    assert.equal(devices.opened.length, 0, 'nothing extra opened');

    Rec.starts = [];
    Rec.rejectTrack = true;
    const out = await new BrowserSpeechInput(win(fakeDevices(macWithIphone))).listen('browser', 'unknown');
    Rec.rejectTrack = false;
    assert.deepEqual(Rec.starts, ['mbp', null]);
    assert.equal(out.result?.transcript, 'i read daddy a book');
  });

  it('uses the parent’s choice', async () => {
    Rec.starts = [];
    await new BrowserSpeechInput(win(fakeDevices(macWithIphone))).listen('browser', 'unknown', {
      microphone: { deviceId: 'usb', label: 'Yeti Stereo Microphone' },
    });
    assert.deepEqual(Rec.starts, ['usb']);
  });
});
