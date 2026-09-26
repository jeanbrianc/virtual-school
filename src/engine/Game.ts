/**
 * Game — the 3D engine facade used by React. Owns the renderer, scene,
 * world, player, camera, input and cinematic director. The UI talks to it
 * through a small imperative API and receives callbacks; the engine never
 * touches persistence or learning logic directly.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { AudioEngine } from '../audio/AudioEngine';
import { CAMERA, INTERACTION, RENDER_QUALITY } from '../config/gameConfig';
import type { TeacherId } from '../domain/teachers/teachers';
import type { AvatarConfig, GraphicsQuality } from '../domain/types';
import type { WorldState } from '../domain/world/worldState';
import { AvatarModel } from './characters/avatarModel';
import { createPet, type PetId, type PetModel } from './characters/pets';
import { NavGrid } from './core/navGrid';
import { Tweens } from './core/tween';
import { Particles } from './fx/particles';
import { LAYOUT } from './palette';
import { canvasTexture } from './render/textures';
import { CameraRig } from './systems/cameraRig';
import { InputManager } from './systems/input';
import { InteractionSystem } from './systems/interaction';
import { PlayerController } from './systems/player';
import { SchoolWorld } from './world/SchoolWorld';
import type { ShelfBook } from './world/bookshelf';
import type { InteractableDef } from './world/types';

export interface FocusInfo {
  id: string;
  label: string;
  icon: string;
  kind: InteractableDef['kind'];
}

export interface GameCallbacks {
  onFocus(info: FocusInfo | null): void;
  onInteract(id: string): void;
  onBack?(): void;
}

export interface GameOptions {
  container: HTMLElement;
  avatar: AvatarConfig;
  quality: GraphicsQuality;
  audio: AudioEngine;
  callbacks: GameCallbacks;
  today: Date;
}

/** Where the camera goes to show off each reward. */
const REWARD_SHOTS: Record<string, { pos: [number, number, number]; look: [number, number, number] }> = {
  shelf: { pos: [-9.6, 3.0, -4.4], look: [-10.4, 1.4, -9.4] },
  nook: { pos: [-9.5, 3.2, 2.2], look: [-14.5, 1.3, 2] },
  library: { pos: [-7.5, 3.6, -1.5], look: [-10, 2.6, -7] },
  greenhouse: { pos: [9.5, 4.5, -1.5], look: [16.5, 1, -4] },
  museum: { pos: [-7.5, 3.6, 2.5], look: [-10.5, 1.2, 6.5] },
  science: { pos: [7.5, 3.4, -3.5], look: [9, 1.2, -8.2] },
  aquarium: { pos: [10.8, 2.3, -6.0], look: [13.4, 1.1, -7.9] },
  classroom: { pos: [0, 4.2, 9.5], look: [0, 1.8, 3.5] },
  mobile: { pos: [0, 2.2, 2.0], look: [0, 3.2, -4.4] },
  rocket: { pos: [9.5, 3.0, 5.5], look: [12.3, 1.2, 8.3] },
  art: { pos: [11.0, 3.2, 5.2], look: [15.5, 1.3, 5.7] },
};

export function shotForReward(id: string): keyof typeof REWARD_SHOTS | null {
  if (id.startsWith('shelf.') || id.startsWith('trophy.books')) return 'shelf';
  if (id === 'room.reading-nook') return 'nook';
  if (id === 'room.grand-library' || id === 'decor.reading-lamp' || id === 'effect.story-stars') return 'library';
  if (id === 'room.greenhouse') return 'greenhouse';
  if (id.startsWith('exhibit.')) return 'museum';
  if (id === 'decor.telescope') return 'science';
  if (id === 'effect.planets' || id === 'decor.art-line') return id === 'effect.planets' ? 'mobile' : 'classroom';
  if (id === 'decor.rocket' || id === 'effect.rocket-launchpad' || id === 'trophy.number-star') return 'rocket';
  if (id === 'room.art-studio') return 'art';
  return null;
}

/**
 * Quality can be overridden with `?quality=low|balanced|high`. Software
 * renderers (no GPU) automatically drop to `low` so the school stays usable.
 */
export function resolveQuality(requested: GraphicsQuality): GraphicsQuality {
  const param = new URLSearchParams(window.location.search).get('quality');
  if (param === 'low' || param === 'balanced' || param === 'high') return param;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = info && gl ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    if (/swiftshader|llvmpipe|software/i.test(name)) return 'low';
  } catch {
    // Ignore — fall back to the requested quality.
  }
  return requested;
}

export class Game {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private scene = new THREE.Scene();
  private lastTime = performance.now();
  private tweens = new Tweens();
  readonly particles = new Particles();
  readonly world: SchoolWorld;
  private rig: CameraRig;
  private input = new InputManager();
  private interaction: InteractionSystem;
  private player: PlayerController;
  private avatar: AvatarModel;
  private pets = new Map<PetId, PetModel>();
  private activePets: PetId[] = [];
  private sun: THREE.DirectionalLight;
  private resizeObserver: ResizeObserver;
  private disposed = false;
  private lastFocusId: string | null = null;
  private pointerDown: { x: number; y: number; moved: number; id: number; button: number } | null = null;
  private quality: GraphicsQuality;
  private maxFps = Number(new URLSearchParams(window.location.search).get('maxfps') ?? 0) || 0;
  private cinematicDepth = 0;
  private frameCount = 0;
  fps = 0;
  private fpsTime = 0;

  static async create(opts: GameOptions): Promise<Game> {
    // Signs and book spines are painted with the UI fonts — load them first.
    if (typeof document !== 'undefined' && document.fonts) {
      await Promise.all([
        document.fonts.load('600 48px "Fredoka"'),
        document.fonts.load('700 48px "Fraunces"'),
        document.fonts.load('500 48px "Fraunces"'),
      ]).catch(() => undefined);
    }
    return new Game(opts);
  }

  private constructor(private readonly opts: GameOptions) {
    this.quality = resolveQuality(opts.quality);
    const q = RENDER_QUALITY[this.quality];
    this.renderer = new THREE.WebGLRenderer({ antialias: q.msaa === 0, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.maxPixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const canvas = this.renderer.domElement;
    canvas.className = 'game-canvas';
    canvas.setAttribute('aria-label', 'Izzy’s 3D school. Use arrow keys to walk, or tap where to go.');
    canvas.tabIndex = 0;
    opts.container.appendChild(canvas);

    // Scene: warm afternoon, gentle haze.
    this.scene.background = new THREE.Color('#cfe6ee');
    this.scene.fog = new THREE.Fog('#dbeaea', 38, 90);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.3;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight('#fff1dc', '#a47a52', 0.62);
    this.scene.add(hemi);
    // Late-morning sun from the north-west, high enough to light the whole
    // dollhouse and cast soft furniture shadows.
    this.sun = new THREE.DirectionalLight('#ffe9c7', 2.0);
    this.sun.position.set(-9, 22, -12);
    this.sun.target.position.set(2, 0, 1);
    this.sun.castShadow = q.shadows;
    this.sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    const sc = this.sun.shadow.camera;
    sc.left = -26;
    sc.right = 26;
    sc.top = 20;
    sc.bottom = -20;
    sc.near = 1;
    sc.far = 60;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    // Soft fill from the south so faces aren't lost in shadow.
    const fill = new THREE.DirectionalLight('#ffe6c9', 0.55);
    fill.position.set(-4, 9, 14);
    this.scene.add(fill);

    this.world = new SchoolWorld(this.tweens, this.particles, opts.today);
    this.scene.add(this.world.root, this.particles.root);
    this.addSunbeams();

    this.avatar = new AvatarModel(opts.avatar);
    this.scene.add(this.avatar.root);
    const hall = LAYOUT.hall;
    const nav = new NavGrid(this.world.structure.collisions, { minX: LAYOUT.nook.minX, maxX: LAYOUT.greenhouse.maxX, minZ: hall.minZ, maxZ: hall.maxZ + 0.5 }, 0.32);
    this.player = new PlayerController(this.avatar, this.world.structure.collisions, nav, opts.audio);
    this.player.teleport(LAYOUT.spawn.x, LAYOUT.spawn.z, Math.PI);

    this.interaction = new InteractionSystem(this.world.interactables);
    this.scene.add(this.interaction.root);

    const rect = opts.container.getBoundingClientRect();
    this.rig = new CameraRig(Math.max(1, rect.width) / Math.max(1, rect.height), this.tweens);
    this.setupComposer();
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(opts.container);

    this.input.attach();
    this.attachPointer(canvas);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private setupComposer() {
    const q = RENDER_QUALITY[this.quality];
    if (!q.bloom) {
      this.composer = null;
      return;
    }
    const size = this.renderer.getSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.rig.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.22, 0.5, 0.96));
    this.composer.addPass(new OutputPass());
  }

  private addSunbeams() {
    const tex = canvasTexture(64, 256, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,236,190,0.55)');
      g.addColorStop(1, 'rgba(255,236,190,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    const beamMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.35, toneMapped: false });
    for (const [x, w] of [
      [-3.6, 2.1],
      [3.6, 2.1],
      [9.5, 4.4],
    ] as const) {
      const beam = new THREE.Mesh(new THREE.PlaneGeometry(w, 4.4), beamMat);
      beam.position.set(x, 2.1, -8.4);
      beam.rotation.x = -0.72;
      beam.renderOrder = 3;
      this.scene.add(beam);
    }
  }

  private attachPointer(canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', (e) => {
      this.opts.audio.unlock();
      canvas.focus({ preventScroll: true });
      this.pointerDown = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId, button: e.button };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.pointerDown && e.pointerId === this.pointerDown.id) {
        const dx = e.clientX - this.pointerDown.x;
        const dy = e.clientY - this.pointerDown.y;
        this.pointerDown.moved += Math.abs(dx) + Math.abs(dy);
        if (this.pointerDown.moved > INTERACTION.clickDragThreshold && !this.rig.inCinematic) {
          this.rig.orbit(-dx * CAMERA.dragSensitivity, dy * CAMERA.dragSensitivity * 0.6);
        }
        this.pointerDown.x = e.clientX;
        this.pointerDown.y = e.clientY;
        return;
      }
      if (e.pointerType === 'mouse') {
        const hit = this.input.enabled ? this.interaction.pick(this.ndc(e), this.rig.camera) : null;
        this.interaction.hovered = hit;
        canvas.style.cursor = hit ? 'pointer' : 'default';
      }
    });
    const up = (e: PointerEvent) => {
      const down = this.pointerDown;
      this.pointerDown = null;
      if (!down || down.moved > INTERACTION.clickDragThreshold || !this.input.enabled || this.cinematicDepth > 0) return;
      this.input.lastDevice = 'pointer';
      this.handleTap(this.ndc(e));
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', () => (this.pointerDown = null));
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (!this.rig.inCinematic) this.rig.zoom(e.deltaY * CAMERA.wheelSensitivity);
      },
      { passive: false },
    );
  }

  private ndc(e: PointerEvent): THREE.Vector2 {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private handleTap(ndc: THREE.Vector2) {
    const hit = this.interaction.pick(ndc, this.rig.camera);
    if (hit) {
      this.goInteract(hit);
      return;
    }
    const p = this.interaction.pickFloor(ndc, this.rig.camera);
    if (p) {
      if (this.player.walkTo(p.x, p.z)) {
        this.interaction.showDestination(p);
        this.opts.audio.play('hover', { volume: 1.5 });
      }
    }
  }

  /** Walks to an interactable (if needed) and activates it. */
  goInteract(def: InteractableDef): void {
    const dist = Math.hypot(def.position.x - this.player.position.x, def.position.z - this.player.position.z);
    const activate = () => {
      this.player.faceToward(def.position);
      this.activate(def);
    };
    if (dist <= def.radius) {
      activate();
      return;
    }
    if (!this.player.walkTo(def.approach.x, def.approach.z, activate)) activate();
    this.interaction.showDestination(def.approach);
  }

  private activate(def: InteractableDef) {
    this.opts.audio.play('pop');
    if (def.kind === 'teacher') {
      this.world.teachers.get(def.id as TeacherId)?.greet();
      this.avatar.wave();
      this.opts.audio.play(def.id === 'hoot' ? 'hootGreet' : def.id === 'digit' ? 'digitGreet' : 'novaGreet');
    }
    this.opts.callbacks.onInteract(def.id);
  }

  interactById(id: string): void {
    const def = this.interaction.byId(id);
    if (def) this.goInteract(def);
  }

  private frame() {
    if (this.disposed) return;
    const now = performance.now();
    // Optional frame cap (battery saver / constrained test environments).
    if (this.maxFps > 0 && now - this.lastTime < 1000 / this.maxFps) return;
    const realDt = (now - this.lastTime) / 1000;
    // Clamp so a hitch never teleports anything, but keep cinematics close to real time.
    const dt = Math.min(0.1, realDt);
    this.lastTime = now;
    this.frameCount++;
    this.fpsTime += realDt;
    if (this.fpsTime > 1) {
      this.fps = Math.round(this.frameCount / this.fpsTime);
      this.frameCount = 0;
      this.fpsTime = 0;
    }
    // Cinematics follow wall-clock time even when frames are slow.
    this.tweens.update(Math.min(0.5, realDt));
    const intents = this.input.poll();
    if (!this.rig.inCinematic) {
      this.rig.orbit(intents.cameraYaw * CAMERA.keyOrbitSpeed * dt, 0);
      if (intents.cameraZoom) this.rig.zoom(intents.cameraZoom * dt * 6);
    }
    let move: { x: number; z: number } | null = null;
    if (this.input.enabled && this.cinematicDepth === 0 && (intents.moveX || intents.moveY)) {
      const { forward, right } = this.rig.moveBasis();
      const v = forward.multiplyScalar(intents.moveY).add(right.multiplyScalar(intents.moveX));
      move = { x: v.x, z: v.z };
    }
    this.player.update(dt, move);

    // Focus + interaction.
    const focus = this.input.enabled && this.cinematicDepth === 0 ? this.interaction.computeFocus(this.player.position) : null;
    this.interaction.focused = focus;
    if ((focus?.id ?? null) !== this.lastFocusId) {
      this.lastFocusId = focus?.id ?? null;
      this.opts.callbacks.onFocus(focus ? { id: focus.id, label: focus.label, icon: focus.icon, kind: focus.kind } : null);
      if (focus) this.opts.audio.play('hover', { volume: 1.2 });
    }
    if (this.input.consumeInteract() && focus && this.cinematicDepth === 0) this.activate(focus);
    if (this.input.consumeBack()) this.opts.callbacks.onBack?.();

    this.interaction.update(dt, this.player.position);
    this.world.update(dt, this.player.position);
    let slot = 0;
    for (const id of this.activePets) this.pets.get(id)?.update(dt, this.player.position, this.player.yaw, slot++);
    this.particles.update(dt);
    this.rig.update(dt, this.player.position);
    this.world.structure.updateCutaways(this.rig.forward, dt);

    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.rig.camera);
  }

  resize(): void {
    const { clientWidth: w, clientHeight: h } = this.opts.container;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.rig.camera.aspect = w / h;
    // Portrait / narrow screens: pull back so more of the room is visible.
    this.rig.camera.fov = w / h < 1 ? 55 : CAMERA.fov;
    this.rig.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  async applyWorld(state: WorldState, books: ShelfBook[], animate = false): Promise<void> {
    await this.world.apply(state, books, animate);
    this.world.setInteractableEnabled('nook', !state.readingNookOpen);
    this.syncPets(state.pets as PetId[]);
  }

  /** Shows only the given pets (active one leads). */
  syncPets(ids: PetId[], active?: string | null): void {
    for (const id of ids) {
      if (!this.pets.has(id)) {
        const pet = createPet(id);
        this.pets.set(id, pet);
        this.scene.add(pet.root);
        pet.root.position.set(this.player.position.x - 0.8, 0, this.player.position.z + 0.8);
      }
    }
    for (const [id, pet] of this.pets) pet.root.visible = ids.includes(id);
    const ordered = [...ids].sort((a, b) => (a === active ? -1 : b === active ? 1 : 0));
    this.activePets = ordered;
  }

  /** Places shelf books instantly (used by milestone previews). */
  setShelfBooks(books: ShelfBook[]): void {
    this.world.bookshelf.setBooks(books);
  }

  setAvatar(cfg: AvatarConfig): void {
    this.avatar.setConfig(cfg);
  }

  setInputEnabled(enabled: boolean): void {
    this.input.enabled = enabled;
    if (!enabled) this.player.cancelPath();
  }

  get inputDevice(): InputManager['lastDevice'] {
    return this.input.lastDevice;
  }

  /** Frames a teacher and Izzy for a conversation. */
  async focusTeacher(id: TeacherId): Promise<void> {
    const anchor = this.world.anchors.get(`teacher:${id}`);
    if (!anchor) return;
    const p = this.player.position;
    const mid = anchor.clone().lerp(new THREE.Vector3(p.x, 1.0, p.z), 0.4);
    const away = new THREE.Vector3(p.x - anchor.x, 0, p.z - anchor.z).normalize();
    const side = new THREE.Vector3(-away.z, 0, away.x);
    const camPos = mid.clone().add(away.multiplyScalar(3.4)).add(side.multiplyScalar(1.4)).add(new THREE.Vector3(0, 1.3, 0));
    this.player.faceToward(anchor);
    // Push the conversation toward the top of the screen (dialogue sits at the bottom).
    await this.rig.shot(camPos, mid.clone().add(new THREE.Vector3(0, -0.35, 0)), 0.9);
  }

  async releaseCamera(): Promise<void> {
    await this.rig.release(0.9);
  }

  cheer(teacher: TeacherId): void {
    this.world.teachers.get(teacher)?.cheer();
  }

  celebratePets(): void {
    for (const id of this.activePets) this.pets.get(id)?.celebrate();
    this.avatar.hop();
  }

  /**
   * The core-loop payoff: camera turns to the bookshelf, the finished book
   * flies from Professor Hoot and lands in its permanent slot.
   */
  async celebrateBook(book: ShelfBook): Promise<void> {
    this.cinematicDepth++;
    try {
      const focus = this.world.bookshelf.focus;
      await this.rig.shot(focus.position, focus.target, 1.3);
      this.cheer('hoot');
      this.opts.audio.play('whoosh');
      const hoot = this.world.anchors.get('teacher:hoot') ?? new THREE.Vector3(-8.3, 1.8, -5.2);
      const from = hoot.clone().add(new THREE.Vector3(0.2, 0.5, 0.4));
      this.opts.audio.play('pageFlip');
      await this.world.bookshelf.flyBookIn(book, from, (at) => {
        this.opts.audio.play('bookThunk');
        this.opts.audio.play('chime');
        this.particles.sparkle(at, { count: 70, speed: 2.4 });
      });
      await this.tweens.wait(0.9);
    } finally {
      this.cinematicDepth--;
    }
  }

  /** Shows newly unlocked rewards in the world with a camera visit. */
  async revealUnlocks(rewardIds: string[], state: WorldState, books: ShelfBook[], fallbackShot?: string): Promise<void> {
    this.cinematicDepth++;
    try {
      const shots = [...new Set(rewardIds.map(shotForReward).filter((s): s is keyof typeof REWARD_SHOTS => s !== null))];
      if (shots.length === 0 && fallbackShot && fallbackShot in REWARD_SHOTS) shots.push(fallbackShot as keyof typeof REWARD_SHOTS);
      const primary = shots[0];
      if (primary) {
        const s = REWARD_SHOTS[primary];
        if (s) await this.rig.shot(new THREE.Vector3(...s.pos), new THREE.Vector3(...s.look), 1.4);
      }
      this.opts.audio.play('unlock');
      await Promise.all([this.applyWorld(state, books, true), this.tweens.wait(1.6)]);
      if (rewardIds.some((r) => r.startsWith('pet.'))) {
        this.particles.sparkle(this.player.position.clone().add(new THREE.Vector3(0, 1, 0)), { count: 90, color: '#ffc37a', speed: 3 });
        if (rewardIds.includes('pet.dragon')) this.opts.audio.play('dragon');
        this.celebratePets();
      }
      for (const extra of shots.slice(1, 3)) {
        const s = REWARD_SHOTS[extra];
        if (!s) continue;
        await this.rig.shot(new THREE.Vector3(...s.pos), new THREE.Vector3(...s.look), 1.2);
        await this.tweens.wait(1.2);
      }
      await this.tweens.wait(0.6);
    } finally {
      this.cinematicDepth--;
    }
  }

  confetti(): void {
    this.particles.confettiShower(this.player.position.clone(), 3.5);
    this.opts.audio.play('fanfare');
  }

  /** Opening flourish: a sweeping establishing shot that settles on Izzy. */
  async introSweep(): Promise<void> {
    // Respect reduced-motion preferences: no sweeping camera moves.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    this.cinematicDepth++;
    try {
      this.rig.update(0.016, this.player.position);
      await this.rig.shot(new THREE.Vector3(2, 15, 26), new THREE.Vector3(0, 0, -1), 0.01);
      await this.tweens.wait(0.3);
      await this.rig.shot(new THREE.Vector3(0, 9.5, 17), new THREE.Vector3(0, 0.8, 5), 2.2);
      await this.rig.release(1.1);
    } finally {
      this.cinematicDepth--;
    }
  }

  /** True while a cinematic (intro, book flight, unlock reveal) is playing. */
  get busy(): boolean {
    return this.cinematicDepth > 0;
  }

  playerPosition(): THREE.Vector3 {
    return this.player.position.clone();
  }

  teleport(x: number, z: number): void {
    this.player.teleport(x, z);
    this.rig.snapTo(this.player.position);
  }

  teleportTo(interactId: string): void {
    const def = this.interaction.byId(interactId);
    if (def) {
      this.player.teleport(def.approach.x, def.approach.z);
      this.player.faceToward(def.position);
    }
  }

  setMotes(visible: boolean): void {
    this.particles.setMotesVisible(visible);
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.input.detach();
    this.tweens.clear();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry?.dispose();
      }
    });
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
