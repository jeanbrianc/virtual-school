/**
 * Museum corner (fossils, dinosaur skeleton, nature finds, trophies) and the
 * annexes that open with learning: the Greenhouse and the Art Studio.
 */
import * as THREE from 'three';
import { createRng } from '../../domain/util/random';
import { ease } from '../core/tween';
import { box, capsule, cone, contactShadow, cyl, glassMat, group, mat, rbox, sphere, torus, uniqueMat } from '../render/kit';
import { canvasTexture, kidArtTexture, signTexture } from '../render/textures';
import { LAYOUT, PALETTE } from '../palette';
import { wallSign } from './library';
import { pottedPlant } from './science';
import { popIn, toggleFeature, type BuildContext } from './types';

const bone = () => mat('#efe4cc', { roughness: 0.8 });

function pedestal(): THREE.Group {
  return group(rbox(0.7, 0.9, 0.7, 0.04, mat('#f3ead8', { roughness: 0.8 }), 0, 0.45, 0), rbox(0.8, 0.06, 0.8, 0.02, mat(PALETTE.walnut), 0, 0.93, 0));
}

function ammonite(): THREE.Mesh {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 80; i++) {
    const t = i / 79;
    const a = t * Math.PI * 4.5;
    const r = 0.02 + t * 0.16;
    pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.TubeGeometry(curve, 160, 0.04, 10, false);
  // Taper the tube toward the center of the spiral.
  const pos = tube.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const seg = Math.floor(i / 11) / 160;
    const c = curve.getPoint(Math.min(1, seg));
    const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(c).multiplyScalar(0.3 + seg * 0.9);
    pos.setXYZ(i, c.x + v.x, c.y + v.y, c.z + v.z);
  }
  tube.computeVertexNormals();
  const m = new THREE.Mesh(tube, mat('#c9a57a', { roughness: 0.7 }));
  m.castShadow = true;
  return m;
}

function dinoSkeleton(): THREE.Group {
  const g = new THREE.Group();
  const b = bone();
  // Spine curve from tail to neck.
  const spine = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.6, 0.9, 0),
    new THREE.Vector3(-1.0, 1.25, 0),
    new THREE.Vector3(-0.2, 1.45, 0),
    new THREE.Vector3(0.5, 1.5, 0),
    new THREE.Vector3(1.0, 1.9, 0),
    new THREE.Vector3(1.3, 2.3, 0),
  ]);
  for (let i = 0; i <= 26; i++) {
    const p = spine.getPoint(i / 26);
    const v = sphere(0.055 + Math.sin((i / 26) * Math.PI) * 0.03, b, p.x, p.y, p.z, 8);
    g.add(v);
  }
  // Ribs.
  for (let i = 0; i < 7; i++) {
    const p = spine.getPoint(0.36 + i * 0.05);
    for (const s of [-1, 1]) {
      const rib = torus(0.3 - Math.abs(i - 3) * 0.03, 0.018, b, Math.PI * 0.8);
      rib.position.set(p.x, p.y - 0.28, p.z + s * 0.02);
      rib.rotation.set(0, (s * Math.PI) / 2, -Math.PI / 2 - 0.1);
      g.add(rib);
    }
  }
  // Skull with horns (triceratops-like).
  const skull = new THREE.Group();
  skull.add(sphere(0.2, b, 0, 0, 0, 14));
  const snout = cone(0.13, 0.35, b, 0.25, -0.05, 0, 10);
  snout.rotation.z = -Math.PI / 2;
  const frill = cyl(0.34, 0.34, 0.05, b, -0.12, 0.12, 0, 20);
  frill.rotation.z = Math.PI / 2 + 0.5;
  skull.add(snout, frill);
  for (const s of [-1, 1]) {
    const horn = cone(0.035, 0.35, b, 0.1, 0.2, s * 0.1, 8);
    horn.rotation.z = -0.9;
    skull.add(horn);
    skull.add(sphere(0.045, mat('#3b3027'), 0.08, 0.05, s * 0.15, 8));
  }
  const nose = cone(0.03, 0.14, b, 0.38, 0.05, 0, 8);
  nose.rotation.z = -0.4;
  skull.add(nose);
  skull.position.set(1.45, 2.4, 0);
  g.add(skull);
  // Legs.
  for (const [x, s] of [
    [-0.55, -1],
    [-0.55, 1],
    [0.55, -1],
    [0.55, 1],
  ] as const) {
    const upper = capsule(0.055, 0.5, b, x, 1.05, s * 0.2);
    upper.rotation.z = x > 0 ? 0.2 : -0.2;
    const lower = capsule(0.045, 0.5, b, x + (x > 0 ? 0.08 : -0.05), 0.42, s * 0.2);
    g.add(upper, lower, sphere(0.08, b, x + (x > 0 ? 0.12 : -0.02), 0.08, s * 0.2, 8));
  }
  // Display platform + support rods.
  g.add(rbox(3.6, 0.1, 1.1, 0.04, mat('#50606b', { roughness: 0.7 }), 0, 0.05, 0));
  for (const x of [-1.0, 0.4]) g.add(cyl(0.012, 0.012, 1.4, mat('#8a8f94', { metalness: 0.8 }), x, 0.75, 0, 6));
  return g;
}

/** Small models for nature finds brought home from walks. */
function natureItem(kind: string, seed: number): THREE.Object3D {
  const rng = createRng(seed);
  switch (kind) {
    case 'acorn':
      return group(sphere(0.045, mat('#a6773f', { roughness: 0.5 }), 0, 0.045, 0, 12), cyl(0.05, 0.045, 0.035, mat('#6b4a2b', { roughness: 1 }), 0, 0.085, 0, 12), cyl(0.006, 0.006, 0.03, mat('#6b4a2b'), 0, 0.11, 0, 5));
    case 'pinecone': {
      const g = new THREE.Group();
      for (let i = 0; i < 5; i++) g.add(cone(0.06 - i * 0.008, 0.05, mat('#7a5236', { flatShading: true }), 0, 0.03 + i * 0.03, 0, 7));
      return g;
    }
    case 'feather': {
      const f = sphere(0.1, mat(rng() < 0.5 ? '#3d85c6' : '#8a6a4a', { roughness: 0.6 }), 0, 0.012, 0, 12);
      f.scale.set(0.35, 0.08, 1.2);
      f.rotation.y = rng() * 3;
      return group(f);
    }
    case 'leaf': {
      const l = sphere(0.08, mat(['#d9a441', '#c9643f', '#b5462f'][seed % 3] ?? '#d9a441', { roughness: 0.7 }), 0, 0.01, 0, 12);
      l.scale.set(1, 0.08, 0.7);
      l.rotation.y = rng() * 3;
      return group(l);
    }
    case 'shell': {
      const s = cone(0.06, 0.1, mat('#f2d7c6', { roughness: 0.4 }), 0, 0.05, 0, 12);
      s.rotation.z = Math.PI / 2;
      return group(s);
    }
    case 'flower': {
      const g = group(sphere(0.025, mat('#8a5a33'), 0, 0.02, 0, 8));
      const petal = mat(['#f28fad', '#ffd166', '#c9a7f5'][seed % 3] ?? '#f28fad', { roughness: 0.6 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const p = sphere(0.03, petal, Math.cos(a) * 0.045, 0.015, Math.sin(a) * 0.045, 8);
        p.scale.set(1.3, 0.4, 1.3);
        g.add(p);
      }
      return g;
    }
    case 'mushroom':
      return group(cyl(0.02, 0.025, 0.07, mat('#f3ead8'), 0, 0.035, 0, 8), sphere(0.05, mat('#c8553d'), 0, 0.075, 0, 12));
    case 'stick': {
      const s = cyl(0.012, 0.015, 0.26, mat('#7a5236'), 0, 0.015, 0, 6);
      s.rotation.z = Math.PI / 2;
      s.rotation.y = rng() * 3;
      return group(s);
    }
    default: {
      const r = sphere(0.055, mat('#8d8a84', { flatShading: true, roughness: 1 }), 0, 0.04, 0, 6);
      r.scale.set(1.2, 0.8, 1);
      return group(r);
    }
  }
}

function trophyModel(id: string): THREE.Group {
  const color = id.includes('100') ? '#ffd35c' : id.includes('50') ? '#f2c14e' : id.includes('25') ? '#cfd8dc' : id.includes('number') ? '#7fe0e6' : '#e3b448';
  const m = mat(color, { metalness: 0.85, roughness: 0.25 });
  const g = group(rbox(0.16, 0.05, 0.16, 0.01, mat(PALETTE.walnut), 0, 0.025, 0), cyl(0.025, 0.04, 0.1, m, 0, 0.1, 0, 12));
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.04, 0.14, 20, 1, true), m);
  cup.position.y = 0.22;
  cup.castShadow = true;
  g.add(cup);
  for (const s of [-1, 1]) {
    const handle = torus(0.04, 0.01, m);
    handle.position.set(s * 0.1, 0.23, 0);
    handle.rotation.y = Math.PI / 2;
    g.add(handle);
  }
  if (id.includes('100')) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.add(cone(0.02, 0.06, m, Math.cos(a) * 0.07, 0.33, Math.sin(a) * 0.07, 6));
    }
  }
  return g;
}

export function buildMuseum(ctx: BuildContext): void {
  // Museum sign board on the west wall (interactable → Learning Museum tour).
  const boardTex = canvasTexture(768, 512, (c, w, h) => {
    c.fillStyle = '#2f4a3f';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = PALETTE.brass;
    c.lineWidth = 16;
    c.strokeRect(12, 12, w - 24, h - 24);
    c.fillStyle = '#f4f1e8';
    c.textAlign = 'center';
    c.font = `600 76px "Fredoka", sans-serif`;
    c.fillText('My Learning', w / 2, 170);
    c.fillText('Museum', w / 2, 260);
    c.font = `500 44px "Fredoka", sans-serif`;
    c.fillStyle = '#f2d98b';
    c.fillText('Show my family! ★', w / 2, 390);
  });
  const board = group(rbox(1.7, 1.15, 0.08, 0.03, mat(PALETTE.walnut), 0, 0, 0));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.06), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.8 }));
  face.position.z = 0.045;
  board.add(face);
  board.rotation.y = Math.PI / 2;
  board.position.set(-13.8, 1.9, 6.4);
  ctx.mount('west', board);
  ctx.interact({
    id: 'museum',
    kind: 'museum',
    label: 'Show my Learning Museum',
    icon: '🏛️',
    position: new THREE.Vector3(-13.3, 0, 6.4),
    approach: new THREE.Vector3(-12.2, 0, 6.4),
    radius: 2.0,
    object: board,
    markerHeight: 2.8,
  });

  // Trophy shelf.
  const shelf = new THREE.Group();
  const wood = mat(PALETTE.walnut, { roughness: 0.6 });
  shelf.add(box(1.6, 0.05, 0.4, wood, 0, 0.9, 0), box(1.6, 0.05, 0.4, wood, 0, 1.5, 0), box(0.05, 1.6, 0.4, wood, -0.8, 0.8, 0), box(0.05, 1.6, 0.4, wood, 0.8, 0.8, 0), box(1.6, 0.05, 0.4, wood, 0, 0.3, 0), box(1.65, 0.05, 0.42, wood, 0, 1.6, 0));
  const trophySlots = new THREE.Group();
  trophySlots.userData.dynamic = true;
  shelf.add(trophySlots);
  shelf.rotation.y = Math.PI / 2;
  shelf.position.set(-13.6, 0, 8.5);
  ctx.addStatic(shelf);
  ctx.collide(-13.6, 8.5, 0.5, 1.7);
  ctx.interact({
    id: 'trophies',
    kind: 'exhibit',
    label: 'Look at my treasures',
    icon: '🏆',
    position: new THREE.Vector3(-13.3, 0, 8.5),
    approach: new THREE.Vector3(-12.3, 0, 8.4),
    radius: 1.9,
    object: shelf,
    markerHeight: 2.2,
  });
  let trophyKey = '';
  ctx.features.push({
    apply: async (state, animate) => {
      const key = state.trophies.join(',');
      if (key === trophyKey) return;
      const prev = trophyKey ? trophyKey.split(',') : [];
      trophyKey = key;
      trophySlots.clear();
      const jobs: Promise<void>[] = [];
      state.trophies.forEach((id, i) => {
        const t = trophyModel(id);
        t.position.set(-0.55 + (i % 4) * 0.36, i < 4 ? 1.525 : 0.925, 0.02);
        trophySlots.add(t);
        if (animate && prev.length >= 0 && !prev.includes(id) && trophyKey !== '') jobs.push(popIn(t, ctx));
      });
      await Promise.all(jobs);
    },
  });

  // Fossil pedestal.
  const fossil = group(pedestal());
  const am = ammonite();
  am.position.set(0, 1.18, 0);
  am.rotation.y = 0.4;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glassMat('#eefcff', 0.2));
  dome.position.y = 0.96;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.16), new THREE.MeshStandardMaterial({ map: signTexture('Ammonite', { icon: '🐚', w: 384, h: 120 }) }));
  label.position.set(0, 0.7, 0.36);
  fossil.add(am, dome, label);
  fossil.position.set(-11.5, 0, 4.3);
  ctx.add(fossil);
  ctx.features.push(
    toggleFeature(fossil, (s) => s.fossilDisplay, ctx, () => {
      if (!ctx.collisions.has('fossil')) ctx.collide(-11.5, 4.3, 0.8, 0.8, 'fossil');
    }),
  );
  ctx.features.push({ apply: () => undefined, update: (_dt, t) => (am.rotation.y = 0.4 + t * 0.3) });

  // Dinosaur skeleton.
  const skeleton = dinoSkeleton();
  skeleton.position.set(-8.3, 0, 7.3);
  skeleton.rotation.y = 0.35;
  ctx.add(skeleton);
  ctx.features.push(
    toggleFeature(skeleton, (s) => s.dinoSkeleton, ctx, () => {
      if (!ctx.collisions.has('skeleton')) ctx.collide(-8.3, 7.3, 3.4, 1.4, 'skeleton');
    }),
  );

  // Nature exhibit table.
  const nature = new THREE.Group();
  nature.add(rbox(1.6, 0.06, 0.8, 0.02, mat(PALETTE.oak, { roughness: 0.5 }), 0, 0.7, 0));
  for (const [x, z] of [
    [-0.7, -0.32],
    [0.7, -0.32],
    [-0.7, 0.32],
    [0.7, 0.32],
  ] as const) nature.add(cyl(0.03, 0.03, 0.68, mat(PALETTE.walnut), x, 0.34, z, 8));
  const tray = rbox(1.4, 0.03, 0.62, 0.01, mat('#e9dcc4', { roughness: 1 }), 0, 0.745, 0);
  nature.add(tray);
  const items = new THREE.Group();
  nature.add(items);
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.18), new THREE.MeshStandardMaterial({ map: signTexture('Nature Finds', { icon: '🍂', w: 384, h: 110 }) }));
  tag.position.set(0, 0.62, 0.41);
  nature.add(tag);
  nature.position.set(-11.2, 0, 2.2);
  ctx.add(nature);
  let natureKey = '';
  let natureShown: boolean | null = null;
  ctx.features.push({
    apply: async (state, animate) => {
      if (natureShown !== state.natureTable) {
        const known = natureShown !== null;
        natureShown = state.natureTable;
        nature.visible = state.natureTable;
        if (state.natureTable) {
          if (!ctx.collisions.has('nature')) ctx.collide(-11.2, 2.2, 1.7, 0.9, 'nature');
          if (animate && known) await popIn(nature, ctx);
        }
      }
      const key = state.natureItems.join(',');
      if (key === natureKey) return;
      const prevCount = natureKey ? natureKey.split(',').length : 0;
      natureKey = key;
      items.clear();
      state.natureItems.forEach((kind, i) => {
        const it = natureItem(kind, i + 1);
        it.position.set(-0.55 + (i % 6) * 0.22, 0.76, -0.16 + Math.floor(i / 6) * 0.3);
        items.add(it);
        if (animate && natureKey && i >= prevCount) void popIn(it, ctx, { duration: 0.7 });
      });
    },
  });
  ctx.interact({
    id: 'nature',
    kind: 'exhibit',
    label: 'See my nature finds',
    icon: '🍂',
    position: new THREE.Vector3(-11.2, 0, 2.2),
    approach: new THREE.Vector3(-11.2, 0, 3.4),
    radius: 1.8,
    object: nature,
    markerHeight: 1.6,
  });

  const museumSign = wallSign('My Museum', '🦴', '#fff6e6', '#8a5a9e', 2.0);
  museumSign.position.set(-13.8, 3.3, 6.4);
  museumSign.rotation.y = Math.PI / 2;
  ctx.mount('west', museumSign);

  // Pet bed near the entrance.
  const bed = group(cyl(0.5, 0.55, 0.14, mat('#9fbdd0', { roughness: 1 }), 0, 0.07, 0, 24), torus(0.47, 0.1, mat('#7fa7bf', { roughness: 1 })));
  (bed.children[1] as THREE.Object3D).rotation.x = Math.PI / 2;
  (bed.children[1] as THREE.Object3D).position.y = 0.15;
  bed.position.set(3.4, 0, 8.6);
  ctx.addStatic(bed);
}

export function buildAnnexes(ctx: BuildContext): void {
  buildGreenhouse(ctx);
  buildArtStudio(ctx);
}

function buildGreenhouse(ctx: BuildContext) {
  const { minX, maxX, minZ, maxZ, doorZ } = LAYOUT.greenhouse;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const w = maxX - minX;
  const d = maxZ - minZ;
  const gh = new THREE.Group();
  const tiles = canvasTexture(
    256,
    256,
    (c, tw, th) => {
      c.fillStyle = '#c9744c';
      c.fillRect(0, 0, tw, th);
      for (let y = 0; y < 2; y++)
        for (let x = 0; x < 2; x++) {
          c.fillStyle = (x + y) % 2 ? '#d98a5f' : '#c26a45';
          c.fillRect(x * 128 + 3, y * 128 + 3, 122, 122);
        }
    },
    { repeat: [w / 1.2, d / 1.2] },
  );
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0.005, cz);
  floor.receiveShadow = true;
  gh.add(floor);
  gh.add(box(w + 0.5, 0.3, d + 0.5, mat('#cdbb9c', { roughness: 0.95 }), cx, -0.16, cz));

  // Glass walls with white frames and a peaked glass roof.
  const frameM = mat('#fbf7ee', { roughness: 0.5 });
  const glass = glassMat('#e6fbf2', 0.2);
  const h = 3.4;
  const wallsSpec: [number, number, number, number][] = [
    [cx, maxZ, w, 0],
    [cx, minZ, w, 0],
    [maxX, cz, d, Math.PI / 2],
  ];
  for (const [x, z, len, rot] of wallsSpec) {
    const wall = new THREE.Group();
    wall.add(box(len, 0.5, 0.2, mat('#e9dcc4', { roughness: 0.9 }), 0, 0.25, 0));
    const pane = box(len, h - 0.5, 0.03, glass, 0, 0.5 + (h - 0.5) / 2, 0);
    pane.castShadow = false;
    wall.add(pane);
    const n = Math.round(len / 1.1);
    for (let i = 0; i <= n; i++) wall.add(box(0.07, h, 0.1, frameM, -len / 2 + (i * len) / n, h / 2, 0));
    wall.add(box(len, 0.08, 0.12, frameM, 0, h, 0), box(len, 0.06, 0.1, frameM, 0, 1.8, 0));
    wall.position.set(x, 0, z);
    wall.rotation.y = rot;
    gh.add(wall);
  }
  ctx.collide(cx, maxZ, w, 0.3);
  ctx.collide(cx, minZ, w, 0.3);
  ctx.collide(maxX, cz, 0.3, d);
  // Roof frames (no glass shadow so sunlight floods in).
  for (let i = 0; i <= 6; i++) {
    const x = minX + (i * w) / 6;
    for (const s of [-1, 1]) {
      const rafter = box(0.06, 0.06, d / 2 + 0.3, frameM, x, h + 0.55, cz + (s * d) / 4);
      rafter.rotation.x = s * 0.22;
      gh.add(rafter);
    }
  }
  gh.add(box(w, 0.08, 0.1, frameM, cx, h + 1.1, cz));

  // Planter beds.
  const soil = mat('#5b3d2a', { roughness: 1 });
  const bedWood = mat('#a8743f', { roughness: 0.8 });
  const beds = [
    [cx, minZ + 2.2],
    [cx, maxZ - 2.8],
  ] as const;
  for (const [bx, bz] of beds) {
    gh.add(rbox(6.4, 0.5, 1.1, 0.04, bedWood, bx, 0.25, bz));
    gh.add(box(6.2, 0.05, 0.95, soil, bx, 0.5, bz));
    ctx.collide(bx, bz, 6.5, 1.2);
  }
  // Potting bench + watering can.
  const benchG = group(rbox(1.6, 0.06, 0.6, 0.02, mat(PALETTE.oak), 0, 0.85, 0));
  for (const [x, z] of [
    [-0.7, -0.25],
    [0.7, -0.25],
    [-0.7, 0.25],
    [0.7, 0.25],
  ] as const) benchG.add(box(0.05, 0.85, 0.05, mat(PALETTE.walnut), x, 0.42, z));
  const can = group(cyl(0.12, 0.14, 0.22, mat('#6d8f86', { metalness: 0.4, roughness: 0.4 }), 0, 0.11, 0, 16), torus(0.08, 0.015, mat('#6d8f86')));
  (can.children[1] as THREE.Object3D).position.y = 0.26;
  const spout = cyl(0.015, 0.025, 0.3, mat('#6d8f86'), 0.18, 0.18, 0, 8);
  spout.rotation.z = -1;
  can.add(spout);
  can.position.set(0.4, 0.88, 0);
  benchG.add(can, pottedPlant(2, 51, '#6d8f86'));
  (benchG.children[benchG.children.length - 1] as THREE.Object3D).position.set(-0.4, 0.88, 0);
  benchG.position.set(maxX - 0.8, 0, cz + 0.4);
  benchG.rotation.y = -Math.PI / 2;
  gh.add(benchG);
  ctx.collide(maxX - 0.8, cz + 0.4, 0.7, 1.7);

  const sunLight = new THREE.PointLight('#fff4d6', 4, 12, 1.5);
  sunLight.position.set(cx, 3.2, cz);
  gh.add(sunLight);
  ctx.addStatic(gh);

  // Plants in the beds grow with plant discoveries.
  const bedPlants = new THREE.Group();
  ctx.add(bedPlants);
  const butterflies = new THREE.Group();
  ctx.add(butterflies);
  const wingMat = [uniqueMat('#ffb3c7', { side: THREE.DoubleSide }), uniqueMat('#ffd166', { side: THREE.DoubleSide }), uniqueMat('#9ad1ff', { side: THREE.DoubleSide })];
  for (let i = 0; i < 5; i++) {
    const bfly = new THREE.Group();
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.CircleGeometry(0.07, 10), wingMat[i % 3] as THREE.Material);
      wing.position.x = s * 0.06;
      wing.userData.side = s;
      bfly.add(wing);
    }
    bfly.userData.phase = i * 1.3;
    butterflies.add(bfly);
  }
  let plantKey = -1;
  ctx.features.push({
    apply: (state, animate) => {
      if (state.plantCount === plantKey) return;
      const prev = plantKey;
      plantKey = state.plantCount;
      bedPlants.clear();
      const total = Math.min(16, state.plantCount * 2 + 2);
      for (let i = 0; i < total; i++) {
        const bed = beds[i % 2] ?? beds[0];
        const col = Math.floor(i / 2);
        const tall = i % 3 === 0;
        const p = tall ? sunflower(i) : pottedPlant(Math.min(3, 1 + (i % 3)), i + 11, '#a8743f');
        p.position.set(bed[0] - 2.8 + col * 0.75, tall ? 0.5 : 0.36, bed[1] + (i % 4 < 2 ? -0.18 : 0.18));
        bedPlants.add(p);
        if (animate && prev >= 0 && i >= prev * 2 + 2) void popIn(p, ctx, { duration: 1 });
      }
      butterflies.visible = state.greenhouseOpen;
    },
    update: (_dt, t) => {
      if (!butterflies.visible) return;
      butterflies.children.forEach((b) => {
        const p = (b.userData.phase as number) + t * 0.4;
        b.position.set(cx + Math.sin(p) * 3.2, 1.3 + Math.sin(p * 2.3) * 0.4, cz + Math.cos(p * 0.8) * 3);
        b.rotation.y = p;
        for (const wing of b.children) wing.rotation.y = (wing.userData.side as number) * (0.3 + Math.abs(Math.sin(t * 14)) * 1.1);
      });
    },
  });

  // Door (double glass doors in the hall's east wall).
  const doorX = LAYOUT.hall.maxX + 0.15;
  const doors: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const leaf = new THREE.Group();
    const panel = group(box(1.34, 2.9, 0.06, frameM, 0, 1.45, 0));
    const pane = box(1.1, 2.4, 0.07, glassMat('#dff7ee', 0.35), 0, 1.5, 0);
    pane.castShadow = false;
    panel.add(pane, sphere(0.05, mat(PALETTE.brass, { metalness: 0.8, roughness: 0.3 }), -s * 0.5, 1.2, 0.06, 10));
    panel.position.x = s * 0.67;
    leaf.add(panel);
    leaf.position.set(doorX, 0, doorZ + s * 1.35);
    leaf.rotation.y = Math.PI / 2;
    doors.push(leaf);
    ctx.add(leaf);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.5), new THREE.MeshStandardMaterial({ map: signTexture('Greenhouse', { icon: '🌱', bg: '#eef7e8', fg: '#4c7a3d' }), roughness: 0.7 }));
  sign.rotation.y = -Math.PI / 2;
  sign.position.set(LAYOUT.hall.maxX - 0.02, 3.35, doorZ);
  ctx.mount('east', sign);
  const lock = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshStandardMaterial({ map: signTexture('🔒', { w: 160, h: 160, bg: '#fff6e6' }), transparent: true }));
  lock.rotation.y = -Math.PI / 2;
  lock.position.set(LAYOUT.hall.maxX - 0.05, 1.5, doorZ);
  ctx.add(lock);
  ctx.collide(doorX, doorZ, 0.4, 2.8, 'greenhouse-door');
  let open: boolean | null = null;
  ctx.features.push({
    apply: async (state, animate) => {
      if (state.greenhouseOpen === open) return;
      const known = open !== null;
      open = state.greenhouseOpen;
      lock.visible = !open;
      if (open) ctx.collisions.remove('greenhouse-door');
      else if (!ctx.collisions.has('greenhouse-door')) ctx.collide(doorX, doorZ, 0.4, 2.8, 'greenhouse-door');
      const setAngle = (k: number) =>
        doors.forEach((dd, i) => {
          const s = i === 0 ? -1 : 1;
          dd.rotation.y = Math.PI / 2 + s * k * 1.35;
        });
      if (open && animate && known) {
        ctx.particles.sparkle(new THREE.Vector3(doorX, 1.8, doorZ), { count: 90, color: '#c9f2a8' });
        await ctx.tweens.run(1.6, setAngle, { easing: ease.outBack });
      } else setAngle(open ? 1 : 0);
    },
  });
  ctx.interact({
    id: 'greenhouse',
    kind: 'door',
    label: 'The Greenhouse',
    icon: '🌱',
    position: new THREE.Vector3(doorX - 0.4, 0, doorZ),
    approach: new THREE.Vector3(doorX - 1.4, 0, doorZ),
    radius: 2.2,
    object: doors[0] ?? lock,
    markerHeight: 3.2,
  });
  ctx.anchors.set('greenhouse', new THREE.Vector3(cx, 1.2, cz));
}

function sunflower(seed: number): THREE.Group {
  const g = new THREE.Group();
  const h = 1.0 + (seed % 3) * 0.2;
  g.add(cyl(0.02, 0.03, h, mat(PALETTE.leafDark), 0, h / 2, 0, 6));
  for (const s of [-1, 1]) {
    const l = sphere(0.12, mat(PALETTE.leaf), s * 0.1, h * 0.45, 0, 8);
    l.scale.set(1.2, 0.2, 0.6);
    g.add(l);
  }
  const head = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const p = sphere(0.06, mat('#f2c14e'), Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0, 8);
    p.scale.set(1.4, 0.6, 0.3);
    p.rotation.z = a;
    head.add(p);
  }
  head.add(cyl(0.09, 0.09, 0.04, mat('#6b4a2b'), 0, 0, 0.01, 16).rotateX(Math.PI / 2));
  head.position.y = h;
  head.rotation.x = -0.3;
  g.add(head);
  return g;
}

function buildArtStudio(ctx: BuildContext) {
  const { minX, maxX, minZ, maxZ, doorZ } = LAYOUT.artStudio;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const studio = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), mat('#d9cbb2', { roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0.005, cz);
  floor.receiveShadow = true;
  studio.add(floor);
  // Paint splatters.
  const rng = createRng(4);
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Mesh(new THREE.CircleGeometry(0.05 + rng() * 0.12, 12), mat(['#e07a5f', '#3d85c6', '#f2cc8f', '#81b29a', '#f15bb5'][i % 5] ?? '#e07a5f'));
    s.rotation.x = -Math.PI / 2;
    s.position.set(minX + 0.5 + rng() * (maxX - minX - 1), 0.008, minZ + 0.5 + rng() * (maxZ - minZ - 1));
    studio.add(s);
  }
  const wallM = mat('#e8f0f2', { roughness: 0.95 });
  studio.add(box(maxX - minX + 0.3, 3.2, 0.25, wallM, cx, 1.6, minZ - 0.12), box(maxX - minX + 0.3, 3.2, 0.25, wallM, cx, 1.6, maxZ + 0.12), box(0.25, 3.2, maxZ - minZ + 0.5, wallM, maxX + 0.12, 1.6, cz));
  ctx.collide(cx, minZ - 0.12, maxX - minX + 0.3, 0.3);
  ctx.collide(cx, maxZ + 0.12, maxX - minX + 0.3, 0.3);
  ctx.collide(maxX + 0.12, cz, 0.3, maxZ - minZ + 0.5);
  // Easels with canvases.
  for (let i = 0; i < 3; i++) {
    const e = new THREE.Group();
    for (const s of [-1, 1]) {
      const leg = box(0.04, 1.6, 0.04, mat(PALETTE.oak), s * 0.3, 0.8, 0);
      leg.rotation.z = -s * 0.06;
      e.add(leg);
    }
    const canvasMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.55), new THREE.MeshStandardMaterial({ map: kidArtTexture(100 + i), roughness: 0.9 }));
    canvasMesh.position.set(0, 1.2, 0.03);
    e.add(canvasMesh, box(0.75, 0.04, 0.1, mat(PALETTE.oak), 0, 0.9, 0.04));
    e.position.set(minX + 1.2 + i * 1.3, 0, maxZ - 1.2);
    e.rotation.y = Math.PI + (i - 1) * 0.3;
    studio.add(e);
  }
  // Paint pots.
  ['#e07a5f', '#3d85c6', '#f2cc8f', '#81b29a', '#f15bb5', '#9b5de5'].forEach((c, i) => {
    studio.add(cyl(0.08, 0.07, 0.12, mat('#f7f2ea'), minX + 0.8 + i * 0.25, 0.06, minZ + 0.8, 12));
    studio.add(cyl(0.07, 0.07, 0.01, mat(c, { roughness: 0.3 }), minX + 0.8 + i * 0.25, 0.12, minZ + 0.8, 12));
  });
  const studioLight = new THREE.PointLight('#fff3dd', 4, 7, 1.6);
  studioLight.position.set(cx, 2.8, cz);
  studio.add(studioLight);
  ctx.addStatic(studio);

  // Door.
  const doorX = LAYOUT.hall.maxX + 0.15;
  const door = new THREE.Group();
  const panel = group(rbox(1.8, 2.65, 0.08, 0.03, mat('#e07a5f', { roughness: 0.6 }), 0.9, 1.33, 0));
  for (let i = 0; i < 6; i++) {
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.08 + (i % 3) * 0.03, 12), mat(['#f2cc8f', '#3d85c6', '#81b29a', '#f15bb5', '#9b5de5', '#fff'][i] ?? '#fff'));
    dot.position.set(0.3 + (i % 3) * 0.55, 0.8 + Math.floor(i / 3) * 1.1, 0.045);
    panel.add(dot);
  }
  panel.add(sphere(0.05, mat(PALETTE.brass, { metalness: 0.8, roughness: 0.3 }), 1.6, 1.25, 0.06, 10));
  door.add(panel);
  door.position.set(doorX, 0, doorZ + 0.9);
  door.rotation.y = Math.PI / 2;
  ctx.add(door);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.48), new THREE.MeshStandardMaterial({ map: signTexture('Art Studio', { icon: '🎨', bg: '#fff0ea', fg: '#c8553d' }), roughness: 0.7 }));
  sign.rotation.y = -Math.PI / 2;
  sign.position.set(LAYOUT.hall.maxX - 0.02, 3.05, doorZ);
  ctx.mount('east', sign);
  ctx.collide(doorX, doorZ, 0.4, 1.9, 'art-door');
  let open: boolean | null = null;
  ctx.features.push({
    apply: async (state, animate) => {
      if (state.artStudioOpen === open) return;
      const known = open !== null;
      open = state.artStudioOpen;
      if (open) ctx.collisions.remove('art-door');
      else if (!ctx.collisions.has('art-door')) ctx.collide(doorX, doorZ, 0.4, 1.9, 'art-door');
      if (open && animate && known) {
        ctx.particles.sparkle(new THREE.Vector3(doorX, 1.6, doorZ), { count: 80, color: '#ffc4b0' });
        await ctx.tweens.run(1.4, (k) => (door.rotation.y = Math.PI / 2 - k * 1.5), { easing: ease.outBack });
      } else door.rotation.y = open ? Math.PI / 2 - 1.5 : Math.PI / 2;
    },
  });
  ctx.interact({
    id: 'artStudio',
    kind: 'door',
    label: 'The Art Studio',
    icon: '🎨',
    position: new THREE.Vector3(doorX - 0.4, 0, doorZ),
    approach: new THREE.Vector3(doorX - 1.4, 0, doorZ),
    radius: 2.0,
    object: door,
    markerHeight: 3.0,
  });
}

export { contactShadow };
