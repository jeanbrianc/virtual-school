import { beatOffsets, type BeatCount, type RhythmPresentation } from '../domain/music/rhythm';

/** Local synthesis only. Every playback is cancellable; stalled pulses cannot earn evidence. */
export class RhythmPlayer {
  private context: AudioContext | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private nodes: OscillatorNode[] = [];
  private end: ((result: { reliable: boolean; presentation: RhythmPresentation }) => void) | null = null;
  stop() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
    for (const node of this.nodes) {
      try {
        node.stop();
      } catch {
        /* already ended */
      }
    }
    this.nodes = [];
    this.end?.({ reliable: false, presentation: 'visual-only' });
    this.end = null;
  }
  async play(beats: BeatCount, pattern: 'a' | 'b', pulse: number, sound: boolean, volume: number, onPulse: (index: number) => void) {
    this.stop();
    let presentation: RhythmPresentation = 'visual-only';
    // Establish cancellation before resume(), which may settle after close or mute.
    let cancelled = false;
    this.end = () => {
      cancelled = true;
    };
    let latency = 0;
    if (sound) {
      try {
        this.context ??= new AudioContext();
        await this.context.resume();
        if (cancelled) return { reliable: false, presentation };
        if (this.context.state === 'running') {
          latency = Math.max(0, Math.min(0.5, this.context.outputLatency || this.context.baseLatency || 0));
          presentation = 'sound-and-visual';
        }
      } catch {
        /* Visual-only remains a complete route if no audio output is available. */
      }
    }
    if (cancelled) return { reliable: false, presentation };
    const offsets = beatOffsets(beats, pattern, pulse);
    const lead = 100 + latency * 1000,
      origin = performance.now() + lead;
    if (presentation === 'sound-and-visual' && this.context) {
      const ctx = this.context,
        start = ctx.currentTime + 0.1;
      for (const offset of offsets) {
        const node = ctx.createOscillator(),
          gain = ctx.createGain(),
          t = start + offset / 1000;
        node.type = 'sine';
        node.frequency.setValueAtTime(390, t);
        node.frequency.exponentialRampToValueAtTime(170, t + 0.1);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, volume)) * 0.22, t + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
        node.connect(gain);
        gain.connect(ctx.destination);
        node.start(t);
        node.stop(t + 0.17);
        node.onended = () => {
          node.disconnect();
          gain.disconnect();
        };
        this.nodes.push(node);
      }
    }
    return new Promise<{ reliable: boolean; presentation: RhythmPresentation }>((resolve) => {
      let reliable = true;
      this.end = resolve;
      offsets.forEach((offset, i) => {
        this.timers.push(
          setTimeout(() => {
            if (Math.abs(performance.now() - (origin + offset)) > 250) reliable = false;
            onPulse(i);
          }, lead + offset),
        );
        this.timers.push(setTimeout(() => onPulse(-1), lead + offset + 350));
      });
      this.timers.push(
        setTimeout(
          () => {
            this.end = null;
            resolve({ reliable, presentation });
          },
          lead + offsets[offsets.length - 1]! + 450,
        ),
      );
    });
  }
  dispose() {
    this.stop();
    void this.context?.close();
    this.context = null;
  }
}
