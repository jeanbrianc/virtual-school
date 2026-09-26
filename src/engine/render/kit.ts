/**
 * Modeling kit: cached materials and small mesh helpers used by all builders.
 * Stylized realism: soft, slightly rough materials, rounded edges, warm tones.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export interface MatOptions {
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  map?: THREE.Texture;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  flatShading?: boolean;
}

const cache = new Map<string, THREE.MeshStandardMaterial>();

export function mat(color: string, opts: MatOptions = {}): THREE.MeshStandardMaterial {
  const key = JSON.stringify([color, { ...opts, map: opts.map?.uuid }]);
  const hit = cache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.78,
    metalness: opts.metalness ?? 0,
    ...(opts.emissive ? { emissive: new THREE.Color(opts.emissive), emissiveIntensity: opts.emissiveIntensity ?? 1 } : {}),
    ...(opts.map ? { map: opts.map } : {}),
    ...(opts.transparent ? { transparent: true, opacity: opts.opacity ?? 1, depthWrite: (opts.opacity ?? 1) > 0.9 } : {}),
    side: opts.side ?? THREE.FrontSide,
    flatShading: opts.flatShading ?? false,
  });
  cache.set(key, m);
  return m;
}

/** A unique (uncached) material — for anything animated per-instance. */
export function uniqueMat(color: string, opts: MatOptions = {}): THREE.MeshStandardMaterial {
  return mat(color, opts).clone();
}

export function glassMat(tintColor = '#dff1f2', opacity = 0.28): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: tintColor,
    roughness: 0.05,
    metalness: 0,
    transmission: 0,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    clearcoat: 1,
  });
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function cachedGeo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  const hit = geoCache.get(key);
  if (hit) return hit as T;
  const g = make();
  geoCache.set(key, g);
  return g;
}

export function shadowed<T extends THREE.Object3D>(obj: T, cast = true, receive = true): T {
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return obj;
}

export function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(cachedGeo(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d)), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function rbox(w: number, h: number, d: number, r: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const radius = Math.min(r, w / 2, h / 2, d / 2);
  const mesh = new THREE.Mesh(cachedGeo(`rbox:${w}:${h}:${d}:${radius}`, () => new RoundedBoxGeometry(w, h, d, 3, radius)), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function cyl(rt: number, rb: number, h: number, material: THREE.Material, x = 0, y = 0, z = 0, seg = 24): THREE.Mesh {
  const mesh = new THREE.Mesh(cachedGeo(`cyl:${rt}:${rb}:${h}:${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function sphere(r: number, material: THREE.Material, x = 0, y = 0, z = 0, seg = 24): THREE.Mesh {
  const mesh = new THREE.Mesh(cachedGeo(`sph:${r}:${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.75)))), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function capsule(r: number, len: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(cachedGeo(`cap:${r}:${len}`, () => new THREE.CapsuleGeometry(r, len, 6, 16)), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

export function cone(r: number, h: number, material: THREE.Material, x = 0, y = 0, z = 0, seg = 16): THREE.Mesh {
  const mesh = new THREE.Mesh(cachedGeo(`cone:${r}:${h}:${seg}`, () => new THREE.ConeGeometry(r, h, seg)), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

export function torus(r: number, tube: number, material: THREE.Material, arc = Math.PI * 2): THREE.Mesh {
  const mesh = new THREE.Mesh(cachedGeo(`torus:${r}:${tube}:${arc}`, () => new THREE.TorusGeometry(r, tube, 10, 32, arc)), material);
  mesh.castShadow = true;
  return mesh;
}

export function plane(w: number, h: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(cachedGeo(`plane:${w}:${h}`, () => new THREE.PlaneGeometry(w, h)), material);
  mesh.receiveShadow = true;
  return mesh;
}

/** Soft fake contact shadow (a dark radial blob on the floor). */
let blobTex: THREE.Texture | null = null;
export function contactShadow(w: number, d: number, opacity = 0.35, x = 0, z = 0): THREE.Mesh {
  if (!blobTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    if (ctx) {
      const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
      g.addColorStop(0, 'rgba(40,24,10,1)');
      g.addColorStop(1, 'rgba(40,24,10,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }
    blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false });
  const mesh = new THREE.Mesh(cachedGeo('unitplane', () => new THREE.PlaneGeometry(1, 1)), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.set(w, d, 1);
  mesh.position.set(x, 0.012, z);
  mesh.renderOrder = 1;
  return mesh;
}

export function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  for (const c of children) g.add(c);
  return g;
}

export function at<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number, rotY = 0): T {
  obj.position.set(x, y, z);
  obj.rotation.y = rotY;
  return obj;
}
