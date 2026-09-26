/**
 * Izzy's personal bookshelf — the heart of the core loop. Every completed book
 * becomes a physical book with its own painted spine, placed in a permanent
 * slot. Units unlock (rise from the floor) as shelves fill: 10 → 25 → 50 → 100.
 */
import * as THREE from 'three';
import type { CoverStyle } from '../../domain/types';
import { hashString } from '../../domain/util/random';
import { shelfSlot } from '../../domain/world/worldState';
import { SHELF_CAPACITIES } from '../../domain/rewards/catalog';
import { paintSpine, ROUNDED } from '../../shared/coverPainter';
import { ease, type Tweens } from '../core/tween';
import { box, mat, rbox } from '../render/kit';
import { canvasTexture } from '../render/textures';
import { LAYOUT, PALETTE } from '../palette';

export interface ShelfBook {
  id: string;
  title: string;
  author: string;
  cover: CoverStyle;
  shelfIndex: number;
}

interface UnitSpec {
  width: number;
  height: number;
  rows: number;
  perRow: number;
  x: number;
  back: string;
  carcass: string;
  label: string;
}

const DEPTH = 0.46;
const BOARD = 0.045;

/** Unit layout along the north wall (left → right). */
export const UNIT_SPECS: UnitSpec[] = [
  { width: 1.6, height: 1.75, rows: 2, perRow: 5, x: -12.75, back: '#a7c4a0', carcass: '#f7efe2', label: 'Shelf 1' },
  { width: 1.6, height: 2.45, rows: 3, perRow: 5, x: -11.05, back: '#9fbdd0', carcass: '#f7efe2', label: 'Shelf 2' },
  { width: 1.9, height: 3.0, rows: 4, perRow: 7, x: -9.2, back: '#e8b8b0', carcass: '#f7efe2', label: 'Shelf 3' },
  { width: 2.9, height: 4.0, rows: 5, perRow: 10, x: -6.7, back: '#6d8f86', carcass: PALETTE.walnut, label: 'Grand' },
];

function bookDims(id: string): { t: number; h: number; lean: number } {
  const h = hashString(id);
  return {
    t: 0.16 + ((h % 7) / 7) * 0.06,
    h: 0.36 + (((h >>> 3) % 9) / 9) * 0.1,
    lean: 0,
  };
}

const pagesMat = mat('#f6ecd6', { roughness: 0.9 });

export class Bookshelf {
  readonly root = new THREE.Group();
  private units: THREE.Group[] = [];
  private unitVisible: boolean[] = [];
  private books = new Map<string, THREE.Mesh>();
  private plaque: THREE.Mesh;
  private plaqueCount = -1;
  private readonly z = LAYOUT.shelfZ;

  constructor(private readonly tweens: Tweens) {
    UNIT_SPECS.forEach((spec, i) => {
      const unit = this.buildUnit(spec, i);
      unit.visible = i === 0;
      this.unitVisible.push(i === 0);
      this.units.push(unit);
      this.root.add(unit);
    });
    this.plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.48), new THREE.MeshStandardMaterial({ roughness: 0.6 }));
    this.plaque.position.set(UNIT_SPECS[0]?.x ?? -12.75, 2.2, this.z - 0.14);
    this.root.add(this.plaque);
    this.setCount(0);
  }

  /** Where the camera should look when showing off the shelf. */
  get focus(): { position: THREE.Vector3; target: THREE.Vector3 } {
    return { position: new THREE.Vector3(-10.9, 2.5, -5.2), target: new THREE.Vector3(-11.8, 1.15, this.z) };
  }

  unitCenter(i: number): THREE.Vector3 {
    const spec = UNIT_SPECS[i] ?? UNIT_SPECS[0];
    return new THREE.Vector3(spec?.x ?? 0, (spec?.height ?? 1) / 2, this.z + DEPTH / 2);
  }

  private buildUnit(spec: UnitSpec, index: number): THREE.Group {
    const g = new THREE.Group();
    g.position.set(spec.x, 0, this.z + DEPTH / 2 - 0.02);
    const carcass = mat(spec.carcass, { roughness: index === 3 ? 0.55 : 0.7 });
    const back = mat(spec.back, { roughness: 0.85 });
    const w = spec.width;
    const h = spec.height;
    g.add(box(BOARD, h, DEPTH, carcass, -w / 2 - BOARD / 2, h / 2, 0));
    g.add(box(BOARD, h, DEPTH, carcass, w / 2 + BOARD / 2, h / 2, 0));
    g.add(box(w, h, 0.02, back, 0, h / 2, -DEPTH / 2 + 0.01));
    g.add(box(w + BOARD * 2, 0.1, DEPTH, carcass, 0, 0.05, 0));
    g.add(rbox(w + BOARD * 2 + 0.08, 0.06, DEPTH + 0.06, 0.02, carcass, 0, h + 0.03, 0.01));
    const rowH = (h - 0.12) / spec.rows;
    for (let r = 1; r < spec.rows; r++) g.add(box(w, BOARD, DEPTH - 0.02, carcass, 0, 0.1 + r * rowH, 0.005));
    if (index === 3) {
      // Grand unit: brass rail, rolling ladder, carved crest.
      const brass = mat(PALETTE.brass, { metalness: 0.8, roughness: 0.3 });
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, w + 0.3, 12), brass);
      rail.rotation.z = Math.PI / 2;
      rail.position.set(0, h - 0.35, DEPTH / 2 + 0.12);
      g.add(rail);
      const ladder = new THREE.Group();
      const wood = mat(PALETTE.oak, { roughness: 0.6 });
      for (const s of [-1, 1]) {
        const rail2 = box(0.05, h - 0.2, 0.05, wood, s * 0.22, (h - 0.2) / 2, 0);
        ladder.add(rail2);
      }
      for (let i = 0; i < 9; i++) ladder.add(box(0.44, 0.035, 0.07, wood, 0, 0.3 + i * 0.36, 0));
      ladder.position.set(-0.6, 0, DEPTH / 2 + 0.35);
      ladder.rotation.x = -0.12;
      g.add(ladder);
      const crest = rbox(0.9, 0.3, 0.06, 0.08, mat('#d9b35c', { metalness: 0.5, roughness: 0.35 }), 0, h + 0.2, 0.1);
      g.add(crest);
    }
    g.userData.rowH = rowH;
    return g;
  }

  private setCount(n: number) {
    if (n === this.plaqueCount) return;
    this.plaqueCount = n;
    const tex = canvasTexture(768, 216, (ctx, w, h) => {
      ctx.fillStyle = '#fff6e6';
      ctx.beginPath();
      ctx.roundRect(6, 6, w - 12, h - 12, 40);
      ctx.fill();
      ctx.lineWidth = 10;
      ctx.strokeStyle = PALETTE.terracotta;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = PALETTE.walnut;
      ctx.font = `600 70px ${ROUNDED}`;
      ctx.fillText('Izzy’s Books', w / 2 - 70, h / 2 + 4);
      ctx.fillStyle = PALETTE.terracotta;
      ctx.beginPath();
      ctx.arc(w - 120, h / 2, 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff6e6';
      ctx.font = `700 ${n >= 100 ? 58 : 76}px ${ROUNDED}`;
      ctx.fillText(String(n), w - 120, h / 2 + 5);
    });
    const m = this.plaque.material as THREE.MeshStandardMaterial;
    m.map?.dispose();
    m.map = tex;
    m.needsUpdate = true;
  }

  setUnitCount(count: number, animate: boolean): Promise<void> {
    const jobs: Promise<void>[] = [];
    this.units.forEach((unit, i) => {
      const shouldShow = i < count;
      if (shouldShow === this.unitVisible[i]) return;
      this.unitVisible[i] = shouldShow;
      if (!shouldShow) {
        unit.visible = false;
        return;
      }
      unit.visible = true;
      if (!animate) {
        unit.scale.set(1, 1, 1);
        return;
      }
      unit.scale.set(1, 0.001, 1);
      jobs.push(this.tweens.run(1.3, (k) => unit.scale.set(1, Math.max(0.001, k), 1), { easing: ease.outBack }));
    });
    return Promise.all(jobs).then(() => undefined);
  }

  /** World transform for a shelf slot. */
  slotTransform(shelfIndex: number, bookId: string): { position: THREE.Vector3; rotationZ: number } {
    const { unit, slot } = shelfSlot(shelfIndex);
    const spec = UNIT_SPECS[Math.min(unit, UNIT_SPECS.length - 1)] ?? UNIT_SPECS[0];
    const group = this.units[Math.min(unit, this.units.length - 1)];
    if (!spec || !group) return { position: new THREE.Vector3(), rotationZ: 0 };
    const dims = bookDims(bookId);
    if (unit >= UNIT_SPECS.length) {
      // Overflow: cozy stacks on the floor beside the grand shelf.
      const stack = Math.floor(slot / 8);
      const level = slot % 8;
      return {
        position: new THREE.Vector3(-5.9 + stack * 0.45, 0.06 + level * 0.1, this.z + 0.9),
        rotationZ: Math.PI / 2,
      };
    }
    const row = Math.floor(slot / spec.perRow);
    const col = slot % spec.perRow;
    const rowH = (spec.height - 0.12) / spec.rows;
    // Rows fill from the top shelf down so new books are at eye level first.
    const rowFromTop = spec.rows - 1 - row;
    const y = 0.1 + BOARD / 2 + rowFromTop * rowH + dims.h / 2 + 0.005;
    const slotW = (spec.width - 0.06) / spec.perRow;
    const x = spec.x - spec.width / 2 + 0.03 + slotW * (col + 0.5);
    return { position: new THREE.Vector3(x, y, this.z + DEPTH / 2 - 0.02 - 0.02), rotationZ: 0 };
  }

  private makeBookMesh(book: ShelfBook): THREE.Mesh {
    const dims = bookDims(book.id);
    const spineTex = canvasTexture(96, 256, (ctx, w, h) => paintSpine(ctx, w, h, { title: book.title, author: book.author, cover: book.cover }), { anisotropy: 4 });
    const coverMat = mat(book.cover.background, { roughness: 0.6 });
    const spineMat = new THREE.MeshStandardMaterial({ map: spineTex, roughness: 0.55 });
    const geo = new THREE.BoxGeometry(dims.t, dims.h, 0.3);
    // +x, -x, +y, -y, +z (spine faces the room), -z
    const mesh = new THREE.Mesh(geo, [coverMat, coverMat, pagesMat, pagesMat, spineMat, pagesMat]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `book:${book.id}`;
    mesh.userData.bookId = book.id;
    return mesh;
  }

  /** Places all books instantly (initial load / preview). */
  setBooks(books: ShelfBook[]): void {
    const keep = new Set(books.map((b) => b.id));
    for (const [id, mesh] of this.books) {
      if (!keep.has(id)) {
        mesh.removeFromParent();
        this.books.delete(id);
      }
    }
    for (const b of books) {
      let mesh = this.books.get(b.id);
      if (!mesh) {
        mesh = this.makeBookMesh(b);
        this.books.set(b.id, mesh);
        this.root.add(mesh);
      }
      const t = this.slotTransform(b.shelfIndex, b.id);
      mesh.position.copy(t.position);
      mesh.rotation.set(0, 0, t.rotationZ);
      mesh.scale.setScalar(1);
    }
    this.setCount(books.length);
    this.leanLastBooks(books);
  }

  /** The last book on a partially-filled row leans against its neighbor. */
  private leanLastBooks(books: ShelfBook[]) {
    const byRow = new Map<string, ShelfBook[]>();
    for (const b of books) {
      const { unit, slot } = shelfSlot(b.shelfIndex, SHELF_CAPACITIES);
      const spec = UNIT_SPECS[unit];
      if (!spec) continue;
      const key = `${unit}:${Math.floor(slot / spec.perRow)}`;
      byRow.set(key, [...(byRow.get(key) ?? []), b]);
    }
    for (const [key, list] of byRow) {
      const [unitStr] = key.split(':');
      const spec = UNIT_SPECS[Number(unitStr)];
      if (!spec || list.length >= spec.perRow || list.length < 2) continue;
      const last = [...list].sort((a, b) => b.shelfIndex - a.shelfIndex)[0];
      const mesh = last ? this.books.get(last.id) : undefined;
      if (mesh) {
        mesh.rotation.z = 0.2;
        mesh.position.x -= 0.03;
        mesh.position.y -= 0.012;
      }
    }
  }

  hasBook(id: string): boolean {
    return this.books.has(id);
  }

  /**
   * The signature moment: the book glows, arcs through the air from the
   * teacher to its permanent slot and settles with a satisfying thunk.
   */
  async flyBookIn(book: ShelfBook, from: THREE.Vector3, onLand: (at: THREE.Vector3) => void): Promise<void> {
    const mesh = this.makeBookMesh(book);
    this.books.set(book.id, mesh);
    this.root.add(mesh);
    const glow = new THREE.PointLight('#ffd98a', 3, 2.5, 2);
    mesh.add(glow);
    const target = this.slotTransform(book.shelfIndex, book.id);
    const start = from.clone();
    const end = target.position.clone();
    const front = end.clone().add(new THREE.Vector3(0, 0.05, 0.9));
    const ctrl = start.clone().lerp(front, 0.5).add(new THREE.Vector3(0, 2.4, 0));
    const curve = new THREE.QuadraticBezierCurve3(start, ctrl, front);

    mesh.position.copy(start);
    mesh.scale.setScalar(0.01);
    // Pop into existence, glowing.
    await this.tweens.run(0.45, (k) => mesh.scale.setScalar(0.01 + k * 1.6), { easing: ease.outBack });
    await this.tweens.run(1.6, (k) => {
      mesh.position.copy(curve.getPoint(k));
      mesh.rotation.set(Math.sin(k * Math.PI) * 0.6, k * Math.PI * 4, Math.sin(k * Math.PI * 2) * 0.3);
      mesh.scale.setScalar(1.6 - k * 0.6);
    });
    // Settle into the slot.
    await this.tweens.run(0.5, (k) => {
      mesh.position.lerpVectors(front, end, k);
      mesh.rotation.set(0, 0, 0);
    }, { easing: ease.outCubic });
    mesh.position.copy(end);
    onLand(end.clone().add(new THREE.Vector3(0, 0.1, 0.2)));
    await this.tweens.run(0.35, (k) => {
      const s = 1 + Math.sin(k * Math.PI) * 0.12;
      mesh.scale.set(s, 1 / s, s);
      glow.intensity = 3 * (1 - k);
    });
    mesh.remove(glow);
    this.setCount(this.books.size);
  }

  update(time: number): void {
    // Gentle shimmer on the plaque number is handled by lighting; nothing per-frame yet.
    void time;
  }
}
