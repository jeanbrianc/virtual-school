/**
 * The 1–10 numbers on the classroom rug as a dance & gym circuit (like the
 * stations in her dance and gymnastics classes). This is the world side only:
 * where each number is, which one she's standing on, a glowing ring and a
 * bouncing star on the number to find next, a flash when she lands, and the
 * little start flag. What each number does is the game's business.
 */
import * as THREE from 'three';
import { ROUNDED } from '../../shared/coverPainter';
import { PALETTE } from '../palette';
import { cyl, mat, sphere } from '../render/kit';
import { canvasTexture, CLASSROOM_RUG_CANVAS, rugNumberSpots } from '../render/textures';
import { CLASSROOM_RUG } from './classroom';
import type { BuildContext, Feature } from './types';

/** How close to a number's middle counts as standing on it (the painted circle is ~0.3). */
export const TILE_RADIUS = 0.4;

export interface MatTile {
  n: number;
  x: number;
  z: number;
}

/** The numbers' spots in the world, from the rug's own layout. */
export function matTiles(): MatTile[] {
  return rugNumberSpots().map(({ n, u, v }) => ({
    n,
    x: CLASSROOM_RUG.x + (u - 0.5) * CLASSROOM_RUG.width,
    z: CLASSROOM_RUG.z + (v - 0.5) * CLASSROOM_RUG.depth,
  }));
}

/** The number at (x, z), or null. */
export function tileAt(tiles: readonly MatTile[], x: number, z: number): number | null {
  for (const t of tiles) if (Math.hypot(t.x - x, t.z - z) <= TILE_RADIUS) return t.n;
  return null;
}

function starTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? w * 0.44 : w * 0.19;
      ctx.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = '#ffc93c';
    ctx.fill();
  });
}

function ringMaterial(color: string): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
}

export class DanceMat implements Feature {
  readonly tiles = matTiles();
  /** Where the start flag stands (left edge of the rug, between numbers 1 and 6). */
  readonly flagAt: THREE.Vector3;
  private readonly glow: THREE.Mesh;
  private readonly star: THREE.Sprite;
  private readonly flashes: { mesh: THREE.Mesh; life: number }[] = [];
  private next: number | null = null;
  private time = 0;

  constructor(ctx: BuildContext) {
    const radius = (CLASSROOM_RUG_CANVAS.numberRadius / CLASSROOM_RUG_CANVAS.w) * CLASSROOM_RUG.width;
    this.glow = new THREE.Mesh(new THREE.RingGeometry(radius + 0.04, radius + 0.13, 40), ringMaterial('#ffd46b'));
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.renderOrder = 4;
    this.glow.visible = false;
    ctx.add(this.glow);

    this.star = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexture(), transparent: true, depthWrite: false }));
    this.star.scale.setScalar(0.34);
    this.star.renderOrder = 19;
    this.star.visible = false;
    ctx.add(this.star);

    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(radius * 0.8, radius, 40), ringMaterial('#fff1c4'));
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 4;
      mesh.visible = false;
      ctx.add(mesh);
      this.flashes.push({ mesh, life: 0 });
    }

    // The start flag: a little striped pennant, like the cones and flags at gym class.
    const t1 = this.tiles[0]!;
    const t6 = this.tiles[5]!;
    this.flagAt = new THREE.Vector3(CLASSROOM_RUG.x - CLASSROOM_RUG.width / 2 + 0.22, 0, (t1.z + t6.z) / 2);
    const flag = new THREE.Group();
    flag.position.copy(this.flagAt);
    flag.add(cyl(0.13, 0.15, 0.05, mat(PALETTE.oak, { roughness: 0.6 }), 0, 0.025, 0));
    flag.add(cyl(0.022, 0.022, 1.15, mat('#fffaf0', { roughness: 0.5 }), 0, 0.6, 0, 10));
    flag.add(sphere(0.045, mat(PALETTE.mustard, { roughness: 0.4 }), 0, 1.2, 0, 14));
    const pennantTex = canvasTexture(256, 160, (c, w, h) => {
      const stripes = [PALETTE.terracotta, PALETTE.mustard, '#7fc8c0', '#9b8ec9'];
      stripes.forEach((col, i) => {
        c.fillStyle = col;
        c.fillRect(0, (i * h) / stripes.length, w, h / stripes.length + 1);
      });
      c.fillStyle = '#fffaf0';
      c.font = `700 64px ${ROUNDED}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('1→10', w * 0.36, h / 2 + 2);
    });
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.32);
    shape.lineTo(0.56, 0.16);
    shape.lineTo(0, 0);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    // ShapeGeometry UVs are the raw shape coordinates; stretch them over the texture.
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 0.56, uv.getY(i) / 0.32);
    const pennant = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: pennantTex, roughness: 0.8, side: THREE.DoubleSide }));
    pennant.position.set(0.02, 0.84, 0);
    pennant.rotation.y = -0.5;
    pennant.castShadow = true;
    flag.add(pennant);
    ctx.add(flag);
    ctx.collide(this.flagAt.x, this.flagAt.z, 0.2, 0.2);
    ctx.interact({
      id: 'circuit',
      kind: 'object',
      label: 'Dance circuit!',
      icon: '🤸',
      position: this.flagAt.clone(),
      // Just off the rug beside the flag, so she doesn't hide number 1 from the camera.
      approach: new THREE.Vector3(this.flagAt.x - 0.5, 0, this.flagAt.z + 0.1),
      radius: 0.8,
      object: flag,
      markerHeight: 1.6,
    });
  }

  apply(): void {
    // Nothing to unlock: the circuit is there from day one.
  }

  tileAt(x: number, z: number): number | null {
    return tileAt(this.tiles, x, z);
  }

  center(n: number): THREE.Vector3 {
    const t = this.tiles[n - 1] ?? this.tiles[0]!;
    return new THREE.Vector3(t.x, 0, t.z);
  }

  /** Glow + bouncing star on the number to find next (null hides them). */
  setNext(n: number | null): void {
    this.next = n !== null && n >= 1 && n <= this.tiles.length ? n : null;
    this.glow.visible = this.next !== null;
    this.star.visible = this.next !== null;
    if (this.next !== null) {
      const c = this.center(this.next);
      this.glow.position.set(c.x, 0.025, c.z);
      this.star.position.set(c.x, 0.75, c.z);
    }
  }

  get nextNumber(): number | null {
    return this.next;
  }

  /** A ripple on the number she just landed on. */
  flash(n: number): void {
    const f = this.flashes.reduce((a, b) => (b.life < a.life ? b : a));
    const c = this.center(n);
    f.mesh.position.set(c.x, 0.03, c.z);
    f.life = 1;
    f.mesh.visible = true;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.next !== null) {
      const pulse = 1 + Math.sin(this.time * 5) * 0.07;
      this.glow.scale.set(pulse, pulse, 1);
      (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.7 + Math.sin(this.time * 5) * 0.25;
      const c = this.center(this.next);
      this.star.position.y = 0.75 + Math.abs(Math.sin(this.time * 3.2)) * 0.28;
      this.star.position.x = c.x;
      this.star.position.z = c.z;
    }
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life = Math.max(0, f.life - dt / 0.7);
      const k = 1 - f.life;
      const s = 1 + k * 1.6;
      f.mesh.scale.set(s, s, 1);
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = f.life;
      if (f.life <= 0) f.mesh.visible = false;
    }
  }
}
