import assert from 'node:assert/strict';
import { it } from 'node:test';
import * as THREE from 'three';
import { DEFAULT_AVATAR } from '../../src/domain/avatar';
import type { WorldState } from '../../src/domain/world/worldState';
import { Game } from '../../src/engine/Game';
import { PLAYER } from '../../src/config/gameConfig';
import { AvatarModel } from '../../src/engine/characters/avatarModel';
import { Tweens } from '../../src/engine/core/tween';
import { NavGrid } from '../../src/engine/core/navGrid';
import { Particles } from '../../src/engine/fx/particles';
import { LAYOUT } from '../../src/engine/palette';
import { PlayerController } from '../../src/engine/systems/player';
import { InteractionSystem } from '../../src/engine/systems/interaction';
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
    assert.ok(Math.hypot(exit.x - def.position.x, exit.z - def.position.z) <= def.radius - 0.1, def.id + ' prompt has approach margin');
    assert.equal(world.structure.collisions.blocked(exit.x, exit.z, PLAYER.radius), false, def.id + ' clear exit');
    assert.ok(nav.findPath(LAYOUT.spawn, exit), def.id + ' reachable from spawn');
    assert.ok(nav.findPath(exit, LAYOUT.spawn), def.id + ' can leave');
  }
});

it('each seat offers its own normal nearby prompt at the clear standing exit', () => {
  const { seats, world } = setup();
  for (const seat of seats) seat.enabled = true;
  const interaction = new InteractionSystem(world.interactables);
  for (const seat of seats) assert.equal(interaction.computeFocus(seat.seat!.exit)?.id, seat.id);
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

it('seat input guards preserve intentional nonseat teacher proxies and never activate unreachable seats', () => {
  const { seats } = setup();
  let active = 0;
  let seated = 0;
  const game = Object.assign(Object.create(Game.prototype), {
    input: { enabled: false },
    disposed: false,
    cinematicDepth: 0,
    pendingSeat: null,
    player: {
      position: new THREE.Vector3(),
      stand() {},
      stop() {},
      faceToward() {},
      walkTo() {
        return false;
      },
      sit() {
        seated++;
      },
    },
    interaction: { showDestination() {} },
    activate() {
      active++;
    },
  }) as Game;
  const seat = seats[0]!;
  game.goInteract(seat);
  assert.equal(seated, 0);
  game.goInteract({ ...seat, seat: undefined, kind: 'teacher' });
  assert.equal(active, 1, 'lesson proxies still activate their teacher with canvas input blocked');
  Object.assign(game, { input: { enabled: true } });
  game.goInteract(seat);
  assert.equal(seated, 0, 'no fallback seating when navigation fails');
  assert.equal(active, 1);
});

it('the actual painted couch and beanbag bubble edges are tappable on 320, 375 and 412 pixel phones', () => {
  const { seats, world } = setup();
  const interaction = new InteractionSystem(world.interactables);
  for (const id of ['seat-nook-couch', 'seat-classroom-coral'])
    for (const width of [320, 375, 412]) {
      const def = seats.find((d) => d.id === id)!;
      def.enabled = true;
      const seat = def.seat!;
      const start = seat.exit.clone().add(seat.exit.clone().sub(seat.position).setY(0).normalize().multiplyScalar(0.6));
      const rig = new CameraRig(width / 915, new Tweens());
      rig.camera.fov = 55;
      rig.camera.updateProjectionMatrix();
      rig.yaw = seat.yaw + 0.3;
      rig.pitch = 0.65;
      rig.distance = 5.5;
      for (let i = 0; i < 30; i++) {
        rig.update(0.1, start);
        rig.camera.updateMatrixWorld(true);
        interaction.update(0.1, start, rig.camera, 915);
      }
      interaction.root.updateMatrixWorld(true);
      const markers = (interaction as unknown as { markers: Map<string, { sprite: THREE.Sprite }> }).markers;
      const marker = markers.get(id)!.sprite;
      const p = marker.position.clone().project(rig.camera);
      const depth = -marker.position.clone().applyMatrix4(rig.camera.matrixWorldInverse).z;
      const spritePixels = (marker.scale.x * 915) / (2 * depth * Math.tan((rig.camera.fov * Math.PI) / 360));
      for (const angle of [Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]) {
        const point = new THREE.Vector2(
          p.x + (((Math.cos(angle) * 63 * spritePixels) / 192) * 2) / width,
          p.y + ((((Math.sin(angle) * 63 + 8) * spritePixels) / 192) * 2) / 915,
        );
        assert.equal(interaction.pick(point, rig.camera)?.id, id, `${id}: width ${width}, upper edge ${angle}`);
      }
    }
});

it('seated calves and shoes clear the actual front edges of cushions and chairs', () => {
  const { seats, avatar } = setup();
  for (const def of seats) {
    const seat = def.seat!;
    avatar.root.position.copy(seat.position);
    avatar.root.rotation.y = seat.yaw;
    avatar.setSeated(seat.reading ? 'read' : 'sit');
    avatar.root.updateMatrixWorld(true);
    const forward = new THREE.Vector3(Math.sin(seat.yaw), 0, Math.cos(seat.yaw));
    const edge =
      def.id === 'seat-nook-couch'
        ? 0.5
        : def.id === 'seat-library-armchair'
          ? 0.45
          : def.id === 'seat-nook-daisy'
            ? 0.55
            : def.id.startsWith('seat-table')
              ? 0.17
              : 0.45;
    for (const side of ['left', 'right']) {
      for (const part of ['calf', 'shoe']) {
        const mesh = avatar.root.getObjectByName(`${side}-${part}`) as THREE.Mesh;
        const points = mesh.geometry.getAttribute('position');
        for (let i = 0; i < points.count; i++) {
          const p = new THREE.Vector3().fromBufferAttribute(points, i).applyMatrix4(mesh.matrixWorld);
          // Chair shoes are below the thin seat pan; only calves overlap its height.
          if (def.id.startsWith('seat-table') && p.y < 0.275) continue;
          const f = p.sub(def.position).dot(forward);
          assert.ok(f > edge, `${def.id} ${side} ${part} at ${f.toFixed(3)} clears front ${edge}`);
        }
      }
    }
  }
});

it('seated garments fold above the cushion, cover the upper knees, and restore exactly on stand', () => {
  for (const outfit of ['dress', 'labcoat'] as const) {
    const avatar = new AvatarModel({ ...DEFAULT_AVATAR, outfit });
    const names = outfit === 'dress' ? ['dress-skirt', 'dress-hem'] : ['coat-hem'];
    const before = names.map((name) => {
      const part = avatar.root.getObjectByName(name)!;
      return { position: part.position.clone(), scale: part.scale.clone(), rotation: part.rotation.clone() };
    });
    avatar.setSeated('read');
    avatar.root.updateMatrixWorld(true);
    const garment = avatar.root.getObjectByName(names[0]!) as THREE.Mesh;
    const box = new THREE.Box3().setFromObject(garment);
    assert.ok(box.min.y >= 0.4 - 0.07, outfit + ' hem above seat plane');
    assert.ok(box.max.z > 0.3, outfit + ' lap covers bent knees');
    // Every calf vertex above the hem is inside the folded elliptical garment.
    const inverse = garment.matrixWorld.clone().invert();
    for (const side of ['left', 'right']) {
      const calf = avatar.root.getObjectByName(`${side}-calf`) as THREE.Mesh;
      const points = calf.geometry.getAttribute('position');
      for (let i = 0; i < points.count; i++) {
        const local = new THREE.Vector3().fromBufferAttribute(points, i).applyMatrix4(calf.matrixWorld).applyMatrix4(inverse);
        const height = outfit === 'dress' ? 0.3 : 0.46;
        if (local.y < -height / 2 || local.y > height / 2) continue;
        const fraction = (local.y + height / 2) / height;
        const radius = outfit === 'dress' ? 0.27 - fraction * 0.12 : 0.25 - fraction * 0.06;
        assert.ok(Math.hypot(local.x, local.z) < radius, `${outfit} covers ${side} knee`);
      }
    }
    avatar.setSeated(null);
    names.forEach((name, i) => {
      const part = avatar.root.getObjectByName(name)!;
      assert.deepEqual(part.position, before[i]!.position);
      assert.deepEqual(part.scale, before[i]!.scale);
      assert.deepEqual(part.rotation.toArray(), before[i]!.rotation.toArray());
    });
  }
});

/** Clip triangles to the tabletop's vertical slab; vertices alone miss a long coat crossing it. */
function tabletopDistance(points: THREE.Vector3[], centerX: number): number {
  let polygon = points;
  for (const [bound, sign] of [
    [0.474, 1],
    [0.526, -1],
  ] as const) {
    const clipped: THREE.Vector3[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!,
        b = polygon[(i + 1) % polygon.length]!;
      const insideA = sign * (a.y - bound) >= 0,
        insideB = sign * (b.y - bound) >= 0;
      if (insideA) clipped.push(a.clone());
      if (insideA !== insideB) clipped.push(a.clone().lerp(b, (bound - a.y) / (b.y - a.y)));
    }
    polygon = clipped;
  }
  let nearest = Infinity;
  const sides: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!,
      b = polygon[(i + 1) % polygon.length]!;
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared ? Math.max(0, Math.min(1, ((centerX - a.x) * dx + (0.9 - a.z) * dz) / lengthSquared)) : 0;
    nearest = Math.min(nearest, Math.hypot(a.x + t * dx - centerX, a.z + t * dz - 0.9));
    sides.push(dx * (0.9 - a.z) - dz * (centerX - a.x));
  }
  if (polygon.length >= 3 && sides.some((side) => Math.abs(side) > 1e-10) && (sides.every((side) => side >= -1e-10) || sides.every((side) => side <= 1e-10)))
    return 0;
  return nearest;
}

it('all six table chairs keep every outfit triangle clear of the tabletop and its rounded rim', () => {
  const { seats } = setup();
  for (const outfit of ['dress', 'tee', 'overalls', 'sweater', 'labcoat'] as const) {
    const avatar = new AvatarModel({ ...DEFAULT_AVATAR, outfit, hairStyle: 'long', accessory: 'backpack' });
    for (const def of seats.filter((seat) => seat.id.startsWith('seat-table-'))) {
      const seat = def.seat!;
      const tableX = def.id.startsWith('seat-table-1-') ? -2.3 : 2.3;
      avatar.root.position.copy(seat.position);
      avatar.root.rotation.y = seat.yaw;
      avatar.setSeated('sit');
      avatar.root.updateMatrixWorld(true);
      avatar.root.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || !object.visible) return;
        // The hidden reading book is not part of an ordinary chair pose.
        for (let parent = object.parent; parent; parent = parent.parent) if (!parent.visible) return;
        const attribute = object.geometry.getAttribute('position');
        const index = object.geometry.index;
        const points = Array.from({ length: attribute.count }, (_, i) =>
          new THREE.Vector3().fromBufferAttribute(attribute, i).applyMatrix4(object.matrixWorld),
        );
        const count = index ? index.count : attribute.count;
        for (let i = 0; i < count; i += 3) {
          const triangle = [0, 1, 2].map((offset) => points[index ? index.getX(i + offset) : i + offset]!);
          const radius = tabletopDistance(triangle, tableX);
          assert.ok(radius > 0.646, `${def.id} ${outfit} ${object.name || 'body'} clears tabletop at radius ${radius.toFixed(3)}`);
        }
      });
    }
  }
});

it('tabletop clearance catches triangles that cross the table without a vertex inside its height', () => {
  const triangle = [new THREE.Vector3(-2.3, 0.4, 0.9), new THREE.Vector3(-2.2, 0.6, 0.9), new THREE.Vector3(-2.4, 0.6, 1)];
  assert.ok(triangle.every((p) => p.y < 0.474 || p.y > 0.526));
  assert.ok(tabletopDistance(triangle, -2.3) < 0.646);
  assert.ok(
    tabletopDistance(
      triangle.map((p) => p.clone().add(new THREE.Vector3(3, 0, 0))),
      -2.3,
    ) > 0.646,
  );
});
