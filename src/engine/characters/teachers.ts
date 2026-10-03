/**
 * Teacher NPC models: Professor Hoot (owl), Digit (robot), Nova (red panda).
 * Each has idle motion, faces the child when she is near, and reacts
 * (greet / cheer) on cue.
 */
import * as THREE from 'three';
import { isTeacherId, TEACHER_REGISTRY, type TeacherRegistration } from '../../domain/teachers/registry';
import type { TeacherId } from '../../domain/teachers/teachers';
import { dampAngle } from '../core/tween';
import { capsule, cone, cyl, mat, rbox, sphere, torus, uniqueMat } from '../render/kit';
import { featherTexture } from '../render/textures';

export interface TeacherModel {
  id: TeacherId;
  root: THREE.Group;
  /** Height of the speech-bubble anchor above the root. */
  headHeight: number;
  update(dt: number, lookAt: THREE.Vector3 | null): void;
  greet(): void;
  cheer(): void;
}

abstract class BaseTeacher implements TeacherModel {
  abstract id: TeacherId;
  readonly root = new THREE.Group();
  protected body = new THREE.Group();
  protected time = Math.random() * 10;
  protected greetT = 0;
  protected cheerT = 0;
  protected baseYaw = 0;
  abstract headHeight: number;

  constructor(baseYaw: number) {
    this.baseYaw = baseYaw;
    this.root.add(this.body);
    this.body.rotation.y = baseYaw;
  }

  greet(): void {
    this.greetT = 1.2;
  }

  cheer(): void {
    this.cheerT = 1.6;
  }

  protected turnToward(dt: number, lookAt: THREE.Vector3 | null) {
    let target = this.baseYaw;
    if (lookAt) {
      const wp = new THREE.Vector3();
      this.root.getWorldPosition(wp);
      const dx = lookAt.x - wp.x;
      const dz = lookAt.z - wp.z;
      if (dx * dx + dz * dz < 36) target = Math.atan2(dx, dz);
    }
    this.body.rotation.y = dampAngle(this.body.rotation.y, target, 4, dt);
  }

  abstract update(dt: number, lookAt: THREE.Vector3 | null): void;
}

// ─── Professor Hoot ─────────────────────────────────────────────────────────
class Hoot extends BaseTeacher {
  id = 'hoot' as const;
  headHeight = 2.15;
  private head = new THREE.Group();
  private wingL = new THREE.Group();
  private wingR = new THREE.Group();
  private lids: THREE.Mesh[] = [];
  private blink = 2;
  private owl = new THREE.Group();

  constructor(baseYaw: number) {
    super(baseYaw);
    const brown = mat('#8b6b4a', { roughness: 0.9 });
    const darkBrown = mat('#6a4e35', { roughness: 0.9 });
    const cream = new THREE.MeshStandardMaterial({ map: featherTexture('#f1dfbf', '#caa77a'), roughness: 0.95 });
    const gold = mat('#d9a441', { metalness: 0.7, roughness: 0.3 });

    // Lectern perch (walnut) with an open book.
    const wood = mat('#7a5236', { roughness: 0.6 });
    const post = cyl(0.12, 0.16, 0.9, wood, 0, 0.45, 0);
    const foot = cyl(0.36, 0.42, 0.08, wood, 0, 0.04, 0);
    const top = rbox(0.8, 0.08, 0.5, 0.03, wood, 0, 0.92, 0);
    const pages = rbox(0.56, 0.04, 0.36, 0.02, mat('#fffaf0'), 0, 0.98, 0.04);
    pages.rotation.x = -0.12;
    const perch = cyl(0.04, 0.04, 0.7, darkBrown, 0, 1.02, -0.18);
    perch.rotation.z = Math.PI / 2;
    this.body.add(post, foot, top, pages, perch);

    // Owl.
    this.owl.position.set(0, 1.05, -0.18);
    const torso = sphere(0.36, brown, 0, 0.42, 0, 32);
    torso.scale.set(1, 1.2, 0.92);
    const belly = sphere(0.3, cream, 0, 0.38, 0.1, 32);
    belly.scale.set(0.95, 1.1, 0.7);
    // Tweed vest + bow tie.
    const vest = sphere(0.345, mat('#5d6b3f', { roughness: 0.95 }), 0, 0.34, 0.03, 32);
    vest.scale.set(1.02, 0.8, 0.9);
    const vestCut = sphere(0.24, cream, 0, 0.48, 0.19);
    vestCut.scale.set(0.7, 1.05, 0.5);
    const tie = new THREE.Group();
    for (const s of [-1, 1]) {
      const w = cone(0.055, 0.12, mat('#b8433a'), s * 0.055, 0, 0);
      w.rotation.z = (s * Math.PI) / 2;
      w.scale.z = 0.45;
      tie.add(w);
    }
    tie.add(sphere(0.028, mat('#b8433a')));
    tie.position.set(0, 0.69, 0.25);
    for (const s of [-1, 1]) {
      const foot2 = sphere(0.06, mat('#e9a13b'), s * 0.12, 0.03, 0.18);
      foot2.scale.set(1.2, 0.5, 1.4);
      this.owl.add(foot2);
    }
    this.owl.add(torso, vest, belly, vestCut, tie);

    // Wings.
    for (const [wing, s] of [
      [this.wingL, -1],
      [this.wingR, 1],
    ] as const) {
      wing.position.set(s * 0.33, 0.62, -0.02);
      const w = sphere(0.2, darkBrown, s * 0.03, -0.2, 0);
      w.scale.set(0.35, 1.1, 0.8);
      wing.add(w);
      this.owl.add(wing);
    }

    // Head.
    this.head.position.set(0, 0.98, 0);
    const skull = sphere(0.32, brown, 0, 0, 0, 32);
    skull.scale.set(1.08, 0.92, 0.95);
    this.head.add(skull);
    for (const s of [-1, 1]) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.15, 28), mat('#f1dfbf', { roughness: 1 }));
      disc.position.set(s * 0.12, 0.02, 0.275);
      disc.rotation.y = s * 0.3;
      this.head.add(disc);
      const eyeWhite = sphere(0.1, mat('#fffdf5', { roughness: 0.2 }), s * 0.12, 0.03, 0.27);
      eyeWhite.scale.z = 0.5;
      const iris = sphere(0.062, mat('#e8a33b', { roughness: 0.2 }), s * 0.12, 0.03, 0.31);
      iris.scale.z = 0.4;
      const pupil = sphere(0.036, mat('#1c1410', { roughness: 0.1 }), s * 0.12, 0.03, 0.33);
      pupil.scale.z = 0.4;
      const glint = sphere(0.013, mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.5 }), s * 0.12 + 0.02, 0.06, 0.345);
      const lid = sphere(0.104, uniqueMat('#8b6b4a'), s * 0.12, 0.03, 0.27);
      lid.scale.set(1, 0.05, 0.55);
      lid.visible = false;
      this.lids.push(lid);
      const rim = torus(0.105, 0.014, gold);
      rim.position.set(s * 0.12, 0.03, 0.335);
      this.head.add(eyeWhite, iris, pupil, glint, lid, rim);
      const tuft = cone(0.07, 0.22, darkBrown, s * 0.22, 0.27, -0.02);
      tuft.rotation.z = -s * 0.5;
      this.head.add(tuft);
    }
    const bridge = capsule(0.01, 0.04, gold, 0, 0.05, 0.34);
    bridge.rotation.z = Math.PI / 2;
    const beak = cone(0.05, 0.13, mat('#e9a13b', { roughness: 0.5 }), 0, -0.08, 0.31);
    beak.rotation.x = Math.PI + 0.35;
    this.head.add(bridge, beak);
    this.owl.add(this.head);
    this.body.add(this.owl);
  }

  update(dt: number, lookAt: THREE.Vector3 | null): void {
    this.time += dt;
    this.turnToward(dt, lookAt);
    this.owl.position.y = 1.05 + Math.sin(this.time * 1.6) * 0.012;
    this.head.rotation.z = Math.sin(this.time * 0.7) * 0.12;
    this.head.rotation.y = Math.sin(this.time * 0.45) * 0.2;
    let flap = 0;
    if (this.greetT > 0) {
      this.greetT -= dt;
      flap = Math.abs(Math.sin(this.greetT * 14)) * 0.9;
      this.owl.position.y += Math.abs(Math.sin(this.greetT * 7)) * 0.06;
    }
    if (this.cheerT > 0) {
      this.cheerT -= dt;
      flap = Math.max(flap, Math.abs(Math.sin(this.cheerT * 16)) * 1.1);
      this.owl.position.y += Math.abs(Math.sin(this.cheerT * 9)) * 0.1;
    }
    this.wingL.rotation.z = -flap;
    this.wingR.rotation.z = flap;
    this.blink -= dt;
    const closed = this.blink < 0.14;
    for (const l of this.lids) {
      l.visible = closed;
      l.scale.y = closed ? 1 : 0.05;
    }
    if (this.blink < 0) this.blink = 2 + Math.random() * 3.5;
  }
}

// ─── Digit ─────────────────────────────────────────────────────────────────
class Digit extends BaseTeacher {
  id = 'digit' as const;
  headHeight = 1.75;
  private bot = new THREE.Group();
  private eyes: THREE.Mesh[] = [];
  private antennaBall: THREE.Mesh;
  private ring: THREE.Mesh;
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private blink = 2;

  constructor(baseYaw: number) {
    super(baseYaw);
    const shell = mat('#f4f1ea', { roughness: 0.35 });
    const teal = mat('#4aa3a8', { roughness: 0.4 });
    const screen = mat('#1c2a33', { roughness: 0.25 });
    this.bot.position.y = 0.25;

    const base = cyl(0.26, 0.3, 0.12, teal, 0, 0.1, 0);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 10, 40), uniqueMat('#7ff5ff', { emissive: '#35e0f0', emissiveIntensity: 1.6 }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.03;
    const body = rbox(0.56, 0.5, 0.46, 0.14, shell, 0, 0.44, 0);
    const belly = rbox(0.34, 0.2, 0.05, 0.05, teal, 0, 0.4, 0.22);
    const dial = cyl(0.045, 0.045, 0.03, mat('#ffcf5c', { emissive: '#ffae00', emissiveIntensity: 0.3 }), 0.08, 0.42, 0.25);
    dial.rotation.x = Math.PI / 2;
    const dial2 = cyl(0.03, 0.03, 0.03, mat('#ef6f6c'), -0.08, 0.42, 0.25);
    dial2.rotation.x = Math.PI / 2;
    const neck = cyl(0.08, 0.1, 0.08, teal, 0, 0.72, 0);
    const head = rbox(0.62, 0.44, 0.44, 0.16, shell, 0, 0.96, 0);
    const face = rbox(0.5, 0.32, 0.04, 0.1, screen, 0, 0.97, 0.235);
    for (const s of [-1, 1]) {
      const eye = rbox(0.09, 0.12, 0.02, 0.04, uniqueMat('#8ff7ff', { emissive: '#35e0f0', emissiveIntensity: 2 }), s * 0.11, 1.0, 0.258);
      this.eyes.push(eye);
      this.bot.add(eye);
      const earBolt = cyl(0.06, 0.06, 0.06, teal, s * 0.33, 0.96, 0);
      earBolt.rotation.z = Math.PI / 2;
      this.bot.add(earBolt);
    }
    const mouth = torus(0.05, 0.012, mat('#8ff7ff', { emissive: '#35e0f0', emissiveIntensity: 1.5 }), Math.PI);
    mouth.rotation.z = Math.PI;
    mouth.position.set(0, 0.905, 0.258);
    const stalk = cyl(0.012, 0.012, 0.2, mat('#9aa7ad', { metalness: 0.7, roughness: 0.3 }), 0, 1.27, 0);
    this.antennaBall = sphere(0.05, uniqueMat('#ffd35c', { emissive: '#ffb000', emissiveIntensity: 1.5 }), 0, 1.39, 0);
    this.bot.add(base, body, belly, dial, dial2, neck, head, face, mouth, stalk, this.antennaBall);
    for (const [arm, s] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      arm.position.set(s * 0.3, 0.58, 0);
      arm.add(capsule(0.045, 0.2, teal, s * 0.02, -0.14, 0));
      arm.add(sphere(0.07, shell, s * 0.03, -0.3, 0));
      arm.rotation.z = s * 0.25;
      this.bot.add(arm);
    }
    this.body.add(this.bot, this.ring);
  }

  update(dt: number, lookAt: THREE.Vector3 | null): void {
    this.time += dt;
    this.turnToward(dt, lookAt);
    this.bot.position.y = 0.25 + Math.sin(this.time * 2.2) * 0.04;
    const glow = 1.2 + Math.sin(this.time * 3) * 0.4;
    (this.ring.material as THREE.MeshStandardMaterial).emissiveIntensity = glow;
    (this.antennaBall.material as THREE.MeshStandardMaterial).emissiveIntensity = 1 + Math.max(0, Math.sin(this.time * 4)) * 1.5;
    let wave = 0;
    if (this.greetT > 0) {
      this.greetT -= dt;
      wave = 1;
    }
    if (this.cheerT > 0) {
      this.cheerT -= dt;
      this.bot.rotation.y = Math.sin(this.cheerT * 10) * 0.4;
      this.bot.position.y += Math.abs(Math.sin(this.cheerT * 8)) * 0.15;
      wave = 1;
    } else this.bot.rotation.y = 0;
    this.armR.rotation.z = wave ? -2.2 + Math.sin(this.time * 12) * 0.3 : 0.25;
    this.armL.rotation.z = this.cheerT > 0 ? 2.2 - Math.sin(this.time * 12) * 0.3 : -0.25;
    this.blink -= dt;
    const closed = this.blink < 0.1;
    for (const e of this.eyes) e.scale.y = closed ? 0.15 : this.cheerT > 0 ? 0.55 : 1;
    if (this.blink < 0) this.blink = 2.5 + Math.random() * 3;
  }
}

// ─── Nova ──────────────────────────────────────────────────────────────────
class Nova extends BaseTeacher {
  id = 'nova' as const;
  headHeight = 1.85;
  private head = new THREE.Group();
  private tail = new THREE.Group();
  private armR = new THREE.Group();
  private eyes: THREE.Mesh[] = [];
  private panda = new THREE.Group();
  private blink = 2.5;

  constructor(baseYaw: number) {
    super(baseYaw);
    const fur = mat('#c65d3b', { roughness: 0.9 });
    const dark = mat('#4a2a22', { roughness: 0.9 });
    const white = mat('#fbf4ea', { roughness: 0.9 });
    const coat = mat('#fbfbf7', { roughness: 0.85 });

    // Legs + feet.
    for (const s of [-1, 1]) {
      this.panda.add(capsule(0.07, 0.16, dark, s * 0.1, 0.18, 0));
      const f = sphere(0.08, dark, s * 0.1, 0.05, 0.05);
      f.scale.set(1, 0.6, 1.3);
      this.panda.add(f);
    }
    // Lab coat body.
    const bodyCoat = cyl(0.2, 0.28, 0.55, coat, 0, 0.55, 0, 28);
    const chest = sphere(0.2, fur, 0, 0.8, 0.02);
    chest.scale.set(1, 0.7, 0.9);
    const lapelL = rbox(0.08, 0.3, 0.02, 0.01, mat('#eceee9'), -0.07, 0.68, 0.2);
    lapelL.rotation.z = 0.25;
    const lapelR = rbox(0.08, 0.3, 0.02, 0.01, mat('#eceee9'), 0.07, 0.68, 0.2);
    lapelR.rotation.z = -0.25;
    const pocket = rbox(0.1, 0.08, 0.02, 0.01, mat('#eceee9'), 0.12, 0.5, 0.24);
    const pens = [0, 1].map((i) => rbox(0.015, 0.07, 0.015, 0.005, mat(i ? '#7fc8c0' : '#e3b448'), 0.1 + i * 0.03, 0.55, 0.245));
    this.panda.add(bodyCoat, chest, lapelL, lapelR, pocket, ...pens);

    // Arms.
    const armL = new THREE.Group();
    armL.position.set(-0.24, 0.78, 0);
    armL.add(capsule(0.06, 0.22, coat, 0, -0.14, 0));
    armL.add(sphere(0.06, dark, 0, -0.3, 0.02));
    armL.rotation.z = -0.2;
    this.armR.position.set(0.24, 0.78, 0);
    this.armR.add(capsule(0.06, 0.22, coat, 0, -0.14, 0));
    this.armR.add(sphere(0.06, dark, 0, -0.3, 0.02));
    // Flask in hand.
    const flask = new THREE.Group();
    flask.add(cone(0.06, 0.1, mat('#bfe9e4', { transparent: true, opacity: 0.6, roughness: 0.05 }), 0, 0, 0));
    flask.add(cyl(0.05, 0.05, 0.03, mat('#63d2c4', { emissive: '#2fb9a8', emissiveIntensity: 0.6 }), 0, -0.03, 0));
    flask.position.set(0.02, -0.38, 0.05);
    this.armR.add(flask);
    this.armR.rotation.z = 0.35;
    this.armR.rotation.x = -0.5;
    this.panda.add(armL, this.armR);

    // Head.
    this.head.position.y = 1.2;
    const skull = sphere(0.3, fur, 0, 0, 0, 32);
    skull.scale.set(1.1, 0.95, 0.95);
    const muzzle = sphere(0.14, white, 0, -0.08, 0.2);
    muzzle.scale.set(1.2, 0.8, 0.9);
    const nose = sphere(0.04, mat('#231815', { roughness: 0.3 }), 0, -0.04, 0.32);
    nose.scale.set(1.3, 0.8, 1);
    this.head.add(skull, muzzle, nose);
    for (const s of [-1, 1]) {
      const brow = sphere(0.055, white, s * 0.13, 0.09, 0.24);
      brow.scale.set(1.2, 0.7, 0.5);
      const cheek = sphere(0.09, white, s * 0.2, -0.08, 0.14);
      cheek.scale.set(1, 0.8, 0.8);
      const tear = capsule(0.03, 0.08, dark, s * 0.14, -0.06, 0.24);
      tear.rotation.z = s * 0.3;
      const eye = sphere(0.045, mat('#1c1410', { roughness: 0.15 }), s * 0.12, 0.02, 0.27);
      eye.scale.z = 0.6;
      this.eyes.push(eye);
      const glint = sphere(0.012, mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.5 }), s * 0.12 + 0.015, 0.04, 0.3);
      const ear = cone(0.11, 0.16, fur, s * 0.22, 0.26, -0.02);
      ear.rotation.z = -s * 0.45;
      const earIn = cone(0.07, 0.1, white, s * 0.215, 0.25, 0.02);
      earIn.rotation.z = -s * 0.45;
      this.head.add(brow, cheek, tear, eye, glint, ear, earIn);
    }
    // Goggles on the forehead.
    const strap = torus(0.29, 0.02, mat('#3b3b4a'), Math.PI * 1.1);
    strap.rotation.x = -0.4;
    strap.position.y = 0.12;
    for (const s of [-1, 1]) {
      const lens = cyl(0.07, 0.07, 0.05, mat('#9fe6f0', { emissive: '#3fc4d6', emissiveIntensity: 0.25, roughness: 0.1 }), s * 0.09, 0.2, 0.22);
      lens.rotation.x = Math.PI / 2 - 0.5;
      const rim = torus(0.072, 0.016, mat('#c9a24a', { metalness: 0.7, roughness: 0.3 }));
      rim.position.set(s * 0.09, 0.2, 0.235);
      rim.rotation.x = -0.5;
      this.head.add(lens, rim);
    }
    this.head.add(strap);
    this.panda.add(this.head);

    // Ringed tail.
    this.tail.position.set(0, 0.35, -0.2);
    for (let i = 0; i < 7; i++) {
      const seg = sphere(0.11 - i * 0.004, i % 2 ? dark : fur, 0, i * 0.08, -i * 0.07);
      seg.scale.set(1, 0.9, 1.1);
      this.tail.add(seg);
    }
    this.panda.add(this.tail);
    this.body.add(this.panda);
  }

  update(dt: number, lookAt: THREE.Vector3 | null): void {
    this.time += dt;
    this.turnToward(dt, lookAt);
    this.tail.rotation.z = Math.sin(this.time * 1.8) * 0.35;
    this.tail.rotation.x = -0.3 + Math.sin(this.time * 1.1) * 0.1;
    this.head.rotation.z = Math.sin(this.time * 0.8) * 0.15;
    this.panda.position.y = 0;
    if (this.greetT > 0) {
      this.greetT -= dt;
      this.panda.position.y = Math.abs(Math.sin(this.greetT * 8)) * 0.08;
      this.head.rotation.z = 0.3;
    }
    if (this.cheerT > 0) {
      this.cheerT -= dt;
      this.panda.position.y = Math.abs(Math.sin(this.cheerT * 9)) * 0.14;
      this.armR.rotation.z = 2.4;
    } else this.armR.rotation.z = 0.35;
    this.blink -= dt;
    for (const e of this.eyes) e.scale.y = this.blink < 0.12 ? 0.12 : 1;
    if (this.blink < 0) this.blink = 2 + Math.random() * 3;
  }
}

const MODEL_FACTORIES: Record<TeacherRegistration['scene']['model'], (yaw: number) => TeacherModel> = {
  owl: (yaw) => new Hoot(yaw),
  robot: (yaw) => new Digit(yaw),
  panda: (yaw) => new Nova(yaw),
};
export function createTeacher(id: TeacherId, baseYaw: number): TeacherModel {
  if (!isTeacherId(id)) throw new Error('Unknown teacher model');
  return MODEL_FACTORIES[TEACHER_REGISTRY[id].scene.model](baseYaw);
}
