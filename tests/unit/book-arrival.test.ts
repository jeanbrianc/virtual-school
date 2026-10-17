import assert from 'node:assert/strict';
import { it } from 'node:test';
import * as THREE from 'three';
import { CAMERA } from '../../src/config/gameConfig';
import { Game } from '../../src/engine/Game';
import { Tweens } from '../../src/engine/core/tween';
import { BookArrivalCutaway, bookArrivalPlan } from '../../src/engine/systems/bookArrival';
import { CameraRig } from '../../src/engine/systems/cameraRig';
import { SchoolWorld } from '../../src/engine/world/SchoolWorld';
import { Particles } from '../../src/engine/fx/particles';
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
      const camera = new THREE.PerspectiveCamera(fov, viewport.width / viewport.height, plan.near, 200);
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
        .distanceTo(new THREE.Vector3(destination.x > -8.3 ? 0 : 0.9, 1.35, 4.25)) < 1e-12,
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

it('a later abort cannot overwrite the newer transform applied by setBooks', async () => {
  const tweens = new Tweens();
  const shelf = new Bookshelf(tweens, 'Sample');
  const controller = new AbortController();
  const old = book(25);
  const flight = shelf.flyBookIn(old, teacher, () => {}, { signal: controller.signal });
  await pump(tweens, 8);
  const updated = { ...old, shelfIndex: 26 };
  shelf.setBooks([updated]);
  const expected = shelf.slotTransform(updated.shelfIndex, updated.id).position;
  controller.abort();
  assert.deepEqual(shelf.root.getObjectByName(`book:${old.id}`)!.position, expected);
  await pump(tweens);
  await flight;
  assert.deepEqual(shelf.root.getObjectByName(`book:${old.id}`)!.position, expected);
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
    bookArrivalCutaway: null,
    scene: new THREE.Group().add(shelf.root),
    reducedMotion: false,
    renderer: { localClippingEnabled: false },
    opts: { container: { clientWidth: 320, clientHeight: 740 }, audio: { play() {} } },
    world: { bookshelf: shelf, structure: { root: new THREE.Group() }, anchors: new Map(), teachers: new Map() },
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
  assert.equal(rig.camera.near, 0.1, 'camera release restores the ordinary clipping plane');
});

it('desktop-to-phone resize updates the current pan and flight without replacing its completion promise', async () => {
  for (const framesBeforeResize of [3, 22]) {
    const tweens = new Tweens();
    const shelf = new Bookshelf(tweens, 'Sample');
    const rig = new CameraRig(1100 / 720, tweens);
    const container = { clientWidth: 1100, clientHeight: 720 };
    const player = new THREE.Vector3();
    rig.update(0.01, player);
    const game = Object.assign(Object.create(Game.prototype) as object, {
      tweens,
      rig,
      disposed: false,
      cinematicDepth: 0,
      bookArrival: null,
      bookArrivalCutaway: null,
      scene: new THREE.Group().add(shelf.root),
      reducedMotion: false,
      composer: null,
      renderer: { localClippingEnabled: false, setSize() {}, domElement: { style: {} } },
      opts: { container, audio: { play() {} } },
      world: { bookshelf: shelf, structure: { root: new THREE.Group() }, anchors: new Map(), teachers: new Map() },
      interaction: { hideMarker() {} },
      particles: { sparkle() {} },
    }) as unknown as Game;
    const b = book(25);
    let completions = 0;
    const arrival = game.celebrateBook(b).then(() => completions++);
    await pump(tweens, framesBeforeResize);
    container.clientWidth = 320;
    container.clientHeight = 740;
    game.resize();
    for (let i = 0; i < 60; i++) {
      await pump(tweens, 1);
      rig.update(0.1, player);
      rig.camera.updateMatrixWorld(true);
      const mesh = shelf.root.getObjectByName(`book:${b.id}`);
      if (!mesh) continue;
      const point = mesh.position.clone().project(rig.camera);
      assert.ok(
        Math.abs(point.x) < 0.9 && Math.abs(point.y) < 0.7 && point.z > -1 && point.z < 1,
        `resize after frame ${framesBeforeResize} lost book at ${point.toArray()}`,
      );
    }
    await arrival;
    assert.equal(completions, 1);
    assert.equal(game.busy, false);
    assert.deepEqual(shelf.root.getObjectByName(`book:${b.id}`)!.position, shelf.slotTransform(25, b.id).position);
  }
});

it('full-world landed books remain visible past Hoot, furniture and the grand ladder at every slot', async () => {
  const world = new SchoolWorld(new Tweens(), new Particles(), new Date('2026-06-01'), 'Sample');
  const books = Array.from({ length: 141 }, (_, index) => book(index));
  await world.apply(
    {
      shelfUnits: 4,
      shelfCapacities: [10, 15, 25, 50],
      booksOnShelves: 141,
      readingLamp: true,
      storyStars: true,
      readingNookOpen: true,
      grandLibrary: true,
      greenhouseOpen: false,
      plantCount: 0,
      fossilDisplay: false,
      dinoSkeleton: false,
      telescope: false,
      planetMobile: false,
      natureTable: false,
      natureItems: [],
      artLine: false,
      artworkCount: 0,
      artStudioOpen: false,
      rocketStage: 0,
      aquariumFish: 2,
      pets: [],
      trophies: [],
      preview: false,
    },
    books,
    false,
  );
  const renderer = { localClippingEnabled: false };
  const cutaway = new BookArrivalCutaway(world.root, [world.structure.root, world.bookshelf.root], renderer);
  for (const viewport of [...viewports, { width: 1100, height: 720 }])
    for (const b of books) {
      world.bookshelf.setBooks(books.filter((prior) => prior.shelfIndex <= b.shelfIndex));
      const transform = world.bookshelf.slotTransform(b.shelfIndex, b.id);
      const mesh = world.bookshelf.root.getObjectByName(`book:${b.id}`) as THREE.Mesh;
      mesh.position.copy(transform.position);
      mesh.rotation.z = transform.rotationZ;
      // Final bounce is the widest landing pose; even its corners must avoid near clipping.
      mesh.scale.set(1.12, 1 / 1.12, 1.12);
      world.root.updateMatrixWorld(true);
      const fov = viewport.width / viewport.height < 1 ? 55 : CAMERA.fov;
      const plan = bookArrivalPlan(transform.position, teacher, { ...viewport, fov });
      cutaway.update(plan.position, plan.target, plan.landNear);
      const camera = new THREE.PerspectiveCamera(fov, viewport.width / viewport.height, 0.1, 200);
      camera.position.copy(plan.position);
      camera.lookAt(plan.target);
      camera.updateMatrixWorld(true);
      mesh.geometry.computeBoundingBox();
      const bounds = mesh.geometry.boundingBox!;
      for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z]) {
            const point = new THREE.Vector3(x, y, z).applyMatrix4(mesh.matrixWorld).project(camera);
            assert.ok(point.z > -1 && point.z < 1, `clipped landing corner at ${viewport.width}px, slot ${b.shelfIndex}`);
          }
      const point = transform.position.clone().project(camera);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(point.x, point.y), camera);
      const hits = ray.intersectObject(world.root, true).filter((hit) => {
        for (let node: THREE.Object3D | null = hit.object; node; node = node.parent) if (!node.visible) return false;
        // Perspective near clipping is an axial plane, not Raycaster's radial distance.
        const depth = -hit.point.clone().applyMatrix4(camera.matrixWorldInverse).z;
        const mesh = hit.object as THREE.Mesh;
        const material = Array.isArray(mesh.material) ? mesh.material[hit.face?.materialIndex ?? 0] : mesh.material;
        return depth >= camera.near && depth <= camera.far && !material?.clippingPlanes?.some((plane) => plane.distanceToPoint(hit.point) < 0);
      });
      assert.equal(hits[0]?.object.name, mesh.name, `foreground obstruction at ${viewport.width}px slot ${b.shelfIndex}`);
    }
  cutaway.dispose();
  assert.equal(renderer.localClippingEnabled, false);
});

it('foreground cutaway preserves room/shelf materials, shares temporary copies and restores renderer state', () => {
  const root = new THREE.Group();
  const room = new THREE.Group();
  const shelf = new THREE.Group();
  const originalPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 100);
  const shared = new THREE.MeshStandardMaterial({ clippingPlanes: [originalPlane] });
  const other = new THREE.MeshBasicMaterial();
  let originalDisposals = 0;
  shared.addEventListener('dispose', () => originalDisposals++);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(), shared);
  const bookMaterials = [shared, other];
  const bookMesh = new THREE.Mesh(new THREE.BoxGeometry(), bookMaterials);
  room.add(floor);
  shelf.add(bookMesh);
  const teacherMesh = new THREE.Mesh(new THREE.BoxGeometry(), shared);
  const furnitureMaterials = [shared, other];
  const furniture = new THREE.Mesh(new THREE.BoxGeometry(), furnitureMaterials);
  root.add(room, shelf, teacherMesh, furniture);
  const renderer = { localClippingEnabled: true };
  const cutaway = new BookArrivalCutaway(root, [room, shelf], renderer);
  assert.equal(floor.material, shared);
  assert.equal(bookMesh.material, bookMaterials);
  assert.notEqual(teacherMesh.material, shared);
  assert.equal(furniture.material[0], teacherMesh.material, 'shared source gets one temporary clone');
  assert.equal(shared.clippingPlanes?.length, 1, 'original material remains unchanged');
  const clone = teacherMesh.material;
  let cloneDisposals = 0;
  clone.addEventListener('dispose', () => cloneDisposals++);
  cutaway.update(new THREE.Vector3(0, 0, 5), new THREE.Vector3(), 4);
  const plane = clone.clippingPlanes![1];
  assert.ok(plane);
  assert.ok(plane.distanceToPoint(new THREE.Vector3(0, 0, 2)) < 0, 'foreground gets clipped');
  assert.ok(plane.distanceToPoint(new THREE.Vector3()) > 0, 'destination stays visible');
  cutaway.dispose();
  cutaway.dispose();
  assert.equal(teacherMesh.material, shared);
  assert.equal(furniture.material, furnitureMaterials);
  assert.equal(renderer.localClippingEnabled, true, 'restore an already-enabled renderer too');
  assert.equal(cloneDisposals, 1);
  assert.equal(originalDisposals, 0);
});
