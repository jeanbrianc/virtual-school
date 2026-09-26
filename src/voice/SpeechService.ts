/**
 * Voice-ready boundary.
 *
 * Teachers speak through `SpeechOutput` and (optionally) listen through
 * `SpeechInput`. Today these wrap the browser's built-in Web Speech APIs when
 * a parent enables them; every interaction always has a tap/click fallback.
 * Future providers (cloud TTS voices, pronunciation analysis, narration
 * scoring) implement the same interfaces — see docs/ARCHITECTURE.md.
 */
export interface SpeakOptions {
  pitch?: number;
  rate?: number;
  volume?: number;
}

export interface SpeechOutput {
  readonly available: boolean;
  speak(text: string, opts?: SpeakOptions): Promise<void>;
  cancel(): void;
}

export interface SpeechInputResult {
  transcript: string;
  confidence: number;
}

export interface SpeechInput {
  readonly available: boolean;
  /** Listens once; resolves with the best transcript or null (timeout / no speech / denied). */
  listenOnce(opts?: { timeoutMs?: number; lang?: string }): Promise<SpeechInputResult | null>;
  stop(): void;
}

export const silentOutput: SpeechOutput = {
  available: false,
  speak: async () => undefined,
  cancel: () => undefined,
};

export const noInput: SpeechInput = {
  available: false,
  listenOnce: async () => null,
  stop: () => undefined,
};

export class BrowserSpeechOutput implements SpeechOutput {
  get available(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  speak(text: string, opts: SpeakOptions = {}): Promise<void> {
    if (!this.available) return Promise.resolve();
    return new Promise((resolve) => {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[*_#]/g, ''));
      u.pitch = opts.pitch ?? 1;
      u.rate = (opts.rate ?? 1) * 0.95;
      u.volume = opts.volume ?? 1;
      const voice = window.speechSynthesis.getVoices().find((v) => /en[-_]/i.test(v.lang) && /female|samantha|karen|moira|serena|google us/i.test(v.name));
      if (voice) u.voice = voice;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
  }

  cancel(): void {
    if (this.available) window.speechSynthesis.cancel();
  }
}

type RecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

export class BrowserSpeechInput implements SpeechInput {
  private active: InstanceType<RecognitionCtor> | null = null;

  private get ctor(): RecognitionCtor | undefined {
    if (typeof window === 'undefined') return undefined;
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition;
  }

  get available(): boolean {
    return !!this.ctor;
  }

  listenOnce(opts: { timeoutMs?: number; lang?: string } = {}): Promise<SpeechInputResult | null> {
    const Ctor = this.ctor;
    if (!Ctor) return Promise.resolve(null);
    return new Promise((resolve) => {
      const rec = new Ctor();
      this.active = rec;
      rec.lang = opts.lang ?? 'en-US';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      let settled = false;
      const finish = (r: SpeechInputResult | null) => {
        if (settled) return;
        settled = true;
        this.active = null;
        resolve(r);
      };
      const timer = window.setTimeout(() => {
        rec.stop();
        finish(null);
      }, opts.timeoutMs ?? 8000);
      rec.onresult = (e) => {
        window.clearTimeout(timer);
        const alt = e.results[0]?.[0];
        finish(alt ? { transcript: alt.transcript, confidence: alt.confidence } : null);
      };
      rec.onerror = () => finish(null);
      rec.onend = () => finish(null);
      try {
        rec.start();
      } catch {
        finish(null);
      }
    });
  }

  stop(): void {
    this.active?.stop();
  }
}
