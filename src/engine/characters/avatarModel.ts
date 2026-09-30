/**
 * Izzy's customizable avatar: a chibi-proportioned, toy-like character built
 * from primitives. All parts are driven by AvatarConfig so parents (and later
 * a photo-inspired generator) can restyle her without new art.
 */
import * as THREE from 'three';
import type { AvatarConfig } from '../../domain/types';
import type { DanceMoveId } from '../../domain/play/circuit';
import { capsule, cone, cyl, mat, rbox, sphere, torus } from '../render/kit';
import { HIP, MOVES, poseAt, type MoveCue } from './moves';

const DARK = '#2b2233';

function shade(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amount)));
  return `#${c.getHexString()}`;
}

function starShape(outer: number, inner: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

export class AvatarModel {
  readonly root = new THREE.Group();
  private rig = new THREE.Group();
  /** Everything above the hips (torso, arms, head) — tips forward for bows and arabesques. */
  private upper = new THREE.Group();
  private head = new THREE.Group();
  private torso = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private eyes: THREE.Object3D[] = [];
  /** Per arm (L, R): the hand and sleeve puff, kept round while a raised arm stretches. */
  private armEnds: { hand: THREE.Object3D; puff: THREE.Object3D | null }[] = [];
  private phase = 0;
  private time = Math.random() * 10;
  private blinkTimer = 2 + Math.random() * 2;
  private waveTime = 0;
  private hopTime = 0;
  private move: { id: DanceMoveId; t: number; nextCue: number; done: () => void } | null = null;
  /** Sounds and sparkles at moments in a dance move (set by the game). */
  onMoveCue: ((cue: MoveCue) => void) | null = null;
  config: AvatarConfig;

  constructor(config: AvatarConfig) {
    this.config = config;
    this.root.name = 'avatar';
    this.root.add(this.rig);
    this.build();
  }

  setConfig(config: AvatarConfig): void {
    this.config = config;
    this.rig.clear();
    this.upper = new THREE.Group();
    this.head = new THREE.Group();
    this.torso = new THREE.Group();
    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    this.eyes = [];
    this.armEnds = [];
    this.build();
  }

  private build() {
    const c = this.config;
    const skin = mat(c.skinTone, { roughness: 0.62 });
    const hair = mat(c.hairColor, { roughness: 0.55, side: THREE.DoubleSide });
    const outfit = mat(c.outfitColor, { roughness: 0.8 });
    const accent = mat(c.accentColor, { roughness: 0.8 });
    const shoe = mat(c.shoeColor, { roughness: 0.5 });
    const pants =
      c.outfit === 'overalls'
        ? outfit
        : c.outfit === 'tee'
          ? accent
          : c.outfit === 'sweater' || c.outfit === 'labcoat'
            ? mat(shade(c.accentColor, -0.35))
            : skin;

    // ── Legs (pivot at hip) ──────────────────────────────────────────────
    for (const [leg, side] of [
      [this.legL, -1],
      [this.legR, 1],
    ] as const) {
      leg.position.set(side * 0.085, 0.4, 0);
      // Swing front/back first, then out to the side (so "forward" means forward at any spread).
      leg.rotation.order = 'ZXY';
      const bareLeg = c.outfit === 'dress' || c.outfit === 'tee';
      const upper = capsule(0.068, 0.2, bareLeg ? skin : pants, 0, -0.16, 0);
      leg.add(upper);
      if (c.outfit === 'dress') leg.add(cyl(0.07, 0.07, 0.07, mat('#fff8ee'), 0, -0.3, 0));
      const foot = sphere(0.085, shoe, 0, -0.36, 0.035);
      foot.scale.set(1, 0.62, 1.35);
      leg.add(foot);
      this.rig.add(leg);
    }

    // ── Upper body (pivots at the hips) ─────────────────────────────────
    this.upper.position.y = HIP;
    this.rig.add(this.upper);

    // ── Torso ───────────────────────────────────────────────────────────
    this.torso.position.y = 0;
    const shirt = c.outfit === 'overalls' ? accent : outfit;
    const body = capsule(0.17, 0.16, shirt, 0, 0.2, 0);
    body.scale.set(1, 1, 0.86);
    this.torso.add(body);
    if (c.outfit === 'dress') {
      const skirt = cyl(0.15, 0.27, 0.3, outfit, 0, 0.02, 0, 28);
      this.torso.add(skirt);
      const hem = torus(0.265, 0.018, accent);
      hem.rotation.x = Math.PI / 2;
      hem.position.y = -0.12;
      this.torso.add(hem);
      const collar = torus(0.1, 0.02, mat('#fffaf0'));
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 0.36;
      this.torso.add(collar);
    } else if (c.outfit === 'overalls') {
      const bib = rbox(0.22, 0.2, 0.06, 0.03, outfit, 0, 0.2, 0.13);
      this.torso.add(bib);
      const hips = cyl(0.17, 0.18, 0.14, outfit, 0, 0.02, 0);
      this.torso.add(hips);
      for (const s of [-1, 1]) {
        const strap = rbox(0.045, 0.2, 0.03, 0.01, outfit, s * 0.09, 0.3, 0.12);
        strap.rotation.x = -0.25;
        this.torso.add(strap);
        this.torso.add(sphere(0.022, mat('#e8c35a', { metalness: 0.6, roughness: 0.3 }), s * 0.08, 0.27, 0.165));
      }
      const pocket = rbox(0.09, 0.06, 0.02, 0.01, mat(shade(c.outfitColor, -0.1)), 0, 0.19, 0.165);
      this.torso.add(pocket);
    } else if (c.outfit === 'tee') {
      this.torso.add(cyl(0.175, 0.185, 0.12, accent, 0, 0.01, 0));
      const star = new THREE.Mesh(new THREE.ShapeGeometry(starShape(0.05, 0.022)), mat('#fff3c4'));
      star.position.set(0, 0.22, 0.152);
      this.torso.add(star);
    } else if (c.outfit === 'sweater') {
      this.torso.add(cyl(0.175, 0.185, 0.12, pants, 0, 0.0, 0));
      const hem = torus(0.172, 0.025, mat(shade(c.outfitColor, -0.12)));
      hem.rotation.x = Math.PI / 2;
      hem.position.y = 0.08;
      this.torso.add(hem);
      for (let i = 0; i < 3; i++) this.torso.add(sphere(0.018, mat('#fff8ee'), 0, 0.14 + i * 0.07, 0.155));
    } else if (c.outfit === 'labcoat') {
      this.torso.add(cyl(0.175, 0.185, 0.12, pants, 0, 0.0, 0));
      const coat = cyl(0.19, 0.25, 0.46, mat('#fbfbf7', { roughness: 0.9 }), 0, 0.1, -0.01, 24);
      this.torso.add(coat);
      this.torso.add(rbox(0.07, 0.07, 0.02, 0.01, mat('#e8eef0'), 0.1, 0.1, 0.21));
      this.torso.add(rbox(0.012, 0.06, 0.012, 0.004, mat(c.accentColor), 0.1, 0.15, 0.225));
    }
    this.upper.add(this.torso);

    // ── Arms (pivot at shoulder) ─────────────────────────────────────────
    const sleeve = c.outfit === 'labcoat' ? mat('#fbfbf7') : c.outfit === 'overalls' ? accent : outfit;
    for (const [arm, side] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      arm.position.set(side * 0.2, 0.72 - HIP, 0);
      arm.rotation.order = 'ZXY';
      const shortSleeve = c.outfit === 'tee' || c.outfit === 'dress' || c.outfit === 'overalls';
      let puff: THREE.Object3D | null = null;
      if (shortSleeve) {
        puff = sphere(0.066, sleeve, 0, -0.03, 0);
        arm.add(puff);
        arm.add(capsule(0.048, 0.18, skin, 0, -0.14, 0));
      } else {
        arm.add(capsule(0.056, 0.19, sleeve, 0, -0.13, 0));
      }
      const hand = sphere(0.056, skin, 0, -0.27, 0.01);
      arm.add(hand);
      this.armEnds.push({ hand, puff });
      arm.rotation.z = side * 0.12;
      this.upper.add(arm);
    }

    // ── Head ────────────────────────────────────────────────────────────
    this.head.position.y = 1.0 - HIP;
    const skull = sphere(0.27, skin, 0, 0, 0, 32);
    skull.scale.set(1, 0.95, 0.95);
    this.head.add(skull);
    for (const s of [-1, 1]) {
      const ear = sphere(0.055, skin, s * 0.26, -0.02, 0);
      ear.scale.set(0.6, 1, 0.8);
      this.head.add(ear);
    }
    const eyeMat = mat(c.eyeColor === '#3b2a1f' ? DARK : c.eyeColor, { roughness: 0.2 });
    const shine = mat('#ffffff', { roughness: 0.1, emissive: '#ffffff', emissiveIntensity: 0.4 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(s * 0.095, 0.01, 0.228);
      const ball = sphere(0.043, eyeMat);
      ball.scale.set(0.9, 1.1, 0.55);
      eye.add(ball);
      eye.add(sphere(0.013, shine, 0.012, 0.018, 0.022));
      this.head.add(eye);
      this.eyes.push(eye);
      const brow = capsule(0.009, 0.045, mat(shade(c.hairColor, -0.05)), s * 0.1, 0.09, 0.235);
      brow.rotation.z = Math.PI / 2 + s * 0.12;
      this.head.add(brow);
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.045, 20), mat('#ff8f8f', { transparent: true, opacity: 0.45, roughness: 1 }));
      cheek.position.set(s * 0.155, -0.06, 0.215);
      cheek.rotation.y = s * 0.55;
      this.head.add(cheek);
    }
    const nose = sphere(0.02, mat(shade(c.skinTone, -0.06)), 0, -0.03, 0.258);
    this.head.add(nose);
    const smile = torus(0.036, 0.009, mat('#b5485a'), Math.PI);
    smile.position.set(0, -0.085, 0.244);
    smile.rotation.z = Math.PI;
    this.head.add(smile);

    this.buildHair(hair, c);
    this.buildAccessory(c);
    this.upper.add(this.head);
  }

  private buildHair(hair: THREE.Material, c: AvatarConfig) {
    const capGeo = new THREE.SphereGeometry(0.29, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const cap = new THREE.Mesh(capGeo, hair);
    cap.rotation.x = -0.28;
    cap.position.set(0, 0.015, -0.01);
    cap.castShadow = true;
    this.head.add(cap);
    // Bangs.
    const bangs = sphere(0.2, hair, 0, 0.14, 0.14);
    bangs.scale.set(1.25, 0.42, 0.62);
    bangs.rotation.x = 0.3;
    this.head.add(bangs);

    const shell = (thetaLength: number, radius = 0.3) => {
      const g = new THREE.SphereGeometry(radius, 32, 20, Math.PI * 0.72, Math.PI * 1.56, 0, thetaLength);
      const m = new THREE.Mesh(g, hair);
      m.castShadow = true;
      return m;
    };

    switch (c.hairStyle) {
      case 'pigtails':
        this.head.add(shell(Math.PI * 0.62));
        for (const s of [-1, 1]) {
          const tail = sphere(0.1, hair, s * 0.31, -0.06, -0.06);
          tail.scale.set(0.8, 1.25, 0.8);
          this.head.add(tail);
          const tip = sphere(0.07, hair, s * 0.34, -0.19, -0.07);
          this.head.add(tip);
          const tie = torus(0.05, 0.018, mat(c.accentColor));
          tie.position.set(s * 0.28, 0.05, -0.05);
          tie.rotation.y = Math.PI / 2;
          this.head.add(tie);
        }
        break;
      case 'bob':
        this.head.add(shell(Math.PI * 0.74));
        break;
      case 'long': {
        this.head.add(shell(Math.PI * 0.8, 0.305));
        const back = rbox(0.5, 0.42, 0.12, 0.06, hair, 0, -0.26, -0.18);
        this.head.add(back);
        break;
      }
      case 'ponytail': {
        this.head.add(shell(Math.PI * 0.58));
        const tie = torus(0.045, 0.018, mat(c.accentColor));
        tie.position.set(0, 0.16, -0.27);
        this.head.add(tie);
        const tail = capsule(0.075, 0.24, hair, 0, -0.02, -0.34);
        tail.rotation.x = 0.35;
        this.head.add(tail);
        break;
      }
      case 'curls': {
        this.head.add(shell(Math.PI * 0.66));
        for (let i = 0; i < 16; i++) {
          const a = Math.PI * 0.72 + (i / 15) * Math.PI * 1.56;
          const y = -0.05 + Math.sin(i * 1.7) * 0.05;
          const curl = sphere(0.075, hair, -Math.cos(a) * 0.29, y, Math.sin(a) * 0.29);
          this.head.add(curl);
        }
        for (let i = 0; i < 6; i++) this.head.add(sphere(0.08, hair, -0.2 + i * 0.08, 0.24, -0.02 + (i % 2) * 0.05));
        break;
      }
      case 'buns':
        this.head.add(shell(Math.PI * 0.6));
        for (const s of [-1, 1]) this.head.add(sphere(0.105, hair, s * 0.17, 0.25, -0.04));
        break;
      case 'short':
      default:
        this.head.add(shell(Math.PI * 0.52, 0.296));
        break;
    }
  }

  private buildAccessory(c: AvatarConfig) {
    const accentPink = mat(c.accessory === 'bow' ? '#e05c7a' : c.accentColor, { roughness: 0.6 });
    switch (c.accessory) {
      case 'bow': {
        const bow = new THREE.Group();
        for (const s of [-1, 1]) {
          const loop = cone(0.06, 0.12, accentPink, s * 0.06, 0, 0);
          loop.rotation.z = (s * Math.PI) / 2;
          loop.scale.z = 0.5;
          bow.add(loop);
        }
        bow.add(sphere(0.03, accentPink));
        bow.position.set(0.17, 0.22, 0.1);
        bow.rotation.z = -0.4;
        this.head.add(bow);
        break;
      }
      case 'glasses': {
        const frame = mat('#3a3346', { roughness: 0.3, metalness: 0.3 });
        for (const s of [-1, 1]) {
          const ring = torus(0.058, 0.01, frame);
          ring.position.set(s * 0.095, 0.01, 0.262);
          this.head.add(ring);
        }
        const bridge = capsule(0.008, 0.05, frame, 0, 0.02, 0.268);
        bridge.rotation.z = Math.PI / 2;
        this.head.add(bridge);
        break;
      }
      case 'flowerCrown': {
        const ring = torus(0.24, 0.018, mat('#5f9e4f'));
        ring.rotation.x = Math.PI / 2 - 0.3;
        ring.position.set(0, 0.17, -0.02);
        this.head.add(ring);
        const colors = ['#f7a1c4', '#fff1a8', '#c9a7f5', '#ffb38a', '#a8e0ff', '#f7a1c4'];
        colors.forEach((col, i) => {
          const a = (i / colors.length) * Math.PI * 2;
          this.head.add(sphere(0.04, mat(col), Math.cos(a) * 0.24, 0.17 + Math.sin(a) * 0.07, Math.sin(a) * 0.23 - 0.02));
        });
        break;
      }
      case 'headband': {
        const band = torus(0.285, 0.022, accentPink, Math.PI);
        band.position.set(0, 0.04, 0.02);
        band.rotation.set(0, Math.PI / 2, 0);
        band.rotation.x = -0.35;
        this.head.add(band);
        break;
      }
      case 'starClips': {
        for (const s of [-1, 1]) {
          const star = new THREE.Mesh(
            new THREE.ExtrudeGeometry(starShape(0.05, 0.022), { depth: 0.015, bevelEnabled: false }),
            mat('#ffd166', { emissive: '#ffb703', emissiveIntensity: 0.15 }),
          );
          star.position.set(s * 0.22, 0.17, 0.12);
          star.rotation.y = s * 0.7;
          this.head.add(star);
        }
        break;
      }
      case 'backpack': {
        const pack = rbox(0.26, 0.28, 0.12, 0.05, mat(c.accentColor), 0, 0.62 - HIP, -0.2);
        this.upper.add(pack);
        this.upper.add(rbox(0.16, 0.1, 0.04, 0.02, mat(shade(c.accentColor, -0.15)), 0, 0.56 - HIP, -0.27));
        break;
      }
      default:
        break;
    }
  }

  /** Plays a friendly wave (e.g. when greeting a teacher). */
  wave(): void {
    this.waveTime = 1.4;
  }

  hop(): void {
    this.hopTime = 0.5;
  }

  /** Does a dance or gym move; resolves when she's standing again. A new move replaces one in progress. */
  perform(move: DanceMoveId): Promise<void> {
    this.move?.done();
    return new Promise((resolve) => {
      this.move = { id: move, t: 0, nextCue: 0, done: resolve };
    });
  }

  get performing(): boolean {
    return this.move !== null;
  }

  /** Seconds a move takes. */
  static moveSeconds(move: DanceMoveId): number {
    return MOVES[move].seconds;
  }

  private readonly pivot = new THREE.Vector3();
  private readonly turned = new THREE.Vector3();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');

  private updateMove(dt: number): boolean {
    const m = this.move;
    if (!m) return false;
    const anim = MOVES[m.id];
    m.t += dt / anim.seconds;
    // (Increment outside the optional call: `?.` would skip it when nobody listens.)
    while (m.nextCue < anim.cues.length && anim.cues[m.nextCue]!.at <= m.t) {
      const cue = anim.cues[m.nextCue]!.cue;
      m.nextCue++;
      this.onMoveCue?.(cue);
    }
    if (m.t >= 1) {
      this.move = null;
      this.resetPose();
      m.done();
      return false;
    }
    const p = poseAt(m.id, m.t);
    // Whole body: lift, and turns around the pivot height (so a flip turns around her middle, not her feet).
    this.euler.set(p.flipX, p.spinY, p.rollZ);
    this.rig.quaternion.setFromEuler(this.euler);
    this.pivot.set(0, p.pivot, 0);
    this.turned.copy(this.pivot).applyQuaternion(this.rig.quaternion);
    this.rig.position.set(this.pivot.x - this.turned.x, p.lift + this.pivot.y - this.turned.y, this.pivot.z - this.turned.z);
    const spread = 1 + (1 - p.squash) * 0.5;
    this.rig.scale.set(spread, p.squash, spread);
    this.upper.rotation.set(p.lean, 0, 0);
    for (const [i, arm, limb, side] of [
      [0, this.armL, p.armL, -1],
      [1, this.armR, p.armR, 1],
    ] as const) {
      arm.rotation.set(limb.fwd, 0, side * (0.12 + limb.out));
      this.stretchArm(i, arm);
    }
    for (const [leg, limb, side] of [
      [this.legL, p.legL, -1],
      [this.legR, p.legR, 1],
    ] as const) {
      leg.rotation.set(limb.fwd, 0, side * limb.out);
    }
    this.head.rotation.set(p.headX, 0, p.headZ);
    this.torso.scale.y = 1;
    return true;
  }

  private readonly along = new THREE.Vector3();

  /**
   * Her arms are short next to her big head, so a raised arm stretches a
   * little (toy-style) to read as "arms up" instead of hiding behind her hair.
   */
  private stretchArm(i: number, arm: THREE.Group) {
    const raised = this.along.set(0, -1, 0).applyEuler(arm.rotation).y; // -1 hanging … 1 straight up
    const k = Math.max(0, Math.min(1, (raised + 0.25) / 0.9));
    const s = 1 + 0.42 * k * k * (3 - 2 * k);
    arm.scale.set(1, s, 1);
    const ends = this.armEnds[i];
    if (ends) {
      ends.hand.scale.set(1, 1 / s, 1);
      ends.puff?.scale.set(1, 1 / s, 1);
    }
  }

  private resetPose() {
    this.rig.rotation.set(0, 0, 0);
    this.rig.position.set(0, 0, 0);
    this.rig.scale.set(1, 1, 1);
    this.upper.rotation.set(0, 0, 0);
    for (const limb of [this.armL, this.armR, this.legL, this.legR]) {
      limb.rotation.set(0, 0, 0);
      limb.scale.set(1, 1, 1);
    }
    for (const e of this.armEnds) {
      e.hand.scale.set(1, 1, 1);
      e.puff?.scale.set(1, 1, 1);
    }
    this.armL.rotation.z = -0.12;
    this.armR.rotation.z = 0.12;
    this.head.rotation.set(0, 0, 0);
  }

  /** speed01: 0 idle … 1 full walk. */
  update(dt: number, speed01: number): void {
    this.time += dt;
    if (this.updateMove(dt)) {
      this.blink(dt);
      return;
    }
    this.phase += dt * (5 + speed01 * 5.5) * (speed01 > 0.05 ? 1 : 0);
    const swing = Math.sin(this.phase) * 0.6 * speed01;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;
    const bob = Math.abs(Math.sin(this.phase)) * 0.035 * speed01;
    const breathe = Math.sin(this.time * 2.2) * 0.006 * (1 - speed01);
    let hopY = 0;
    if (this.hopTime > 0) {
      this.hopTime -= dt;
      hopY = Math.sin((1 - this.hopTime / 0.5) * Math.PI) * 0.18;
    }
    this.rig.position.y = bob + hopY;
    this.torso.scale.y = 1 + breathe;
    this.head.rotation.z = Math.sin(this.time * 0.9) * 0.03 * (1 - speed01);
    this.head.rotation.x = Math.sin(this.phase * 2) * 0.03 * speed01;

    if (this.waveTime > 0) {
      this.waveTime -= dt;
      // Up and out to the side, hand waggling (out, not across her face).
      this.armR.rotation.z = 2.5;
      this.armR.rotation.x = Math.sin(this.time * 14) * 0.25;
    } else {
      this.armR.rotation.z = 0.12 + speed01 * 0.05;
    }
    this.stretchArm(1, this.armR);

    this.blink(dt);
  }

  private blink(dt: number) {
    this.blinkTimer -= dt;
    const blinking = this.blinkTimer < 0.12;
    for (const e of this.eyes) e.scale.y = blinking ? 0.12 : 1;
    if (this.blinkTimer < 0) this.blinkTimer = 2.5 + Math.random() * 3;
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry.type !== 'BufferGeometry') {
        // Geometries from the kit are shared and cached — only dispose ad-hoc ones.
        if (m.geometry.type === 'SphereGeometry' && (m.geometry as THREE.SphereGeometry).parameters.phiLength < Math.PI * 2) m.geometry.dispose();
      }
    });
  }
}
