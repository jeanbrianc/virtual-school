/**
 * Central classroom: alphabet rug, chalkboard greeting, low tables, globe,
 * paper lanterns, the art line (Izzy's artwork) and the planet mobile.
 */
import * as THREE from 'three';
import { createRng } from '../../domain/util/random';
import { box, contactShadow, cyl, group, mat, rbox, sphere, torus } from '../render/kit';
import { canvasTexture, chalkboardTexture, kidArtTexture, posterTexture, rugTexture } from '../render/textures';
import { PALETTE } from '../palette';
import { popIn, toggleFeature, type BuildContext } from './types';

const CHAIR_COLORS = [PALETTE.terracotta, PALETTE.mustard, '#7fc8c0', PALETTE.blush, '#9b8ec9', PALETTE.wainscot];

function kidChair(color: string): THREE.Group {
  const m = mat(color, { roughness: 0.6 });
  const legM = mat(PALETTE.birch, { roughness: 0.6 });
  const g = group(rbox(0.36, 0.05, 0.34, 0.02, m, 0, 0.3, 0), rbox(0.36, 0.26, 0.04, 0.02, m, 0, 0.47, -0.16));
  for (const [x, z] of [
    [-0.15, -0.14],
    [0.15, -0.14],
    [-0.15, 0.14],
    [0.15, 0.14],
  ] as const)
    g.add(cyl(0.02, 0.02, 0.3, legM, x, 0.15, z, 8));
  return g;
}

function roundTable(ctx: BuildContext, x: number, z: number, seed: number) {
  const top = cyl(0.62, 0.62, 0.05, mat(PALETTE.birch, { roughness: 0.5 }), 0, 0.5, 0, 40);
  const edge = torus(0.62, 0.025, mat(PALETTE.oak, { roughness: 0.5 }));
  edge.rotation.x = Math.PI / 2;
  edge.position.y = 0.5;
  const g = group(top, edge, cyl(0.06, 0.08, 0.48, mat(PALETTE.oak), 0, 0.24, 0), cyl(0.3, 0.32, 0.03, mat(PALETTE.oak), 0, 0.015, 0));
  const rng = createRng(seed);
  // Crayon cup + drawing paper + blocks.
  const cup = cyl(0.07, 0.06, 0.12, mat(PALETTE.teal, { roughness: 0.5 }), 0.15, 0.585, -0.1);
  g.add(cup);
  for (let i = 0; i < 6; i++) {
    const cr = cyl(0.012, 0.012, 0.16, mat(CHAIR_COLORS[i] ?? '#e07a5f', { roughness: 0.5 }), 0.15 + Math.cos(i) * 0.03, 0.66, -0.1 + Math.sin(i) * 0.03, 6);
    cr.rotation.z = (rng() - 0.5) * 0.4;
    g.add(cr);
  }
  const paper = box(0.3, 0.004, 0.22, mat('#fffaf0', { roughness: 0.9 }), -0.15, 0.527, 0.1);
  paper.rotation.y = rng();
  g.add(paper);
  for (let i = 0; i < 4; i++)
    g.add(rbox(0.07, 0.07, 0.07, 0.01, mat(CHAIR_COLORS[(i + seed) % 6] ?? '#e07a5f'), -0.25 + i * 0.08, 0.56 + (i === 3 ? 0.07 : 0), -0.2));
  g.position.set(x, 0, z);
  ctx.addStatic(g);
  ctx.addStatic(contactShadow(1.7, 1.7, 0.28, x, z));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + seed;
    const c = kidChair(CHAIR_COLORS[(i + seed) % CHAIR_COLORS.length] ?? '#e07a5f');
    c.position.set(x + Math.cos(a) * 0.85, 0, z + Math.sin(a) * 0.85);
    c.rotation.y = -a - Math.PI / 2;
    ctx.addStatic(c);
  }
  ctx.collide(x, z, 1.5, 1.5);
}

/** The alphabet rug in the middle of the classroom (its 1–10 numbers are the dance circuit). */
export const CLASSROOM_RUG = { x: 0, z: -4.2, width: 7, depth: 5.25 } as const;

export function buildClassroom(ctx: BuildContext, today: Date): void {
  // Alphabet rug.
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(CLASSROOM_RUG.width, CLASSROOM_RUG.depth),
    new THREE.MeshStandardMaterial({ map: rugTexture('classroom'), roughness: 1 }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(CLASSROOM_RUG.x, 0.01, CLASSROOM_RUG.z);
  rug.receiveShadow = true;
  ctx.addStatic(rug);

  // Chalkboard.
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const board = new THREE.Group();
  const frame = rbox(4.5, 2.1, 0.08, 0.03, mat(PALETTE.oak, { roughness: 0.5 }), 0, 0, 0);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(4.3, 1.9),
    new THREE.MeshStandardMaterial({
      map: chalkboardTexture([`Good morning, ${ctx.childName}!`, 'Let’s explore!'], `${days[today.getDay()]}, ${months[today.getMonth()]} ${today.getDate()}`),
      roughness: 0.9,
    }),
  );
  face.position.z = 0.045;
  const tray = box(4.3, 0.05, 0.14, mat(PALETTE.oak), 0, -1.02, 0.07);
  board.add(frame, face, tray);
  for (let i = 0; i < 4; i++)
    board.add(cyl(0.012, 0.012, 0.08, mat(['#ffffff', '#f7d27a', '#a8d8e0', '#f4a6a6'][i] ?? '#fff'), -1.6 + i * 0.12, -0.98, 0.09, 6).rotateZ(Math.PI / 2));
  board.position.set(0, 2.35, -9.78);
  ctx.mount('north', board);

  // Alphabet banner.
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.72), new THREE.MeshStandardMaterial({ map: posterTexture('alphabet'), roughness: 0.9 }));
  banner.position.set(0, 3.95, -9.8);
  ctx.mount('north', banner);

  // Calendar easel.
  const easel = new THREE.Group();
  const legM = mat(PALETTE.oak, { roughness: 0.6 });
  for (const s of [-1, 1]) {
    const leg = box(0.05, 1.7, 0.05, legM, s * 0.4, 0.85, 0);
    leg.rotation.z = s * -0.08;
    easel.add(leg);
  }
  const back = box(0.05, 1.6, 0.05, legM, 0, 0.8, -0.35);
  back.rotation.x = 0.25;
  easel.add(back);
  const cal = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshStandardMaterial({ map: posterTexture('calendar', today), roughness: 0.8 }));
  cal.position.set(0, 1.25, 0.04);
  easel.add(cal, box(0.9, 0.05, 0.12, legM, 0, 0.83, 0.03));
  easel.position.set(-3.6, 0, -8.8);
  easel.rotation.y = 0.35;
  ctx.addStatic(easel);
  ctx.collide(-3.6, -8.8, 1.0, 0.6);

  // Globe.
  const globe = new THREE.Group();
  const earth = sphere(0.32, new THREE.MeshStandardMaterial({ map: posterTexture('map'), roughness: 0.5 }), 0, 1.25, 0, 32);
  earth.rotation.z = 0.41;
  earth.name = 'globe-earth';
  const meridian = torus(0.36, 0.015, mat(PALETTE.brass, { metalness: 0.8, roughness: 0.3 }), Math.PI);
  meridian.position.y = 1.25;
  meridian.rotation.z = 0.41 - Math.PI / 2;
  globe.add(earth, meridian, cyl(0.03, 0.03, 0.85, mat(PALETTE.walnut), 0, 0.45, 0), cyl(0.22, 0.26, 0.06, mat(PALETTE.walnut), 0, 0.03, 0));
  globe.position.set(4.3, 0, -7.4);
  ctx.add(globe);
  ctx.collide(4.3, -7.4, 0.6, 0.6);
  ctx.features.push({ apply: () => undefined, update: (dt) => (earth.rotation.y += dt * 0.25) });

  // Low tables.
  roundTable(ctx, -2.3, 0.9, 1);
  roundTable(ctx, 2.3, 0.9, 3);

  // Bean bags on the rug.
  const bb1 = sphere(0.45, mat(PALETTE.terracotta, { roughness: 1 }), -3.1, 0.3, -2.3, 20);
  bb1.scale.set(1, 0.65, 1);
  const bb2 = sphere(0.45, mat('#7fc8c0', { roughness: 1 }), 3.1, 0.3, -2.3, 20);
  bb2.scale.set(1, 0.65, 1);
  ctx.addStatic(bb1);
  ctx.addStatic(bb2);
  ctx.collide(-3.1, -2.3, 0.8, 0.8);
  ctx.collide(3.1, -2.3, 0.8, 0.8);

  // Paper lanterns.
  const lanternColors = ['#fff1d6', '#ffe0cc', '#fff6c9'];
  [
    [-2.5, -4.5],
    [2.5, -4.5],
    [0, 1.8],
  ].forEach(([x, z], i) => {
    const l = new THREE.Group();
    const paper = sphere(0.36, mat(lanternColors[i] ?? '#fff1d6', { emissive: '#ffd79a', emissiveIntensity: 0.35, roughness: 1 }), 0, 0, 0, 20);
    paper.castShadow = false;
    for (let r = -2; r <= 2; r++) {
      const rib = torus(0.36 * Math.cos((r * Math.PI) / 7), 0.006, mat('#d8c3a5'));
      rib.rotation.x = Math.PI / 2;
      rib.position.y = 0.36 * Math.sin((r * Math.PI) / 7);
      l.add(rib);
    }
    const light = new THREE.PointLight('#ffd9a8', 2.5, 7, 1.7);
    l.add(paper, light, cyl(0.004, 0.004, 1.1, mat('#6b5a45'), 0, 0.9, 0, 4));
    l.position.set(x ?? 0, 3.5, z ?? 0);
    ctx.addStatic(l);
  });

  // Reward: art line with the child's artwork.
  const artLine = new THREE.Group();
  const post = mat(PALETTE.oak, { roughness: 0.6 });
  for (const s of [-1, 1]) artLine.add(cyl(0.04, 0.05, 2.5, post, s * 3.6, 1.25, 0, 10), sphere(0.07, mat(PALETTE.mustard), s * 3.6, 2.55, 0, 12));
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-3.6, 2.4, 0), new THREE.Vector3(0, 2.2, 0), new THREE.Vector3(3.6, 2.4, 0));
  artLine.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.008, 5), mat('#e9dcc4')));
  const artSlots = new THREE.Group();
  artLine.add(artSlots);
  artLine.position.set(0, 0, 4.4);
  ctx.add(artLine);
  ctx.collide(-3.6, 4.4, 0.25, 0.25);
  ctx.collide(3.6, 4.4, 0.25, 0.25);
  let artCount = -1;
  let artVisible: boolean | null = null;
  const artTextures = new Map<number, THREE.Texture>();
  const photoTextures: THREE.Texture[] = [];
  const renderArt = (count: number, fresh: number) => {
    artSlots.clear();
    const n = Math.min(7, count);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / 7;
      const p = curve.getPoint(t);
      const seed = [31, 77, 12, 45, 90, 23, 64][i] ?? i * 17;
      let tex = photoTextures[i] ?? artTextures.get(seed);
      if (!tex) {
        tex = kidArtTexture(seed, ctx.childName);
        artTextures.set(seed, tex);
      }
      const frame = new THREE.Group();
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.47), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide }));
      paper.position.y = -0.26;
      paper.castShadow = true;
      const pin = box(0.03, 0.07, 0.02, mat(CHAIR_COLORS[i % 6] ?? '#e07a5f'), 0, 0, 0.01);
      frame.add(paper, pin);
      frame.position.set(p.x, p.y, 0.01);
      frame.rotation.z = Math.sin(i * 2.1) * 0.06;
      frame.userData.swing = i;
      artSlots.add(frame);
      if (i >= n - fresh) void popIn(frame, ctx, { duration: 0.8 });
    }
  };
  ctx.features.push({
    apply: async (state, animate) => {
      if (artVisible !== state.artLine) {
        const wasKnown = artVisible !== null;
        artVisible = state.artLine;
        artLine.visible = state.artLine;
        if (state.artLine && animate && wasKnown) await popIn(artLine, ctx);
      }
      if (state.artworkCount !== artCount) {
        const fresh = artCount >= 0 && animate ? Math.max(0, state.artworkCount - artCount) : 0;
        artCount = state.artworkCount;
        renderArt(artCount, fresh);
      }
    },
    update: (_dt, t) => {
      for (const f of artSlots.children) f.rotation.z = Math.sin(t * 1.2 + (f.userData.swing as number)) * 0.04;
    },
  });
  ctx.anchors.set('artLine', new THREE.Vector3(0, 1.8, 4.4));
  // Expose a hook so parent-uploaded artwork photos can replace generated art.
  artLine.userData.setPhotos = (textures: THREE.Texture[]) => {
    photoTextures.splice(0, photoTextures.length, ...textures);
    if (artCount >= 0) renderArt(artCount, 0);
  };
  artLine.name = 'art-line';

  // Reward: planet mobile over the rug.
  const mobile = new THREE.Group();
  const sun = sphere(0.28, mat('#ffcc4d', { emissive: '#ffae00', emissiveIntensity: 1.2 }), 0, 0, 0, 24);
  mobile.add(sun);
  const planets: [number, string, number][] = [
    [0.06, '#b9a38c', 0.55],
    [0.09, '#e9c07b', 0.8],
    [0.1, '#5aa0d6', 1.05],
    [0.08, '#d9774b', 1.3],
    [0.2, '#d9b38c', 1.65],
    [0.17, '#e8d29a', 2.0],
    [0.13, '#9fd6e0', 2.3],
    [0.12, '#4f7bd6', 2.55],
  ];
  const orbits: THREE.Group[] = [];
  planets.forEach(([r, c, d], i) => {
    const orbit = new THREE.Group();
    const p = sphere(r, mat(c, { roughness: 0.6 }), d, -0.1 - (i % 3) * 0.12, 0, 16);
    orbit.add(p, cyl(0.004, 0.004, 0.2 + (i % 3) * 0.12, mat('#6b5a45'), d, 0.02 - (i % 3) * 0.06, 0, 4));
    if (i === 5) {
      const ringM = torus(0.3, 0.03, mat('#d9c9a3'));
      ringM.rotation.x = Math.PI / 2 - 0.3;
      ringM.position.copy(p.position);
      orbit.add(ringM);
    }
    orbit.rotation.y = i * 1.3;
    orbit.userData.speed = 0.5 / (1 + i * 0.4);
    orbits.push(orbit);
    mobile.add(orbit);
  });
  mobile.add(cyl(0.006, 0.006, 1.2, mat('#6b5a45'), 0, 0.7, 0, 4));
  mobile.position.set(0, 3.4, -4.4);
  ctx.add(mobile);
  const mobileFeature = toggleFeature(mobile, (s) => s.planetMobile, ctx);
  ctx.features.push({
    ...mobileFeature,
    update: (dt) => {
      if (!mobile.visible) return;
      for (const o of orbits) o.rotation.y += dt * (o.userData.speed as number);
    },
  });

  // Welcome mat at the entrance.
  const matTex = canvasTexture(512, 256, (c, w, h) => {
    c.fillStyle = '#b5533c';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#e9c07b';
    c.lineWidth = 10;
    c.strokeRect(18, 18, w - 36, h - 36);
    c.fillStyle = '#fbe7c6';
    c.font = '600 64px "Fredoka", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('Welcome!', w / 2, h / 2 + 4);
  });
  const welcome = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.0), new THREE.MeshStandardMaterial({ map: matTex, roughness: 1 }));
  welcome.rotation.x = -Math.PI / 2;
  welcome.position.set(0, 0.013, 8.9);
  welcome.receiveShadow = true;
  ctx.addStatic(welcome);

  // Flower boxes along the outside of the low entrance wall frame the view.
  const rngF = createRng(12);
  for (const [x0, x1] of [
    [-13.6, -1.8],
    [1.8, 13.6],
  ] as const) {
    const len = x1 - x0;
    const cx = (x0 + x1) / 2;
    const planter = rbox(len, 0.34, 0.5, 0.05, mat('#8aa37f', { roughness: 0.8 }), cx, 0.3, 10.6);
    ctx.addStatic(planter);
    ctx.addStatic(box(len - 0.1, 0.04, 0.4, mat('#5b3d2a', { roughness: 1 }), cx, 0.46, 10.6));
    for (let i = 0; i < Math.floor(len / 0.32); i++) {
      const x = x0 + 0.2 + i * 0.32;
      const bush = sphere(0.14 + rngF() * 0.06, mat(rngF() < 0.5 ? '#6f9e57' : '#5f8f4e', { roughness: 0.8 }), x, 0.55, 10.6 + (rngF() - 0.5) * 0.15, 10);
      bush.scale.y = 0.8;
      ctx.addStatic(bush);
      if (rngF() < 0.55) {
        const col = ['#f28fad', '#ffd166', '#f4a261', '#c9a7f5', '#fff4e0'][Math.floor(rngF() * 5)] ?? '#ffd166';
        ctx.addStatic(sphere(0.06, mat(col, { roughness: 0.6 }), x + (rngF() - 0.5) * 0.12, 0.68, 10.6 + (rngF() - 0.5) * 0.2, 8));
      }
    }
  }
}
