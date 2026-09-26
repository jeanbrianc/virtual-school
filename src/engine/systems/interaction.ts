/**
 * Interaction system: proximity focus, hover, tap-to-walk and the big,
 * friendly markers that tell a young child "you can touch this!".
 */
import * as THREE from 'three';
import { createRng } from '../../domain/util/random';
import { canvasTexture } from '../render/textures';
import type { InteractableDef } from '../world/types';

const PROXY_LAYER = 1;

function iconTexture(icon: string, highlight: boolean): THREE.CanvasTexture {
  return canvasTexture(192, 192, (ctx, w, h) => {
    ctx.shadowColor = 'rgba(60,30,10,0.35)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = highlight ? '#fff6e6' : 'rgba(255,246,230,0.92)';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2 - 8, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 8;
    ctx.strokeStyle = highlight ? '#e3b448' : 'rgba(227,180,72,0.6)';
    ctx.stroke();
    // Little speech-bubble tail.
    ctx.fillStyle = highlight ? '#fff6e6' : 'rgba(255,246,230,0.92)';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 16, h / 2 + 56);
    ctx.lineTo(w / 2, h / 2 + 84);
    ctx.lineTo(w / 2 + 16, h / 2 + 56);
    ctx.fill();
    ctx.font = '84px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, w / 2, h / 2 - 2);
  });
}

interface Marker {
  sprite: THREE.Sprite;
  base: THREE.Vector3;
  phase: number;
}

export class InteractionSystem {
  readonly root = new THREE.Group();
  private proxies: THREE.Mesh[] = [];
  private markers = new Map<string, Marker>();
  private ring: THREE.Mesh;
  private dest: THREE.Mesh;
  private destLife = 0;
  focused: InteractableDef | null = null;
  hovered: InteractableDef | null = null;
  private raycaster = new THREE.Raycaster();
  private time = 0;

  constructor(private readonly defs: InteractableDef[]) {
    this.raycaster.layers.set(PROXY_LAYER);
    const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
    const rng = createRng(2);
    for (const d of defs) {
      const r = Math.max(0.5, Math.min(1.1, d.radius * 0.42));
      const proxy = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.markerHeight, 12), proxyMat);
      proxy.position.set(d.position.x, d.markerHeight / 2, d.position.z);
      proxy.layers.set(PROXY_LAYER);
      proxy.userData.interactId = d.id;
      this.proxies.push(proxy);
      this.root.add(proxy);

      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(d.icon, false), depthTest: false, transparent: true }));
      sprite.scale.setScalar(d.kind === 'teacher' ? 0.62 : 0.5);
      sprite.renderOrder = 20;
      const base = new THREE.Vector3(d.position.x, d.markerHeight, d.position.z);
      sprite.position.copy(base);
      this.markers.set(d.id, { sprite, base, phase: rng() * 6 });
      this.root.add(sprite);
    }

    const ringTex = canvasTexture(256, 256, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,214,120,0)');
      g.addColorStop(0.7, 'rgba(255,214,120,0.85)');
      g.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    this.ring = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.ring.renderOrder = 5;
    this.root.add(this.ring);

    this.dest = this.ring.clone();
    this.dest.material = (this.ring.material as THREE.MeshBasicMaterial).clone();
    this.root.add(this.dest);
  }

  byId(id: string): InteractableDef | undefined {
    return this.defs.find((d) => d.id === id);
  }

  /** Nearest enabled interactable whose radius contains the player. */
  computeFocus(player: THREE.Vector3): InteractableDef | null {
    let best: InteractableDef | null = null;
    let bestD = Infinity;
    for (const d of this.defs) {
      if (!d.enabled) continue;
      const dist = Math.hypot(d.position.x - player.x, d.position.z - player.z);
      if (dist < d.radius && dist < bestD) {
        best = d;
        bestD = dist;
      }
    }
    return best;
  }

  pick(ndc: THREE.Vector2, camera: THREE.Camera): InteractableDef | null {
    this.raycaster.setFromCamera(ndc, camera);
    const hits = this.raycaster.intersectObjects(this.proxies, false);
    for (const h of hits) {
      const def = this.byId(h.object.userData.interactId as string);
      if (def?.enabled) return def;
    }
    return null;
  }

  pickFloor(ndc: THREE.Vector2, camera: THREE.Camera): THREE.Vector3 | null {
    this.raycaster.setFromCamera(ndc, camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) ? p : null;
  }

  showDestination(p: THREE.Vector3): void {
    this.dest.position.set(p.x, 0.02, p.z);
    this.destLife = 0.8;
    this.dest.visible = true;
  }

  update(dt: number, player: THREE.Vector3): void {
    this.time += dt;
    for (const d of this.defs) {
      const m = this.markers.get(d.id);
      if (!m) continue;
      const isFocus = this.focused?.id === d.id || this.hovered?.id === d.id;
      const near = Math.hypot(d.position.x - player.x, d.position.z - player.z) < 9;
      // Teachers always show a gentle marker; objects only when nearby.
      m.sprite.visible = d.enabled && (isFocus || (d.kind === 'teacher' ? near : near && Math.hypot(d.position.x - player.x, d.position.z - player.z) < d.radius + 2.5));
      const bob = Math.sin(this.time * 2.6 + m.phase) * 0.1;
      m.sprite.position.set(m.base.x, m.base.y + bob + (isFocus ? 0.15 : 0), m.base.z);
      const target = (d.kind === 'teacher' ? 0.62 : 0.5) * (isFocus ? 1.35 : 1);
      const s = m.sprite.scale.x + (target - m.sprite.scale.x) * Math.min(1, dt * 10);
      m.sprite.scale.setScalar(s);
      (m.sprite.material as THREE.SpriteMaterial).opacity = isFocus ? 1 : 0.85;
    }
    const f = this.focused ?? this.hovered;
    if (f) {
      this.ring.visible = true;
      const size = Math.max(1.2, Math.min(2.4, f.radius * 0.9)) * (1 + Math.sin(this.time * 4) * 0.05);
      this.ring.scale.set(size, size, 1);
      this.ring.position.set(f.position.x, 0.02, f.position.z);
    } else this.ring.visible = false;
    if (this.destLife > 0) {
      this.destLife -= dt;
      const k = 1 - this.destLife / 0.8;
      this.dest.scale.setScalar(0.3 + k * 0.9);
      (this.dest.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      if (this.destLife <= 0) this.dest.visible = false;
    }
  }
}
