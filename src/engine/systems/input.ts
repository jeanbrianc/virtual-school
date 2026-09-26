/**
 * Unified input: keyboard + gamepad (+ pointer, handled by the interaction
 * system). Everything is reduced to intents — move, interact, back, camera —
 * so new devices (touch joystick, switch access, voice) plug in cleanly.
 */
export interface InputIntents {
  moveX: number;
  moveY: number;
  cameraYaw: number;
  cameraZoom: number;
}

const MOVE_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, 1],
  KeyW: [0, 1],
  ArrowDown: [0, -1],
  KeyS: [0, -1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
};

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

export class InputManager {
  private keys = new Set<string>();
  private interactQueued = false;
  private backQueued = false;
  private padButtons: boolean[] = [];
  enabled = true;
  /** Last device used — lets the UI show the right prompt (key vs. button). */
  lastDevice: 'keyboard' | 'pointer' | 'gamepad' = 'pointer';

  private onKeyDown = (e: KeyboardEvent) => {
    if (isTypingTarget(e.target)) return;
    if (e.code in MOVE_KEYS) {
      this.keys.add(e.code);
      this.lastDevice = 'keyboard';
      if (this.enabled) e.preventDefault();
    }
    if (!e.repeat && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE')) {
      if (this.enabled) {
        this.interactQueued = true;
        e.preventDefault();
      }
      this.lastDevice = 'keyboard';
    }
    if (e.code === 'Escape') this.backQueued = true;
    if (e.code === 'KeyQ' || e.code === 'KeyR') this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => this.keys.clear();

  attach(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }

  /** Polls keyboard + gamepads once per frame. */
  poll(): InputIntents {
    let mx = 0;
    let my = 0;
    for (const k of this.keys) {
      const v = MOVE_KEYS[k];
      if (v) {
        mx += v[0];
        my += v[1];
      }
    }
    let yaw = (this.keys.has('KeyQ') ? 1 : 0) - (this.keys.has('KeyR') ? 1 : 0);
    let zoom = 0;

    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
      const lx = dz(pad.axes[0] ?? 0);
      const ly = dz(pad.axes[1] ?? 0);
      const rx = dz(pad.axes[2] ?? 0);
      const ry = dz(pad.axes[3] ?? 0);
      if (lx || ly || rx || ry) this.lastDevice = 'gamepad';
      mx += lx;
      my -= ly;
      yaw -= rx;
      zoom += ry;
      // Edge-detect A (0) = interact, B (1) = back; D-pad (12-15) = move.
      const pressed = pad.buttons.map((b) => b.pressed);
      if (pressed[0] && !this.padButtons[0]) this.interactQueued = true;
      if (pressed[1] && !this.padButtons[1]) this.backQueued = true;
      if (pressed[12]) my += 1;
      if (pressed[13]) my -= 1;
      if (pressed[14]) mx -= 1;
      if (pressed[15]) mx += 1;
      if (pressed.some(Boolean)) this.lastDevice = 'gamepad';
      this.padButtons = pressed;
    }
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    if (!this.enabled) return { moveX: 0, moveY: 0, cameraYaw: yaw, cameraZoom: zoom };
    return { moveX: mx, moveY: my, cameraYaw: yaw, cameraZoom: zoom };
  }

  consumeInteract(): boolean {
    const v = this.interactQueued && this.enabled;
    this.interactQueued = false;
    return v;
  }

  consumeBack(): boolean {
    const v = this.backQueued;
    this.backQueued = false;
    return v;
  }
}
