import assert from 'node:assert/strict';
import { it } from 'node:test';
import * as THREE from 'three';
import { SchoolWorld } from '../../src/engine/world/SchoolWorld';
import { Tweens } from '../../src/engine/core/tween';
import { Particles } from '../../src/engine/fx/particles';
import type { WorldState } from '../../src/domain/world/worldState';

// Geometry tests need texture construction, but do not pretend to render pixels.
const paint = new Proxy(
  {},
  {
    get: (_target, key) =>
      key === 'measureText'
        ? () => ({ width: 10 })
        : key === 'createLinearGradient' || key === 'createRadialGradient'
          ? () => ({ addColorStop() {} })
          : () => {},
    set: () => true,
  },
);
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => paint }) } });
const state = { shelfUnits: 1, shelfCapacities: [12], pets: [], trophies: [], natureItems: [], readingNookOpen: false } as unknown as WorldState;

it('the unlocked nook arch has no skin, rail or cap across its sightline', () => {
  const world = new SchoolWorld(new Tweens(), new Particles(), new Date('2026-10-12'), 'Test reader');
  world.root.updateMatrixWorld(true);
  for (const z of [0, 2, 4])
    for (const y of [0.2, 1.32, 2.5]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(-13, y, z), new THREE.Vector3(-1, 0, 0), 0, 1.5);
      assert.equal(ray.intersectObject(world.structure.root, true).length, 0, `arch blocked at y=${y}, z=${z}`);
    }
});

it('curtain blocks both directions until unlock, and reload restores the right collision', async () => {
  const world = new SchoolWorld(new Tweens(), new Particles(), new Date('2026-10-12'), 'Test reader');
  const collision = world.structure.collisions;
  await world.apply(state, [], false);
  assert.ok(collision.has('nook-curtain'));
  for (const start of [-13.4, -14.6]) {
    const next = collision.resolveCircle(start < -14 ? -14.2 : -13.9, 2, 0.25);
    assert.ok(start < -14 ? next.x < -14.2 : next.x > -13.9);
  }
  await world.apply({ ...state, readingNookOpen: true }, [], false);
  assert.equal(collision.has('nook-curtain'), false);
  for (const direction of [-1, 1]) {
    for (let i = 0; i <= 24; i++) {
      const x = direction < 0 ? -13 + i * -0.1 : -15.4 + i * 0.1;
      assert.equal(collision.blocked(x, 2, 0.25), false, `entry corridor at ${x}`);
      assert.deepEqual(collision.resolveCircle(x, 2, 0.25), { x, z: 2 });
    }
  }
  await world.apply({ ...state, readingNookOpen: true }, [], false);
  assert.equal(collision.has('nook-curtain'), false);
  const reloaded = new SchoolWorld(new Tweens(), new Particles(), new Date('2026-10-12'), 'Test reader');
  await reloaded.apply({ ...state, readingNookOpen: true }, [], false);
  assert.equal(reloaded.structure.collisions.has('nook-curtain'), false);
  await world.apply(state, [], false);
  assert.ok(collision.has('nook-curtain'));
});

it('nook outer walls cut away for camera views while keeping boundary collision', () => {
  const world = new SchoolWorld(new Tweens(), new Particles(), new Date('2026-10-12'), 'Test reader');
  const nookWalls = world.structure.cutaways.slice(-3);
  assert.equal(nookWalls.length, 3);
  for (const wall of nookWalls) {
    world.structure.updateCutaways(wall.outward.clone().negate(), 1);
    assert.equal(wall.upper.visible, false);
    world.structure.updateCutaways(wall.outward, 1);
    assert.equal(wall.upper.visible, true);
  }
  assert.ok(world.structure.collisions.blocked(-18.5, 2, 0.25));
  assert.ok(world.structure.collisions.blocked(-16, -0.5, 0.25));
  assert.ok(world.structure.collisions.blocked(-16, 4.5, 0.25));
});

it('the hall wall cuts away while approaching the nook from the hall on an elevated camera', () => {
  const world = new SchoolWorld(new Tweens(), new Particles(), new Date('2026-10-12'), 'Test reader');
  const west = world.structure.cutaways[2]!;
  const forward = new THREE.Vector3(-1, 0, 0);
  world.structure.updateCutaways(forward, 1, new THREE.Vector3(-13, 0, 2));
  assert.equal(west.upper.visible, false);
  world.structure.updateCutaways(forward, 1, new THREE.Vector3(-15, 0, 2));
  assert.equal(west.upper.visible, false);
  world.structure.updateCutaways(forward, 1, new THREE.Vector3(-10, 0, 2));
  assert.equal(west.upper.visible, true);
});
