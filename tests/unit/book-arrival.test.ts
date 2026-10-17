import assert from 'node:assert/strict';
import { it } from 'node:test';
import * as THREE from 'three';
import { CAMERA } from '../../src/config/gameConfig';
import { Game } from '../../src/engine/Game';
import { Tweens } from '../../src/engine/core/tween';
import { bookArrivalPlan } from '../../src/engine/systems/bookArrival';
import { CameraRig } from '../../src/engine/systems/cameraRig';
import { Bookshelf, type ShelfBook } from '../../src/engine/world/bookshelf';

// Real geometry/projection, synthetic canvas text. Pixel checks live in Playwright.
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
const book = (shelfIndex: number, id = `synthetic-${shelfIndex}`): ShelfBook => ({
  id,
  title: `Synthetic story ${shelfIndex}`,
  author: 'Sample Author',
  shelfIndex,
  cover: { background: '#b340e0', accent: '#fff183', motif: 'owl' },
});
const teacher = new THREE.Vector3(-8.1, 2.3, -4.8);
const boundaries = [0, 9, 10, 24, 25, 31, 49, 50, 59, 99, 100, 107, 108, 140];
const viewports = [
  { width: 320, height: 740 },
  { width: 375, height: 812 },
  { width: 412, height: 915 },
  { width: 667, height: 375 },
  { width: 740, height: 320 },
];

it('reproduces the fixed first-two-cases shot losing the third-case arrival on a 320px phone', () => {
  const shelf = new Bookshelf(new Tweens(), 'Sample');
  const camera = new THREE.PerspectiveCamera(55, 320 / 740, 0.1, 200);
  camera.position.copy(shelf.focus.position);
  camera.lookAt(shelf.focus.target);
  camera.updateMatrixWorld(true);
  const destination = shelf.slotTransform(25, book(25).id).position.project(camera);
  assert.ok(Math.abs(destination.x) > 1, `old third-case x=${destination.x}`);
});

it('frames the actual slot and whole compact flight at every shelf and overflow boundary', () => {
  const shelf = new Bookshelf(new Tweens(), 'Sample');
  for (const viewport of viewports)
    for (const index of boundaries) {
      const destination = shelf.slotTransform(index, book(index).id).position;
      const fov = viewport.width / viewport.height < 1 ? 55 : CAMERA.fov;
      const plan = bookArrivalPlan(destination, teacher, { ...viewport, fov });
      const camera = new THREE.PerspectiveCamera(fov, viewport.width / viewport.height, 0.1, 200);
      camera.position.copy(plan.position);
      camera.lookAt(plan.target);
      camera.updateMatrixWorld(true);
      const front = destination.clone().add(new THREE.Vector3(0, 0.05, 0.9));
      const control = plan.from
        .clone()
        .lerp(front, 0.5)
        .add(new THREE.Vector3(0, plan.arcHeight, 0));
      const curve = new THREE.QuadraticBezierCurve3(plan.from, control, front);
      for (const center of [destination, ...Array.from({ length: 21 }, (_, i) => curve.getPoint(i / 20))]) {
        // A .44m box bounds even the enlarged/spinning book. Stay below phone HUD.
        for (const x of [-0.44, 0.44])
          for (const y of [-0.44, 0.44])
            for (const z of [-0.44, 0.44]) {
              const ndc = center
                .clone()
                .add(new THREE.Vector3(x, y, z))
                .project(camera);
              const screenY = ((1 - ndc.y) / 2) * viewport.height;
              assert.ok(Math.abs(ndc.x) < 0.9, `${viewport.width}px slot ${index} horizontal clipping`);
              assert.ok(ndc.z > -1 && ndc.z < 1);
              assert.ok(screenY > 100 && screenY < viewport.height - 60, `${viewport.width}x${viewport.height} slot ${index} HUD overlap at ${screenY}`);
            }
      }
      assert.ok(Math.abs(plan.target.x - destination.x) < 0.1, `target must follow slot ${index}`);
    }
});

it('preserves the desktop arrival angle and flight from Hoot while translating to later destinations', () => {
  const shelf = new Bookshelf(new Tweens(), 'Sample');
  for (const index of boundaries) {
    const destination = shelf.slotTransform(index, book(index).id).position;
    const plan = bookArrivalPlan(destination, teacher, { width: 1100, height: 720, fov: CAMERA.fov });
    assert.deepEqual(plan.target, destination);
    assert.ok(
      plan.position
        .clone()
        .sub(destination)
        .distanceTo(new THREE.Vector3(0.9, 1.35, 4.25)) < 1e-12,
    );
    assert.deepEqual(plan.from, teacher);
    assert.equal(plan.arcHeight, 2.4);
  }
});

async function pump(tweens: Tweens, frames = 120) {
  for (let i = 0; i < frames; i++) {
    tweens.update(0.1);
    await Promise.resolve();
  }
}

it('repeated arrival reuses a stable mesh and cancellation/reload stops stale movement', async () => {
  const tweens = new Tweens();
  const shelf = new Bookshelf(tweens, 'Sample');
  const b = book(25);
  let landed = 0;
  const first = shelf.flyBookIn(b, teacher, () => landed++);
  await pump(tweens, 7);
  const controller = new AbortController();
  const second = shelf.flyBookIn(b, teacher, () => landed++, { signal: controller.signal });
  await pump(tweens, 7);
  controller.abort();
  const destination = shelf.slotTransform(25, b.id).position;
  assert.deepEqual(shelf.root.getObjectByName(`book:${b.id}`)!.position, destination);
  await pump(tweens);
  await Promise.all([first, second]);
  assert.equal(landed, 0);
  assert.equal(shelf.root.children.filter((node) => node.name === `book:${b.id}`).length, 1);
  assert.deepEqual(shelf.root.getObjectByName(`book:${b.id}`)!.position, destination);
  const third = shelf.flyBookIn(b, teacher, () => landed++);
  await pump(tweens, 8);
  shelf.setBooks([b]);
  await pump(tweens);
  await third;
  assert.equal(landed, 0);
  assert.deepEqual(shelf.root.getObjectByName(`book:${b.id}`)!.position, destination);
  const reload = new Bookshelf(tweens, 'Sample');
  reload.setBooks([b]);
  assert.deepEqual(reload.root.getObjectByName(`book:${b.id}`)!.position, destination);
});

it('overflow settles in the same rotated stack pose after flight, cancellation and reload', async () => {
  const tweens = new Tweens();
  const shelf = new Bookshelf(tweens, 'Sample');
  const b = book(108);
  const flight = shelf.flyBookIn(b, teacher, () => {});
  await pump(tweens);
  await flight;
  const mesh = shelf.root.getObjectByName(`book:${b.id}`)!;
  const transform = shelf.slotTransform(108, b.id);
  assert.deepEqual(mesh.position, transform.position);
  assert.equal(mesh.rotation.z, Math.PI / 2);
  assert.deepEqual(mesh.scale.toArray(), [1, 1, 1]);
  shelf.setBooks([b]);
  assert.deepEqual(mesh.position, transform.position);
  assert.equal(mesh.rotation.z, Math.PI / 2);
});

it('newer arrival and camera release cannot be overwritten by an older awaited arrival', async () => {
  const tweens = new Tweens();
  const shelf = new Bookshelf(tweens, 'Sample');
  const rig = new CameraRig(320 / 740, tweens);
  rig.camera.fov = 55;
  rig.update(0.01, new THREE.Vector3());
  const game = Object.assign(Object.create(Game.prototype) as object, {
    tweens,
    rig,
    disposed: false,
    cinematicDepth: 0,
    bookArrival: null,
    reducedMotion: false,
    opts: { container: { clientWidth: 320, clientHeight: 740 }, audio: { play() {} } },
    world: { bookshelf: shelf, anchors: new Map(), teachers: new Map() },
    interaction: { hideMarker() {} },
    particles: { sparkle() {} },
  }) as unknown as Game;
  const old = game.celebrateBook(book(24));
  await pump(tweens, 3);
  const latest = game.celebrateBook(book(25));
  await pump(tweens);
  await Promise.all([old, latest]);
  assert.equal(shelf.hasBook(book(24).id), false, 'interrupted pan must not start a late flight');
  assert.equal(shelf.hasBook(book(25).id), true);
  assert.equal(game.busy, false);
  const interrupted = game.celebrateBook(book(50));
  await pump(tweens, 15);
  const released = game.releaseCamera();
  await pump(tweens);
  await Promise.all([interrupted, released]);
  assert.equal(game.busy, false);
  assert.equal(rig.inCinematic, false, 'stale arrival must not recapture the camera');
});
