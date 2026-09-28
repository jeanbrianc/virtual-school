/**
 * Interaction system: proximity focus, hover, tap-to-walk and the big,
 * friendly markers that tell a young child "you can touch this!".
 */
import * as THREE from 'three';
import { createRng } from '../../domain/util/random';
import { canvasTexture } from '../render/textures';
import type { InteractableDef } from '../world/types';

const PROXY_LAYER = 1;

/** Four-point sparkle used on markers for things the child hasn't discovered yet. */
function drawSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.38;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffd24a';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fill();
}

function iconTexture(icon: string, highlight: boolean, fresh = false): THREE.CanvasTexture {
  return canvasTexture(192, 192, (ctx, w, h) => {
    ctx.shadowColor = 'rgba(60,30,10,0.35)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = highlight ? '#fff6e6' : 'rgba(255,246,230,0.92)';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2 - 8, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = fresh ? 12 : 8;
    ctx.strokeStyle = fresh ? '#ffc93c' : highlight ? '#e3b448' : 'rgba(227,180,72,0.6)';
    if (fresh) {
      ctx.shadowColor = 'rgba(255,200,60,0.9)';
      ctx.shadowBlur = 18;
    }
    ctx.stroke();
    ctx.shadowColor = 'transparent';
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
    if (fresh) drawSparkle(ctx, w - 38, 36, 34);
  });
}

interface Marker {
  sprite: THREE.Sprite;
  base: THREE.Vector3;
  phase: number;
  normal: THREE.Texture;
  fresh: THREE.Texture | null;
  icon: string;
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
  private fresh = new Set<string>();

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

      const normal = iconTexture(d.icon, false);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: normal, depthTest: false, transparent: true }));
      sprite.scale.setScalar(d.kind === 'teacher' ? 0.62 : 0.5);
      sprite.renderOrder = 20;
      const base = new THREE.Vector3(d.position.x, d.markerHeight, d.position.z);
      sprite.position.copy(base);
      this.markers.set(d.id, { sprite, base, phase: rng() * 6, normal, fresh: null, icon: d.icon });
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

  /** Things not yet discovered get a sparkle and are visible from across the room. */
  setFresh(ids: Iterable<string>): void {
    this.fresh = new Set(ids);
    for (const [id, m] of this.markers) {
      const isFresh = this.fresh.has(id);
      if (isFresh && !m.fresh) m.fresh = iconTexture(m.icon, false, true);
      const mat = m.sprite.material as THREE.SpriteMaterial;
      const next = isFresh ? m.fresh! : m.normal;
      if (mat.map !== next) {
        mat.map = next;
        mat.needsUpdate = true;
      }
    }
  }

  isFresh(id: string): boolean {
    return this.fresh.has(id);
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
      const dist = Math.hypot(d.position.x - player.x, d.position.z - player.z);
      const near = dist < 9;
      const fresh = this.fresh.has(d.id);
      // Undiscovered things sparkle from across the room; teachers show a gentle
      // marker nearby; discovered objects only when close.
      m.sprite.visible = d.enabled && (isFocus || (fresh ? dist < 22 : d.kind === 'teacher' ? near : near && dist < d.radius + 2.5));
      const bob = Math.sin(this.time * (fresh ? 3.4 : 2.6) + m.phase) * (fresh ? 0.16 : 0.1);
      m.sprite.position.set(m.base.x, m.base.y + bob + (isFocus ? 0.15 : 0), m.base.z);
      const pulse = fresh ? 1 + Math.sin(this.time * 3 + m.phase) * 0.06 : 1;
      const target = (d.kind === 'teacher' ? 0.62 : 0.5) * (isFocus ? 1.35 : fresh ? 1.3 * pulse : 1);
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
