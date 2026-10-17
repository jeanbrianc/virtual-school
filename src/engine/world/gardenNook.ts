/** Handmade garden details. Everything is local geometry or a painted texture. */
import * as THREE from 'three';
import { box, cyl, group, mat, sphere } from '../render/kit';
import { canvasTexture } from '../render/textures';

const LEAF = '#5c8655';
const PETALS = ['#f4baaf', '#fff3ce', '#c1b4d9'];

/** A shallow flower relief, facing +Z, that stays flush to its wall. */
function flower(color: string, size: number): THREE.Group {
  const bloom = new THREE.Group();
  const petal = mat(color, { roughness: 0.95 });
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const mesh = sphere(size * 0.53, petal, Math.cos(angle) * size * 0.65, Math.sin(angle) * size * 0.65, 0.015, 10);
    mesh.scale.set(0.7, 1, 0.23);
    mesh.rotation.z = angle - Math.PI / 2;
    bloom.add(mesh);
  }
  const heart = sphere(size * 0.34, mat('#e4ae44'), 0, 0, 0.055, 12);
  heart.scale.z = 0.35;
  bloom.add(heart);
  return bloom;
}

/** One world-owned mural material, shared by the three nook walls. */
export function gardenMuralMaterial(): THREE.MeshStandardMaterial {
  const mural = canvasTexture(1024, 576, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#c7e5e6');
    sky.addColorStop(1, '#eff1d6');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    // Soft cloud puffs and a distant rolling meadow.
    ctx.fillStyle = '#fff8e9';
    for (const [x, y, scale] of [
      [0.18, 0.2, 1],
      [0.73, 0.16, 0.75],
      [0.53, 0.38, 0.52],
    ] as const) {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(x * w + (i - 1) * 34 * scale, y * h + (i === 1 ? -11 : 0), 43 * scale, 23 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const [color, y, offset] of [
      ['#bfd2a3', 0.69, 0.17],
      ['#a2bf89', 0.88, 0.62],
    ] as const) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, h * y);
      ctx.bezierCurveTo(w * offset, h * (y - 0.36), w * 0.65, h * (y + 0.23), w, h * (y - 0.12));
      ctx.lineTo(w, h);
      ctx.fill();
    }
  });
  // Do not put per-world canvas textures in the kit's permanent material cache.
  return new THREE.MeshStandardMaterial({ map: mural, roughness: 1 });
}

/** A sky-and-hills mural with raised flowers. Mount on the cutaway itself. */
export function gardenWallDecor(width: number, sunny: boolean, muralMaterial: THREE.MeshStandardMaterial): THREE.Group {
  const decor = new THREE.Group();
  decor.name = 'garden-wall-decor';
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.08, 2.72), muralMaterial);
  face.position.set(0, 1.82, 0);
  decor.add(face);

  // A little wooden garden border along the bottom of the mural.
  const fence = mat('#f8edce');
  decor.add(box(width - 0.12, 0.055, 0.045, fence, 0, 0.69, 0.045));
  for (let x = -width / 2 + 0.2; x < width / 2 - 0.1; x += 0.24) {
    decor.add(box(0.1, 0.38, 0.04, fence, x, 0.68, 0.055));
  }
  // Tall flowers frame the reading space without sticking into the walkway.
  for (const [i, u] of [-0.4, -0.27, 0.26, 0.4].entries()) {
    const x = width * u;
    const y = [1.43, 1.92, 1.65, 2.03][i]!;
    const stem = cyl(0.018, 0.018, y - 0.7, mat(LEAF), x, (y + 0.7) / 2, 0.07, 6);
    const bloom = flower(PETALS[i % PETALS.length]!, i % 2 ? 0.24 : 0.31);
    bloom.position.set(x, y, 0.09);
    decor.add(stem, bloom);
    for (const s of [-1, 1]) {
      const leaf = sphere(0.15, mat(LEAF), x + s * 0.11, y - 0.35 - (s + 1) * 0.08, 0.08, 8);
      leaf.scale.set(1, 0.44, 0.15);
      leaf.rotation.z = s * 0.6;
      decor.add(leaf);
    }
  }

  if (sunny) {
    const sunshine = new THREE.Group();
    sunshine.name = 'nook-sunshine';
    sunshine.position.set(0, 2.52, 0.05);
    const gold = mat('#f2c458', { emissive: '#e9b84d', emissiveIntensity: 0.12 });
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI) / 6;
      const ray = box(0.065, 0.19, 0.025, gold, Math.cos(angle) * 0.49, Math.sin(angle) * 0.49, 0);
      ray.rotation.z = angle - Math.PI / 2;
      sunshine.add(ray);
    }
    const disc = sphere(0.34, gold, 0, 0, 0.02, 24);
    disc.scale.z = 0.17;
    sunshine.add(disc);
    for (const x of [-0.1, 0.1]) {
      const eye = sphere(0.022, mat('#785335'), x, 0.03, 0.08, 8);
      eye.scale.z = 0.2;
      sunshine.add(eye);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 16, Math.PI), mat('#785335'));
    smile.rotation.z = Math.PI;
    smile.position.set(0, -0.035, 0.08);
    sunshine.add(smile);
    decor.add(sunshine);
  }
  return decor;
}

/** A small pot for an existing furniture surface; no new collision footprint. */
export function gardenPot(): THREE.Group {
  const pot = group(cyl(0.12, 0.09, 0.22, mat('#bd7558'), 0, 0.11, 0, 12), cyl(0.13, 0.13, 0.045, mat('#d89170'), 0, 0.21, 0, 12));
  for (const [i, x] of [-0.065, 0.065].entries()) {
    const y = 0.43 + i * 0.08;
    pot.add(cyl(0.012, 0.012, y - 0.2, mat(LEAF), x, (y + 0.2) / 2, 0, 6));
    const bloom = flower(PETALS[i]!, 0.1);
    bloom.position.set(x, y, 0);
    pot.add(bloom);
  }
  return pot;
}

/** A painted pool of sunshine: no extra lights, shadows, animations or timers. */
export function gardenSunlight(): THREE.Mesh {
  const texture = canvasTexture(256, 256, (ctx, w, h) => {
    const glow = ctx.createRadialGradient(w / 2, h / 2, 24, w / 2, h / 2, w / 2);
    glow.addColorStop(0, 'rgba(255,235,170,0.3)');
    glow.addColorStop(0.65, 'rgba(255,235,170,0.15)');
    glow.addColorStop(1, 'rgba(255,235,170,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 2.2), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2;
  pool.renderOrder = 2;
  return pool;
}
