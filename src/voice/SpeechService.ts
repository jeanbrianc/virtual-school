/**
 * Voice-ready boundary.
 *
 * Teachers speak through `SpeechOutput` and (optionally) listen through
 * `SpeechInput`. Today these wrap the browser's built-in Web Speech APIs when
 * a parent enables them; every interaction always has a tap/click fallback.
 * Future providers (cloud TTS voices, pronunciation analysis, narration
 * scoring) implement the same interfaces — see docs/ARCHITECTURE.md.
 */
import type { OnDeviceAnswer } from '../domain/talk';
import type { TeacherId } from '../domain/teachers/teachers';
import { openMicrophone, resolveMicrophone, type MicChoice } from './microphones';

/** A natural AI voice from the family's helper (see voice/helperVoice.ts). */
export interface NaturalVoice {
  endpoint: string;
  teacher: TeacherId;
}

export interface SpeakOptions {
  pitch?: number;
  rate?: number;
  volume?: number;
  /** A built-in voice chosen by a parent (by name); ignored when this device doesn't have it. */
  voiceName?: string;
  /** Speak with this teacher's natural voice from the helper (falls back to the built-in voice). */
  natural?: NaturalVoice;
}

/** A voice built into this device. */
export interface VoiceInfo {
  name: string;
  lang: string;
  isDefault: boolean;
}

export interface SpeechOutput {
  readonly available: boolean;
  speak(text: string, opts?: SpeakOptions): Promise<void>;
  cancel(): void;
  /** English voices built into this device, best first (network voices are never used). */
  voices(): VoiceInfo[];
  /** The voice `speak` will use for this choice (undefined: the browser's default). */
  voiceFor(voiceName?: string): VoiceInfo | undefined;
  /** Calls back when the browser finishes loading its voices (Chrome loads them late). */
  onVoicesChanged(cb: () => void): () => void;
}

// Joke and robot voices (macOS) plus the older low-fidelity ones, which misread
// names the most. A parent can still choose one; they are never picked automatically.
const NOVELTY_VOICE =
  /^(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i;
// Clear, natural voices on Apple, Windows and ChromeOS/Android devices, best first.
const PREFERRED_VOICES = [
  'samantha',
  'ava',
  'allison',
  'susan',
  'zoe',
  'nicky',
  'evan',
  'nathan',
  'tom',
  'aria',
  'jenny',
  'zira',
  'victoria',
  'karen',
  'moira',
  'serena',
  'tessa',
];

/** Higher is better; novelty voices score below every ordinary voice. */
export function rankVoice(v: VoiceInfo): number {
  if (NOVELTY_VOICE.test(v.name)) return -100;
  const name = v.name.toLowerCase();
  let score = /^en[-_]us$/i.test(v.lang) ? 20 : /^en[-_](gb|au|ie|ca|nz)$/i.test(v.lang) ? 12 : 8;
  if (/premium|enhanced|natural|neural/.test(name)) score += 10;
  const i = PREFERRED_VOICES.findIndex((p) => new RegExp(`\\b${p}\\b`).test(name));
  if (i >= 0) score += 8 - i * 0.25;
  if (v.isDefault) score += 3;
  return score;
}

/** Sorts voices best first (stable for equal scores). */
export function rankVoices(list: VoiceInfo[]): VoiceInfo[] {
  return list
    .map((v, i) => ({ v, i, s: rankVoice(v) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.v);
}

/** The parent's chosen voice when this device has it, otherwise the best one. */
export function pickVoice(list: VoiceInfo[], chosen?: string): VoiceInfo | undefined {
  return (chosen ? list.find((v) => v.name === chosen) : undefined) ?? rankVoices(list)[0];
}

export interface SpeechInputResult {
  transcript: string;
  confidence: number;
  /** True when the words were recognized on this computer (audio never left it). */
  onDevice: boolean;
}

/**
 * Who may turn her voice into words.
 *  • off     — no microphone anywhere in child mode.
 *  • device  — only the browser's ON-DEVICE recognizer (audio never leaves the computer).
 *  • browser — on-device when possible, otherwise the browser's own speech
 *              service (Chrome: Google; Safari: Apple), which receives the audio.
 *  • helper  — the family's AI helper (OpenAI): her recording goes to the helper
 *              and on to OpenAI to be turned into words (see voice/helperVoice.ts).
 */
export type TalkMode = 'off' | 'device' | 'browser' | 'helper';

/** What this browser said about on-device recognition (asked only from the Parent Studio — see domain/talk.ts). */
export type { OnDeviceAnswer };

export interface TalkAvailability {
  state: 'ready' | 'needs-check' | 'needs-download' | 'downloading' | 'unsupported' | 'off';
  /** Whether listening will happen on this computer. */
  onDevice: boolean;
}

export type ListenError = 'no-speech' | 'not-allowed' | 'no-microphone' | 'network' | 'unavailable' | 'aborted';

export interface ListenOptions {
  lang?: string;
  /** Longest she can talk before we stop and use what we heard. */
  maxMs?: number;
  /** Words to listen for (book titles, names) — improves on-device recognition when supported. */
  phrases?: string[];
  /** Live words while she talks. */
  onInterim?: (text: string) => void;
  /** Where to send the recording in 'helper' mode. */
  helper?: { endpoint: string; childName?: string };
  /** The microphone a parent chose (otherwise the default — unless that's an iPhone; see voice/microphones.ts). */
  microphone?: MicChoice | null;
}

export interface ListenOutcome {
  result: SpeechInputResult | null;
  error?: ListenError;
}

export interface SpeechInput {
  /** Some recognizer exists in this browser (it may still need a parent's OK or a download). */
  readonly available: boolean;
  /** True when asking about on-device support means calling the browser (see `probe`). */
  readonly canProbe: boolean;
  /**
   * Asks the browser whether it can recognize speech on-device. Call only from a
   * parent's click, with a crash marker saved first: some builds crash the tab here.
   */
  probe(lang?: string): Promise<OnDeviceAnswer>;
  /** What talking would do right now, given what the browser said earlier. Never calls the browser. */
  check(mode: TalkMode, known: OnDeviceAnswer): TalkAvailability;
  /** Downloads the on-device language pack (call from a parent's click). */
  install(lang?: string): Promise<boolean>;
  listen(mode: TalkMode, known: OnDeviceAnswer, opts?: ListenOptions): Promise<ListenOutcome>;
  /** Finish listening now and use what was heard so far. */
  stop(): void;
}

/** Pure: the talk state for a mode, whether a recognizer exists, and the on-device answer. */
export function talkAvailability(mode: TalkMode, hasRecognizer: boolean, known: OnDeviceAnswer): TalkAvailability {
  if (mode === 'off') return { state: 'off', onDevice: false };
  if (!hasRecognizer) return { state: 'unsupported', onDevice: false };
  if (mode === 'helper') return { state: 'ready', onDevice: false };
  if (known === 'available') return { state: 'ready', onDevice: true };
  if (mode === 'browser') return { state: 'ready', onDevice: false };
  if (known === 'downloadable') return { state: 'needs-download', onDevice: true };
  if (known === 'downloading') return { state: 'downloading', onDevice: true };
  if (known === 'unknown') return { state: 'needs-check', onDevice: false };
  return { state: 'unsupported', onDevice: false };
}

export const silentOutput: SpeechOutput = {
  available: false,
  speak: async () => undefined,
  cancel: () => undefined,
  voices: () => [],
  voiceFor: () => undefined,
  onVoicesChanged: () => () => undefined,
};

export const noInput: SpeechInput = {
  available: false,
  canProbe: false,
  probe: async () => 'unavailable',
  check: (mode) => talkAvailability(mode, false, 'unavailable'),
  install: async () => false,
  listen: async () => ({ result: null, error: 'unavailable' }),
  stop: () => undefined,
};

export class BrowserSpeechOutput implements SpeechOutput {
  get available(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  /** Only voices built into this computer: network voices would send the text away. */
  private localVoices(): SpeechSynthesisVoice[] {
    if (!this.available) return [];
    return window.speechSynthesis.getVoices().filter((v) => v.localService && /^en([-_]|$)/i.test(v.lang));
  }

  voices(): VoiceInfo[] {
    return rankVoices(this.localVoices().map((v) => ({ name: v.name, lang: v.lang, isDefault: v.default })));
  }

  voiceFor(voiceName?: string): VoiceInfo | undefined {
    return pickVoice(this.voices(), voiceName);
  }

  onVoicesChanged(cb: () => void): () => void {
    if (!this.available) return () => undefined;
    const synth = window.speechSynthesis;
    synth.addEventListener('voiceschanged', cb);
    return () => synth.removeEventListener('voiceschanged', cb);
  }

  speak(text: string, opts: SpeakOptions = {}): Promise<void> {
    if (!this.available) return Promise.resolve();
    return new Promise((resolve) => {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[*_#]/g, ''));
      u.pitch = opts.pitch ?? 1;
      u.rate = (opts.rate ?? 1) * 0.95;
      u.volume = opts.volume ?? 1;
      const pick = this.voiceFor(opts.voiceName);
      const voice = pick && this.localVoices().find((v) => v.name === pick.name);
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      }
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
  }

  cancel(): void {
    if (this.available) window.speechSynthesis.cancel();
  }
}

interface RecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface RecognitionResultList {
  length: number;
  [index: number]: { isFinal: boolean; length: number; [index: number]: RecognitionAlternative };
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  processLocally?: boolean;
  phrases?: unknown[];
  onresult: ((e: { resultIndex: number; results: RecognitionResultList }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  /** Chrome 133+: listen to this track instead of the default microphone. */
  start(track?: MediaStreamTrack): void;
  stop(): void;
  abort(): void;
}
type AvailabilityAnswer = 'available' | 'downloadable' | 'downloading' | 'unavailable';
interface RecognitionCtor {
  new (): Recognition;
  available?: (opts: { langs: string[]; processLocally?: boolean }) => Promise<AvailabilityAnswer>;
  install?: (opts: { langs: string[]; processLocally?: boolean }) => Promise<boolean>;
}
type PhraseCtor = new (phrase: string, boost?: number) => unknown;

const ERRORS: Record<string, ListenError> = {
  'no-speech': 'no-speech',
  'not-allowed': 'not-allowed',
  'service-not-allowed': 'not-allowed',
  'audio-capture': 'no-microphone',
  network: 'network',
  aborted: 'aborted',
  'language-not-supported': 'unavailable',
};

/**
 * The browser's Web Speech recognizer, on-device first.
 * Chrome can recognize speech entirely on the computer once its language pack
 * is installed (SpeechRecognition.available/install + processLocally); without
 * that, Chrome and Safari send audio to their own speech services — which we
 * only allow in 'browser' mode, chosen by a parent.
 */
export class BrowserSpeechInput implements SpeechInput {
  private active: Recognition | null = null;

  constructor(private readonly win: Window | undefined = typeof window === 'undefined' ? undefined : window) {}

  private get ctor(): RecognitionCtor | undefined {
    const w = this.win as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor } | undefined;
    return w?.SpeechRecognition ?? w?.webkitSpeechRecognition;
  }

  get available(): boolean {
    return !!this.ctor;
  }

  get canProbe(): boolean {
    return typeof this.ctor?.available === 'function';
  }

  async probe(lang = 'en-US'): Promise<OnDeviceAnswer> {
    const Ctor = this.ctor;
    if (!Ctor || typeof Ctor.available !== 'function') return 'unavailable';
    let timer: number | undefined;
    try {
      const answer = await Promise.race([
        Ctor.available({ langs: [lang], processLocally: true }),
        new Promise<'unavailable'>((resolve) => {
          timer = this.win?.setTimeout(() => resolve('unavailable'), 15_000);
        }),
      ]);
      return answer === 'available' || answer === 'downloadable' || answer === 'downloading' ? answer : 'unavailable';
    } catch {
      return 'unavailable';
    } finally {
      if (timer !== undefined) this.win?.clearTimeout(timer);
    }
  }

  check(mode: TalkMode, known: OnDeviceAnswer): TalkAvailability {
    // Without the static method there is nothing to ask: no on-device recognizer.
    return talkAvailability(mode, !!this.ctor, this.canProbe ? known : 'unavailable');
  }

  async install(lang = 'en-US'): Promise<boolean> {
    const Ctor = this.ctor;
    if (!Ctor || typeof Ctor.install !== 'function') return false;
    try {
      return await Ctor.install({ langs: [lang], processLocally: true });
    } catch {
      return false;
    }
  }

  async listen(mode: TalkMode, known: OnDeviceAnswer, opts: ListenOptions = {}): Promise<ListenOutcome> {
    const Ctor = this.ctor;
    const lang = opts.lang ?? 'en-US';
    const avail = this.check(mode, known);
    if (!Ctor || avail.state !== 'ready') return { result: null, error: 'unavailable' };
    this.stop();
    // Listen to a real microphone when the default isn't one she can use (an iPhone's
    // Continuity mic) or a parent picked one: the recognizer takes a track (Chrome 133+).
    const devices = this.win?.navigator?.mediaDevices ?? null;
    const mic = typeof devices?.enumerateDevices === 'function' ? await resolveMicrophone(opts.microphone, devices) : null;
    let stream: MediaStream | null = null;
    if (mic && devices) {
      try {
        stream = await openMicrophone(mic.deviceId, devices);
      } catch {
        stream = null; // fall back to the browser's own choice
      }
    }
    const track = stream?.getAudioTracks()[0] ?? null;
    try {
      let out = await this.run(Ctor, avail.onDevice, lang, opts, true, track);
      // Some builds reject phrase lists; try once more without them.
      if (out.error === 'aborted' && out.retryWithoutPhrases) out = await this.run(Ctor, avail.onDevice, lang, opts, false, track);
      // A recognizer that can't listen to a chosen microphone: use its default one.
      if (track && out.trackRejected) out = await this.run(Ctor, avail.onDevice, lang, opts, true, null);
      const { retryWithoutPhrases: _r, trackRejected: _t, ...result } = out;
      return result;
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
    }
  }

  private run(
    Ctor: RecognitionCtor,
    onDevice: boolean,
    lang: string,
    opts: ListenOptions,
    withPhrases: boolean,
    track: MediaStreamTrack | null = null,
  ): Promise<ListenOutcome & { retryWithoutPhrases?: boolean; trackRejected?: boolean }> {
    return new Promise((resolve) => {
      const rec = new Ctor();
      this.active = rec;
      rec.lang = lang;
      rec.continuous = false;
      rec.interimResults = !!opts.onInterim;
      rec.maxAlternatives = 1;
      if (onDevice) rec.processLocally = true;
      const Phrase = (this.win as unknown as { SpeechRecognitionPhrase?: PhraseCtor } | undefined)?.SpeechRecognitionPhrase;
      let usedPhrases = false;
      if (withPhrases && onDevice && Phrase && opts.phrases?.length) {
        try {
          rec.phrases = opts.phrases.slice(0, 50).map((p) => new Phrase(p, 3));
          usedPhrases = true;
        } catch {
          // Phrase biasing is a nice-to-have.
        }
      }
      let finalText = '';
      let interim = '';
      let confidence = 0;
      let settled = false;
      const finish = (out: ListenOutcome & { retryWithoutPhrases?: boolean; trackRejected?: boolean }) => {
        if (settled) return;
        settled = true;
        this.win?.clearTimeout(timer);
        if (this.active === rec) this.active = null;
        resolve(out);
      };
      const timer = this.win?.setTimeout(() => rec.stop(), opts.maxMs ?? 12_000) ?? 0;
      rec.onresult = (e) => {
        let live = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]!;
          const alt = r[0];
          if (!alt) continue;
          if (r.isFinal) {
            finalText = `${finalText} ${alt.transcript}`.trim();
            confidence = alt.confidence;
          } else live += alt.transcript;
        }
        interim = live.trim();
        opts.onInterim?.(`${finalText} ${interim}`.trim());
      };
      rec.onerror = (e) => {
        const code = e.error ?? '';
        if (code === 'phrases-not-supported' && usedPhrases) return finish({ result: null, error: 'aborted', retryWithoutPhrases: true });
        const heard = `${finalText} ${interim}`.trim();
        if (heard) return finish({ result: { transcript: heard, confidence, onDevice } });
        const error = ERRORS[code] ?? 'unavailable';
        const trackProblem = !!track && (error === 'unavailable' || error === 'no-microphone');
        finish({ result: null, error, ...(trackProblem ? { trackRejected: true } : {}) });
      };
      rec.onend = () => {
        const heard = (finalText || interim).trim();
        finish(heard ? { result: { transcript: heard, confidence, onDevice } } : { result: null, error: 'no-speech' });
      };
      try {
        if (track) rec.start(track);
        else rec.start();
      } catch {
        finish({ result: null, error: 'unavailable', ...(track ? { trackRejected: true } : {}) });
      }
    });
  }

  stop(): void {
    this.active?.stop();
  }
}
