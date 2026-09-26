import * as THREE from 'three';
import type { WorldState } from '../../domain/world/worldState';
import type { CollisionWorld } from '../core/collision';
import { ease, type Tweens } from '../core/tween';
import type { Particles } from '../fx/particles';
import type { Structure, WallSide } from './structure';

export type InteractKind = 'teacher' | 'shelf' | 'door' | 'pet' | 'exhibit' | 'object' | 'museum' | 'lesson';

export interface InteractableDef {
  id: string;
  kind: InteractKind;
  /** Child-facing prompt, e.g. "Talk to Professor Hoot". */
  label: string;
  icon: string;
  position: THREE.Vector3;
  /** Where Izzy stands to interact (click-to-walk destination). */
  approach: THREE.Vector3;
  radius: number;
  object: THREE.Object3D;
  markerHeight: number;
  enabled: boolean;
}

/** A piece of the world that reacts to WorldState changes. */
export interface Feature {
  apply(state: WorldState, animate: boolean): Promise<void> | void;
  update?(dt: number, time: number): void;
}

export interface BuildContext {
  root: THREE.Group;
  structure: Structure;
  collisions: CollisionWorld;
  tweens: Tweens;
  particles: Particles;
  interactables: InteractableDef[];
  features: Feature[];
  anchors: Map<string, THREE.Vector3>;
  lights: THREE.Light[];
  /** The learner this school belongs to (chalkboard, art signatures, shelf plaque). */
  childName: string;
  add(obj: THREE.Object3D): void;
  /** Adds a prop that never moves; it is merged into batched meshes after building. */
  addStatic(obj: THREE.Object3D): void;
  mount(side: WallSide, obj: THREE.Object3D): void;
  collide(x: number, z: number, w: number, d: number, id?: string): void;
  interact(def: Omit<InteractableDef, 'enabled'> & { enabled?: boolean }): InteractableDef;
}

/** Scale-in with a little bounce + sparkles (used for unlocks). */
export async function popIn(obj: THREE.Object3D, ctx: BuildContext, opts: { sparkleAt?: THREE.Vector3; duration?: number } = {}): Promise<void> {
  obj.visible = true;
  const target = obj.userData.baseScale instanceof THREE.Vector3 ? (obj.userData.baseScale as THREE.Vector3).clone() : new THREE.Vector3(1, 1, 1);
  obj.scale.set(0.001, 0.001, 0.001);
  const where = opts.sparkleAt ?? obj.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.8, 0));
  ctx.particles.sparkle(where, { count: 60, speed: 3 });
  await ctx.tweens.run(opts.duration ?? 1.1, (k) => obj.scale.copy(target).multiplyScalar(Math.max(0.001, k)), { easing: ease.outBack });
}

export function setVisible(obj: THREE.Object3D, visible: boolean): void {
  obj.visible = visible;
  if (visible && obj.userData.baseScale instanceof THREE.Vector3) obj.scale.copy(obj.userData.baseScale as THREE.Vector3);
}

/** Toggle helper: shows/hides an object, animating only on newly-true. */
export function toggleFeature(obj: THREE.Object3D, getter: (s: WorldState) => boolean, ctx: BuildContext, onShow?: () => void): Feature {
  let current: boolean | null = null;
  obj.userData.baseScale = obj.scale.clone();
  return {
    apply(state, animate) {
      const next = getter(state);
      if (next === current) return;
      const wasKnown = current !== null;
      current = next;
      if (next && animate && wasKnown) {
        onShow?.();
        return popIn(obj, ctx);
      }
      setVisible(obj, next);
      if (next) onShow?.();
    },
  };
}
