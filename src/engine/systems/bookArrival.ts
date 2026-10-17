/** Destination-aware arrival framing. Phone flights stay in the clear middle of the HUD. */
import * as THREE from 'three';

export interface BookArrivalViewport {
  width: number;
  height: number;
  fov: number;
}

export function bookArrivalPlan(destination: THREE.Vector3, teacher: THREE.Vector3, viewport: BookArrivalViewport) {
  const compact = viewport.width < 760 || viewport.width / viewport.height < 0.9;
  if (!compact) {
    // Keep the desktop sweep from Hoot. Face the grand shelf head-on so its ladder
    // does not cross the new book; retain the familiar oblique view for earlier cases.
    const side = destination.x > -8.3 ? 0 : 0.9;
    return {
      position: destination.clone().add(new THREE.Vector3(side, 1.35, 4.25)),
      target: destination.clone(),
      from: teacher.clone(),
      arcHeight: 2.4,
      near: 0.1,
      landNear: Math.hypot(side, 1.35, 4.25) - 0.4,
    };
  }

  // A long flight from Hoot leaves a portrait frustum. Pop in just in front of the
  // destination instead, then use the same fly/settle payoff without losing the book.
  const from = destination.clone().add(new THREE.Vector3(0.18, 0.1, 1.25));
  const arcHeight = 0.55;
  // Conservative bounds include the entire Bezier control hull and the enlarged pop.
  const halfWidth = 0.53;
  const halfHeight = 0.7525;
  const front = 1.69;
  const tangent = Math.tan(THREE.MathUtils.degToRad(viewport.fov / 2));
  const aspect = viewport.width / viewport.height;
  const top = Math.max(110, viewport.height * 0.18);
  const bottom = viewport.height - Math.max(80, viewport.height * 0.15);
  const safeHeight = Math.max(0.2, (bottom - top) / viewport.height);
  const distance = front + Math.max(halfWidth / (tangent * aspect * 0.8), halfHeight / (tangent * safeHeight));
  const screenCenter = (top + bottom) / (2 * viewport.height);
  const target = destination.clone().add(new THREE.Vector3(0.09, 0.3125 + (2 * screenCenter - 1) * distance * tangent, 0));
  return {
    position: target.clone().add(new THREE.Vector3(0, 0, distance)),
    target,
    from,
    arcHeight,
    // A temporary cinematic cutaway removes foreground teachers/furniture, while
    // retaining the whole enlarged flight hull (front edge is at most 1.69m).
    near: distance - 1.8,
    landNear: distance - 0.4,
  };
}
