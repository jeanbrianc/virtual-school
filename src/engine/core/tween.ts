export type Easing = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  outBounce: (t: number) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

interface Tween {
  elapsed: number;
  duration: number;
  delay: number;
  easing: Easing;
  update: (k: number) => void;
  resolve: () => void;
}

/** Frame-driven tweens; `run` returns a promise that resolves when done. */
export class Tweens {
  private active: Tween[] = [];

  run(duration: number, update: (k: number) => void, opts: { easing?: Easing; delay?: number } = {}): Promise<void> {
    return new Promise((resolve) => {
      this.active.push({ elapsed: 0, duration: Math.max(0.0001, duration), delay: opts.delay ?? 0, easing: opts.easing ?? ease.inOutCubic, update, resolve });
    });
  }

  wait(seconds: number): Promise<void> {
    return this.run(seconds, () => undefined, { easing: ease.linear });
  }

  update(dt: number): void {
    if (this.active.length === 0) return;
    const still: Tween[] = [];
    for (const t of this.active) {
      if (t.delay > 0) {
        t.delay -= dt;
        still.push(t);
        continue;
      }
      t.elapsed += dt;
      const k = Math.min(1, t.elapsed / t.duration);
      t.update(t.easing(k));
      if (k >= 1) t.resolve();
      else still.push(t);
    }
    this.active = still;
  }

  clear(): void {
    for (const t of this.active) t.resolve();
    this.active = [];
  }
}

export function damp(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}

export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let delta = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
}
