/** Real pointer/touch, keyboard and interrupted seating with synthetic profiles only. */
import { writeFileSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from 'playwright/test';
import type * as THREE from 'three';
import type { AvatarConfig } from '../../src/domain/types';
import type { WorldState } from '../../src/domain/world/worldState';
import type { InteractableDef } from '../../src/engine/world/types';
import type { SeatAnchor } from '../../src/engine/world/seats';
import { APP, enterSchool } from './helpers';
import { loadBookSample } from './fixtures/book-arrival';
import { CHILD_SCOPED_TABLES, DB_NAME } from '../../src/data/schema';
import { CAMERA } from '../../src/config/gameConfig';

type SeatingGame = {
  busy: boolean;
  seated: boolean;
  pendingSeat: string | null;
  standUp(): void;
  teleport(x: number, z: number): void;
  teleportTo(id: string): void;
  interactById(id: string): void;
  setInputEnabled(value: boolean): void;
  setAvatar(config: AvatarConfig): void;
  applyWorld(state: WorldState, books: [], animate: boolean): Promise<void>;
  renderer: { info: { render: { frame: number } } };
  input: { enabled: boolean };
  avatar: { root: THREE.Group; config: AvatarConfig; seatedPose: string | null };
  player: {
    position: THREE.Vector3;
    yaw: number;
    seated: SeatAnchor | null;
    isWalkingPath: boolean;
    nav: { findPath(from: { x: number; z: number }, to: { x: number; z: number }): { x: number; z: number }[] | null };
  };
  interaction: {
    markers: Map<string, { sprite: THREE.Sprite }>;
    pick(point: THREE.Vector2, camera: THREE.PerspectiveCamera): InteractableDef | null;
    pickFloor(point: THREE.Vector2, camera: THREE.PerspectiveCamera): THREE.Vector3 | null;
  };
  rig: {
    camera: THREE.PerspectiveCamera;
    yaw: number;
    pitch: number;
    distance: number;
    spotlight: boolean;
    inCinematic: boolean;
    snapTo(p: THREE.Vector3): void;
  };
  world: {
    root: THREE.Group;
    interactables: InteractableDef[];
    currentState: WorldState;
    structure: { collisions: { blocked(x: number, z: number, radius: number): boolean } };
  };
};

/** Visual play must not write reading, evidence, mastery, rewards, or saved appearances. */
async function savedLearning(page: Page) {
  return page.evaluate(
    async ({ name, tables }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const entries = await Promise.all(
          tables.map(
            (table) =>
              new Promise<[string, unknown[]]>((resolve, reject) => {
                const request = db.transaction(table).objectStore(table).getAll();
                request.onsuccess = () => resolve([table, request.result]);
                request.onerror = () => reject(request.error);
              }),
          ),
        );
        return Object.fromEntries(entries);
      } finally {
        db.close();
      }
    },
    { name: DB_NAME, tables: CHILD_SCOPED_TABLES },
  );
}

async function frames(page: Page, count = 6) {
  const current = await page.evaluate(() => (window.__izzy!.game() as unknown as SeatingGame).renderer.info.render.frame);
  await page.waitForFunction(
    ({ current, count }) => (window.__izzy!.game() as unknown as SeatingGame).renderer.info.render.frame >= current + count,
    { current, count },
    { timeout: 120_000 },
  );
}
async function ready(page: Page) {
  await expect(page.getByTestId('child-mode')).toHaveClass(/\bready\b/, { timeout: 300_000 });
  await page.waitForFunction(
    () => {
      const g = window.__izzy?.game() as unknown as SeatingGame | null;
      return g && !g.busy && g.input.enabled && !window.__izzy!.overlay();
    },
    null,
    { timeout: 300_000 },
  );
}
async function snapshot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}-${info.project.name}.png`);
  await page.screenshot({ path });
  await info.attach(`${name} (synthetic Sample profile)`, { path, contentType: 'image/png' });
}
async function prepareSeat(page: Page, id: string) {
  await page.evaluate((id) => {
    const g = window.__izzy!.game() as unknown as SeatingGame;
    const seat = g.world.interactables.find((d) => d.id === id)!.seat!;
    const away = seat.exit.clone().sub(seat.position).setY(0).normalize().multiplyScalar(0.6);
    const start = seat.exit.clone().add(away);
    g.teleport(
      g.world.structure.collisions.blocked(start.x, start.z, 0.3) ? seat.exit.x : start.x,
      g.world.structure.collisions.blocked(start.x, start.z, 0.3) ? seat.exit.z : start.z,
    );
    g.rig.yaw = seat.yaw + 0.3;
    g.rig.pitch = 0.65;
    g.rig.distance = 9;
    g.rig.snapTo(g.player.position);
  }, id);
  await frames(page);
}
async function tapSeat(page: Page, id: string, mobile: boolean) {
  const point = await page.evaluate((id) => {
    const g = window.__izzy!.game() as unknown as SeatingGame;
    const marker = g.interaction.markers.get(id)!.sprite;
    const p = marker.position.clone().project(g.rig.camera);
    const canvas = document.querySelector('canvas.game-canvas')!;
    const bounds = canvas.getBoundingClientRect();
    const x = bounds.left + ((p.x + 1) * bounds.width) / 2;
    const y = bounds.top + ((1 - p.y) * bounds.height) / 2;
    const depth = -marker.position.clone().applyMatrix4(g.rig.camera.matrixWorldInverse).z;
    const diameter = (((marker.scale.x * bounds.height) / (2 * depth * Math.tan((g.rig.camera.fov * Math.PI) / 360))) * 140) / 192;
    const edgeY = y - (diameter * 71) / 140;
    const edge = p.clone().setY(p.y + (diameter * 71) / 70 / bounds.height);
    return {
      x,
      y,
      edgeY,
      edgePicked: g.interaction.pick(edge as unknown as THREE.Vector2, g.rig.camera)?.id,
      edgeOnCanvas: document.elementFromPoint(x, edgeY) === canvas,
      visible: marker.visible,
      picked: g.interaction.pick(p as unknown as THREE.Vector2, g.rig.camera)?.id,
      onCanvas: document.elementFromPoint(x, y) === canvas,
      targetDiameter: (((marker.scale.x * bounds.height) / (2 * depth * Math.tan((g.rig.camera.fov * Math.PI) / 360))) * 140) / 192,
    };
  }, id);
  expect(point.visible, id + ' visible seat marker').toBe(true);
  expect(point.picked, id + ' exact chair target').toBe(id);
  expect(point.onCanvas, id + ' unobstructed touch target').toBe(true);
  expect(point.targetDiameter, id + ' minimum 44 CSS-pixel marker').toBeGreaterThanOrEqual(44);
  if (mobile) {
    expect(point.edgePicked, id + ' visible upper bubble edge is tappable').toBe(id);
    expect(point.edgeOnCanvas).toBe(true);
    await page.touchscreen.tap(point.x, point.edgeY);
  } else await page.mouse.click(point.x, point.y);
}
async function expectSeated(page: Page, id: string, settleFrames = 15) {
  await expect
    .poll(
      () =>
        page.evaluate((id) => {
          const g = window.__izzy!.game() as unknown as SeatingGame;
          return g.player.seated === g.world.interactables.find((d) => d.id === id)?.seat;
        }, id),
      { timeout: 120_000 },
    )
    .toBe(true);
  await frames(page, settleFrames);
  await expect(page.getByTestId('interact-prompt')).toContainText('Stand up');
  await expect(page.getByTestId('interact-prompt')).toBeInViewport();
  const box = await page.getByTestId('interact-prompt').boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  const geometry = await page.evaluate((id) => {
    const g = window.__izzy!.game() as unknown as SeatingGame;
    const def = g.world.interactables.find((d) => d.id === id)!;
    const seat = def.seat!;
    const face = g.player.position
      .clone()
      .add({ x: 0, y: 1, z: 0 } as THREE.Vector3)
      .project(g.rig.camera);
    const book = g.avatar.root.getObjectByName('seated-open-book')!;
    return {
      error: g.player.position.distanceTo(seat.position),
      yaw: Math.abs(g.player.yaw - seat.yaw),
      pose: g.avatar.seatedPose,
      book: book.visible,
      face: { x: face.x, y: face.y, z: face.z },
      walking: g.player.isWalkingPath,
      cameraLocked: g.rig.inCinematic,
    };
  }, id);
  expect(geometry.error).toBeLessThan(0.001);
  expect(geometry.yaw).toBeLessThan(0.001);
  expect(geometry.pose).toBe(id === 'seat-nook-couch' ? 'read' : 'sit');
  expect(geometry.book).toBe(id === 'seat-nook-couch');
  expect(Math.abs(geometry.face.x)).toBeLessThan(0.8);
  expect(Math.abs(geometry.face.y)).toBeLessThan(0.8);
  expect(geometry.face.z).toBeLessThan(1);
  expect(geometry.walking).toBe(false);
  expect(geometry.cameraLocked).toBe(false);
}
async function expectStanding(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const g = window.__izzy!.game() as unknown as SeatingGame;
        return {
          seated: g.seated,
          pose: g.avatar.seatedPose,
          book: g.avatar.root.getObjectByName('seated-open-book')!.visible,
          pending: g.pendingSeat,
          blocked: g.world.structure.collisions.blocked(g.player.position.x, g.player.position.z, 0.3),
        };
      }),
    )
    .toEqual({ seated: false, pose: null, book: false, pending: null, blocked: false });
}

// Every rendered chair is exercised through its actual canvas bubble on both devices.
test('all eleven seats have real reachable taps, framed personalized poses and safe stand exits', async ({ page, isMobile }, info) => {
  await loadBookSample(page, 25);
  await enterSchool(page, 'sample');
  await ready(page);
  const before = await savedLearning(page);
  const config = await page.evaluate(() => (window.__izzy!.game() as unknown as SeatingGame).avatar.config);
  const ids = await page.evaluate(() => (window.__izzy!.game() as unknown as SeatingGame).world.interactables.filter((d) => d.seat).map((d) => d.id));
  expect(ids).toHaveLength(11);
  for (const id of ids) {
    await prepareSeat(page, id);
    await tapSeat(page, id, isMobile);
    await expectSeated(page, id);
    await snapshot(page, info, id);
    expect(await page.evaluate(() => (window.__izzy!.game() as unknown as SeatingGame).avatar.config)).toEqual(config);
    await page.getByTestId('interact-prompt').click();
    await expectStanding(page);
    // Normal follow camera, no seat shot or special aiming: every chair has the
    // same accessible prompt a learner sees when walking up to the furniture.
    await page.evaluate(
      ({ id, camera }) => {
        const g = window.__izzy!.game() as unknown as SeatingGame;
        const exit = g.world.interactables.find((d) => d.id === id)!.seat!.exit;
        g.teleport(exit.x, exit.z);
        g.rig.yaw = camera.defaultYaw;
        g.rig.pitch = camera.defaultPitch;
        g.rig.distance = camera.defaultDistance;
        g.rig.spotlight = false;
        g.rig.snapTo(g.player.position);
      },
      { id, camera: CAMERA },
    );
    await frames(page);
    const label = await page.evaluate((id) => (window.__izzy!.game() as unknown as SeatingGame).world.interactables.find((d) => d.id === id)!.label, id);
    await expect(page.getByTestId('interact-prompt')).toContainText(label);
    await expect(page.getByTestId('interact-prompt')).toBeInViewport();
    await snapshot(page, info, `${id}-default-approach`);
    await page.getByTestId('interact-prompt').click();
    await expectSeated(page, id, 2);
    await page.getByTestId('interact-prompt').click();
    await expectStanding(page);
  }
  expect(await savedLearning(page)).toEqual(before);
});

test('seating cancels cleanly for taps, keys, repeated approaches, switching, resize and room or child travel', async ({ page, isMobile }, info) => {
  await loadBookSample(page, 25);
  await enterSchool(page, 'sample');
  await ready(page);
  const before = await savedLearning(page);
  const couch = 'seat-nook-couch';
  await prepareSeat(page, couch);
  await tapSeat(page, couch, isMobile);
  await expectSeated(page, couch);
  // Escape and keyboard movement are handled by the real canvas input listener.
  await page.keyboard.press('Escape');
  await expectStanding(page);
  await page.evaluate((id) => {
    const g = window.__izzy!.game() as unknown as SeatingGame;
    g.teleportTo(id);
  }, couch);
  await frames(page);
  await page.locator('canvas.game-canvas').focus();
  await page.keyboard.press('Space');
  await expectSeated(page, couch);
  await page.keyboard.down('ArrowDown');
  await frames(page, 2);
  await page.keyboard.up('ArrowDown');
  await expectStanding(page);

  // Rapid repeat requests and a different-seat request discard the older arrival callback.
  await page.evaluate(() => {
    const g = window.__izzy!.game() as unknown as SeatingGame;
    g.teleport(-13, 2);
    g.interactById('seat-nook-couch');
    g.interactById('seat-nook-couch');
    g.interactById('seat-library-armchair');
  });
  await expectSeated(page, 'seat-library-armchair');
  await page.evaluate(() => (window.__izzy!.game() as unknown as SeatingGame).interactById('seat-nook-couch'));
  await expectSeated(page, couch);

  // Find an honest empty-floor target in the current seated view, then tap it.
  const point = await page.evaluate(() => {
    const g = window.__izzy!.game() as unknown as SeatingGame;
    const canvas = document.querySelector('canvas.game-canvas')!;
    const b = canvas.getBoundingClientRect();
    const unreachable: { x: number; z: number; reason: string }[] = [];
    // Scan the actual view rather than assuming a tiny world-space patch is visible.
    for (const ny of [-0.4, -0.55, -0.7, -0.25, -0.1])
      for (const nx of [-0.6, 0.6, -0.4, 0.4, -0.8, 0.8, 0]) {
        const p = g.player.position.clone().set(nx, ny, 0) as unknown as THREE.Vector2;
        const floor = g.interaction.pickFloor(p, g.rig.camera);
        const sx = b.left + ((nx + 1) * b.width) / 2;
        const sy = b.top + ((1 - ny) * b.height) / 2;
        if (
          !floor ||
          floor.distanceTo(g.player.seated!.exit) < 0.6 ||
          g.world.structure.collisions.blocked(floor.x, floor.z, 0.32) ||
          g.interaction.pick(p, g.rig.camera) ||
          document.elementFromPoint(sx, sy) !== canvas
        )
          continue;
        // Collision-clear floor can still be an isolated pocket behind furniture.
        // Require the ordinary navigation graph to reach this exact destination.
        const path = g.player.nav.findPath(g.player.seated!.exit, floor);
        const end = path?.at(-1);
        if (!end || Math.hypot(end.x - floor.x, end.z - floor.z) > 0.1) {
          unreachable.push({ x: floor.x, z: floor.z, reason: !path ? 'no connected path' : 'path ends elsewhere' });
          continue;
        }
        return { x: sx, y: sy, floorX: floor.x, floorZ: floor.z, exit: g.player.seated!.exit.toArray(), path, unreachable };
      }
    return null;
  });
  expect(point).not.toBeNull();
  const proofPath = info.outputPath('floor-target-navigation-proof.json');
  writeFileSync(proofPath, JSON.stringify(point, null, 2));
  await info.attach('floor-target-navigation-proof', { path: proofPath, contentType: 'application/json' });
  if (isMobile) await page.touchscreen.tap(point!.x, point!.y);
  else await page.mouse.click(point!.x, point!.y);
  await expectStanding(page);
  await expect
    .poll(
      () =>
        page.evaluate(({ floorX, floorZ }) => {
          const g = window.__izzy!.game() as unknown as SeatingGame;
          return Math.hypot(g.player.position.x - floorX, g.player.position.z - floorZ);
        }, point!),
      { timeout: 120_000 },
    )
    .toBeLessThan(0.35);
  await snapshot(page, info, 'floor-tap-exit-navigation');

  await prepareSeat(page, 'seat-table-1-1');
  await tapSeat(page, 'seat-table-1-1', isMobile);
  await expectSeated(page, 'seat-table-1-1');
  await tapSeat(page, 'seat-table-1-2', isMobile);
  await expectSeated(page, 'seat-table-1-2');
  await page.getByTestId('interact-prompt').click();
  await expectStanding(page);

  for (const size of isMobile
    ? [
        { width: 320, height: 812 },
        { width: 375, height: 812 },
        { width: 412, height: 915 },
        { width: 915, height: 412 },
      ]
    : [{ width: 980, height: 680 }]) {
    await page.setViewportSize(size);
    await frames(page);
    await prepareSeat(page, couch);
    await tapSeat(page, couch, isMobile);
    await expectSeated(page, couch);
    await snapshot(page, info, `couch-${size.width}x${size.height}`);
    await page.setViewportSize({ width: size.width + 1, height: size.height });
    await expectStanding(page);
  }
  // Input-blocking overlays, travel and route disposal never retain a seated avatar.
  await page.evaluate((id) => {
    const g = window.__izzy!.game() as unknown as SeatingGame;
    g.teleportTo(id);
    g.interactById(id);
    g.setInputEnabled(false);
    g.setInputEnabled(true);
  }, couch);
  await expectStanding(page);
  await page.evaluate((id) => {
    const g = window.__izzy!.game() as unknown as SeatingGame;
    g.teleportTo(id);
    g.interactById(id);
    g.teleportTo('globe');
  }, couch);
  await expectStanding(page);
  await prepareSeat(page, couch);
  await tapSeat(page, couch, isMobile);
  await expectSeated(page, couch);
  await page.goto(`${APP}#/school/child_georgia`);
  await expect(page.getByTestId('child-mode')).toHaveClass(/\bready\b/, { timeout: 300_000 });
  await expect.poll(() => page.evaluate(() => (window.__izzy?.game() as unknown as SeatingGame | null)?.seated)).toBe(false);
  await enterSchool(page, 'sample');
  await ready(page);
  await expectStanding(page);
  expect(await savedLearning(page)).toEqual(before);
  await page.reload();
  await ready(page);
  await expectStanding(page);
});

test('locked nook cannot be seated by ID; unlocking, relocking and avatar restyling clear reading safely', async ({ page, isMobile }, info) => {
  await loadBookSample(page, 24);
  await enterSchool(page, 'sample');
  await ready(page);
  const before = await savedLearning(page);
  await page.evaluate(() => {
    const g = window.__izzy!.game() as unknown as SeatingGame;
    g.interactById('seat-nook-couch');
  });
  await frames(page);
  await expectStanding(page);
  await page.evaluate(async () => {
    const g = window.__izzy!.game() as unknown as SeatingGame;
    await g.applyWorld({ ...g.world.currentState, readingNookOpen: true }, [], false);
  });
  await prepareSeat(page, 'seat-nook-couch');
  await tapSeat(page, 'seat-nook-couch', isMobile);
  await expectSeated(page, 'seat-nook-couch');
  for (const outfit of ['dress', 'labcoat'] as const) {
    await page.evaluate((outfit) => {
      const g = window.__izzy!.game() as unknown as SeatingGame;
      g.setAvatar({ ...g.avatar.config, outfit, hairStyle: 'long', accessory: 'backpack', outfitColor: '#6538a8', accentColor: '#e8b334' });
    }, outfit);
    await expectStanding(page);
    await prepareSeat(page, 'seat-nook-couch');
    await tapSeat(page, 'seat-nook-couch', isMobile);
    await expectSeated(page, 'seat-nook-couch');
    await snapshot(page, info, `reading-${outfit}-long-hair-backpack`);
    for (const id of ['seat-table-1-1', 'seat-table-3-2']) {
      await page.getByTestId('interact-prompt').click();
      await expectStanding(page);
      await prepareSeat(page, id);
      await tapSeat(page, id, isMobile);
      await expectSeated(page, id);
      await snapshot(page, info, `${id}-${outfit}-long-hair-backpack`);
    }
  }
  await page.getByTestId('interact-prompt').click();
  await expectStanding(page);
  await prepareSeat(page, 'seat-nook-couch');
  await tapSeat(page, 'seat-nook-couch', isMobile);
  await expectSeated(page, 'seat-nook-couch');
  await page.evaluate(async () => {
    const g = window.__izzy!.game() as unknown as SeatingGame;
    await g.applyWorld({ ...g.world.currentState, readingNookOpen: false }, [], false);
  });
  await expectStanding(page);
  expect(await page.evaluate(() => (window.__izzy!.game() as unknown as SeatingGame).player.position.x)).toBeGreaterThan(-14);
  await page.evaluate(async () => {
    const g = window.__izzy!.game() as unknown as SeatingGame;
    await g.applyWorld({ ...g.world.currentState, readingNookOpen: true }, [], false);
    g.teleport(-13, 2);
    g.interactById('seat-nook-couch');
    await g.applyWorld({ ...g.world.currentState, readingNookOpen: false }, [], false);
  });
  await frames(page);
  await expectStanding(page);
  expect(await savedLearning(page)).toEqual(before);
});
