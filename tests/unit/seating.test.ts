import assert from 'node:assert/strict';
import { it } from 'node:test';
import * as THREE from 'three';
import { DEFAULT_AVATAR } from '../../src/domain/avatar';
import type { WorldState } from '../../src/domain/world/worldState';
import { PLAYER } from '../../src/config/gameConfig';
import { AvatarModel } from '../../src/engine/characters/avatarModel';
import { Tweens } from '../../src/engine/core/tween';
import { NavGrid } from '../../src/engine/core/navGrid';
import { Particles } from '../../src/engine/fx/particles';
import { LAYOUT } from '../../src/engine/palette';
import { PlayerController } from '../../src/engine/systems/player';
import { CameraRig } from '../../src/engine/systems/cameraRig';
import { SchoolWorld } from '../../src/engine/world/SchoolWorld';
import { seatedCamera } from '../../src/engine/world/seats';
import type { AudioEngine } from '../../src/audio/AudioEngine';

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
const state = { shelfUnits: 1, shelfCapacities: [12], pets: [], trophies: [], natureItems: [], readingNookOpen: true } as unknown as WorldState;
const audio = { play() {} } as unknown as AudioEngine;
function setup() {
  const world = new SchoolWorld(new Tweens(), new Particles(), new Date('2026-10-17'), 'Sample');
  world.structure.collisions.remove('nook-curtain');
  const nav = new NavGrid(
    world.structure.collisions,
    { minX: LAYOUT.nook.minX, maxX: LAYOUT.greenhouse.maxX, minZ: LAYOUT.hall.minZ, maxZ: LAYOUT.hall.maxZ + 0.5 },
    0.32,
  );
  const avatar = new AvatarModel({ ...DEFAULT_AVATAR });
  const player = new PlayerController(avatar, world.structure.collisions, nav, audio);
  return { world, nav, avatar, player, seats: world.interactables.filter((d) => d.seat) };
}

it('inventory has exactly eleven seats, every clear exit connects to the classroom', () => {
  const { seats, world, nav } = setup();
  assert.equal(seats.length, 11);
  assert.equal(new Set(seats.map((s) => s.id)).size, 11);
  assert.equal(seats.filter((s) => s.seat!.reading).length, 1);
  assert.equal(seats.filter((s) => s.seat!.requiresNook).length, 2);
  for (const def of seats) {
    const exit = def.seat!.exit;
    assert.equal(world.structure.collisions.blocked(exit.x, exit.z, PLAYER.radius), false, def.id + ' clear exit');
    assert.ok(nav.findPath(LAYOUT.spawn, exit), def.id + ' reachable from spawn');
    assert.ok(nav.findPath(exit, LAYOUT.spawn), def.id + ' can leave');
  }
});

it('only active seated poses bypass furniture collision; stand, walk, and teleport restore normal movement', () => {
  const { seats, world, player, avatar } = setup();
  for (const def of seats) {
    const seat = def.seat!;
    player.teleport(seat.exit.x, seat.exit.z);
    assert.equal(player.sit(seat), true, def.id);
    for (let i = 0; i < 8; i++) player.update(0.1, null);
    assert.deepEqual(player.position, seat.position);
    assert.equal(player.yaw, seat.yaw);
    assert.equal(avatar.seatedPose, seat.reading ? 'read' : 'sit');
    assert.equal(avatar.root.getObjectByName('seated-open-book')!.visible, seat.reading);
    player.stand();
    assert.deepEqual(player.position, seat.exit);
    assert.equal(player.seated, null);
    assert.equal(avatar.seatedPose, null);
    assert.equal(avatar.root.getObjectByName('seated-open-book')!.visible, false);
    assert.equal(world.structure.collisions.blocked(player.position.x, player.position.z, PLAYER.radius), false);
    assert.equal(player.walkTo(LAYOUT.spawn.x, LAYOUT.spawn.z), true);
    player.update(0.1, null);
    player.sit(seat);
    player.update(0.1, { x: Math.sin(seat.yaw), z: Math.cos(seat.yaw) });
    assert.equal(player.seated, null);
    assert.equal(avatar.seatedPose, null);
    player.sit(seat);
    player.teleport(0, 5);
    assert.deepEqual(player.position, new THREE.Vector3(0, 0, 5));
    assert.equal(player.seated, null);
  }
});

it('arrival seating survives the same frame and pending path cancellation never seats later', () => {
  const { seats, player } = setup();
  const seat = seats.find((s) => s.id === 'seat-nook-couch')!.seat!;
  player.teleport(seat.exit.x + 0.15, seat.exit.z);
  player.walkTo(seat.exit.x, seat.exit.z, () => player.sit(seat));
  for (let i = 0; i < 100 && !player.seated; i++) player.update(0.1, null);
  assert.equal(player.seated, seat);
  assert.deepEqual(player.position, seat.position);
  player.teleport(-13, 2);
  let calls = 0;
  player.walkTo(seat.exit.x, seat.exit.z, () => {
    calls++;
    player.sit(seat);
  });
  player.stop();
  for (let i = 0; i < 50; i++) player.update(0.1, null);
  assert.equal(calls, 0);
  assert.equal(player.seated, null);
});

it('seated camera shows each face and book on desktop and narrow portrait without changing seat yaw', async () => {
  const { seats, world } = setup();
  await world.apply(state, [], false);
  for (const def of seats)
    for (const aspect of [1100 / 720, 320 / 812, 412 / 915]) {
      const seat = def.seat!;
      const rig = new CameraRig(aspect, new Tweens());
      if (aspect < 1) rig.camera.fov = 55;
      rig.camera.updateProjectionMatrix();
      Object.assign(rig, seatedCamera(seat));
      rig.spotlight = true;
      for (let i = 0; i < 100; i++) rig.update(0.1, seat.position);
      rig.camera.updateMatrixWorld(true);
      for (const h of [0.55, 1.1]) {
        const p = seat.position
          .clone()
          .add(new THREE.Vector3(0, h, 0))
          .project(rig.camera);
        assert.ok(Math.abs(p.x) < 0.75 && Math.abs(p.y) < 0.75 && p.z < 1, `${def.id} portrait framing`);
      }
      const towardsCamera = rig.camera.position.clone().sub(seat.position).normalize();
      assert.ok(towardsCamera.dot(new THREE.Vector3(Math.sin(seat.yaw), 0, Math.cos(seat.yaw))) > 0.5, def.id + ' face toward camera');
    }
});

it('all outfit variants retain configuration and reset knees/book through repeated sit and appearance changes', () => {
  for (const outfit of ['dress', 'tee', 'overalls', 'sweater', 'labcoat'] as const) {
    const config = { ...DEFAULT_AVATAR, outfit, hairStyle: 'long' as const, accessory: 'backpack' as const };
    const avatar = new AvatarModel(config);
    for (let i = 0; i < 3; i++) {
      avatar.setSeated('read');
      avatar.update(0.1, 0);
      assert.deepEqual(avatar.config, config);
      assert.equal(avatar.root.getObjectByName('left-knee')!.rotation.x, Math.PI / 2);
      assert.equal(avatar.root.getObjectByName('seated-open-book')!.visible, true);
      avatar.setSeated(null);
      avatar.update(0.1, 0);
      assert.equal(avatar.root.getObjectByName('left-knee')!.rotation.x, 0);
    }
    avatar.setSeated('read');
    avatar.setConfig(config);
    assert.equal(avatar.seatedPose, null);
    assert.equal(avatar.root.getObjectByName('seated-open-book')!.visible, false);
  }
});
