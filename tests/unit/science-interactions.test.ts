import assert from 'node:assert/strict';
import { it } from 'node:test';
import * as THREE from 'three';
import { SOLAR_POSTER_PLANETS, solarPosterPlanetAt } from '../../src/shared/solarPoster';
import { Tweens } from '../../src/engine/core/tween';
import { Particles } from '../../src/engine/fx/particles';
import { SchoolWorld } from '../../src/engine/world/SchoolWorld';
import { InteractionSystem } from '../../src/engine/systems/interaction';
import { PLAYER } from '../../src/config/gameConfig';
import { NavGrid } from '../../src/engine/core/navGrid';
import { LAYOUT } from '../../src/engine/palette';
import type { WorldState } from '../../src/domain/world/worldState';

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
const setup = () => new SchoolWorld(new Tweens(), new Particles(), new Date('2026-11-07'), 'Sample');

it('painted planet centers and labels select the matching planet, not the poster title', () => {
  for (const planet of SOLAR_POSTER_PLANETS) {
    assert.equal(solarPosterPlanetAt(planet.x / 768, 1 - planet.y / 512), planet.id);
    assert.equal(solarPosterPlanetAt(planet.x / 768, 1 - 322 / 512), planet.id);
  }
  assert.equal(solarPosterPlanetAt(0.5, 0.9), undefined);
});

it('all eight wall planets are raycastable after batching, and the poster has a reachable prompt', () => {
  const world = setup();
  const def = world.interactables.find((d) => d.id === 'solar-system')!;
  assert.ok(def.pointerSurface);
  assert.equal(world.root.getObjectByName('solar-system-poster'), def.object);
  assert.equal(world.structure.collisions.blocked(def.approach.x, def.approach.z, PLAYER.radius), false);
  const nav = new NavGrid(
    world.structure.collisions,
    { minX: LAYOUT.nook.minX, maxX: LAYOUT.greenhouse.maxX, minZ: LAYOUT.hall.minZ, maxZ: LAYOUT.hall.maxZ + 0.5 },
    0.32,
  );
  assert.ok(nav.findPath(LAYOUT.spawn, def.approach));
  const interactions = new InteractionSystem(world.interactables);
  assert.equal(interactions.computeFocus(def.approach)?.id, 'solar-system');
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
  camera.position.set(12.95, 2.45, -6.8);
  camera.lookAt(12.95, 2.45, -9.8);
  camera.updateMatrixWorld(true);
  world.root.updateMatrixWorld(true);
  for (const planet of SOLAR_POSTER_PLANETS) {
    const point = new THREE.Vector3((planet.x / 768 - 0.5) * 1.8, 0, 0);
    def.object.localToWorld(point);
    point.project(camera);
    assert.equal(interactions.pick(new THREE.Vector2(point.x, point.y), camera)?.id, `solar-system:${planet.id}`);
  }
  def.object.visible = false;
  assert.ok(!interactions.pick(new THREE.Vector2(0, 0), camera)?.id.startsWith('solar-system:'));
});

it('aquarium glass/water cannot create specular glare, and new fish are retained through updates', async () => {
  const world = setup();
  for (const [name, maxOpacity] of [
    ['aquarium-glass', 0.08],
    ['aquarium-water', 0.13],
  ] as const) {
    const mesh = world.root.getObjectByName(name) as THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
    assert.ok(mesh.material.isMeshBasicMaterial);
    assert.ok(mesh.material.opacity <= maxOpacity);
    assert.equal(mesh.material.depthWrite, false);
    assert.equal(mesh.material.side, THREE.FrontSide);
    assert.equal(mesh.castShadow, false);
  }
  const state = { shelfUnits: 1, shelfCapacities: [12], pets: [], trophies: [], natureItems: [], plantCount: 1, aquariumFish: 2 } as unknown as WorldState;
  await world.apply(state, [], false);
  const fish = world.root.getObjectByName('aquarium-fish')!;
  assert.equal(fish.children.length, 2);
  await world.apply({ ...state, aquariumFish: 3 }, [], true);
  assert.equal(fish.children.length, 3);
  world.update(0.1, new THREE.Vector3());
  assert.ok(fish.children.every((item) => item.visible && item.position.y > 0.84 && item.position.y < 1.4));
  const latest = fish.children[2];
  await world.apply({ ...state, aquariumFish: 3 }, [], false);
  assert.equal(fish.children[2], latest);
});
