/**
 * Lightweight particle effects: sparkle bursts, celebration confetti and
 * drifting dust motes in the sunbeams. Used sparingly, for moments that matter.
 */
import * as THREE from 'three';
import { radialTexture } from '../render/textures';

interface Burst {
  points: THREE.Points;
  velocities: Float32Array;
  life: number;
  maxLife: number;
  gravity: number;
}

interface ConfettiPiece {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  color: THREE.Color;
}

export class Particles {
  readonly root = new THREE.Group();
  private bursts: Burst[] = [];
  private sprite = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64);
  private confetti: THREE.InstancedMesh;
  private pieces: ConfettiPiece[] = [];
  private confettiLife = 0;
  private motes: THREE.Points;
  private moteBase: Float32Array;
  private time = 0;
  private dummy = new THREE.Object3D();

  constructor() {
    this.confetti = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.07, 0.11),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }),
      260,
    );
    this.confetti.count = 0;
    this.confetti.frustumCulled = false;
    this.root.add(this.confetti);

    // Dust motes drifting through the north-window sunbeams.
    const count = 220;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const beam = i % 3;
      const cx = beam === 0 ? -3.6 : beam === 1 ? 3.6 : 9.5;
      pos[i * 3] = cx + (Math.random() - 0.5) * 2.6;
      pos[i * 3 + 1] = 0.4 + Math.random() * 3.2;
      pos[i * 3 + 2] = -9.3 + Math.random() * 3.4;
    }
    this.moteBase = pos.slice();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.035,
        map: this.sprite,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        color: '#fff2c9',
        blending: THREE.AdditiveBlending,
      }),
    );
    this.root.add(this.motes);
  }

  setMotesVisible(v: boolean): void {
    this.motes.visible = v;
  }

  sparkle(at: THREE.Vector3, opts: { count?: number; color?: string; speed?: number; size?: number; gravity?: number; life?: number } = {}): void {
    const count = opts.count ?? 40;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const base = new THREE.Color(opts.color ?? '#ffe29a');
    const alt = new THREE.Color('#ffffff');
    for (let i = 0; i < count; i++) {
      positions[i * 3] = at.x;
      positions[i * 3 + 1] = at.y;
      positions[i * 3 + 2] = at.z;
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize();
      const sp = (opts.speed ?? 2.2) * (0.4 + Math.random() * 0.8);
      velocities[i * 3] = dir.x * sp;
      velocities[i * 3 + 1] = dir.y * sp;
      velocities[i * 3 + 2] = dir.z * sp;
      const c = base.clone().lerp(alt, Math.random() * 0.6);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: opts.size ?? 0.16,
        map: this.sprite,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    points.frustumCulled = false;
    this.root.add(points);
    const life = opts.life ?? 1.3;
    this.bursts.push({ points, velocities, life, maxLife: life, gravity: opts.gravity ?? 2.5 });
  }

  confettiShower(center: THREE.Vector3, radius = 3): void {
    const palette = ['#e07a5f', '#f2cc8f', '#81b29a', '#3d85c6', '#f15bb5', '#ffd166', '#9b5de5'];
    this.pieces = [];
    for (let i = 0; i < 260; i++) {
      this.pieces.push({
        pos: new THREE.Vector3(
          center.x + (Math.random() - 0.5) * radius * 2,
          center.y + 3 + Math.random() * 2.5,
          center.z + (Math.random() - 0.5) * radius * 2,
        ),
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, -0.8 - Math.random() * 0.8, (Math.random() - 0.5) * 0.6),
        rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        color: new THREE.Color(palette[i % palette.length]),
      });
    }
    this.confetti.count = this.pieces.length;
    this.pieces.forEach((p, i) => this.confetti.setColorAt(i, p.color));
    if (this.confetti.instanceColor) this.confetti.instanceColor.needsUpdate = true;
    this.confettiLife = 5;
  }

  update(dt: number): void {
    this.time += dt;
    const alive: Burst[] = [];
    for (const b of this.bursts) {
      b.life -= dt;
      const attr = b.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < arr.length / 3; i++) {
        b.velocities[i * 3 + 1] = (b.velocities[i * 3 + 1] ?? 0) - b.gravity * dt;
        arr[i * 3] = (arr[i * 3] ?? 0) + (b.velocities[i * 3] ?? 0) * dt;
        arr[i * 3 + 1] = (arr[i * 3 + 1] ?? 0) + (b.velocities[i * 3 + 1] ?? 0) * dt;
        arr[i * 3 + 2] = (arr[i * 3 + 2] ?? 0) + (b.velocities[i * 3 + 2] ?? 0) * dt;
      }
      attr.needsUpdate = true;
      (b.points.material as THREE.PointsMaterial).opacity = Math.max(0, b.life / b.maxLife);
      if (b.life > 0) alive.push(b);
      else {
        this.root.remove(b.points);
        b.points.geometry.dispose();
        (b.points.material as THREE.Material).dispose();
      }
    }
    this.bursts = alive;

    if (this.confettiLife > 0) {
      this.confettiLife -= dt;
      this.pieces.forEach((p, i) => {
        p.vel.x += Math.sin(this.time * 3 + i) * 0.02;
        p.pos.addScaledVector(p.vel, dt);
        p.rot.x += p.spin.x * dt;
        p.rot.y += p.spin.y * dt;
        p.rot.z += p.spin.z * dt;
        this.dummy.position.copy(p.pos);
        this.dummy.rotation.copy(p.rot);
        this.dummy.scale.setScalar(p.pos.y < 0.02 ? 0 : 1);
        this.dummy.updateMatrix();
        this.confetti.setMatrixAt(i, this.dummy.matrix);
      });
      this.confetti.instanceMatrix.needsUpdate = true;
      if (this.confettiLife <= 0) this.confetti.count = 0;
    }

    if (this.motes.visible) {
      const attr = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < arr.length / 3; i++) {
        arr[i * 3] = (this.moteBase[i * 3] ?? 0) + Math.sin(this.time * 0.3 + i) * 0.15;
        arr[i * 3 + 1] = (this.moteBase[i * 3 + 1] ?? 0) + Math.sin(this.time * 0.2 + i * 1.7) * 0.2;
      }
      attr.needsUpdate = true;
    }
  }
}
