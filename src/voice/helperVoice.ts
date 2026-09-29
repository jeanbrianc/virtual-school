/**
 * Natural teacher voices and listening through the family's AI helper
 * (scripts/ai-helper — on this computer, or /api on the family's site, which
 * uses OpenAI). Consent-gated: used only when a parent turns each one on.
 *
 *  • HelperSpeechOutput — a teacher line → that teacher's natural voice
 *    (the words go to the helper). Spoken lines are kept in this browser so a
 *    repeated line is free and instant. Any problem → the computer's own voice.
 *  • HelperListener — records her (only while the microphone button is on),
 *    stops by itself when she stops talking, and sends the recording to the
 *    helper to be turned into words.
 *  • RoutingSpeechInput — the browser's recognizer, or the helper, by talk mode.
 */
import type { OnDeviceAnswer } from '../domain/talk';
import { openMicrophone, resolveMicrophone } from './microphones';
import {
  talkAvailability,
  type ListenOptions,
  type ListenOutcome,
  type NaturalVoice,
  type SpeakOptions,
  type SpeechInput,
  type SpeechOutput,
  type TalkAvailability,
  type TalkMode,
  type VoiceInfo,
} from './SpeechService';

const HELPER_HEADER = 'X-Izzy-Classroom';
const VOICE_CACHE = 'izzy-teacher-voices-v1';
const VOICE_CACHE_MAX = 400;

const joinUrl = (endpoint: string, path: string) => `${endpoint.replace(/\/+$/, '')}${path}`;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Natural voices from the helper, with the computer's own voice as the fallback. */
export class HelperSpeechOutput implements SpeechOutput {
  private token = 0;
  private audio: HTMLAudioElement | null = null;
  private finishAudio: (() => void) | null = null;
  private inflight: AbortController | null = null;
  private readonly memory = new Map<string, Blob>();

  constructor(
    private readonly device: SpeechOutput,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
    private readonly timeoutMs = 15_000,
  ) {}

  get available(): boolean {
    return this.device.available;
  }
  voices(): VoiceInfo[] {
    return this.device.voices();
  }
  voiceFor(voiceName?: string): VoiceInfo | undefined {
    return this.device.voiceFor(voiceName);
  }
  onVoicesChanged(cb: () => void): () => void {
    return this.device.onVoicesChanged(cb);
  }

  cancel(): void {
    this.token += 1;
    this.inflight?.abort();
    this.inflight = null;
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    this.finishAudio?.();
    this.device.cancel();
  }

  async speak(text: string, opts: SpeakOptions = {}): Promise<void> {
    this.cancel();
    const { natural, ...rest } = opts;
    if (!natural || typeof Audio === 'undefined') return this.device.speak(text, rest);
    const mine = ++this.token;
    try {
      const blob = await this.audioFor(text, natural);
      if (mine !== this.token) return;
      await this.play(blob, rest.volume ?? 1, mine);
    } catch {
      // Helper down, limit reached, or the audio wouldn't play: the computer's voice says it instead.
      if (mine === this.token) return this.device.speak(text, rest);
    }
  }

  private async audioFor(text: string, natural: NaturalVoice): Promise<Blob> {
    const key = `${natural.teacher}\n${text}`;
    const hit = this.memory.get(key);
    if (hit) {
      this.remember(key, hit);
      return hit;
    }
    const cacheUrl = `${location.origin}/__teacher-voice/${await sha256Hex(key)}`;
    const stored = await this.fromCache(cacheUrl);
    if (stored) {
      this.remember(key, stored);
      return stored;
    }
    const controller = new AbortController();
    this.inflight = controller;
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(joinUrl(natural.endpoint, '/v1/speak'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [HELPER_HEADER]: '1' },
        body: JSON.stringify({ teacherId: natural.teacher, text }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = new Blob([await res.arrayBuffer()], { type: res.headers.get('content-type') || 'audio/mpeg' });
      if (blob.size < 100) throw new Error('empty audio');
      this.remember(key, blob);
      void this.toCache(cacheUrl, blob);
      return blob;
    } finally {
      clearTimeout(timer);
      if (this.inflight === controller) this.inflight = null;
    }
  }

  private remember(key: string, blob: Blob): void {
    this.memory.delete(key);
    this.memory.set(key, blob);
    while (this.memory.size > 40) this.memory.delete(this.memory.keys().next().value!);
  }

  private async fromCache(url: string): Promise<Blob | null> {
    try {
      if (typeof caches === 'undefined') return null;
      const res = await (await caches.open(VOICE_CACHE)).match(url);
      return res ? await res.blob() : null;
    } catch {
      return null;
    }
  }

  private async toCache(url: string, blob: Blob): Promise<void> {
    try {
      if (typeof caches === 'undefined') return;
      const cache = await caches.open(VOICE_CACHE);
      await cache.put(url, new Response(blob, { headers: { 'Content-Type': blob.type } }));
      const keys = await cache.keys();
      for (const old of keys.slice(0, Math.max(0, keys.length - VOICE_CACHE_MAX))) await cache.delete(old);
    } catch {
      // Storage full or unavailable: it just won't be remembered.
    }
  }

  private play(blob: Blob, volume: number, mine: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.volume = Math.max(0, Math.min(1, volume));
      let done = false;
      const finish = (err?: unknown) => {
        if (done) return;
        done = true;
        URL.revokeObjectURL(url);
        if (this.audio === audio) this.audio = null;
        if (this.finishAudio === finish) this.finishAudio = null;
        if (err && mine === this.token) reject(err instanceof Error ? err : new Error('playback failed'));
        else resolve();
      };
      this.audio = audio;
      this.finishAudio = finish;
      audio.onended = () => finish();
      audio.onerror = () => finish(new Error('audio error'));
      audio.play().catch((err: unknown) => finish(err ?? new Error('play refused')));
    });
  }
}

/** Removes cached natural-voice lines from this browser (Settings → turn natural voices off). */
export async function clearNaturalVoiceCache(): Promise<void> {
  try {
    if (typeof caches !== 'undefined') await caches.delete(VOICE_CACHE);
  } catch {
    // nothing to clear
  }
}

// ── Listening through the helper ─────────────────────────────────────────────

export interface HelperListenOptions {
  endpoint: string;
  childName?: string;
}

const RECORDING_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];

function pickRecordingType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return RECORDING_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Turn a getUserMedia failure into what child mode tells her. */
function micError(err: unknown): ListenOutcome['error'] {
  const name = (err as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'not-allowed';
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') return 'no-microphone';
  return 'unavailable';
}

/**
 * Records her while the microphone button is on and sends the recording to the
 * helper to be turned into words. Stops when she has been quiet for a moment,
 * after `maxMs`, or when she taps the button again.
 */
export class HelperListener {
  private finish: (() => void) | null = null;
  private autoFinish: (() => void) | null = null;
  private cancelled = false;
  /** She tapped "done" while the microphone was still opening. */
  private stopWanted = false;

  constructor(private readonly fetchImpl: typeof fetch = (...args) => fetch(...args)) {}

  get available(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
  }

  stop(): void {
    if (this.finish) this.finish();
    else this.stopWanted = true;
  }

  abort(): void {
    this.cancelled = true;
    this.autoFinish?.();
  }

  async listen(helper: HelperListenOptions, opts: ListenOptions = {}): Promise<ListenOutcome> {
    if (!this.available) return { result: null, error: 'unavailable' };
    this.cancelled = false;
    this.stopWanted = false;
    let stream: MediaStream;
    try {
      // A real microphone: the parent's choice, or the built-in one when the default is an iPhone.
      const mic = await resolveMicrophone(opts.microphone);
      stream = await openMicrophone(mic?.deviceId);
    } catch (err) {
      return { result: null, error: micError(err) };
    }
    const type = pickRecordingType();
    const recorder = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 32_000 } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };

    // A simple loudness meter tells when she starts and stops talking.
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    try {
      audioCtx = new AudioContext();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
    } catch {
      analyser = null;
    }
    const samples = new Float32Array(analyser?.fftSize ?? 1024);
    const started = Date.now();
    const maxMs = opts.maxMs ?? 12_000;
    let heard = !analyser; // without a meter, rely on the time limit / her tap
    let tapped = false;
    let lastLoud = started;
    // The quietest the room has been (she may start talking the moment she taps).
    let floor = Number.POSITIVE_INFINITY;

    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    let meter: ReturnType<typeof setInterval> | null = null;
    const end = () => {
      this.finish = null;
      if (meter) clearInterval(meter);
      if (recorder.state !== 'inactive') recorder.stop();
    };
    const done = new Promise<void>((resolve) => {
      this.finish = () => {
        // A tap on the button means she's done talking: send what we have.
        tapped = true;
        end();
        resolve();
      };
      this.autoFinish = () => {
        end();
        resolve();
      };
    });
    recorder.start(250);
    opts.onInterim?.('I’m listening…');
    if (this.stopWanted) this.finish?.();
    meter = setInterval(() => {
      const now = Date.now();
      if (analyser) {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const x of samples) sum += x * x;
        const rms = Math.sqrt(sum / samples.length);
        floor = Math.min(floor, rms);
        if (rms > Math.max(0.012, floor * 4)) {
          heard = true;
          lastLoud = now;
        }
        if (heard && now - lastLoud > 1_300) this.autoFinish?.();
        if (!heard && now - started > 7_000) this.autoFinish?.();
      }
      if (now - started > maxMs) this.autoFinish?.();
    }, 100);

    await done;
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    void audioCtx?.close().catch(() => undefined);
    this.autoFinish = null;
    if (this.cancelled) return { result: null, error: 'aborted' };
    if (!heard && !tapped) return { result: null, error: 'no-speech' };

    const blob = new Blob(chunks, { type: recorder.mimeType || type || 'audio/webm' });
    if (blob.size < 200) return { result: null, error: 'no-speech' };
    opts.onInterim?.('Got it! Thinking…');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await this.fetchImpl(joinUrl(helper.endpoint, '/v1/listen'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [HELPER_HEADER]: '1' },
        body: JSON.stringify({
          audio: await blobToBase64(blob),
          mime: blob.type,
          keywords: (opts.phrases ?? []).slice(0, 30),
          ...(helper.childName ? { childName: helper.childName } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) return { result: null, error: 'network' };
      const text = ((await res.json()) as { text?: unknown }).text;
      const words = typeof text === 'string' ? text.trim() : '';
      return words ? { result: { transcript: words, confidence: 0.9, onDevice: false } } : { result: null, error: 'no-speech' };
    } catch {
      return { result: null, error: 'network' };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** The browser's recognizer for 'device'/'browser', the helper for 'helper'. */
export class RoutingSpeechInput implements SpeechInput {
  private helperActive = false;

  constructor(
    private readonly browser: SpeechInput,
    private readonly helper: HelperListener = new HelperListener(),
  ) {}

  get available(): boolean {
    return this.browser.available || this.helper.available;
  }
  get canProbe(): boolean {
    return this.browser.canProbe;
  }
  probe(lang?: string): Promise<OnDeviceAnswer> {
    return this.browser.probe(lang);
  }
  install(lang?: string): Promise<boolean> {
    return this.browser.install(lang);
  }

  check(mode: TalkMode, known: OnDeviceAnswer): TalkAvailability {
    if (mode === 'helper') return this.helper.available ? { state: 'ready', onDevice: false } : talkAvailability('helper', false, known);
    return this.browser.check(mode, known);
  }

  async listen(mode: TalkMode, known: OnDeviceAnswer, opts: ListenOptions = {}): Promise<ListenOutcome> {
    if (mode !== 'helper') return this.browser.listen(mode, known, opts);
    if (!opts.helper) return { result: null, error: 'unavailable' };
    this.helperActive = true;
    try {
      return await this.helper.listen(opts.helper, opts);
    } finally {
      this.helperActive = false;
    }
  }

  stop(): void {
    if (this.helperActive) this.helper.stop();
    else this.browser.stop();
  }
}
