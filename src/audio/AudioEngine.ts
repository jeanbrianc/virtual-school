/**
 * Procedural game audio (Web Audio API). Every sound is synthesized at
 * runtime — no audio files, no licensing concerns — and routed through
 * master / effects / ambience buses with parent-controlled volumes.
 * Sounds are gentle by design: short, soft, never alarming.
 */
import type { AudioSettings } from '../domain/types';

export type SfxName =
  | 'click'
  | 'hover'
  | 'step'
  | 'pageFlip'
  | 'bookThunk'
  | 'chime'
  | 'unlock'
  | 'fanfare'
  | 'sparkle'
  | 'correct'
  | 'tryAgain'
  | 'hootGreet'
  | 'digitGreet'
  | 'novaGreet'
  | 'door'
  | 'whoosh'
  | 'splash'
  | 'plop'
  | 'dragon'
  | 'petHappy'
  | 'pop';

const NOTE = (semitonesFromA4: number) => 440 * Math.pow(2, semitonesFromA4 / 12);
const C5 = NOTE(3);
const E5 = NOTE(7);
const G5 = NOTE(10);
const C6 = NOTE(15);
const A5 = NOTE(12);

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private effects: GainNode | null = null;
  private ambience: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private ambienceNodes: AudioNode[] = [];
  private ambienceTimer: number | null = null;
  private settings: AudioSettings = { master: 0.8, effects: 0.8, ambience: 0.35, voice: 0.9, muted: false };
  private lastPlayed = new Map<SfxName, number>();

  /** Lazily creates the AudioContext; must be called from a user gesture on iOS/Safari. */
  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.effects = this.ctx.createGain();
      this.ambience = this.ctx.createGain();
      this.effects.connect(this.master);
      this.ambience.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.makeNoise(2);
      this.applySettings();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get available(): boolean {
    return this.ctx !== null;
  }

  setSettings(settings: AudioSettings): void {
    this.settings = settings;
    this.applySettings();
  }

  getSettings(): AudioSettings {
    return this.settings;
  }

  private applySettings() {
    if (!this.ctx || !this.master || !this.effects || !this.ambience) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.muted ? 0 : this.settings.master, t, 0.05);
    this.effects.gain.setTargetAtTime(this.settings.effects, t, 0.05);
    this.ambience.gain.setTargetAtTime(this.settings.ambience * 0.5, t, 0.2);
  }

  private makeNoise(seconds: number): AudioBuffer | null {
    if (!this.ctx) return null;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      // Gently pinked noise.
      const white = Math.random() * 2 - 1;
      last = 0.97 * last + 0.03 * white;
      data[i] = white * 0.35 + last * 2.2;
    }
    return buffer;
  }

  play(name: SfxName, opts: { volume?: number; pitch?: number } = {}): void {
    if (!this.ctx || !this.effects || this.settings.muted) return;
    // Rate-limit identical sounds (e.g. footsteps, hover).
    const now = performance.now();
    const minGap = name === 'step' ? 180 : name === 'hover' ? 90 : 30;
    if (now - (this.lastPlayed.get(name) ?? 0) < minGap) return;
    this.lastPlayed.set(name, now);

    const v = opts.volume ?? 1;
    const p = opts.pitch ?? 1;
    switch (name) {
      case 'click':
        this.tone('sine', 880 * p, 620 * p, 0.07, 0.18 * v);
        break;
      case 'hover':
        this.tone('sine', 1320 * p, 1320 * p, 0.03, 0.05 * v);
        break;
      case 'pop':
        this.tone('sine', 520 * p, 980 * p, 0.08, 0.16 * v);
        break;
      case 'step':
        this.noise(0.06, 'lowpass', 320 * p, 320 * p, 0.09 * v);
        break;
      case 'pageFlip':
        this.noise(0.22, 'bandpass', 1800, 6500, 0.12 * v);
        break;
      case 'bookThunk':
        this.tone('sine', 170 * p, 70 * p, 0.18, 0.35 * v);
        this.noise(0.05, 'lowpass', 900, 400, 0.15 * v);
        break;
      case 'chime':
        this.bell(C6 * p, 1.2, 0.18 * v);
        break;
      case 'unlock':
        [C5, E5, G5, C6].forEach((f, i) => this.bell(f * p, 1.4, 0.16 * v, i * 0.11));
        break;
      case 'fanfare':
        [C5, E5, G5, C6, G5, C6].forEach((f, i) => this.bell(f * p, 1.6, 0.14 * v, i * 0.12));
        [C5, E5, G5].forEach((f) => this.pad(f * p, 1.8, 0.05 * v, 0.72));
        break;
      case 'sparkle':
        for (let i = 0; i < 6; i++) this.bell(NOTE(15 + Math.floor(Math.random() * 12)) * p, 0.5, 0.05 * v, i * 0.06);
        break;
      case 'correct':
        this.marimba(E5 * p, 0, 0.2 * v);
        this.marimba(A5 * p, 0.1, 0.2 * v);
        break;
      case 'tryAgain':
        // Soft and warm — a "hmm, let's look again", never a buzzer.
        this.marimba(NOTE(-2) * p, 0, 0.12 * v);
        this.marimba(NOTE(3) * p, 0.14, 0.12 * v);
        break;
      case 'hootGreet':
        this.hoot(0, v);
        this.hoot(0.32, v * 0.9);
        break;
      case 'digitGreet':
        this.tone('square', 900, 900, 0.07, 0.05 * v, 0);
        this.tone('square', 640, 640, 0.07, 0.05 * v, 0.1);
        this.tone('square', 1200, 1200, 0.09, 0.05 * v, 0.2);
        break;
      case 'novaGreet':
        this.tone('sine', 1100, 1750, 0.09, 0.12 * v, 0);
        this.tone('sine', 1250, 1900, 0.1, 0.12 * v, 0.13);
        break;
      case 'door':
        this.noise(0.45, 'lowpass', 300, 900, 0.1 * v);
        this.tone('triangle', 180, 150, 0.25, 0.05 * v, 0.05);
        break;
      case 'whoosh':
        this.noise(0.5, 'bandpass', 400, 2400, 0.12 * v);
        break;
      case 'splash':
        this.noise(0.35, 'lowpass', 2200, 500, 0.2 * v);
        break;
      case 'plop':
        this.tone('sine', 700 * p, 160 * p, 0.14, 0.22 * v);
        break;
      case 'dragon':
        this.tone('sawtooth', 110, 160, 0.5, 0.05 * v, 0, 700);
        this.tone('sine', 220, 330, 0.35, 0.1 * v, 0.3);
        break;
      case 'petHappy':
        this.tone('sine', 1400 * p, 2300 * p, 0.09, 0.1 * v);
        this.tone('sine', 1600 * p, 2600 * p, 0.09, 0.08 * v, 0.1);
        break;
    }
  }

  // ── Synthesis primitives ───────────────────────────────────────────────
  private env(gain: GainNode, start: number, attack: number, dur: number, peak: number) {
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, peak: number, delay = 0, lowpass?: number) {
    if (!this.ctx || !this.effects) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    this.env(g, t, Math.min(0.01, dur / 4), dur, peak);
    if (lowpass) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      osc.connect(f).connect(g);
    } else osc.connect(g);
    g.connect(this.effects);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(dur: number, type: BiquadFilterType, f0: number, f1: number, peak: number, delay = 0) {
    if (!this.ctx || !this.effects || !this.noiseBuffer) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = this.ctx.createGain();
    this.env(g, t, 0.01, dur, peak);
    src.connect(filter).connect(g).connect(this.effects);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private bell(freq: number, dur: number, peak: number, delay = 0) {
    if (!this.ctx || !this.effects) return;
    const t = this.ctx.currentTime + delay;
    for (const [ratio, amp] of [
      [1, 1],
      [2.76, 0.35],
      [5.4, 0.12],
    ] as const) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.frequency.value = freq * ratio;
      this.env(g, t, 0.004, dur / ratio, peak * amp);
      osc.connect(g).connect(this.effects);
      osc.start(t);
      osc.stop(t + dur);
    }
  }

  private marimba(freq: number, delay: number, peak: number) {
    if (!this.ctx || !this.effects) return;
    const t = this.ctx.currentTime + delay;
    for (const [ratio, amp, d] of [
      [1, 1, 0.45],
      [4, 0.2, 0.12],
    ] as const) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.frequency.value = freq * ratio;
      this.env(g, t, 0.005, d, peak * amp);
      osc.connect(g).connect(this.effects);
      osc.start(t);
      osc.stop(t + d + 0.05);
    }
  }

  private pad(freq: number, dur: number, peak: number, delay = 0) {
    if (!this.ctx || !this.effects) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.effects);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private hoot(delay: number, v: number) {
    if (!this.ctx || !this.effects) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(390, t);
    osc.frequency.linearRampToValueAtTime(430, t + 0.08);
    osc.frequency.linearRampToValueAtTime(360, t + 0.26);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * v, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(f).connect(g).connect(this.effects);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  // ── Ambience ───────────────────────────────────────────────────────────
  startAmbience(): void {
    if (!this.ctx || !this.ambience || !this.noiseBuffer || this.ambienceNodes.length) return;
    // A soft, warm room tone…
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    src.connect(lp).connect(g).connect(this.ambience);
    src.start();
    this.ambienceNodes = [src, lp, g];
    // …with occasional distant birdsong outside the windows.
    const chirp = () => {
      if (!this.ctx || !this.ambience) return;
      const t = this.ctx.currentTime;
      const base = 2200 + Math.random() * 1400;
      const count = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        const osc = this.ctx.createOscillator();
        const cg = this.ctx.createGain();
        const st = t + i * 0.13;
        osc.frequency.setValueAtTime(base, st);
        osc.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.3), st + 0.07);
        this.env(cg, st, 0.01, 0.09, 0.025);
        osc.connect(cg).connect(this.ambience);
        osc.start(st);
        osc.stop(st + 0.12);
      }
      this.ambienceTimer = window.setTimeout(chirp, 7000 + Math.random() * 12000);
    };
    this.ambienceTimer = window.setTimeout(chirp, 3000);
  }

  stopAmbience(): void {
    for (const n of this.ambienceNodes) {
      if (n instanceof AudioBufferSourceNode) n.stop();
      n.disconnect();
    }
    this.ambienceNodes = [];
    if (this.ambienceTimer !== null) window.clearTimeout(this.ambienceTimer);
    this.ambienceTimer = null;
  }
}
