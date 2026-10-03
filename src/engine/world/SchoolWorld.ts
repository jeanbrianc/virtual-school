/**
 * Assembles the whole school: architecture, rooms, teachers and the dynamic
 * features that grow with learning. The world only ever consumes a
 * WorldState + shelf book list — it never touches persistence.
 */
import * as THREE from 'three';
import { TEACHER_IDS, TEACHER_REGISTRY } from '../../domain/teachers/registry';
import { TEACHERS } from '../../domain/teachers/teachers';
import type { TeacherId } from '../../domain/teachers/teachers';
import type { WorldState } from '../../domain/world/worldState';
import { createTeacher, type TeacherModel } from '../characters/teachers';
import type { Tweens } from '../core/tween';
import type { Particles } from '../fx/particles';
import { LAYOUT } from '../palette';
import { Bookshelf, type ShelfBook } from './bookshelf';
import type { AlphabetBanner } from './alphabetBanner';
import { buildClassroom } from './classroom';
import { DanceMat } from './danceMat';
import { buildLibrary } from './library';
import { buildAnnexes, buildMuseum } from './museum';
import { buildMath, buildScience } from './science';
import { Structure } from './structure';
import { bakeStatic } from '../render/bake';
import type { BuildContext, Feature, InteractableDef } from './types';

export class SchoolWorld {
  readonly root = new THREE.Group();
  readonly structure: Structure;
  readonly bookshelf: Bookshelf;
  readonly teachers = new Map<TeacherId, TeacherModel>();
  readonly interactables: InteractableDef[] = [];
  readonly anchors = new Map<string, THREE.Vector3>();
  /** The 1–10 dance & gym circuit on the classroom rug. */
  readonly alphabet: AlphabetBanner;
  readonly danceMat: DanceMat;
  private readonly features: Feature[] = [];
  private state: WorldState | null = null;
  private time = 0;

  constructor(tweens: Tweens, particles: Particles, today: Date, childName: string) {
    this.structure = new Structure();
    this.root.add(this.structure.root);
    const staticRoot = new THREE.Group();
    staticRoot.name = 'static-props';
    this.root.add(staticRoot);
    const ctx: BuildContext = {
      root: this.root,
      structure: this.structure,
      collisions: this.structure.collisions,
      tweens,
      particles,
      interactables: this.interactables,
      features: this.features,
      anchors: this.anchors,
      lights: [],
      childName,
      add: (obj) => this.root.add(obj),
      addStatic: (obj) => staticRoot.add(obj),
      mount: (side, obj) => this.structure.mountOnWall(side, obj),
      collide: (x, z, w, d, id) => this.structure.collisions.addBox(x, z, w, d, id),
      interact: (def) => {
        const full: InteractableDef = { ...def, enabled: def.enabled ?? true };
        this.interactables.push(full);
        return full;
      },
    };

    this.bookshelf = new Bookshelf(tweens, childName);
    this.root.add(this.bookshelf.root);
    this.structure.collisions.addBox(-9.4, LAYOUT.shelfZ + 0.22, 8.5, 0.8);
    ctx.interact({
      id: 'bookshelf',
      kind: 'shelf',
      label: 'Look at my bookshelf',
      icon: '📚',
      position: new THREE.Vector3(-11.9, 0, -8.7),
      approach: new THREE.Vector3(-11.6, 0, -7.5),
      radius: 2.0,
      object: this.bookshelf.root,
      markerHeight: 2.9,
    });

    buildLibrary(ctx);
    this.alphabet = buildClassroom(ctx, today);
    this.danceMat = new DanceMat(ctx);
    this.features.push(this.danceMat);
    buildScience(ctx);
    buildMath(ctx);
    buildMuseum(ctx);
    buildAnnexes(ctx);
    this.addTeachers(ctx);
    this.batchStatic(staticRoot);
  }

  /** Merges static geometry into per-material batches (big draw-call savings). */
  private batchStatic(staticRoot: THREE.Group) {
    const wallGroups = this.structure.root.children.filter((c) => /-(upper|lower)$/.test(c.name));
    for (const g of wallGroups) {
      bakeStatic(g);
      g.userData.dynamic = true;
    }
    bakeStatic(this.structure.root);
    bakeStatic(staticRoot);
  }

  private addTeachers(ctx: BuildContext) {
    const specs = TEACHER_IDS.map((id) => ({ id, ...TEACHER_REGISTRY[id].scene, label: `Talk to ${TEACHERS[id].name}` }));
    for (const s of specs) {
      // Face toward the middle of the room.
      const yaw = Math.atan2(0 - s.x, 1.5 - s.z);
      const t = createTeacher(s.id, yaw);
      t.root.position.set(s.x, 0, s.z);
      this.teachers.set(s.id, t);
      this.root.add(t.root);
      const approach = new THREE.Vector3(s.x + Math.sin(yaw) * 1.25, 0, s.z + Math.cos(yaw) * 1.25);
      ctx.interact({
        id: s.id,
        kind: 'teacher',
        label: s.label,
        icon: s.icon,
        position: new THREE.Vector3(s.x, 0, s.z),
        approach,
        radius: 2.3,
        object: t.root,
        markerHeight: t.headHeight + 0.35,
      });
      this.anchors.set(`teacher:${s.id}`, new THREE.Vector3(s.x, t.headHeight - 0.4, s.z));
    }
    ctx.interact({
      id: 'tank',
      kind: 'lesson',
      label: 'Sink or float?',
      icon: '💧',
      position: new THREE.Vector3(10.9, 0, -6.2),
      approach: new THREE.Vector3(10.4, 0, -5.1),
      radius: 1.6,
      object: this.root,
      markerHeight: 1.7,
    });
    ctx.interact({
      id: 'rocket',
      kind: 'lesson',
      label: 'Digit’s rocket',
      icon: '🚀',
      position: new THREE.Vector3(12.3, 0, 8.3),
      approach: new THREE.Vector3(11.0, 0, 7.4),
      radius: 1.9,
      object: this.root,
      markerHeight: 2.6,
    });
  }

  get currentState(): WorldState | null {
    return this.state;
  }

  /** Applies world state; `animate` celebrates newly appearing features. */
  async apply(state: WorldState, books: ShelfBook[], animate: boolean): Promise<void> {
    this.state = state;
    const jobs: Promise<void>[] = [];
    const shelfJob = this.bookshelf.setUnitCount(state.shelfUnits, animate);
    jobs.push(shelfJob);
    // Books that are already placed stay; new ones (without animation) snap in.
    if (!animate) this.bookshelf.setBooks(books);
    for (const f of this.features) {
      const r = f.apply(state, animate);
      if (r) jobs.push(r);
    }
    await Promise.all(jobs);
  }

  setInteractableEnabled(id: string, enabled: boolean): void {
    const i = this.interactables.find((x) => x.id === id);
    if (i) i.enabled = enabled;
  }

  update(dt: number, player: THREE.Vector3): void {
    this.time += dt;
    for (const f of this.features) f.update?.(dt, this.time);
    for (const t of this.teachers.values()) t.update(dt, player);
    this.bookshelf.update(this.time);
  }
}
