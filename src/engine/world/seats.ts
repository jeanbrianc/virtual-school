/** All eleven pieces of seating in the school. Work benches are not seats. */
import * as THREE from 'three';
import type { BuildContext, InteractableDef } from './types';

export interface SeatAnchor {
  /** Avatar origin, with the hips raised above the cushion. */
  position: THREE.Vector3;
  yaw: number;
  exit: THREE.Vector3;
  reading: boolean;
  requiresNook: boolean;
}

/** Register a seat independently of static mesh batching. +Z is furniture-forward. */
export function addSeat(
  ctx: BuildContext,
  object: THREE.Object3D,
  options: {
    id: string;
    label: string;
    x: number;
    z: number;
    top: number;
    yaw: number;
    forward?: number;
    exit: [number, number];
    reading?: boolean;
    nook?: boolean;
  },
): InteractableDef {
  const forward = options.forward ?? 0;
  const seat: SeatAnchor = {
    position: new THREE.Vector3(options.x + Math.sin(options.yaw) * forward, options.top + 0.14 - 0.4, options.z + Math.cos(options.yaw) * forward),
    yaw: options.yaw,
    exit: new THREE.Vector3(options.exit[0], 0, options.exit[1]),
    reading: options.reading ?? false,
    requiresNook: options.nook ?? false,
  };
  return ctx.interact({
    id: options.id,
    kind: 'seat',
    label: options.label,
    icon: seat.reading ? '📖' : '🪑',
    position: new THREE.Vector3(options.x, options.top, options.z),
    approach: seat.exit.clone(),
    radius: 1.25,
    object,
    markerHeight: options.top + 0.9,
    enabled: !seat.requiresNook,
    seat,
  });
}

/** Face the learner and book using the existing follow camera, without locking input. */
export function seatedCamera(seat: SeatAnchor): { yaw: number; pitch: number; distance: number } {
  return { yaw: seat.yaw + 0.3, pitch: 0.48, distance: 5.5 };
}
