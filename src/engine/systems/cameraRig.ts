/**
 * Third-person follow camera with damping, gentle orbit/zoom, and a
 * cinematic override that can glide to any shot and back.
 */
import * as THREE from 'three';
import { CAMERA } from '../../config/gameConfig';
import { damp, ease, type Tweens } from '../core/tween';

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  yaw: number = CAMERA.defaultYaw;
  pitch: number = CAMERA.defaultPitch;
  distance: number = CAMERA.defaultDistance;
  private target = new THREE.Vector3();
  private followPos = new THREE.Vector3();
  private followLook = new THREE.Vector3();
  private cinePos = new THREE.Vector3();
  private cineLook = new THREE.Vector3();
  private cineBlend = 0;
  private cineToken = 0;
  private initialized = false;

  constructor(
    aspect: number,
    private readonly tweens: Tweens,
  ) {
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, aspect, 0.1, 200);
  }

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /** Movement basis relative to the camera (for "up = away from camera"). */
  moveBasis(): { forward: THREE.Vector3; right: THREE.Vector3 } {
    const forward = this.forward;
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    return { forward, right };
  }

  orbit(dYaw: number, dPitch: number): void {
    this.yaw += dYaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, CAMERA.minPitch, CAMERA.maxPitch);
  }

  zoom(delta: number): void {
    this.distance = THREE.MathUtils.clamp(this.distance + delta, CAMERA.minDistance, CAMERA.maxDistance);
  }

  snapTo(target: THREE.Vector3): void {
    this.target.copy(target);
    this.initialized = false;
  }

  /** Glides to a cinematic shot; resolves when the camera arrives. */
  async shot(position: THREE.Vector3, lookAt: THREE.Vector3, duration = 1.2): Promise<void> {
    const token = ++this.cineToken;
    const fromPos = this.camera.position.clone();
    const fromLook = this.currentLook();
    this.cinePos.copy(fromPos);
    this.cineLook.copy(fromLook);
    this.cineBlend = 1;
    await this.tweens.run(
      duration,
      (k) => {
        if (token !== this.cineToken) return;
        this.cinePos.lerpVectors(fromPos, position, k);
        this.cineLook.lerpVectors(fromLook, lookAt, k);
      },
      { easing: ease.inOutCubic },
    );
  }

  /** Returns control to the follow camera. */
  async release(duration = 1.0): Promise<void> {
    const token = ++this.cineToken;
    const start = this.cineBlend;
    await this.tweens.run(
      duration,
      (k) => {
        if (token !== this.cineToken) return;
        this.cineBlend = start * (1 - k);
      },
      { easing: ease.inOutCubic },
    );
  }

  get inCinematic(): boolean {
    return this.cineBlend > 0.001;
  }

  private currentLook(): THREE.Vector3 {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return this.camera.position.clone().add(dir.multiplyScalar(this.distance));
  }

  update(dt: number, focus: THREE.Vector3): void {
    // Look slightly ahead of Izzy so she sits in the lower third with the room ahead in view.
    const desired = focus.clone().add(new THREE.Vector3(0, CAMERA.lookHeight, 0)).addScaledVector(this.forward, CAMERA.lookAhead);
    if (!this.initialized) {
      this.target.copy(desired);
      this.initialized = true;
    } else {
      this.target.x = damp(this.target.x, desired.x, CAMERA.followDamping, dt);
      this.target.y = damp(this.target.y, desired.y, CAMERA.followDamping, dt);
      this.target.z = damp(this.target.z, desired.z, CAMERA.followDamping, dt);
    }
    const cp = Math.cos(this.pitch);
    this.followPos.set(
      this.target.x + Math.sin(this.yaw) * cp * this.distance,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * cp * this.distance,
    );
    this.followLook.copy(this.target);
    if (this.cineBlend > 0.001) {
      this.camera.position.lerpVectors(this.followPos, this.cinePos, this.cineBlend);
      const look = this.followLook.clone().lerp(this.cineLook, this.cineBlend);
      this.camera.lookAt(look);
    } else {
      this.camera.position.copy(this.followPos);
      this.camera.lookAt(this.followLook);
    }
  }
}
