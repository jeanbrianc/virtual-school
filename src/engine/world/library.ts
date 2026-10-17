/**
 * The Library: Izzy's shelf (see bookshelf.ts), Professor Hoot's lectern,
 * a braided rug and armchair, the school's own tall shelves, the Reading
 * Nook behind a curtain, and reward features (lamp, story stars, chandelier).
 */
import * as THREE from 'three';
import { createRng } from '../../domain/util/random';
import { ease } from '../core/tween';
import { box, contactShadow, cyl, group, mat, rbox, sphere, uniqueMat } from '../render/kit';
import { rugTexture, signTexture } from '../render/textures';
import { bakeStatic } from '../render/bake';
import { gardenMuralMaterial, gardenPot, gardenSunlight, gardenWallDecor } from './gardenNook';
import { addSeat } from './seats';
import { LAYOUT, PALETTE } from '../palette';
import { toggleFeature, type BuildContext } from './types';

/** A zone sign mounted flat on a wall (never blocks the camera). */
export function wallSign(text: string, icon: string, bg: string = PALETTE.cream, fg: string = PALETTE.walnut, width = 1.9): THREE.Group {
  const g = new THREE.Group();
  const tex = signTexture(text, { icon, bg, fg });
  const board = rbox(width, width * 0.315, 0.06, 0.04, mat(PALETTE.walnut), 0, 0, 0);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.95, width * 0.295), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  face.position.z = 0.035;
  g.add(board, face);
  return g;
}

export function hangingSign(
  text: string,
  icon: string,
  x: number,
  y: number,
  z: number,
  rotY = 0,
  bg: string = PALETTE.cream,
  fg: string = PALETTE.walnut,
): THREE.Group {
  const g = new THREE.Group();
  const tex = signTexture(text, { icon, bg, fg });
  const board = rbox(1.9, 0.6, 0.06, 0.04, mat(PALETTE.walnut), 0, 0, 0);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.56), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  face.position.z = 0.035;
  const back = face.clone();
  back.rotation.y = Math.PI;
  back.position.z = -0.035;
  g.add(board, face, back);
  for (const s of [-1, 1]) g.add(cyl(0.008, 0.008, 1.6, mat('#6b5a45'), s * 0.7, 1.1, 0, 6));
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  return g;
}

function decorativeShelf(ctx: BuildContext, x: number, z: number, rotY: number, seed: number) {
  const g = new THREE.Group();
  const wood = mat(PALETTE.walnut, { roughness: 0.6 });
  const w = 2.2;
  const h = 3.1;
  const d = 0.4;
  g.add(box(0.06, h, d, wood, -w / 2, h / 2, 0), box(0.06, h, d, wood, w / 2, h / 2, 0), box(w, h, 0.03, mat('#5c3b25'), 0, h / 2, -d / 2));
  g.add(rbox(w + 0.2, 0.08, d + 0.08, 0.03, wood, 0, h + 0.04, 0));
  const rows = 6;
  const rowH = (h - 0.1) / rows;
  for (let r = 0; r <= rows; r++) g.add(box(w, 0.04, d, wood, 0, 0.06 + r * rowH, 0));
  // Instanced books with varied colors and heights.
  const rng = createRng(seed);
  const palette = ['#b5533c', '#2f6f73', '#e3b448', '#6d8f86', '#8a5a9e', '#c8553d', '#4a6fa5', '#d9a441', '#5f8f4e', '#e8c7b8', '#3d4b6b'];
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.7 }), 180);
  const m = new THREE.Matrix4();
  let n = 0;
  for (let r = 0; r < rows; r++) {
    let cx = -w / 2 + 0.06;
    while (cx < w / 2 - 0.12 && n < 180) {
      const t = 0.05 + rng() * 0.05;
      const bh = rowH * (0.62 + rng() * 0.3);
      if (rng() < 0.06) {
        cx += 0.18;
        continue;
      }
      const tilt = rng() < 0.05 ? 0.2 : 0;
      m.compose(
        new THREE.Vector3(cx + t / 2, 0.08 + r * rowH + bh / 2, 0.02),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, tilt)),
        new THREE.Vector3(t, bh, 0.26 + rng() * 0.06),
      );
      inst.setMatrixAt(n, m);
      inst.setColorAt(n, new THREE.Color(palette[Math.floor(rng() * palette.length)] ?? '#b5533c'));
      n++;
      cx += t + 0.004;
    }
  }
  inst.count = n;
  inst.castShadow = true;
  inst.receiveShadow = true;
  g.add(inst);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  ctx.addStatic(g);
}

function armchair(fabric: string): THREE.Group {
  const f = mat(fabric, { roughness: 0.95 });
  const piping = mat('#fff3dc', { roughness: 0.9 });
  const legs = mat(PALETTE.walnutDark, { roughness: 0.5 });
  const g = group(
    rbox(1.0, 0.36, 0.9, 0.12, f, 0, 0.36, 0),
    rbox(0.86, 0.14, 0.76, 0.06, piping, 0, 0.58, 0.04),
    rbox(1.0, 0.8, 0.24, 0.12, f, 0, 0.82, -0.36),
    rbox(0.2, 0.44, 0.84, 0.1, f, -0.46, 0.66, 0.02),
    rbox(0.2, 0.44, 0.84, 0.1, f, 0.46, 0.66, 0.02),
  );
  for (const [x, z] of [
    [-0.4, -0.35],
    [0.4, -0.35],
    [-0.4, 0.35],
    [0.4, 0.35],
  ] as const)
    g.add(cyl(0.035, 0.025, 0.18, legs, x, 0.09, z));
  const pillow = rbox(0.42, 0.34, 0.14, 0.08, mat(PALETTE.teal, { roughness: 0.95 }), 0.1, 0.8, -0.18);
  pillow.rotation.set(-0.2, 0, 0.15);
  g.add(pillow);
  return g;
}

export function buildLibrary(ctx: BuildContext): void {
  // Braided rug.
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.1, 64), new THREE.MeshStandardMaterial({ map: rugTexture('library'), roughness: 1 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(-10.3, 0.011, -4.8);
  rug.receiveShadow = true;
  ctx.addStatic(rug);

  // School library shelves on the west wall.
  decorativeShelf(ctx, -13.62, -7.6, Math.PI / 2, 31);
  decorativeShelf(ctx, -13.62, -5.2, Math.PI / 2, 47);
  decorativeShelf(ctx, -13.62, -2.8, Math.PI / 2, 59);
  ctx.collide(-13.62, -5.2, 0.5, 7.3);

  // Armchair, side table and the book she's reading now.
  const chair = armchair(PALETTE.mustard);
  chair.position.set(-12.1, 0, -3.3);
  chair.rotation.y = Math.PI / 2 + 0.5;
  ctx.addStatic(chair);
  addSeat(ctx, chair, {
    id: 'seat-library-armchair',
    label: 'Sit in the library chair',
    x: -12.1,
    z: -3.3,
    top: 0.65,
    yaw: chair.rotation.y,
    forward: 0.38,
    exit: [-11.1, -3.8],
  });
  ctx.addStatic(contactShadow(1.4, 1.3, 0.3, -12.1, -3.3));
  ctx.collide(-12.1, -3.3, 1.0, 1.0);
  const table = group(
    cyl(0.3, 0.3, 0.04, mat(PALETTE.oak, { roughness: 0.5 }), 0, 0.6, 0),
    cyl(0.04, 0.05, 0.58, mat(PALETTE.walnutDark), 0, 0.3, 0),
    cyl(0.2, 0.22, 0.03, mat(PALETTE.walnutDark), 0, 0.015, 0),
  );
  table.position.set(-12.9, 0, -1.9);
  const cup = group(cyl(0.05, 0.04, 0.08, mat('#f7f2ea', { roughness: 0.3 }), 0.12, 0.66, 0.05), cyl(0.08, 0.08, 0.01, mat('#f7f2ea'), 0.12, 0.625, 0.05));
  table.add(cup);
  const readingBook = group(
    box(0.26, 0.05, 0.34, mat('#d8c3a5', { roughness: 0.6 }), -0.06, 0.645, 0),
    box(0.24, 0.045, 0.32, mat('#fbf4e4'), -0.06, 0.65, 0.005),
    box(0.03, 0.002, 0.18, mat(PALETTE.terracotta), -0.06, 0.676, 0.12),
  );
  readingBook.rotation.y = 0.3;
  table.add(readingBook);
  ctx.addStatic(table);
  ctx.collide(-12.9, -1.9, 0.6, 0.6);
  ctx.anchors.set('readingTable', new THREE.Vector3(-12.9, 0.7, -1.9));

  // Reward: golden reading lamp.
  const lamp = new THREE.Group();
  const brass = mat(PALETTE.brass, { metalness: 0.8, roughness: 0.3 });
  lamp.add(cyl(0.22, 0.26, 0.05, brass, 0, 0.025, 0), cyl(0.025, 0.025, 1.6, brass, 0, 0.8, 0));
  const shade = cyl(
    0.2,
    0.34,
    0.36,
    uniqueMat('#f6d88f', { emissive: '#ffcf70', emissiveIntensity: 0.8, roughness: 0.9, side: THREE.DoubleSide }),
    0,
    1.62,
    0,
    28,
  );
  const bulb = new THREE.PointLight('#ffcf8a', 7, 6, 1.8);
  bulb.position.set(0, 1.5, 0);
  lamp.add(shade, bulb);
  lamp.position.set(-13.25, 0, -4.35);
  ctx.add(lamp);
  ctx.features.push(toggleFeature(lamp, (s) => s.readingLamp, ctx));

  // Reward: story stars floating over the library.
  const stars = new THREE.Group();
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.18 : 0.08;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.04, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 1 });
  const starMat = mat('#ffe38a', { emissive: '#ffc94d', emissiveIntensity: 0.9, roughness: 0.4 });
  const rngS = createRng(5);
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Mesh(starGeo, starMat);
    s.position.set(-12.8 + rngS() * 7.4, 3.1 + rngS() * 1.1, -8.4 + rngS() * 6.4);
    s.rotation.y = rngS() * Math.PI;
    s.userData.phase = rngS() * 6;
    stars.add(s);
    const cord = cyl(0.004, 0.004, 4.6 - s.position.y, mat('#e9dcc4'), s.position.x, (4.6 + s.position.y) / 2 + 0.1, s.position.z, 4);
    stars.add(cord);
  }
  ctx.add(stars);
  const starFeature = toggleFeature(stars, (s) => s.storyStars, ctx);
  ctx.features.push({
    ...starFeature,
    update: (_dt, t) => {
      if (!stars.visible) return;
      for (const s of stars.children) {
        if (!(s as THREE.Mesh).geometry || s.userData.phase === undefined) continue;
        s.rotation.y = t * 0.4 + (s.userData.phase as number);
        s.position.y += Math.sin(t * 1.3 + (s.userData.phase as number)) * 0.0015;
      }
    },
  });

  // Reward: grand library chandelier.
  const chandelier = new THREE.Group();
  chandelier.add(cyl(0.01, 0.01, 1.1, mat('#3b2f25'), 0, 0.55, 0, 6));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 10, 40), brass);
  ring.rotation.x = Math.PI / 2;
  chandelier.add(ring);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    chandelier.add(cyl(0.035, 0.035, 0.14, mat('#fff4dc', { emissive: '#ffd37a', emissiveIntensity: 1.2 }), Math.cos(a) * 0.55, 0.1, Math.sin(a) * 0.55, 10));
  }
  const cl = new THREE.PointLight('#ffd9a0', 8, 9, 1.6);
  cl.position.y = -0.2;
  chandelier.add(cl);
  chandelier.position.set(-8.8, 3.5, -6.6);
  ctx.add(chandelier);
  ctx.features.push(toggleFeature(chandelier, (s) => s.grandLibrary, ctx));

  // Library sign + potted fig.
  const libSign = wallSign('Library', '📚', '#fff6e6', PALETTE.terracotta, 2.2);
  libSign.position.set(-13.8, 3.72, -5.2);
  libSign.rotation.y = Math.PI / 2;
  ctx.mount('west', libSign);
  const fig = group(cyl(0.26, 0.2, 0.46, mat(PALETTE.terracottaPot), 0, 0.23, 0), cyl(0.03, 0.04, 1.1, mat(PALETTE.walnut), 0, 0.9, 0));
  const leaf = mat(PALETTE.leaf, { roughness: 0.7 });
  const rngF = createRng(9);
  for (let i = 0; i < 16; i++) {
    const l = sphere(0.16, leaf, (rngF() - 0.5) * 0.7, 1.1 + rngF() * 0.9, (rngF() - 0.5) * 0.7, 10);
    l.scale.set(1, 0.35, 0.7);
    l.rotation.set(rngF(), rngF() * 3, rngF());
    fig.add(l);
  }
  fig.position.set(-4.95, 0, -9.2);
  ctx.addStatic(fig);
  ctx.collide(-4.95, -9.2, 0.6, 0.6);

  // Hoot's lectern collider & interaction.
  const { x: hx, z: hz } = LAYOUT.hoot;
  ctx.collide(hx, hz, 0.9, 0.7);

  buildReadingNook(ctx);
}

function buildReadingNook(ctx: BuildContext) {
  const { minX, maxX, minZ, maxZ } = LAYOUT.nook;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const nook = new THREE.Group();
  // Floor + walls.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), new THREE.MeshStandardMaterial({ map: rugTexture('nook'), roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0.005, cz);
  floor.receiveShadow = true;
  nook.add(floor);
  const wallMat = mat('#d9e7c6', { roughness: 0.95 });
  const muralMaterial = gardenMuralMaterial();
  // Fold the outer nook walls with the same camera policy as the school.
  // Keep these dynamic groups outside static batching.
  const nookWall = (side: 'west' | 'north' | 'south', x: number, z: number, w: number, d: number) => {
    const split = 0.42;
    nook.add(box(w, split, d, wallMat, x, split / 2, z));
    const upper = group(box(w, 3.2 - split, d, wallMat, x, (3.2 + split) / 2, z));
    upper.name = `nook-${side}-upper`;
    const decor = gardenWallDecor(side === 'west' ? maxZ - minZ : maxX - minX, side === 'west', muralMaterial);
    decor.position.set(side === 'west' ? minX + 0.015 : cx, 0, side === 'west' ? cz : side === 'north' ? minZ + 0.015 : maxZ - 0.015);
    decor.rotation.y = side === 'west' ? Math.PI / 2 : side === 'south' ? Math.PI : 0;
    upper.add(decor);
    // Bake each wall separately, so its mural and flowers fold away with it.
    bakeStatic(upper);
    ctx.add(upper);
    ctx.structure.cutaways.push({
      side,
      upper,
      split,
      amount: 0,
      outward: new THREE.Vector3(side === 'west' ? -1 : 0, 0, side === 'north' ? -1 : side === 'south' ? 1 : 0),
    });
    ctx.collide(x, z, w + 0.05, d + 0.05);
  };
  nookWall('west', minX - 0.125, cz, 0.25, maxZ - minZ + 0.5);
  nookWall('north', cx, minZ - 0.125, maxX - minX, 0.25);
  nookWall('south', cx, maxZ + 0.125, maxX - minX, 0.25);

  // An airy garden pergola frames the bench. Spaced rafters let the camera
  // see the cushions from above; there is no opaque canopy or front panel.
  const wood = mat(PALETTE.oak, { roughness: 0.8 });
  const benchX = minX + 0.75;
  const canopy = group(
    box(0.07, 0.08, 2.5, wood, benchX + 0.55, 2.15, cz),
    box(0.07, 0.08, 2.5, wood, benchX - 0.55, 2.15, cz),
    cyl(0.035, 0.035, 2.15, wood, benchX + 0.55, 1.075, cz - 1.2, 8),
    cyl(0.035, 0.035, 2.15, wood, benchX + 0.55, 1.075, cz + 1.2, 8),
    rbox(1.05, 0.3, 2.3, 0.08, wood, benchX, 0.25, cz),
    rbox(1.0, 0.18, 2.2, 0.08, mat('#a7bd8b'), benchX, 0.49, cz),
    rbox(0.18, 0.65, 2.3, 0.07, mat('#a7bd8b'), minX + 0.22, 0.72, cz),
  );
  for (let i = 0; i < 5; i++) canopy.add(box(1.25, 0.07, 0.075, wood, benchX, 2.2, cz - 1.1 + i * 0.55));
  for (const [i, color] of ['#f2cc8f', '#e9aaa1', '#bca9d1'].entries()) {
    const pillow = rbox(0.22, 0.4, 0.5, 0.08, mat(color), benchX - 0.25, 0.78, cz - 0.7 + i * 0.7);
    pillow.rotation.z = -0.15;
    canopy.add(pillow);
  }
  nook.add(canopy);
  addSeat(ctx, canopy, {
    id: 'seat-nook-couch',
    label: 'Sit and read on the garden couch',
    x: benchX,
    z: cz,
    top: 0.58,
    yaw: Math.PI / 2,
    forward: 0.42,
    exit: [benchX + 1.05, cz],
    reading: true,
    nook: true,
  });
  ctx.collide(benchX, cz, 1.25, 2.5);

  // Low outward-facing books, a second seat, and a book left open to read.
  const shelfX = cx + 0.25;
  const shelfZ = minZ + 0.42;
  nook.add(rbox(1.65, 0.72, 0.35, 0.04, wood, shelfX, 0.36, shelfZ));
  const covers = ['#b5533c', '#2f6f73', '#e3b448', '#8a5a9e', '#4a6fa5', '#5f8f4e'];
  covers.forEach((color, i) => {
    nook.add(box(0.2, 0.3 + (i % 2) * 0.08, 0.055, mat(color), shelfX - 0.64 + i * 0.25, 0.83, shelfZ + 0.19));
  });
  ctx.collide(shelfX, shelfZ, 1.7, 0.5);
  const bean = sphere(0.55, mat('#e7bc60', { roughness: 1 }), cx + 0.2, 0.32, maxZ - 0.85, 16);
  bean.scale.set(1, 0.65, 1);
  nook.add(bean);
  addSeat(ctx, bean, {
    id: 'seat-nook-daisy',
    label: 'Sit on the daisy cushion',
    x: cx + 0.2,
    z: maxZ - 0.85,
    top: 0.6,
    yaw: Math.PI / 2,
    forward: 0.47,
    exit: [cx + 1.15, maxZ - 0.85],
    nook: true,
  });
  // A daisy cushion gives the sunny little seat a flower-shaped top.
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const petal = sphere(0.18, mat('#fff0d5', { roughness: 1 }), cx + 0.2 + Math.cos(a) * 0.28, 0.56, maxZ - 0.85 + Math.sin(a) * 0.28, 10);
    petal.scale.set(1, 0.32, 1);
    nook.add(petal);
  }
  const center = sphere(0.18, mat('#dca84e', { roughness: 1 }), cx + 0.2, 0.58, maxZ - 0.85, 12);
  center.scale.y = 0.35;
  nook.add(center);
  ctx.collide(cx + 0.2, maxZ - 0.85, 1.0, 1.0);
  const tableX = cx + 0.45;
  nook.add(cyl(0.36, 0.36, 0.08, wood, tableX, 0.5, cz + 0.65, 16), cyl(0.16, 0.2, 0.46, wood, tableX, 0.23, cz + 0.65, 12));
  for (const sign of [-1, 1]) {
    const page = box(0.19, 0.025, 0.28, mat('#fff6e6'), tableX + sign * 0.095, 0.56, cz + 0.65);
    page.rotation.z = sign * 0.08;
    nook.add(page);
  }
  ctx.collide(tableX, cz + 0.65, 0.72, 0.72);
  // Flowers on the book ledge and a sun-warmed floor, with one gentle light.
  const pot = gardenPot();
  pot.position.set(shelfX + 0.58, 0.75, shelfZ);
  nook.add(pot);
  const sunlight = gardenSunlight();
  sunlight.position.set(cx + 0.5, 0.018, cz - 0.2);
  nook.add(sunlight);
  const glow = new THREE.PointLight('#ffe5ac', 4, 6, 1.6);
  glow.position.set(cx, 2.4, cz);
  nook.add(glow);
  ctx.addStatic(nook);

  // Curtain across the arch (closed until 25 books).
  const archX = LAYOUT.hall.minX - 0.05;
  const curtain = new THREE.Group();
  const drapeMat = mat('#698961', { roughness: 0.95, side: THREE.DoubleSide });
  const drapes: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(2.55, 3.1, 24, 1);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 9) * 0.05);
    geo.computeVertexNormals();
    const d = new THREE.Mesh(geo, drapeMat);
    d.rotation.y = Math.PI / 2;
    d.position.set(archX, 1.55, cz + s * 1.27);
    d.castShadow = true;
    drapes.push(d);
    curtain.add(d);
  }
  const rod = cyl(0.03, 0.03, 5.3, mat(PALETTE.brass, { metalness: 0.8, roughness: 0.3 }), archX, 3.12, cz, 10);
  rod.rotation.x = Math.PI / 2;
  curtain.add(rod);
  const lockSign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.48),
    new THREE.MeshStandardMaterial({ map: signTexture('Reading Nook', { icon: '🔒', bg: '#fff6e6', fg: '#52764e' }), roughness: 0.7 }),
  );
  lockSign.rotation.y = Math.PI / 2;
  lockSign.position.set(archX + 0.08, 2.3, cz);
  curtain.add(lockSign);
  ctx.add(curtain);
  ctx.collide(archX, cz, 0.4, 5.0, 'nook-curtain');

  let open: boolean | null = null;
  ctx.features.push({
    apply: async (state, animate) => {
      if (state.readingNookOpen === open) return;
      const wasKnown = open !== null;
      open = state.readingNookOpen;
      if (open) ctx.collisions.remove('nook-curtain');
      else if (!ctx.collisions.has('nook-curtain')) ctx.collide(archX, cz, 0.4, 5.0, 'nook-curtain');
      lockSign.visible = !open;
      const targetScale = open ? 0.18 : 1;
      if (animate && wasKnown && open) {
        ctx.particles.sparkle(new THREE.Vector3(archX + 0.5, 1.8, cz), { count: 80 });
        await ctx.tweens.run(
          1.4,
          (k) => {
            drapes.forEach((d, i) => {
              const s = i === 0 ? -1 : 1;
              d.scale.x = 1 - k * (1 - targetScale);
              d.position.z = cz + s * (1.27 + k * 1.05);
            });
          },
          { easing: ease.inOutCubic },
        );
      } else {
        drapes.forEach((d, i) => {
          const s = i === 0 ? -1 : 1;
          d.scale.x = targetScale;
          d.position.z = cz + s * (open ? 2.32 : 1.27);
        });
      }
    },
  });
  ctx.interact({
    id: 'nook',
    kind: 'door',
    label: 'The Reading Nook',
    icon: '🏕️',
    position: new THREE.Vector3(archX + 0.3, 0, cz),
    approach: new THREE.Vector3(archX + 1.2, 0, cz),
    radius: 2.2,
    object: curtain,
    markerHeight: 3.4,
  });
}
