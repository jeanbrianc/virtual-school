/**
 * Architectural shell: floor, walls with window/door openings, trim,
 * exterior grounds, backdrop and the shadow-only ceiling that makes sunlight
 * pour in through the windows. Walls facing the camera cut away to wainscot
 * height (dollhouse view) so Izzy is never hidden.
 */
import * as THREE from 'three';
import { CollisionWorld } from '../core/collision';
import { box, glassMat, mat } from '../render/kit';
import { beadboardTexture, canvasTexture, landscapeTexture, wallpaperTexture, woodFloorTexture } from '../render/textures';
import { LAYOUT, PALETTE } from '../palette';

export type WallSide = 'north' | 'south' | 'east' | 'west';

export interface CutawayWall {
  side: WallSide;
  /** Everything above the split height on this wall. */
  upper: THREE.Group;
  outward: THREE.Vector3;
  amount: number;
  /** Height the wall folds down to when cut away. */
  split: number;
}

interface Opening {
  from: number;
  to: number;
  bottom: number;
  top: number;
  kind: 'window' | 'door' | 'arch';
}

const WAINSCOT_H = 1.2;

/** Rescales a BoxGeometry's UVs so textures tile in world units. */
function worldUVs(geo: THREE.BoxGeometry, w: number, h: number, d: number, tile: number): THREE.BoxGeometry {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  // Face order: +x, -x, +y, -y, +z, -z (4 verts each).
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = dims[f] ?? [1, 1];
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, (uv.getX(idx) * su) / tile, (uv.getY(idx) * sv) / tile);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

export class Structure {
  readonly root = new THREE.Group();
  readonly cutaways: CutawayWall[] = [];
  readonly collisions = new CollisionWorld();
  private wallMat: THREE.MeshStandardMaterial;
  private wainscotMat: THREE.MeshStandardMaterial;
  private exteriorMat = mat('#efe2c8', { roughness: 0.95 });
  private capMat = mat(PALETTE.walnut, { roughness: 0.7 });
  private trimMat = mat(PALETTE.trim, { roughness: 0.6 });
  private baseMat = mat(PALETTE.walnutDark, { roughness: 0.6 });
  readonly glass = glassMat('#e3f4f5', 0.22);

  constructor() {
    const wallTex = wallpaperTexture();
    wallTex.repeat.set(1, 1);
    this.wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.92 });
    const bead = beadboardTexture();
    bead.repeat.set(1, 1);
    this.wainscotMat = new THREE.MeshStandardMaterial({ map: bead, roughness: 0.75 });

    this.buildGrounds();
    this.buildFloor();
    this.buildWalls();
    this.buildWindowLight();
  }

  private buildGrounds() {
    const grassTex = canvasTexture(
      256,
      256,
      (ctx, w, h) => {
        ctx.fillStyle = '#8fb86c';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 1400; i++) {
          ctx.fillStyle = Math.random() < 0.5 ? 'rgba(70,110,50,0.25)' : 'rgba(190,220,140,0.25)';
          ctx.fillRect(Math.random() * w, Math.random() * h, 2, 5);
        }
      },
      { repeat: [40, 40] },
    );
    const grass = new THREE.Mesh(new THREE.CircleGeometry(70, 48), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.02;
    grass.receiveShadow = true;
    this.root.add(grass);

    const backdrop = new THREE.Mesh(
      new THREE.CylinderGeometry(62, 62, 26, 64, 1, true),
      new THREE.MeshBasicMaterial({ map: landscapeTexture(), side: THREE.BackSide, fog: false }),
    );
    backdrop.position.set(4, 9, 0);
    this.root.add(backdrop);

    // Stepping-stone path to the front door.
    const stone = mat('#d8cbb3', { roughness: 0.95 });
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.06, 18), stone);
      s.position.set(Math.sin(i * 1.3) * 0.4, 0.0, 11.2 + i * 1.1);
      s.scale.x = 1.3;
      s.receiveShadow = true;
      this.root.add(s);
    }
  }

  private buildFloor() {
    const { minX, maxX, minZ, maxZ } = LAYOUT.hall;
    const w = maxX - minX;
    const d = maxZ - minZ;
    const tex = woodFloorTexture();
    tex.repeat.set(w / 2.4, d / 2.4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.02 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    floor.receiveShadow = true;
    floor.name = 'floor';
    this.root.add(floor);
    // Foundation lip so the dollhouse sits on the lawn.
    const lip = box(w + 0.9, 0.3, d + 0.9, mat('#cdbb9c', { roughness: 0.95 }), floor.position.x, -0.16, floor.position.z);
    lip.castShadow = false;
    this.root.add(lip);
  }

  private buildWalls() {
    const { minX, maxX, minZ, maxZ, height } = LAYOUT.hall;
    this.wall('north', minX, maxX, minZ, height, [
      { from: -4.7, to: -2.5, bottom: WAINSCOT_H, top: 3.7, kind: 'window' },
      { from: 2.5, to: 4.7, bottom: WAINSCOT_H, top: 3.7, kind: 'window' },
      { from: 7.2, to: 11.8, bottom: WAINSCOT_H + 0.1, top: 3.6, kind: 'window' },
    ]);
    this.wall('south', minX, maxX, maxZ, height, [{ from: -1.3, to: 1.3, bottom: 0, top: 2.7, kind: 'door' }]);
    this.wall('west', minZ, maxZ, minX, height, [{ from: -0.5, to: 4.5, bottom: 0, top: 3.1, kind: 'arch' }]);
    this.wall('east', minZ, maxZ, maxX, height, [
      { from: -5.4, to: -2.6, bottom: 0, top: 3.0, kind: 'door' },
      { from: 4.8, to: 6.7, bottom: 0, top: 2.7, kind: 'door' },
    ]);
  }

  /**
   * Builds one wall. For north/south walls `a..b` runs along X at z = `line`;
   * for east/west it runs along Z at x = `line`.
   */
  private wall(side: WallSide, a: number, b: number, line: number, height: number, openings: Opening[]) {
    const t = LAYOUT.hall.wall;
    const horizontal = side === 'north' || side === 'south';
    const outward =
      side === 'north'
        ? new THREE.Vector3(0, 0, -1)
        : side === 'south'
          ? new THREE.Vector3(0, 0, 1)
          : side === 'west'
            ? new THREE.Vector3(-1, 0, 0)
            : new THREE.Vector3(1, 0, 0);
    // Wall center line sits just outside the room edge.
    const center = line + (outward.x + outward.z) * (t / 2);
    const lower = new THREE.Group();
    const upper = new THREE.Group();
    lower.name = `${side}-lower`;
    upper.name = `${side}-upper`;
    this.root.add(lower, upper);
    // The entrance (south) wall folds down to a low knee wall so the default
    // camera looks straight into the room; the others keep their wainscot.
    const split = side === 'south' ? 0.42 : WAINSCOT_H + 0.1;
    this.cutaways.push({ side, upper, outward, amount: 0, split });

    // Place a box spanning [s0,s1] along the wall, [y0,y1] vertically.
    const place = (s0: number, s1: number, y0: number, y1: number, material: THREE.Material, depth: number, offset: number, parent: THREE.Group) => {
      if (s1 - s0 < 0.001 || y1 - y0 < 0.001) return;
      const len = s1 - s0;
      const h = y1 - y0;
      const geo = worldUVs(
        new THREE.BoxGeometry(horizontal ? len : depth, h, horizontal ? depth : len),
        horizontal ? len : depth,
        h,
        horizontal ? depth : len,
        2.4,
      );
      const m = new THREE.Mesh(geo, material);
      const mid = (s0 + s1) / 2;
      const off = center - (outward.x + outward.z) * offset;
      if (horizontal) m.position.set(mid, (y0 + y1) / 2, off);
      else m.position.set(off, (y0 + y1) / 2, mid);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    const sorted = [...openings].sort((x, y) => x.from - y.from);
    // Solid wall pieces between openings, split into lower (≤ wainscot) and upper parts.
    const spans: [number, number][] = [];
    let cursor = a;
    for (const o of sorted) {
      spans.push([cursor, o.from]);
      cursor = o.to;
    }
    spans.push([cursor, b]);
    for (const [s0, s1] of spans) {
      place(s0, s1, 0, split, this.wallMat, t, 0, lower);
      place(s0, s1, split, height, this.wallMat, t, 0, upper);
    }
    for (const o of sorted) {
      if (o.bottom > 0) place(o.from, o.to, 0, o.bottom, this.wallMat, t, 0, lower);
      place(o.from, o.to, o.top, height, this.wallMat, t, 0, o.top > split ? upper : lower);
    }

    // Collisions: solid spans + below-window pieces block; door/arch openings are passable.
    const blockers: [number, number][] = [...spans];
    for (const o of sorted) if (o.kind === 'window') blockers.push([o.from, o.to]);
    for (const [s0, s1] of blockers) {
      if (horizontal) this.collisions.add({ minX: s0, maxX: s1, minZ: center - t / 2 - 0.05, maxZ: center + t / 2 + 0.05 });
      else this.collisions.add({ minX: center - t / 2 - 0.05, maxX: center + t / 2 + 0.05, minZ: s0, maxZ: s1 });
    }

    // Interior finishes: wainscot panel, chair rail, baseboard, crown.
    const inset = t / 2 + 0.02;
    const doorSpans: [number, number][] = [];
    cursor = a;
    for (const o of sorted.filter((x) => x.kind !== 'window')) {
      doorSpans.push([cursor, o.from]);
      cursor = o.to;
    }
    doorSpans.push([cursor, b]);
    for (const [s0, s1] of doorSpans) {
      place(s0, s1, 0.12, Math.min(WAINSCOT_H, split), this.wainscotMat, 0.04, inset, lower);
      if (split < WAINSCOT_H) place(s0, s1, split, WAINSCOT_H, this.wainscotMat, 0.04, inset, upper);
      place(s0, s1, WAINSCOT_H - 0.02, WAINSCOT_H + 0.06, this.trimMat, 0.08, inset + 0.02, split < WAINSCOT_H ? upper : lower);
      place(s0, s1, 0, 0.14, this.baseMat, 0.06, inset + 0.01, lower);
    }
    place(a, b, height - 0.18, height - 0.02, this.trimMat, 0.1, inset + 0.02, upper);
    // Wall cap (visible from the dollhouse camera).
    place(a - t, b + t, height, height + 0.08, this.capMat, t + 0.12, 0, upper);
    // Cap for the cut-away state (sits at wainscot height).
    const lowCap = place(a - t, b + t, split, split + 0.06, this.capMat, t + 0.1, 0, lower);
    if (lowCap) lowCap.name = `${side}-lowcap`;
    // Exterior skin.
    place(a - t, b + t, 0, split, this.exteriorMat, 0.02, -(t / 2 + 0.01), lower);
    place(a - t, b + t, split, height, this.exteriorMat, 0.02, -(t / 2 + 0.01), upper);

    // Window frames & glass; door frames.
    for (const o of sorted) {
      const target = o.kind === 'window' ? upper : o.top > split ? upper : lower;
      const fw = 0.1;
      const frameDepth = t + 0.08;
      place(o.from - fw, o.from, o.bottom, o.top, this.trimMat, frameDepth, 0, target);
      place(o.to, o.to + fw, o.bottom, o.top, this.trimMat, frameDepth, 0, target);
      place(o.from - fw, o.to + fw, o.top, o.top + fw, this.trimMat, frameDepth, 0, target);
      if (o.kind === 'window') {
        place(o.from - 0.15, o.to + 0.15, o.bottom - 0.06, o.bottom + 0.02, this.trimMat, t + 0.3, 0.1, lower);
        const glass = place(o.from, o.to, o.bottom, o.top, this.glass, 0.02, 0, upper);
        if (glass) {
          glass.castShadow = false;
          glass.receiveShadow = false;
        }
        // Mullions.
        const panes = Math.max(2, Math.round((o.to - o.from) / 1.1));
        for (let i = 1; i < panes; i++) {
          const s = o.from + ((o.to - o.from) * i) / panes;
          place(s - 0.03, s + 0.03, o.bottom, o.top, this.trimMat, 0.08, 0, upper);
        }
        const mid = o.bottom + (o.top - o.bottom) * 0.62;
        place(o.from, o.to, mid - 0.03, mid + 0.03, this.trimMat, 0.08, 0, upper);
      }
    }
  }

  /** Warm pools of "window light" on the floor beneath each north window. */
  private buildWindowLight() {
    const tex = canvasTexture(256, 256, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,226,160,0.0)');
      g.addColorStop(0.25, 'rgba(255,226,160,0.55)');
      g.addColorStop(1, 'rgba(255,226,160,0.0)');
      ctx.fillStyle = g;
      // Window panes with mullion gaps.
      ctx.fillRect(8, 0, w / 2 - 14, h);
      ctx.fillRect(w / 2 + 6, 0, w / 2 - 14, h);
    });
    const m = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      opacity: 0.22,
    });
    for (const [x, w] of [
      [-3.6, 2.2],
      [3.6, 2.2],
      [9.5, 4.6],
    ] as const) {
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.1, 3.6), m);
      pool.rotation.x = -Math.PI / 2;
      pool.rotation.z = 0.12;
      pool.position.set(x + 0.3, 0.015, -8.0);
      pool.renderOrder = 2;
      this.root.add(pool);
    }
  }

  /** Mount decor on a wall's upper section so it hides with the cutaway. */
  mountOnWall(side: WallSide, obj: THREE.Object3D): void {
    const wall = this.cutaways.find((c) => c.side === side);
    (wall?.upper ?? this.root).add(obj);
  }

  /** Applies cut-away amounts from the camera's facing (0 = full wall, 1 = cut). */
  updateCutaways(cameraForward: THREE.Vector3, dt: number): void {
    const f = new THREE.Vector3(cameraForward.x, 0, cameraForward.z).normalize();
    for (const c of this.cutaways) {
      const target = f.dot(c.outward) < -0.3 ? 1 : 0;
      c.amount += (target - c.amount) * Math.min(1, dt * 6);
      const s = 1 - c.amount;
      c.upper.visible = s > 0.02;
      // Fold the upper wall down onto the wainscot cap for a soft transition.
      const pivot = c.split;
      c.upper.scale.y = Math.max(0.001, s);
      c.upper.position.y = pivot * (1 - s);
    }
  }
}
