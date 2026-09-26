/**
 * Game-feel tuning in one place (no magic numbers scattered through systems).
 * Values favour a young child: forgiving interaction ranges, moderate speed,
 * a stable camera that rarely needs adjusting.
 */
export const PLAYER = {
  radius: 0.3,
  walkSpeed: 3.1,
  acceleration: 10,
  turnDamping: 12,
  arriveRadius: 0.14,
  stepInterval: 0.34,
} as const;

export const CAMERA = {
  fov: 42,
  defaultYaw: 0,
  defaultPitch: 0.6,
  minPitch: 0.35,
  maxPitch: 1.25,
  defaultDistance: 9.6,
  minDistance: 5.5,
  maxDistance: 17,
  lookHeight: 0.9,
  lookAhead: 1.6,
  followDamping: 5,
  dragSensitivity: 0.005,
  wheelSensitivity: 0.01,
  keyOrbitSpeed: 1.6,
} as const;

export const INTERACTION = {
  /** Clicking anything farther than this walks there first. */
  clickDragThreshold: 6,
  markerBob: 0.12,
} as const;

export const RENDER_QUALITY = {
  high: { maxPixelRatio: 2, shadows: true, shadowMapSize: 2048, bloom: true, msaa: 4 },
  balanced: { maxPixelRatio: 1.5, shadows: true, shadowMapSize: 1024, bloom: true, msaa: 2 },
  low: { maxPixelRatio: 1, shadows: false, shadowMapSize: 512, bloom: false, msaa: 0 },
} as const;

export const FEATURE_FLAGS = {
  /** Exposes a small automation hook (window.__izzy) for end-to-end tests. */
  automationHooks: typeof __E2E__ !== 'undefined' && (__E2E__ || __BUILD_MODE__ === 'development'),
} as const;
