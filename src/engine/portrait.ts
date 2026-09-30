/**
 * Renders avatar portraits (and a live turntable preview) with a small
 * dedicated renderer, so the UI shows the same character as the 3D world.
 */
import * as THREE from 'three';
import type { DanceMoveId } from '../domain/play/circuit';
import type { AvatarConfig } from '../domain/types';
import { AvatarModel } from './characters/avatarModel';

let shared: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null = null;
const cache = new Map<string, string>();

function lights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight('#fff6e8', '#b98a5a', 1.6));
  const key = new THREE.DirectionalLight('#fff0d8', 2.2);
  key.position.set(2, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#cfe6ff', 1.2);
  rim.position.set(-3, 2, -2);
  scene.add(rim);
}

function getShared() {
  if (shared) return shared;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  lights(scene);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  shared = { renderer, scene, camera };
  return shared;
}

/** Head-and-shoulders portrait as a PNG data URL (cached per config). */
export function renderAvatarPortrait(cfg: AvatarConfig, size = 256, framing: 'head' | 'full' = 'head'): string {
  const key = `${JSON.stringify(cfg)}|${size}|${framing}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const { renderer, scene, camera } = getShared();
    renderer.setSize(size, size, false);
    const model = new AvatarModel(cfg);
    model.update(0.016, 0);
    model.root.rotation.y = 0.35;
    scene.add(model.root);
    if (framing === 'head') {
      camera.position.set(0.45, 1.05, 2.1);
      camera.lookAt(0, 0.88, 0);
    } else {
      camera.position.set(0.9, 1.0, 3.6);
      camera.lookAt(0, 0.6, 0);
    }
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    scene.remove(model.root);
    cache.set(key, url);
    return url;
  } catch {
    return '';
  }
}

/** A live, slowly rotating avatar preview mounted in a container (parent avatar editor). */
export class AvatarPreview {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
  private model: AvatarModel;
  private raf = 0;
  private last = performance.now();
  private spin = 0;
  /** 0 = turntable, 1 = showing a dance move (camera back, turned to the camera). */
  private show = 0;

  constructor(
    private readonly container: HTMLElement,
    cfg: AvatarConfig,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);
    lights(this.scene);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.8, 40), new THREE.MeshStandardMaterial({ color: '#efe2c8', roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    this.model = new AvatarModel(cfg);
    this.scene.add(this.model.root);
    this.camera.position.set(0, 1.0, 3.3);
    this.camera.lookAt(0, 0.62, 0);
    this.resize();
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      const performing = this.model.performing;
      this.show += ((performing ? 1 : 0) - this.show) * (1 - Math.exp(-4 * dt));
      if (!performing) this.spin += dt * 0.5;
      // A move gets the same slight three-quarter turn as in her school, and room for flips.
      this.model.root.rotation.y = Math.sin(this.spin) * 0.7 * (1 - this.show) + 0.5 * this.show;
      this.camera.position.set(0, 1.0 + 0.3 * this.show, 3.3 + 1.5 * this.show);
      this.camera.lookAt(0, 0.62 + 0.3 * this.show, 0);
      this.model.update(dt, 0);
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  setConfig(cfg: AvatarConfig): void {
    this.model.setConfig(cfg);
    this.model.wave();
  }

  /** Plays a dance-circuit move (the parent's "Try it"). */
  perform(move: DanceMoveId): Promise<void> {
    return this.model.perform(move);
  }

  resize(): void {
    const w = this.container.clientWidth || 280;
    const h = this.container.clientHeight || 320;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
