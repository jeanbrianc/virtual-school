/**
 * Dance & gym moves for the avatar — pure pose functions over time, so they
 * can be unit-tested without a renderer.
 *
 * The avatar is a toy-like rig: legs pivot at the hip, arms at the shoulder,
 * a head, and the whole body (the "rig") can lift, spin, flip and roll around
 * a pivot height. Each move describes that rig over t = 0…1. Arms, legs, head
 * and the forward bend ease in and out automatically (so every move starts and
 * ends standing); lift and whole-body turns are each move's own job and always
 * end back at rest (a full turn counts as rest).
 */
import type { DanceMoveId } from '../../domain/play/circuit';

export interface Limb {
  /** Raise out to the side (0 = hanging down, ~1.6 = level, ~2.3 = a "V", ~2.9 = straight up). */
  out: number;
  /** Swing front/back (negative = forward, positive = back); applied before `out`, so it means the same at any spread. */
  fwd: number;
}

export interface Pose {
  /** Whole body up/down (m). */
  lift: number;
  /** Whole-body turns (radians): twirl, flip (+ = forward), cartwheel roll. */
  spinY: number;
  flipX: number;
  rollZ: number;
  /** Height the flips and rolls turn around (m). Hips by default. */
  pivot: number;
  /** Bend forward at the hips (radians): the upper body tips, the legs stay planted. */
  lean: number;
  headX: number;
  headZ: number;
  armL: Limb;
  armR: Limb;
  legL: Limb;
  legR: Limb;
  /** 1 = normal; below 1 = squashed (landing, crouch). */
  squash: number;
}

export type MoveCue = 'boing' | 'land' | 'twirl' | 'chime' | 'sparkle' | 'whoosh' | 'star';

export interface MoveAnim {
  seconds: number;
  pose(t: number, p: Pose): void;
  /** Sounds / sparkles at moments in the move (t = 0…1). */
  cues: { at: number; cue: MoveCue }[];
  /** How long limbs take to settle in / out (fraction of the move). */
  easeIn?: number;
  easeOut?: number;
}

export const HIP = 0.4;
const TAU = Math.PI * 2;
/**
 * An extra turn for moves whose shape is a leg line (arabesque, split leap).
 * The game already stands her a little turned from the camera, so this puts
 * her about 60° round — the leg line shows and so does her face.
 */
const PROFILE = 0.55;

export function neutralPose(): Pose {
  return {
    lift: 0,
    spinY: 0,
    flipX: 0,
    rollZ: 0,
    pivot: HIP,
    lean: 0,
    headX: 0,
    headZ: 0,
    armL: { out: 0, fwd: 0 },
    armR: { out: 0, fwd: 0 },
    legL: { out: 0, fwd: 0 },
    legR: { out: 0, fwd: 0 },
    squash: 1,
  };
}

// ── Easing helpers ──────────────────────────────────────────────────────────
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** 0→1 as t goes a→b. */
export const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
export const smooth = (x: number) => x * x * (3 - 2 * x);
/** 0 → 1 → 0 over x = 0…1. */
export const bell = (x: number) => Math.sin(Math.PI * clamp01(x));
/** Up over a→b, hold, down over c→d. */
const plateau = (t: number, a: number, b: number, c: number, d: number) => smooth(seg(t, a, b)) * (1 - smooth(seg(t, c, d)));

const arms = (p: Pose, out: number, fwd: number) => {
  p.armL = { out, fwd };
  p.armR = { out, fwd };
};
const legs = (p: Pose, out: number, fwd: number) => {
  p.legL = { out, fwd };
  p.legR = { out, fwd };
};

/** A jump: crouch → air (height h) → land. Returns 0…1 progress through the air (or -1 on the ground). */
function jump(t: number, p: Pose, air: [number, number], h: number, crouch = 0.06): number {
  const [a, b] = air;
  const pre = bell(seg(t, Math.max(0, a - 0.2), a + 0.02));
  const post = bell(seg(t, b - 0.02, Math.min(1, b + 0.18)));
  const u = seg(t, a, b);
  const inAir = t > a && t < b;
  p.lift = inAir ? h * Math.sin(Math.PI * u) : -crouch * (pre + post);
  p.squash = inAir ? 1 : 1 - 0.07 * (pre + post);
  return inAir ? u : -1;
}

export const MOVES: Record<DanceMoveId, MoveAnim> = {
  plie: {
    seconds: 2.0,
    cues: [
      { at: 0.25, cue: 'chime' },
      { at: 0.75, cue: 'chime' },
    ],
    pose(t, p) {
      const d = Math.sin(TAU * t) ** 2; // two bends
      p.lift = -0.05 * d;
      legs(p, 0.1 + 0.22 * d, 0);
      // First position (rounded in front), opening to second as she rises.
      const open = bell(seg(t, 0.35, 0.65));
      arms(p, 0.35 + 1.05 * open, -0.8 * (1 - open));
      p.headZ = 0.12 * Math.sin(TAU * t);
    },
  },

  bunnyHop: {
    seconds: 1.9,
    cues: [
      { at: 0.12, cue: 'boing' },
      { at: 0.39, cue: 'boing' },
      { at: 0.66, cue: 'boing' },
    ],
    pose(t, p) {
      arms(p, 2.65, -0.1); // bunny ears
      const u = seg(t, 0.1, 0.9) * 3;
      const f = u - Math.floor(u);
      const inAir = t > 0.1 && t < 0.9;
      p.lift = inAir ? 0.2 * Math.sin(Math.PI * f) : 0;
      p.squash = inAir ? 1 - 0.08 * Math.max(0, 1 - Math.sin(Math.PI * f) * 4) : 1;
      legs(p, 0, inAir ? -0.35 * Math.sin(Math.PI * f) : 0);
      p.headZ = 0.15 * Math.sin(u * Math.PI);
    },
  },

  sunshineTwirl: {
    seconds: 2.5,
    easeIn: 0.02,
    cues: [
      { at: 0.25, cue: 'sparkle' },
      { at: 0.32, cue: 'twirl' },
    ],
    pose(t, p) {
      // Arms sweep up the sides like the sun rising…
      const rise = smooth(seg(t, 0, 0.3));
      arms(p, 0.1 + 2.2 * rise, -0.1 * rise);
      // …then twirl all the way around, up on her toes.
      const s = seg(t, 0.3, 0.88);
      p.spinY = TAU * smooth(s);
      p.lift = 0.05 * bell(s);
      p.headZ = 0.18 * bell(s);
      p.armL.fwd = p.armR.fwd = -0.15 * Math.sin(TAU * 2 * s);
    },
  },

  starJump: {
    seconds: 1.6,
    cues: [
      { at: 0.3, cue: 'boing' },
      { at: 0.5, cue: 'star' },
      { at: 0.72, cue: 'land' },
    ],
    pose(t, p) {
      const u = jump(t, p, [0.3, 0.72], 0.42);
      if (u >= 0) {
        const star = bell(u);
        arms(p, 0.3 + 1.95 * star, 0);
        legs(p, 0.6 * star, 0);
      } else {
        arms(p, 0.1, t < 0.3 ? 0.5 * bell(seg(t, 0.1, 0.32)) : 0);
        p.lean = t < 0.3 ? 0.18 * bell(seg(t, 0.1, 0.32)) : 0;
      }
    },
  },

  curtsey: {
    seconds: 2.0,
    cues: [{ at: 0.45, cue: 'chime' }],
    pose(t, p) {
      const k = plateau(t, 0.08, 0.35, 0.68, 0.92);
      p.legR = { out: -0.12 * k, fwd: 0.42 * k }; // one foot behind
      p.legL = { out: 0.04 * k, fwd: 0 };
      p.lift = -0.07 * k;
      p.lean = 0.18 * k;
      p.headX = 0.28 * k;
      p.headZ = 0.14 * k;
      arms(p, 0.6 * k, -0.2 * k); // holding her skirt out
    },
  },

  arabesque: {
    seconds: 2.3,
    cues: [{ at: 0.3, cue: 'sparkle' }],
    pose(t, p) {
      const k = plateau(t, 0.05, 0.3, 0.75, 0.95);
      p.legL = { out: 0, fwd: 1.15 * k };
      p.lean = 0.42 * k;
      p.headX = -0.35 * k;
      p.armR = { out: 0.4 * k, fwd: -1.6 * k }; // front arm reaching forward
      p.armL = { out: 1.4 * k, fwd: 0.2 * k }; // back arm out to the side
      p.lift = 0.02 * k;
      p.spinY = PROFILE * k;
      p.pivot = 0;
      p.rollZ = 0.035 * Math.sin(t * 22) * k; // a little balance wobble
    },
  },

  cartwheel: {
    seconds: 2.0,
    cues: [
      { at: 0.2, cue: 'whoosh' },
      { at: 0.86, cue: 'land' },
    ],
    pose(t, p) {
      const reach = smooth(seg(t, 0, 0.2));
      arms(p, 2.9 * reach, 0);
      const r = seg(t, 0.2, 0.86);
      p.rollZ = -TAU * smooth(r);
      p.pivot = 0.6;
      p.lift = 0.22 * bell(r);
      legs(p, 0.55 * bell(r), 0);
    },
  },

  frogJump: {
    seconds: 1.8,
    cues: [
      { at: 0.38, cue: 'boing' },
      { at: 0.78, cue: 'land' },
    ],
    pose(t, p) {
      const u = jump(t, p, [0.38, 0.78], 0.38, 0.12);
      if (u >= 0) {
        arms(p, 2.3 * bell(u), -0.3);
        legs(p, 0.35, -0.5 * bell(u));
      } else {
        // Squat like a frog, hands down between the knees.
        const low = t < 0.38 ? smooth(seg(t, 0.05, 0.3)) : 1 - smooth(seg(t, 0.8, 0.95));
        p.lift = Math.min(p.lift, -0.12 * low);
        legs(p, 0.55 * low, 0);
        arms(p, 0.15, -0.55 * low);
        p.lean = 0.25 * low;
      }
    },
  },

  backflip: {
    seconds: 2.1,
    cues: [
      { at: 0.24, cue: 'boing' },
      { at: 0.4, cue: 'whoosh' },
      { at: 0.8, cue: 'land' },
      { at: 0.84, cue: 'star' },
    ],
    pose(t, p) {
      const u = jump(t, p, [0.24, 0.8], 0.78, 0.08);
      if (u >= 0) {
        p.flipX = -TAU * smooth(u); // over backwards
        p.pivot = 0.62;
        arms(p, 2.8, 0);
        legs(p, 0, -0.95 * bell(u)); // tuck
      } else if (t < 0.24) {
        arms(p, 0.2, 0.9 * bell(seg(t, 0.05, 0.26))); // arms swing back to load up
        p.lean = 0.2 * bell(seg(t, 0.05, 0.26));
      } else {
        arms(p, 2.35, -0.2); // stick the landing
      }
    },
  },

  tada: {
    seconds: 1.8,
    cues: [{ at: 0.2, cue: 'star' }],
    pose(t, p) {
      p.lift = 0.1 * bell(seg(t, 0, 0.22));
      const k = smooth(seg(t, 0.05, 0.25));
      arms(p, 2.3 * k, -0.2 * k);
      p.lean = -0.1 * k;
      p.headX = -0.2 * k;
      p.headZ = 0.1 * Math.sin(t * 9) * k;
    },
  },

  pirouette: {
    seconds: 2.0,
    cues: [
      { at: 0.22, cue: 'twirl' },
      { at: 0.55, cue: 'sparkle' },
    ],
    pose(t, p) {
      const prep = bell(seg(t, 0, 0.22));
      const s = seg(t, 0.2, 0.86);
      p.lift = -0.04 * prep + 0.06 * bell(s);
      p.spinY = TAU * smooth(s);
      const crown = smooth(seg(t, 0.12, 0.25));
      arms(p, 0.4 + 2.0 * crown, -0.45 * crown);
      p.legL = { out: 0.35 * bell(s), fwd: -1.0 * bell(s) }; // passé
    },
  },

  forwardRoll: {
    seconds: 2.1,
    cues: [
      { at: 0.3, cue: 'whoosh' },
      { at: 0.84, cue: 'land' },
    ],
    pose(t, p) {
      const curl = plateau(t, 0.05, 0.25, 0.8, 0.95);
      const r = seg(t, 0.25, 0.84);
      p.flipX = TAU * smooth(r); // forward
      p.pivot = 0.42;
      p.lift = -0.1 * curl + 0.34 * bell(r);
      p.lean = 0.45 * curl * (1 - bell(r));
      p.headX = 0.5 * curl;
      arms(p, 0.2, -1.3 * curl);
      legs(p, 0, -0.9 * bell(r));
      p.squash = 1 - 0.12 * curl;
    },
  },

  flamingo: {
    seconds: 2.4,
    cues: [{ at: 0.3, cue: 'sparkle' }],
    pose(t, p) {
      const k = plateau(t, 0.05, 0.25, 0.8, 0.95);
      p.legR = { out: 0.3 * k, fwd: -0.75 * k };
      arms(p, 1.55 * k, 0);
      p.armL.out += 0.25 * Math.sin(t * 16) * k;
      p.armR.out -= 0.25 * Math.sin(t * 16) * k;
      p.pivot = 0;
      p.rollZ = 0.05 * Math.sin(t * 16) * k;
    },
  },

  wiggle: {
    seconds: 2.0,
    cues: [
      { at: 0.1, cue: 'sparkle' },
      { at: 0.6, cue: 'sparkle' },
    ],
    pose(t, p) {
      const w = Math.sin(TAU * 4 * t);
      p.pivot = 0.25;
      p.rollZ = 0.14 * w * bell(t);
      p.armL = { out: 1.2 + 1.1 * w, fwd: -0.2 };
      p.armR = { out: 1.2 - 1.1 * w, fwd: -0.2 };
      p.headZ = 0.2 * w;
      p.lift = 0.035 * Math.abs(Math.sin(TAU * 4 * t)) * bell(t);
    },
  },

  bow: {
    seconds: 1.8,
    cues: [{ at: 0.45, cue: 'chime' }],
    pose(t, p) {
      const k = plateau(t, 0.1, 0.38, 0.65, 0.9);
      p.lean = 0.6 * k;
      p.headX = 0.3 * k;
      arms(p, 0.05, 0.35 * k);
    },
  },

  jumpingJacks: {
    seconds: 2.2,
    cues: [
      { at: 0.12, cue: 'boing' },
      { at: 0.4, cue: 'boing' },
      { at: 0.68, cue: 'boing' },
    ],
    pose(t, p) {
      const u = seg(t, 0.1, 0.94) * 3;
      const f = u - Math.floor(u);
      const on = t > 0.1 && t < 0.94;
      const open = on ? Math.sin(Math.PI * f) : 0;
      p.lift = 0.14 * open;
      arms(p, 0.2 + 2.2 * open, 0);
      legs(p, 0.45 * open, 0);
    },
  },

  splitLeap: {
    seconds: 1.8,
    cues: [
      { at: 0.3, cue: 'boing' },
      { at: 0.5, cue: 'sparkle' },
      { at: 0.74, cue: 'land' },
    ],
    pose(t, p) {
      p.spinY = PROFILE * plateau(t, 0.04, 0.26, 0.8, 0.96);
      const u = jump(t, p, [0.3, 0.74], 0.5);
      if (u >= 0) {
        const split = bell(u);
        p.legL = { out: 0, fwd: -1.35 * split };
        p.legR = { out: 0, fwd: 1.35 * split };
        p.armR = { out: 0.3, fwd: -1.7 * split };
        p.armL = { out: 1.5 * split, fwd: 0 };
        p.headX = -0.2 * split;
      } else {
        arms(p, 0.2, t < 0.3 ? 0.4 * bell(seg(t, 0.1, 0.32)) : 0);
      }
    },
  },
};

/**
 * The move's pose at t (0…1), with arms, legs, head and bend eased in and out
 * so every move starts and ends standing.
 */
export function poseAt(move: DanceMoveId, t: number): Pose {
  const anim = MOVES[move];
  const p = neutralPose();
  const tt = clamp01(t);
  anim.pose(tt, p);
  const env = smooth(seg(tt, 0, anim.easeIn ?? 0.08)) * (1 - smooth(seg(tt, 1 - (anim.easeOut ?? 0.12), 1)));
  const limb = (l: Limb): Limb => ({ out: l.out * env, fwd: l.fwd * env });
  return {
    ...p,
    lean: p.lean * env,
    headX: p.headX * env,
    headZ: p.headZ * env,
    armL: limb(p.armL),
    armR: limb(p.armR),
    legL: limb(p.legL),
    legR: limb(p.legR),
    squash: 1 + (p.squash - 1) * env,
  };
}
