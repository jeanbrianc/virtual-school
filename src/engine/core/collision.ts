/**
 * 2D (XZ-plane) static collision. The school is mostly boxes, so axis-aligned
 * rectangles are enough; the player is a circle. No physics engine needed.
 */
export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Optional id so dynamic blockers (doors, curtains) can be toggled. */
  id?: string;
}

export class CollisionWorld {
  private rects: Rect[] = [];
  private version = 0;

  add(rect: Rect): void {
    this.rects.push(rect);
    this.version++;
  }

  /** Axis-aligned box from center + size (width along X, depth along Z). */
  addBox(x: number, z: number, w: number, d: number, id?: string): void {
    this.add({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, ...(id ? { id } : {}) });
  }

  remove(id: string): void {
    const before = this.rects.length;
    this.rects = this.rects.filter((r) => r.id !== id);
    if (this.rects.length !== before) this.version++;
  }

  has(id: string): boolean {
    return this.rects.some((r) => r.id === id);
  }

  get all(): readonly Rect[] {
    return this.rects;
  }

  get revision(): number {
    return this.version;
  }

  /** Pushes a circle out of every overlapping rectangle (a few iterations). */
  resolveCircle(x: number, z: number, radius: number): { x: number; z: number } {
    let px = x;
    let pz = z;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const r of this.rects) {
        const cx = Math.max(r.minX, Math.min(px, r.maxX));
        const cz = Math.max(r.minZ, Math.min(pz, r.maxZ));
        const dx = px - cx;
        const dz = pz - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          px = cx + (dx / d) * radius;
          pz = cz + (dz / d) * radius;
        } else {
          // Center inside the rect: push out along the shallowest axis.
          const left = px - r.minX;
          const right = r.maxX - px;
          const top = pz - r.minZ;
          const bottom = r.maxZ - pz;
          const m = Math.min(left, right, top, bottom);
          if (m === left) px = r.minX - radius;
          else if (m === right) px = r.maxX + radius;
          else if (m === top) pz = r.minZ - radius;
          else pz = r.maxZ + radius;
        }
        moved = true;
      }
      if (!moved) break;
    }
    return { x: px, z: pz };
  }

  blocked(x: number, z: number, radius: number): boolean {
    for (const r of this.rects) {
      const cx = Math.max(r.minX, Math.min(x, r.maxX));
      const cz = Math.max(r.minZ, Math.min(z, r.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < radius * radius) return true;
    }
    return false;
  }
}
