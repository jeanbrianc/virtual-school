/**
 * Izzy's movement: direct control (keys/stick) or forgiving tap-to-walk
 * along an A* path. Collision is resolved against the static world.
 */
import * as THREE from 'three';
import { PLAYER } from '../../config/gameConfig';
import type { AudioEngine } from '../../audio/AudioEngine';
import type { AvatarModel } from '../characters/avatarModel';
import type { CollisionWorld } from '../core/collision';
import type { NavGrid, Point } from '../core/navGrid';
import { dampAngle } from '../core/tween';

export class PlayerController {
  readonly position = new THREE.Vector3();
  yaw = Math.PI;
  private velocity = new THREE.Vector3();
  private path: Point[] = [];
  private onArrive: (() => void) | null = null;
  private stepTimer = 0;
  private faceTarget: number | null = null;

  constructor(
    readonly avatar: AvatarModel,
    private readonly collisions: CollisionWorld,
    private readonly nav: NavGrid,
    private readonly audio: AudioEngine,
  ) {}

  teleport(x: number, z: number, yaw = this.yaw): void {
    this.position.set(x, 0, z);
    this.yaw = yaw;
    this.velocity.set(0, 0, 0);
    this.path = [];
    this.onArrive = null;
    this.sync();
  }

  /** Walks to a point via pathfinding; `onArrive` fires when she gets there. */
  walkTo(x: number, z: number, onArrive?: () => void): boolean {
    const path = this.nav.findPath({ x: this.position.x, z: this.position.z }, { x, z });
    if (!path || path.length === 0) return false;
    this.path = path.slice(1);
    this.onArrive = onArrive ?? null;
    if (this.path.length === 0) {
      this.finishPath();
    }
    return true;
  }

  cancelPath(): void {
    this.path = [];
    this.onArrive = null;
  }

  get isWalkingPath(): boolean {
    return this.path.length > 0;
  }

  faceToward(p: THREE.Vector3): void {
    this.faceTarget = Math.atan2(p.x - this.position.x, p.z - this.position.z);
  }

  private finishPath() {
    const cb = this.onArrive;
    this.path = [];
    this.onArrive = null;
    cb?.();
  }

  update(dt: number, move: { x: number; z: number } | null): void {
    const desired = new THREE.Vector3();
    if (move && (move.x !== 0 || move.z !== 0)) {
      this.cancelPath();
      this.faceTarget = null;
      desired.set(move.x, 0, move.z).multiplyScalar(PLAYER.walkSpeed);
    } else if (this.path.length > 0) {
      const next = this.path[0] as Point;
      const to = new THREE.Vector3(next.x - this.position.x, 0, next.z - this.position.z);
      const dist = to.length();
      const last = this.path.length === 1;
      if (dist < (last ? PLAYER.arriveRadius : 0.35)) {
        this.path.shift();
        if (this.path.length === 0) this.finishPath();
      } else {
        const speed = last ? Math.min(PLAYER.walkSpeed, 0.8 + dist * 2.2) : PLAYER.walkSpeed;
        desired.copy(to.normalize().multiplyScalar(speed));
      }
    }

    const k = 1 - Math.exp(-PLAYER.acceleration * dt);
    this.velocity.lerp(desired, k);
    if (this.velocity.lengthSq() < 0.0004 && desired.lengthSq() === 0) this.velocity.set(0, 0, 0);

    const next = this.position.clone().addScaledVector(this.velocity, dt);
    const resolved = this.collisions.resolveCircle(next.x, next.z, PLAYER.radius);
    this.position.set(resolved.x, 0, resolved.z);

    const speed = this.velocity.length();
    if (speed > 0.15) {
      this.yaw = dampAngle(this.yaw, Math.atan2(this.velocity.x, this.velocity.z), PLAYER.turnDamping, dt);
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.audio.play('step', { pitch: 0.9 + Math.random() * 0.2, volume: 0.8 });
        this.stepTimer = PLAYER.stepInterval;
      }
    } else if (this.faceTarget !== null) {
      this.yaw = dampAngle(this.yaw, this.faceTarget, 8, dt);
    }
    this.avatar.update(dt, Math.min(1, speed / PLAYER.walkSpeed));
    this.sync();
  }

  private sync() {
    this.avatar.root.position.copy(this.position);
    this.avatar.root.rotation.y = this.yaw;
  }
}
