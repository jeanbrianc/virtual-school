/**
 * Static batching: merges the meshes under a group into one mesh per
 * material (preserving shadow flags). Procedural props are built from many
 * small primitives for easy authoring; baking keeps draw calls low enough for
 * tablets. Only use on groups that never animate internally.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface Bucket {
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
  renderOrder: number;
  geometries: THREE.BufferGeometry[];
}

export function bakeStatic(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, Bucket>();
  const victims: THREE.Mesh[] = [];

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as unknown as THREE.InstancedMesh).isInstancedMesh) return;
    if (Array.isArray(mesh.material) || mesh.userData.dynamic || !mesh.visible) return;
    // Skip anything under a dynamic ancestor.
    let p: THREE.Object3D | null = mesh.parent;
    while (p && p !== root) {
      if (p.userData.dynamic) return;
      p = p.parent;
    }
    const geo = mesh.geometry;
    if (!geo.getAttribute('position') || !geo.getAttribute('normal')) return;
    const key = `${mesh.material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}|${mesh.renderOrder}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { material: mesh.material, castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow, renderOrder: mesh.renderOrder, geometries: [] };
      buckets.set(key, bucket);
    }
    const g = geo.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
    bucket.geometries.push(g);
    victims.push(mesh);
  });

  let created = 0;
  for (const b of buckets.values()) {
    if (b.geometries.length < 2) {
      b.geometries.forEach((g) => g.dispose());
      continue;
    }
    const anyNonIndexed = b.geometries.some((g) => g.index === null);
    const prepared = b.geometries.map((g) => {
      const base = anyNonIndexed && g.index ? g.toNonIndexed() : g;
      // Keep only the attributes every primitive shares.
      for (const name of Object.keys(base.attributes)) if (!['position', 'normal', 'uv'].includes(name)) base.deleteAttribute(name);
      if (!base.getAttribute('uv')) {
        base.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((base.getAttribute('position').count ?? 0) * 2), 2));
      }
      base.clearGroups();
      return base;
    });
    const merged = mergeGeometries(prepared, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.castShadow = b.castShadow;
    mesh.receiveShadow = b.receiveShadow;
    mesh.renderOrder = b.renderOrder;
    mesh.name = 'baked';
    root.add(mesh);
    created++;
    for (const v of victims) {
      if (v.material === b.material && v.castShadow === b.castShadow && v.receiveShadow === b.receiveShadow && v.renderOrder === b.renderOrder) {
        v.removeFromParent();
      }
    }
  }
  return created;
}
