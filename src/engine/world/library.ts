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
import { LAYOUT, PALETTE } from '../palette';
import { popIn, toggleFeature, type BuildContext } from './types';

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
  const wallMat = mat('#f2d7cf', { roughness: 0.95 });
  nook.add(box(0.25, 3.2, maxZ - minZ + 0.5, wallMat, minX - 0.125, 1.6, cz));
  nook.add(box(maxX - minX, 3.2, 0.25, wallMat, cx, 1.6, minZ - 0.125));
  nook.add(box(maxX - minX, 3.2, 0.25, wallMat, cx, 1.6, maxZ + 0.125));
  ctx.collide(minX - 0.125, cz, 0.3, maxZ - minZ + 0.5);
  ctx.collide(cx, minZ - 0.125, maxX - minX, 0.3);
  ctx.collide(cx, maxZ + 0.125, maxX - minX, 0.3);
  // Tent canopy.
  const tent = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.4, 6, 1, true), mat('#fbf1e3', { side: THREE.DoubleSide, roughness: 0.95 }));
  tent.position.set(minX + 1.4, 1.2, cz);
  tent.castShadow = true;
  nook.add(tent);
  const flag = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 3), mat(PALETTE.terracotta));
  flag.position.set(minX + 1.4, 2.5, cz);
  flag.rotation.z = Math.PI / 2;
  nook.add(flag);
  // Cushions and a beanbag.
  const cushionColors = ['#e9a8a0', '#f2cc8f', '#9fbdd0', '#a7c4a0'];
  cushionColors.forEach((c, i) => {
    const p = rbox(0.6, 0.18, 0.6, 0.09, mat(c, { roughness: 1 }), minX + 1.0 + (i % 2) * 0.7, 0.09 + Math.floor(i / 2) * 0.16, cz - 0.4 + (i % 2) * 0.3);
    p.rotation.y = i * 0.4;
    nook.add(p);
  });
  const bean = sphere(0.5, mat(PALETTE.teal, { roughness: 1 }), maxX - 1.1, 0.35, maxZ - 1.0, 20);
  bean.scale.set(1, 0.7, 1);
  nook.add(bean);
  // Fairy lights along the walls.
  const bulbMat = mat('#fff1c1', { emissive: '#ffd36b', emissiveIntensity: 2 });
  for (let i = 0; i < 26; i++) {
    const t = i / 25;
    const x = minX + 0.1 + t * (maxX - minX - 0.2);
    nook.add(sphere(0.035, bulbMat, x, 2.6 - Math.sin(t * Math.PI * 3) * 0.12, minZ + 0.02, 8));
    nook.add(sphere(0.035, bulbMat, x, 2.6 - Math.sin(t * Math.PI * 3 + 1) * 0.12, maxZ - 0.02, 8));
  }
  const glow = new THREE.PointLight('#ffcf8a', 6, 6, 1.6);
  glow.position.set(cx, 2.2, cz);
  nook.add(glow);
  ctx.addStatic(nook);

  // Curtain across the arch (closed until 25 books).
  const archX = LAYOUT.hall.minX - 0.05;
  const curtain = new THREE.Group();
  const drapeMat = mat('#b8433a', { roughness: 0.95, side: THREE.DoubleSide });
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
    new THREE.MeshStandardMaterial({ map: signTexture('Reading Nook', { icon: '🔒', bg: '#fff6e6', fg: '#b8433a' }), roughness: 0.7 }),
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
  void popIn;
}
