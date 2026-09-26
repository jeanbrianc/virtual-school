/**
 * Art direction: "Honey & Sage" — a sunlit, lived-in schoolhouse.
 * Warm honey woods, sage wainscoting, cream plaster, terracotta and mustard
 * accents, deep teal for science, soft navy for night-sky details.
 */
export const PALETTE = {
  floor: '#bd8a58',
  floorDark: '#a8743f',
  wall: '#f3e6cf',
  wallShadow: '#e6d3b3',
  wainscot: '#9fb59a',
  wainscotDark: '#86a081',
  trim: '#f8f0e1',
  walnut: '#7a5236',
  walnutDark: '#5c3b25',
  birch: '#e2c9a0',
  oak: '#c08a52',
  terracotta: '#d9774b',
  mustard: '#e3b448',
  teal: '#2f6f73',
  tealLight: '#7fc8c0',
  navy: '#2d3a5a',
  blush: '#e9a8a0',
  cream: '#fff6e6',
  leaf: '#6f9e57',
  leafDark: '#4c7a3d',
  terracottaPot: '#c46a45',
  chalk: '#2f4a3f',
  brass: '#c9a24a',
  glass: '#cfe8ea',
  sky: '#bfe0f0',
  night: '#1d2440',
} as const;

/** World layout (meters). North is −Z; the camera looks north by default. */
export const LAYOUT = {
  hall: { minX: -14, maxX: 14, minZ: -10, maxZ: 10, height: 4.6, wall: 0.3 },
  spawn: { x: 0, z: 7.4 },
  library: { minX: -14, maxX: -5 },
  science: { minX: 5, maxX: 14, maxZ: 0 },
  math: { minX: 5, maxX: 14, minZ: 1 },
  greenhouse: { minX: 14, maxX: 23, minZ: -9.5, maxZ: 0.5, doorZ: -4 },
  artStudio: { minX: 14, maxX: 19, minZ: 3, maxZ: 8.5, doorZ: 5.75 },
  nook: { minX: -18.5, maxX: -14, minZ: -0.5, maxZ: 4.5, doorZ: 2 },
  hoot: { x: -8.3, z: -5.2 },
  digit: { x: 8.3, z: 4.4 },
  nova: { x: 8.2, z: -5.4 },
  shelfBaseX: -12.4,
  shelfZ: -9.45,
} as const;
