import { SOLAR_SYSTEM_PLANETS } from '../domain/solarSystem';

/** One layout for the painted poster and its pointer targets (canvas pixels). */
export const SOLAR_POSTER_SIZE = { width: 768, height: 512 } as const;
const radii = [10, 16, 17, 13, 34, 30, 22, 21];
let nextX = 150;
export const SOLAR_POSTER_PLANETS = SOLAR_SYSTEM_PLANETS.map((planet, index) => {
  const radius = radii[index] ?? 20;
  const layout = { ...planet, x: nextX, y: 256, radius };
  nextX += radius * 2 + 30;
  return layout;
});

/** Texture UVs start at the bottom, while the painter starts at the top. */
export function solarPosterPlanetAt(u: number, v: number): string | undefined {
  const x = u * SOLAR_POSTER_SIZE.width;
  const y = (1 - v) * SOLAR_POSTER_SIZE.height;
  return SOLAR_POSTER_PLANETS.find(
    (planet) => Math.hypot(x - planet.x, y - planet.y) <= planet.radius + 12 || (Math.abs(x - planet.x) <= 28 && y >= 306 && y <= 342),
  )?.id;
}
