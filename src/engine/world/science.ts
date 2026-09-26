/**
 * Discovery Lab (science) and Number Nook (math). Both corners grow with
 * learning: windowsill plants, aquarium fish, a telescope, and Digit's rocket
 * assembled mission by mission.
 */
import * as THREE from 'three';
import { createRng } from '../../domain/util/random';
import { ease } from '../core/tween';
import { box, cone, contactShadow, cyl, glassMat, group, mat, rbox, sphere, torus, uniqueMat } from '../render/kit';
import { posterTexture } from '../render/textures';
import { LAYOUT, PALETTE } from '../palette';
import { wallSign } from './library';
import { popIn, toggleFeature, type BuildContext } from './types';

/** A small potted plant; `stage` 0..3 grows from sprout to flowering. */
export function pottedPlant(stage: number, seed: number, potColor: string = PALETTE.terracottaPot): THREE.Group {
  const rng = createRng(seed);
  const g = new THREE.Group();
  g.add(cyl(0.11, 0.08, 0.16, mat(potColor, { roughness: 0.8 }), 0, 0.08, 0, 16));
  g.add(cyl(0.1, 0.1, 0.02, mat('#5b3d2a', { roughness: 1 }), 0, 0.155, 0, 16));
  const leaf = mat(rng() < 0.5 ? PALETTE.leaf : '#7fb069', { roughness: 0.7 });
  const h = 0.12 + stage * 0.12;
  g.add(cyl(0.012, 0.015, h, mat(PALETTE.leafDark), 0, 0.16 + h / 2, 0, 6));
  const leaves = 2 + stage * 2;
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + rng();
    const y = 0.18 + (h * (i + 1)) / (leaves + 1);
    const l = sphere(0.05 + stage * 0.012, leaf, Math.cos(a) * 0.06, y, Math.sin(a) * 0.06, 8);
    l.scale.set(1.4, 0.35, 0.8);
    l.rotation.y = -a;
    g.add(l);
  }
  if (stage >= 3) {
    const petal = mat(['#f28fad', '#ffd166', '#f4a261', '#c9a7f5'][seed % 4] ?? '#ffd166', { roughness: 0.6 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const p = sphere(0.035, petal, Math.cos(a) * 0.05, 0.16 + h + 0.02, Math.sin(a) * 0.05, 8);
      p.scale.set(1.2, 0.5, 1.2);
      g.add(p);
    }
    g.add(sphere(0.03, mat('#8a5a33'), 0, 0.17 + h + 0.03, 0, 8));
  }
  return g;
}

function labBench(ctx: BuildContext) {
  const bench = new THREE.Group();
  const w = 5.2;
  const cabinet = mat(PALETTE.teal, { roughness: 0.6 });
  const top = mat('#c9a06a', { roughness: 0.45 });
  bench.add(rbox(w, 0.86, 0.7, 0.03, cabinet, 0, 0.43, 0));
  bench.add(rbox(w + 0.1, 0.06, 0.78, 0.02, top, 0, 0.89, 0.02));
  for (let i = 0; i < 6; i++) {
    const x = -w / 2 + 0.45 + i * ((w - 0.9) / 5);
    bench.add(box(0.7, 0.66, 0.02, mat('#3f8387', { roughness: 0.6 }), x, 0.44, 0.36));
    bench.add(sphere(0.025, mat(PALETTE.brass, { metalness: 0.8, roughness: 0.3 }), x + 0.26, 0.58, 0.38, 10));
  }
  // Microscope.
  const scope = group(
    rbox(0.2, 0.04, 0.22, 0.02, mat('#2f3a44'), 0, 0.02, 0),
    box(0.04, 0.3, 0.04, mat('#2f3a44'), 0, 0.17, -0.07),
    cyl(0.035, 0.03, 0.22, mat('#e9eef0', { metalness: 0.4, roughness: 0.3 }), 0, 0.3, 0),
    box(0.14, 0.012, 0.14, mat('#9aa7ad'), 0, 0.12, 0.01),
  );
  (scope.children[2] as THREE.Object3D).rotation.x = -0.35;
  scope.position.set(-1.6, 0.92, 0.05);
  bench.add(scope);
  // Beakers and test tubes.
  const liquid = ['#63d2c4', '#f28fad', '#ffd166', '#9b8ec9'];
  liquid.forEach((c, i) => {
    const b = group(
      cyl(0.07, 0.07, 0.18, glassMat('#e8fbff', 0.35), 0, 0.09, 0, 18),
      cyl(0.062, 0.062, 0.09 + (i % 2) * 0.04, uniqueMat(c, { emissive: c, emissiveIntensity: 0.25, transparent: true, opacity: 0.85, roughness: 0.2 }), 0, 0.05, 0, 18),
    );
    b.position.set(-0.8 + i * 0.22, 0.92, 0.12 - (i % 2) * 0.1);
    bench.add(b);
  });
  const rack = group(rbox(0.36, 0.04, 0.1, 0.01, mat(PALETTE.oak), 0, 0.12, 0));
  for (let i = 0; i < 4; i++) {
    rack.add(cyl(0.02, 0.02, 0.2, glassMat('#e8fbff', 0.4), -0.12 + i * 0.08, 0.14, 0, 10));
    rack.add(cyl(0.018, 0.018, 0.08, mat(liquid[i] ?? '#fff', { emissive: liquid[i] ?? '#fff', emissiveIntensity: 0.3 }), -0.12 + i * 0.08, 0.08, 0, 10));
  }
  rack.position.set(0.3, 0.92, 0.05);
  bench.add(rack);
  // Crystal collection (glowing).
  const crystals = new THREE.Group();
  const cc = ['#b99cf2', '#7fe0e6', '#f7a8d1'];
  for (let i = 0; i < 7; i++) {
    const c = cone(0.035 + (i % 3) * 0.01, 0.16 + (i % 2) * 0.08, uniqueMat(cc[i % 3] ?? '#b99cf2', { emissive: cc[i % 3] ?? '#b99cf2', emissiveIntensity: 0.6, roughness: 0.15 }), (i - 3) * 0.05, 0.08, (i % 2) * 0.05, 6);
    c.rotation.z = (i - 3) * 0.12;
    crystals.add(c);
  }
  crystals.add(sphere(0.12, mat('#8d8a84', { roughness: 1, flatShading: true }), 0, 0.02, 0, 6));
  crystals.position.set(1.4, 0.92, 0.08);
  bench.add(crystals);
  bench.position.set(9.5, 0, -9.55);
  ctx.addStatic(bench);
  ctx.collide(9.5, -9.55, w + 0.2, 0.9);
}

export function buildScience(ctx: BuildContext): void {
  labBench(ctx);
  const labSign = wallSign('Discovery Lab', '🔬', '#eaf6f4', PALETTE.teal, 2.2);
  labSign.position.set(9.5, 4.08, -9.8);
  ctx.mount('north', labSign);

  // Posters on the north wall.
  const plantPoster = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.18), new THREE.MeshStandardMaterial({ map: posterTexture('plants'), roughness: 0.9 }));
  plantPoster.position.set(5.95, 2.45, -9.8);
  ctx.mount('north', plantPoster);
  const solar = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), new THREE.MeshStandardMaterial({ map: posterTexture('solar'), roughness: 0.9 }));
  solar.position.set(12.95, 2.45, -9.8);
  ctx.mount('north', solar);

  // Windowsill plants (count grows with plant learning).
  const sill = new THREE.Group();
  ctx.add(sill);
  let plantCount = -1;
  ctx.features.push({
    apply: (state, animate) => {
      if (state.plantCount === plantCount) return;
      const prev = plantCount;
      plantCount = state.plantCount;
      sill.clear();
      const n = Math.min(6, Math.max(1, plantCount));
      for (let i = 0; i < n; i++) {
        const p = pottedPlant(Math.min(3, 1 + Math.floor((plantCount + i) / 3)), i + 3);
        p.position.set(7.4 + i * 0.8, 0.92, -9.78);
        sill.add(p);
        if (animate && prev >= 0 && i >= prev) void popIn(p, ctx, { duration: 0.9 });
      }
    },
  });

  // Sink-or-float tank (Nova's lesson station).
  const tankTable = group(rbox(1.3, 0.06, 0.8, 0.02, mat(PALETTE.birch, { roughness: 0.5 }), 0, 0.72, 0));
  for (const [x, z] of [
    [-0.55, -0.32],
    [0.55, -0.32],
    [-0.55, 0.32],
    [0.55, 0.32],
  ] as const) tankTable.add(cyl(0.035, 0.035, 0.7, mat(PALETTE.oak), x, 0.35, z, 8));
  const tank = group(
    box(1.1, 0.5, 0.6, glassMat('#e3fbff', 0.25), 0, 1.0, 0),
    box(1.06, 0.36, 0.56, uniqueMat('#6cc6dc', { transparent: true, opacity: 0.55, roughness: 0.05, emissive: '#1d6f86', emissiveIntensity: 0.15 }), 0, 0.93, 0),
  );
  const duck = group(sphere(0.07, mat('#f5c542'), 0, 0, 0, 14), sphere(0.045, mat('#f5c542'), 0.05, 0.06, 0, 12), cone(0.02, 0.04, mat('#e9833b'), 0.1, 0.055, 0, 6));
  (duck.children[2] as THREE.Object3D).rotation.z = -Math.PI / 2;
  duck.position.set(-0.25, 1.13, 0.05);
  const cork = cyl(0.04, 0.035, 0.06, mat('#b98a5a'), 0.2, 1.12, -0.1, 12);
  const key = box(0.12, 0.02, 0.04, mat('#c9a646', { metalness: 0.7, roughness: 0.35 }), 0.1, 0.77, 0.1);
  const rock = sphere(0.06, mat('#8d8a84', { flatShading: true }), -0.3, 0.8, -0.1, 6);
  duck.userData.dynamic = true;
  cork.userData.dynamic = true;
  tankTable.add(tank, duck, cork, key, rock);
  tankTable.position.set(10.9, 0, -6.2);
  ctx.addStatic(tankTable);
  ctx.addStatic(contactShadow(1.7, 1.2, 0.25, 10.9, -6.2));
  ctx.collide(10.9, -6.2, 1.4, 0.9);
  ctx.features.push({
    apply: () => undefined,
    update: (_dt, t) => {
      duck.position.y = 1.13 + Math.sin(t * 2) * 0.012;
      duck.rotation.y = Math.sin(t * 0.5) * 0.5;
      cork.position.y = 1.12 + Math.sin(t * 2.3 + 1) * 0.01;
    },
  });

  // Aquarium on the east wall.
  const aq = new THREE.Group();
  aq.add(rbox(0.6, 0.8, 1.6, 0.02, mat(PALETTE.walnut, { roughness: 0.6 }), 0, 0.4, 0));
  aq.add(box(0.55, 0.62, 1.5, glassMat('#dff7ff', 0.22), 0, 1.12, 0));
  aq.add(box(0.5, 0.5, 1.45, uniqueMat('#5fb8d6', { transparent: true, opacity: 0.45, emissive: '#1d6f86', emissiveIntensity: 0.25, roughness: 0.05 }), 0, 1.07, 0));
  aq.add(box(0.5, 0.06, 1.45, mat('#e8d4a8', { roughness: 1 }), 0, 0.84, 0));
  for (let i = 0; i < 5; i++) {
    const weed = cyl(0.015, 0.02, 0.25 + (i % 3) * 0.1, mat('#4f9a5a'), 0, 0.98 + (i % 3) * 0.05, -0.6 + i * 0.3, 6);
    weed.rotation.x = Math.sin(i) * 0.2;
    aq.add(weed);
  }
  aq.add(rbox(0.6, 0.06, 1.6, 0.02, mat(PALETTE.walnut), 0, 1.46, 0));
  const aqLight = new THREE.PointLight('#8fe3ff', 2.2, 3, 2);
  aqLight.position.set(-0.4, 1.2, 0);
  aq.add(aqLight);
  const fishGroup = new THREE.Group();
  fishGroup.userData.dynamic = true;
  aq.add(fishGroup);
  aq.position.set(13.5, 0, -7.9);
  ctx.addStatic(aq);
  ctx.collide(13.5, -7.9, 0.8, 1.8);
  ctx.anchors.set('aquarium', new THREE.Vector3(13.4, 1.1, -7.9));
  const fishColors = ['#ff8c42', '#ffd166', '#f15bb5', '#4cc9f0', '#90be6d', '#f94144', '#b5179e', '#43aa8b'];
  let fishCount = -1;
  ctx.features.push({
    apply: (state, animate) => {
      if (state.aquariumFish === fishCount) return;
      const prev = fishCount;
      fishCount = state.aquariumFish;
      fishGroup.clear();
      for (let i = 0; i < fishCount; i++) {
        const c = fishColors[i % fishColors.length] ?? '#ff8c42';
        const f = group(sphere(0.045, mat(c, { roughness: 0.4 }), 0, 0, 0, 12), cone(0.035, 0.05, mat(c), 0, 0, -0.06, 6));
        (f.children[0] as THREE.Object3D).scale.set(0.6, 1, 1.4);
        (f.children[1] as THREE.Object3D).rotation.x = -Math.PI / 2;
        f.userData.phase = i * 1.7;
        f.userData.depth = 0.95 + (i % 4) * 0.08;
        fishGroup.add(f);
        if (animate && prev >= 0 && i >= prev) {
          ctx.particles.sparkle(new THREE.Vector3(13.4, 1.2, -7.9), { count: 30, color: '#8fe3ff' });
        }
      }
    },
    update: (_dt, t) => {
      for (const f of fishGroup.children) {
        const p = (f.userData.phase as number) + t * 0.6;
        f.position.set(Math.sin(p * 1.3) * 0.12, (f.userData.depth as number) + Math.sin(p * 2) * 0.03, Math.sin(p) * 0.6);
        f.rotation.y = Math.cos(p) > 0 ? 0 : Math.PI;
      }
    },
  });

  // Reward: brass telescope by the window.
  const scope = new THREE.Group();
  const brass = mat(PALETTE.brass, { metalness: 0.85, roughness: 0.25 });
  const wood = mat(PALETTE.walnut, { roughness: 0.6 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = cyl(0.02, 0.025, 1.3, wood, Math.cos(a) * 0.25, 0.62, Math.sin(a) * 0.25, 8);
    leg.rotation.set(Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2);
    scope.add(leg);
  }
  const tube = group(cyl(0.06, 0.09, 1.1, brass, 0, 0, 0, 20), torus(0.09, 0.012, mat(PALETTE.walnut)));
  (tube.children[1] as THREE.Object3D).rotation.x = Math.PI / 2;
  (tube.children[1] as THREE.Object3D).position.y = 0.5;
  tube.position.set(0, 1.35, 0);
  tube.rotation.x = -1.0;
  scope.add(tube);
  scope.position.set(6.6, 0, -8.3);
  ctx.add(scope);
  ctx.features.push(toggleFeature(scope, (s) => s.telescope, ctx, () => ctx.collide(6.6, -8.3, 0.6, 0.6, 'telescope')));

  // Nova's station collider.
  ctx.collide(LAYOUT.nova.x, LAYOUT.nova.z, 0.6, 0.6);
}

export function buildMath(ctx: BuildContext): void {
  const numSign = wallSign('Number Nook', '🔢', '#fff6e6', '#2f7f8a', 2.2);
  numSign.position.set(13.8, 3.5, 1.2);
  numSign.rotation.y = -Math.PI / 2;
  ctx.mount('east', numSign);

  // Number line + shapes posters on the east wall.
  const nl = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshStandardMaterial({ map: posterTexture('numberline'), roughness: 0.9 }));
  nl.rotation.y = -Math.PI / 2;
  nl.position.set(13.8, 2.3, 1.2);
  ctx.mount('east', nl);
  const shapes = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.12), new THREE.MeshStandardMaterial({ map: posterTexture('shapes'), roughness: 0.9 }));
  shapes.rotation.y = -Math.PI / 2;
  shapes.position.set(13.8, 2.3, 8.3);
  ctx.mount('east', shapes);

  // Counting table with block towers and moon-rock bins.
  const table = group(rbox(1.5, 0.06, 1.0, 0.03, mat('#f2e3c6', { roughness: 0.5 }), 0, 0.52, 0));
  for (const [x, z] of [
    [-0.65, -0.4],
    [0.65, -0.4],
    [-0.65, 0.4],
    [0.65, 0.4],
  ] as const) table.add(cyl(0.035, 0.035, 0.5, mat('#7fc8c0'), x, 0.25, z, 8));
  const colors = [PALETTE.terracotta, PALETTE.mustard, '#7fc8c0', PALETTE.blush, '#9b8ec9', PALETTE.wainscot, '#4a6fa5'];
  [3, 5, 2, 4, 6, 1].forEach((hgt, i) => {
    for (let j = 0; j < hgt; j++) table.add(rbox(0.09, 0.09, 0.09, 0.012, mat(colors[(i + j) % colors.length] ?? '#e07a5f', { roughness: 0.5 }), -0.55 + i * 0.2, 0.6 + j * 0.092, -0.2));
  });
  for (const x of [-0.35, 0.35]) {
    const bin = group(cyl(0.2, 0.17, 0.16, mat('#4a6fa5', { roughness: 0.6 }), 0, 0.63, 0, 20));
    const rng = createRng(x > 0 ? 3 : 8);
    for (let i = 0; i < 9; i++) bin.add(sphere(0.045, mat('#b8b2a7', { flatShading: true, roughness: 1 }), (rng() - 0.5) * 0.24, 0.72 + rng() * 0.04, (rng() - 0.5) * 0.24, 6));
    bin.position.set(x, 0, 0.2);
    table.add(bin);
  }
  table.position.set(10.7, 0, 5.4);
  ctx.addStatic(table);
  ctx.addStatic(contactShadow(2, 1.4, 0.25, 10.7, 5.4));
  ctx.collide(10.7, 5.4, 1.6, 1.1);

  // Abacus stand.
  const abacus = new THREE.Group();
  const frame = mat(PALETTE.walnut, { roughness: 0.5 });
  abacus.add(box(0.05, 1.3, 0.05, frame, -0.55, 0.65, 0), box(0.05, 1.3, 0.05, frame, 0.55, 0.65, 0), box(1.15, 0.05, 0.08, frame, 0, 1.28, 0), box(1.15, 0.05, 0.08, frame, 0, 0.55, 0));
  for (let r = 0; r < 5; r++) {
    const y = 0.66 + r * 0.12;
    const rod = cyl(0.008, 0.008, 1.1, mat('#c9c2b4', { metalness: 0.6 }), 0, y, 0, 6);
    rod.rotation.z = Math.PI / 2;
    abacus.add(rod);
    for (let b = 0; b < 10; b++) {
      const bead = sphere(0.04, mat(colors[r] ?? '#e07a5f', { roughness: 0.4 }), -0.45 + b * 0.065 + (b >= 10 - r * 2 ? 0.25 : 0), y, 0, 12);
      bead.scale.set(0.7, 1, 1);
      abacus.add(bead);
    }
  }
  abacus.position.set(13.2, 0, 2.6);
  abacus.rotation.y = -Math.PI / 2;
  ctx.addStatic(abacus);
  ctx.collide(13.2, 2.6, 0.4, 1.3);

  // Digit's rocket (grows with missions).
  const rocket = new THREE.Group();
  const pad = group(cyl(0.9, 0.95, 0.08, mat('#50606b', { roughness: 0.7 }), 0, 0.04, 0, 32));
  const padLights: THREE.Mesh[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const l = sphere(0.04, uniqueMat('#ffe28a', { emissive: '#ffb703', emissiveIntensity: 0 }), Math.cos(a) * 0.8, 0.1, Math.sin(a) * 0.8, 8);
    padLights.push(l);
    pad.add(l);
  }
  const stage1 = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const fin = box(0.04, 0.45, 0.3, mat(PALETTE.terracotta, { roughness: 0.5 }), Math.cos(a) * 0.3, 0.35, Math.sin(a) * 0.3);
    fin.rotation.y = -a;
    stage1.add(fin);
  }
  stage1.add(cyl(0.28, 0.3, 0.5, mat('#f4f1ea', { roughness: 0.4 }), 0, 0.4, 0, 24));
  const stage2 = group(cyl(0.28, 0.28, 0.8, mat('#f4f1ea', { roughness: 0.4 }), 0, 1.05, 0, 24), torus(0.285, 0.02, mat(PALETTE.terracotta)));
  (stage2.children[1] as THREE.Object3D).rotation.x = Math.PI / 2;
  (stage2.children[1] as THREE.Object3D).position.y = 0.72;
  const window1 = cyl(0.11, 0.11, 0.04, mat('#8fe3ff', { emissive: '#35c0e0', emissiveIntensity: 0.6 }), 0, 1.15, 0.27, 20);
  window1.rotation.x = Math.PI / 2;
  stage2.add(window1);
  const stage3 = group(cone(0.28, 0.6, mat(PALETTE.terracotta, { roughness: 0.5 }), 0, 1.75, 0, 24), sphere(0.05, mat(PALETTE.mustard), 0, 2.07, 0, 10));
  const flame = cone(0.18, 0.5, uniqueMat('#ffd27a', { emissive: '#ff8c1a', emissiveIntensity: 2, transparent: true, opacity: 0.85 }), 0, -0.05, 0, 16);
  flame.rotation.x = Math.PI;
  flame.visible = false;
  stage1.add(flame);
  rocket.add(pad, stage1, stage2, stage3);
  rocket.position.set(12.3, 0, 8.3);
  ctx.add(rocket);
  ctx.collide(12.3, 8.3, 1.4, 1.4);
  ctx.anchors.set('rocket', new THREE.Vector3(12.3, 1.2, 8.3));
  const stages = [stage1, stage2, stage3];
  let stage = -1;
  ctx.features.push({
    apply: async (state, animate) => {
      if (state.rocketStage === stage) return;
      const prev = stage;
      stage = state.rocketStage;
      stages.forEach((s, i) => (s.visible = i < Math.min(3, stage)));
      if (animate && prev >= 0 && stage > prev) {
        const s = stages[Math.min(2, stage - 1)];
        if (s && stage <= 3) await popIn(s, ctx, { sparkleAt: new THREE.Vector3(12.3, 1 + stage * 0.4, 8.3) });
      }
      flame.visible = stage >= 4;
    },
    update: (_dt, t) => {
      padLights.forEach((l, i) => {
        (l.material as THREE.MeshStandardMaterial).emissiveIntensity = stage >= 4 ? 1 + Math.sin(t * 5 + i) * 0.8 : 0;
      });
      if (flame.visible) flame.scale.set(1, 0.9 + Math.sin(t * 20) * 0.1, 1);
    },
  });

  ctx.collide(LAYOUT.digit.x, LAYOUT.digit.z, 0.7, 0.7);
  void ease;
}
