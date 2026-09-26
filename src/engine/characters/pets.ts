/**
 * Companion pets earned through learning. They trail Izzy around the school
 * with a little personality: Pip wiggles, Bramble scurries, Ember hovers.
 */
import * as THREE from 'three';
import { dampAngle } from '../core/tween';
import { capsule, cone, mat, sphere, torus, uniqueMat } from '../render/kit';

export type PetId = 'pet.bookworm' | 'pet.hedgehog' | 'pet.dragon';

export interface PetModel {
  id: PetId;
  root: THREE.Group;
  /** Called every frame with Izzy's position/facing. */
  update(dt: number, owner: THREE.Vector3, ownerYaw: number, slot: number): void;
  celebrate(): void;
}

abstract class FollowPet implements PetModel {
  abstract id: PetId;
  readonly root = new THREE.Group();
  protected model = new THREE.Group();
  protected time = Math.random() * 5;
  protected party = 0;
  protected speed = 0;
  protected hover = 0;
  private initialized = false;

  constructor() {
    this.root.add(this.model);
  }

  celebrate(): void {
    this.party = 2;
  }

  update(dt: number, owner: THREE.Vector3, ownerYaw: number, slot: number): void {
    this.time += dt;
    // Trail behind and to the side of Izzy.
    const side = slot % 2 === 0 ? 1 : -1;
    const back = 0.9 + Math.floor(slot / 2) * 0.6;
    const target = new THREE.Vector3(
      owner.x - Math.sin(ownerYaw) * back + Math.cos(ownerYaw) * 0.55 * side,
      0,
      owner.z - Math.cos(ownerYaw) * back - Math.sin(ownerYaw) * 0.55 * side,
    );
    if (!this.initialized) {
      this.root.position.copy(target);
      this.initialized = true;
    }
    const delta = target.sub(this.root.position);
    delta.y = 0;
    const dist = delta.length();
    const desired = dist > 0.25 ? Math.min(4.5, dist * 3) : 0;
    this.speed += (desired - this.speed) * Math.min(1, dt * 6);
    if (dist > 0.001) {
      this.root.position.addScaledVector(delta.normalize(), this.speed * dt);
      if (this.speed > 0.2) this.root.rotation.y = dampAngle(this.root.rotation.y, Math.atan2(delta.x, delta.z), 6, dt);
    }
    if (this.party > 0) this.party -= dt;
    this.animate(dt, Math.min(1, this.speed / 3));
  }

  protected abstract animate(dt: number, move01: number): void;
}

class Bookworm extends FollowPet {
  id = 'pet.bookworm' as const;
  private segs: THREE.Mesh[] = [];

  constructor() {
    super();
    const green = mat('#8cc56b', { roughness: 0.6 });
    const light = mat('#b7dd8e', { roughness: 0.6 });
    for (let i = 0; i < 5; i++) {
      const seg = sphere(0.1 - i * 0.008, i % 2 ? light : green, 0, 0.1, -i * 0.14);
      this.segs.push(seg);
      this.model.add(seg);
    }
    const head = this.segs[0];
    if (head) {
      head.scale.setScalar(1.25);
      for (const s of [-1, 1]) {
        head.add(sphere(0.028, mat('#1c1410'), s * 0.045, 0.03, 0.08));
        const lens = torus(0.035, 0.007, mat('#3a3346'));
        lens.position.set(s * 0.045, 0.03, 0.095);
        head.add(lens);
        const ant = capsule(0.008, 0.08, mat('#5f8f4e'), s * 0.04, 0.12, 0);
        ant.rotation.z = -s * 0.3;
        head.add(ant);
        head.add(sphere(0.018, mat('#ffd166'), s * 0.06, 0.17, 0));
      }
      const smile = torus(0.03, 0.006, mat('#5b2a2a'), Math.PI);
      smile.rotation.z = Math.PI;
      smile.position.set(0, -0.02, 0.1);
      head.add(smile);
    }
    this.model.scale.setScalar(1.1);
  }

  protected animate(_dt: number, move: number): void {
    this.segs.forEach((s, i) => {
      s.position.y = 0.1 + Math.max(0, Math.sin(this.time * 9 - i * 0.9)) * 0.05 * (0.3 + move);
      s.position.x = Math.sin(this.time * 3 - i * 0.7) * 0.02;
    });
    this.model.position.y = this.party > 0 ? Math.abs(Math.sin(this.party * 10)) * 0.25 : 0;
  }
}

class Hedgehog extends FollowPet {
  id = 'pet.hedgehog' as const;
  private legs: THREE.Mesh[] = [];

  constructor() {
    super();
    const body = sphere(0.2, mat('#d9b48c', { roughness: 0.9 }), 0, 0.2, 0);
    body.scale.set(1, 0.8, 1.2);
    this.model.add(body);
    const spikeMat = mat('#6b4a34', { roughness: 0.9 });
    const spikeGeo = new THREE.ConeGeometry(0.035, 0.14, 6);
    const count = 70;
    const spikes = new THREE.InstancedMesh(spikeGeo, spikeMat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      // Fibonacci sphere over the back hemisphere.
      const y = 1 - (i / (count - 1)) * 1.2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const a = i * 2.39996;
      const dir = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r - 0.35).normalize();
      if (dir.z > 0.55) continue;
      q.setFromUnitVectors(up, dir);
      m.compose(new THREE.Vector3(dir.x * 0.19, 0.2 + dir.y * 0.16, dir.z * 0.23), q, new THREE.Vector3(1, 1, 1));
      spikes.setMatrixAt(i, m);
    }
    spikes.castShadow = true;
    this.model.add(spikes);
    const face = sphere(0.1, mat('#f1dcc0'), 0, 0.17, 0.2);
    face.scale.set(1, 0.9, 1.2);
    this.model.add(face);
    this.model.add(sphere(0.025, mat('#231815'), 0, 0.18, 0.32));
    for (const s of [-1, 1]) {
      this.model.add(sphere(0.02, mat('#231815'), s * 0.055, 0.23, 0.26));
      const leg = sphere(0.04, mat('#6b4a34'), s * 0.1, 0.04, s * 0.05);
      this.legs.push(leg);
      this.model.add(leg);
    }
  }

  protected animate(_dt: number, move: number): void {
    this.model.position.y = Math.abs(Math.sin(this.time * 16)) * 0.03 * move + (this.party > 0 ? Math.abs(Math.sin(this.party * 9)) * 0.2 : 0);
    this.model.rotation.z = Math.sin(this.time * 16) * 0.05 * move;
  }
}

class Dragon extends FollowPet {
  id = 'pet.dragon' as const;
  private wingL = new THREE.Group();
  private wingR = new THREE.Group();
  private tail = new THREE.Group();
  private ember: THREE.PointLight;
  private glow: THREE.MeshStandardMaterial;

  constructor() {
    super();
    const scale = mat('#e76f51', { roughness: 0.5 });
    const belly = mat('#f4c77b', { roughness: 0.6 });
    this.glow = uniqueMat('#ffd27a', { emissive: '#ff9a3c', emissiveIntensity: 0.9 });
    const wing = mat('#f2a65a', { roughness: 0.6, side: THREE.DoubleSide });
    const horn = mat('#fff1d6', { roughness: 0.4 });

    const bodyM = sphere(0.24, scale, 0, 0, 0, 28);
    bodyM.scale.set(0.95, 1, 1.2);
    const bellyM = sphere(0.19, belly, 0, -0.04, 0.1);
    bellyM.scale.set(0.9, 1, 0.8);
    const head = new THREE.Group();
    head.position.set(0, 0.26, 0.22);
    const skull = sphere(0.19, scale, 0, 0, 0, 28);
    const snout = sphere(0.12, scale, 0, -0.04, 0.14);
    snout.scale.set(1.1, 0.8, 1);
    head.add(skull, snout);
    for (const s of [-1, 1]) {
      head.add(sphere(0.045, mat('#fffaf0'), s * 0.085, 0.04, 0.14));
      head.add(sphere(0.03, mat('#1c1410'), s * 0.09, 0.045, 0.175));
      head.add(sphere(0.01, mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.5 }), s * 0.095, 0.06, 0.2));
      const h = cone(0.035, 0.14, horn, s * 0.09, 0.18, -0.05);
      h.rotation.x = -0.5;
      h.rotation.z = -s * 0.25;
      head.add(h);
      head.add(sphere(0.012, mat('#5b2a2a'), s * 0.035, -0.02, 0.26));
    }
    // Wings: membrane shape.
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(0.2, 0.35, 0.5, 0.42);
    shape.lineTo(0.42, 0.24);
    shape.lineTo(0.5, 0.12);
    shape.lineTo(0.36, 0.04);
    shape.lineTo(0.38, -0.08);
    shape.quadraticCurveTo(0.18, -0.02, 0, 0);
    const wingGeo = new THREE.ShapeGeometry(shape, 12);
    for (const [grp, s] of [
      [this.wingL, -1],
      [this.wingR, 1],
    ] as const) {
      const w = new THREE.Mesh(wingGeo, wing);
      w.rotation.y = s > 0 ? 0 : Math.PI;
      w.castShadow = true;
      grp.add(w);
      grp.position.set(s * 0.14, 0.12, -0.02);
      grp.rotation.x = -0.3;
      this.model.add(grp);
    }
    // Spine ridges.
    for (let i = 0; i < 4; i++) {
      const r = cone(0.04, 0.09, this.glow, 0, 0.23 - i * 0.04, 0.05 - i * 0.11);
      r.rotation.x = -0.4;
      this.model.add(r);
    }
    // Tail.
    this.tail.position.set(0, -0.08, -0.26);
    for (let i = 0; i < 6; i++) this.tail.add(sphere(0.09 - i * 0.012, scale, 0, -i * 0.02, -i * 0.09));
    const tip = cone(0.07, 0.12, this.glow, 0, -0.12, -0.56);
    tip.rotation.x = -Math.PI / 2;
    this.tail.add(tip);
    this.model.add(bodyM, bellyM, head, this.tail);
    for (const s of [-1, 1]) {
      const leg = sphere(0.06, scale, s * 0.13, -0.2, 0.06);
      leg.scale.set(1, 0.8, 1.3);
      this.model.add(leg);
    }
    this.ember = new THREE.PointLight('#ffb35c', 0.8, 2.2, 2);
    this.ember.position.set(0, 0.1, 0.3);
    this.model.add(this.ember);
    this.model.position.y = 0.9;
  }

  protected animate(_dt: number, move: number): void {
    const flapSpeed = 7 + move * 5 + (this.party > 0 ? 8 : 0);
    const flap = Math.sin(this.time * flapSpeed) * 0.7;
    this.wingL.rotation.z = -0.3 - flap;
    this.wingR.rotation.z = 0.3 + flap;
    this.hover = 0.95 + Math.sin(this.time * 2.4) * 0.08 + (this.party > 0 ? Math.abs(Math.sin(this.party * 5)) * 0.4 : 0);
    this.model.position.y = this.hover;
    this.model.rotation.x = move * 0.25;
    this.tail.rotation.y = Math.sin(this.time * 2) * 0.4;
    this.glow.emissiveIntensity = 0.7 + Math.sin(this.time * 3) * 0.3;
    this.ember.intensity = 0.6 + Math.sin(this.time * 5) * 0.2;
    if (this.party > 0) this.model.rotation.y = this.party * 6;
    else this.model.rotation.y = 0;
  }
}

export function createPet(id: PetId): PetModel {
  if (id === 'pet.dragon') return new Dragon();
  if (id === 'pet.hedgehog') return new Hedgehog();
  return new Bookworm();
}
