/**
 * Grid A* pathfinding over the collision world, used for forgiving
 * click/tap-to-walk: tap anywhere (or on a teacher) and Izzy finds her way.
 */
import type { CollisionWorld } from './collision';

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Point {
  x: number;
  z: number;
}

export class NavGrid {
  readonly cell: number;
  private cols = 0;
  private rows = 0;
  private blocked = new Uint8Array(0);
  private builtRevision = -1;

  constructor(
    private readonly world: CollisionWorld,
    private readonly bounds: Bounds,
    private readonly radius: number,
    cell = 0.25,
  ) {
    this.cell = cell;
  }

  private ensure() {
    if (this.builtRevision === this.world.revision) return;
    this.cols = Math.ceil((this.bounds.maxX - this.bounds.minX) / this.cell);
    this.rows = Math.ceil((this.bounds.maxZ - this.bounds.minZ) / this.cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const { x, z } = this.center(c, r);
        this.blocked[r * this.cols + c] = this.world.blocked(x, z, this.radius) ? 1 : 0;
      }
    }
    this.builtRevision = this.world.revision;
  }

  private center(c: number, r: number): Point {
    return { x: this.bounds.minX + (c + 0.5) * this.cell, z: this.bounds.minZ + (r + 0.5) * this.cell };
  }

  private toCell(p: Point): [number, number] {
    return [
      Math.max(0, Math.min(this.cols - 1, Math.floor((p.x - this.bounds.minX) / this.cell))),
      Math.max(0, Math.min(this.rows - 1, Math.floor((p.z - this.bounds.minZ) / this.cell))),
    ];
  }

  isWalkable(p: Point): boolean {
    this.ensure();
    const [c, r] = this.toCell(p);
    return this.blocked[r * this.cols + c] === 0;
  }

  /** Nearest walkable cell center to a point (spiral search). */
  nearestWalkable(p: Point, maxRing = 16): Point | null {
    this.ensure();
    const [c0, r0] = this.toCell(p);
    for (let ring = 0; ring <= maxRing; ring++) {
      let best: Point | null = null;
      let bestD = Infinity;
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const c = c0 + dc;
          const r = r0 + dr;
          if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
          if (this.blocked[r * this.cols + c]) continue;
          const q = this.center(c, r);
          const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = q;
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  findPath(from: Point, to: Point): Point[] | null {
    this.ensure();
    const goal = this.isWalkable(to) ? to : this.nearestWalkable(to);
    const start = this.isWalkable(from) ? from : this.nearestWalkable(from);
    if (!goal || !start) return null;
    const [sc, sr] = this.toCell(start);
    const [gc, gr] = this.toCell(goal);
    const n = this.cols * this.rows;
    const g = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const startIdx = sr * this.cols + sc;
    const goalIdx = gr * this.cols + gc;
    g[startIdx] = 0;
    const heap = new MinHeap();
    heap.push(0, startIdx);
    const h = (idx: number) => {
      const c = idx % this.cols;
      const r = Math.floor(idx / this.cols);
      const dc = Math.abs(c - gc);
      const dr = Math.abs(r - gr);
      return (Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr)) * this.cell;
    };
    const dirs: [number, number, number][] = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, Math.SQRT2],
      [1, -1, Math.SQRT2],
      [-1, 1, Math.SQRT2],
      [-1, -1, Math.SQRT2],
    ];
    let found = false;
    let guard = 0;
    while (heap.size > 0 && guard++ < 60000) {
      const idx = heap.pop();
      if (idx === undefined) break;
      if (closed[idx]) continue;
      if (idx === goalIdx) {
        found = true;
        break;
      }
      closed[idx] = 1;
      const c = idx % this.cols;
      const r = Math.floor(idx / this.cols);
      for (const [dc, dr, cost] of dirs) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
        const ni = nr * this.cols + nc;
        if (this.blocked[ni] || closed[ni]) continue;
        // No corner cutting.
        if (dc !== 0 && dr !== 0 && (this.blocked[r * this.cols + nc] || this.blocked[nr * this.cols + c])) continue;
        const ng = (g[idx] ?? Infinity) + cost * this.cell;
        if (ng < (g[ni] ?? Infinity)) {
          g[ni] = ng;
          came[ni] = idx;
          heap.push(ng + h(ni), ni);
        }
      }
    }
    if (!found) return null;
    const cells: Point[] = [];
    for (let i = goalIdx; i !== -1; i = came[i] ?? -1) {
      cells.push(this.center(i % this.cols, Math.floor(i / this.cols)));
      if (i === startIdx) break;
    }
    cells.reverse();
    cells[cells.length - 1] = goal;
    return this.smooth([start, ...cells.slice(1)]);
  }

  /** String-pulling: drop waypoints that have clear line of sight. */
  private smooth(path: Point[]): Point[] {
    if (path.length <= 2) return path;
    const out: Point[] = [path[0] as Point];
    let anchor = 0;
    for (let i = 2; i < path.length; i++) {
      if (!this.lineClear(path[anchor] as Point, path[i] as Point)) {
        out.push(path[i - 1] as Point);
        anchor = i - 1;
      }
    }
    out.push(path[path.length - 1] as Point);
    return out;
  }

  lineClear(a: Point, b: Point): boolean {
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.ceil(dist / (this.cell * 0.5));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (!this.isWalkable({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false;
    }
    return true;
  }
}

/** Binary min-heap keyed by priority, storing integer cell indices. */
class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];

  get size(): number {
    return this.vals.length;
  }

  push(key: number, val: number): void {
    this.keys.push(key);
    this.vals.push(val);
    let i = this.vals.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if ((this.keys[p] ?? 0) <= key) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number | undefined {
    const n = this.vals.length;
    if (n === 0) return undefined;
    const top = this.vals[0];
    this.swap(0, n - 1);
    this.keys.pop();
    this.vals.pop();
    let i = 0;
    const len = this.vals.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < len && (this.keys[l] ?? 0) < (this.keys[m] ?? 0)) m = l;
      if (r < len && (this.keys[r] ?? 0) < (this.keys[m] ?? 0)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const k = this.keys[a] ?? 0;
    this.keys[a] = this.keys[b] ?? 0;
    this.keys[b] = k;
    const v = this.vals[a] ?? 0;
    this.vals[a] = this.vals[b] ?? 0;
    this.vals[b] = v;
  }
}
