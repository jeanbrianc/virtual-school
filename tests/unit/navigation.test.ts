/** Tap-to-walk navigation and collision (pure engine logic, no WebGL). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CollisionWorld } from '../../src/engine/core/collision';
import { NavGrid } from '../../src/engine/core/navGrid';

const bounds = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };

describe('collision', () => {
  it('pushes a walking child out of furniture', () => {
    const w = new CollisionWorld();
    w.addBox(0, 0, 2, 2, 'table');
    const p = w.resolveCircle(0.9, 0, 0.3);
    assert.ok(p.x >= 1.3 - 1e-6, `pushed to x=${p.x}`);
    assert.ok(w.blocked(0, 0, 0.3));
    w.remove('table');
    assert.ok(!w.blocked(0, 0, 0.3));
  });
});

describe('nav grid (tap-to-walk)', () => {
  it('finds a path around a wall and never through it', () => {
    const w = new CollisionWorld();
    w.addBox(0, -1, 0.4, 8, 'wall'); // wall along z from -5 to 3, gap at the top
    const grid = new NavGrid(w, bounds, 0.3);
    const path = grid.findPath({ x: -3, z: -3 }, { x: 3, z: -3 });
    assert.ok(path && path.length >= 2, 'path exists');
    for (const p of path!) assert.ok(!w.blocked(p.x, p.z, 0.25), `waypoint (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) is walkable`);
    assert.ok(
      path!.some((p) => p.z > 2.5),
      'detours through the gap',
    );
    const end = path!.at(-1)!;
    assert.ok(Math.hypot(end.x - 3, end.z + 3) < 0.5);
  });

  it('a tap inside furniture resolves to the nearest walkable spot', () => {
    const w = new CollisionWorld();
    w.addBox(2, 2, 1, 1);
    const grid = new NavGrid(w, bounds, 0.3);
    assert.equal(grid.isWalkable({ x: 2, z: 2 }), false);
    const near = grid.nearestWalkable({ x: 2, z: 2 })!;
    assert.ok(grid.isWalkable(near));
    assert.ok(Math.hypot(near.x - 2, near.z - 2) < 1.5);
  });

  it('returns null when the goal is fully enclosed', () => {
    const w = new CollisionWorld();
    w.addBox(0, 2.5, 10, 0.5);
    w.addBox(0, -2.5, 10, 0.5);
    w.addBox(2.5, 0, 0.5, 10);
    w.addBox(-2.5, 0, 0.5, 10);
    const grid = new NavGrid(w, bounds, 0.3);
    const path = grid.findPath({ x: 4.5, z: 4.5 }, { x: 0, z: 0 });
    assert.equal(path, null);
  });

  it('rebuilds when the world changes (a door opening)', () => {
    const w = new CollisionWorld();
    w.addBox(0, 0, 0.4, 10, 'wall');
    const grid = new NavGrid(w, bounds, 0.3);
    assert.equal(grid.findPath({ x: -3, z: 0 }, { x: 3, z: 0 }), null);
    w.remove('wall');
    assert.ok(grid.findPath({ x: -3, z: 0 }, { x: 3, z: 0 }));
  });
});
