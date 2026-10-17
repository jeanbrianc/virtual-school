import maps from './maps.json';
import { shuffle, type Rng } from '../util/random';

/** A small, explicitly bounded first adventure; the full map remains a separate choice. */
export const STARTER_STATES = ['Florida', 'Texas', 'California', 'Michigan', 'Ohio', 'Alaska', 'Hawaii', 'Louisiana'] as const;
export interface StateShapeRound {
  target: string;
  choices: { name: string; path: string }[];
}

export function stateShapeAdventure(rng: Rng): StateShapeRound[] {
  const pool = maps.states.filter((state) => (STARTER_STATES as readonly string[]).includes(state.name));
  const targets = [
    'Florida',
    ...shuffle(
      rng,
      pool.filter((state) => state.name !== 'Florida'),
    )
      .slice(0, 4)
      .map((state) => state.name),
  ];
  return targets.map((target) => ({
    target,
    choices: shuffle(rng, [
      pool.find((state) => state.name === target)!,
      ...shuffle(
        rng,
        pool.filter((state) => state.name !== target),
      ).slice(0, 2),
    ]),
  }));
}

/** Generated Natural Earth paths contain only absolute M/L coordinates and Z. */
export function stateShapeViewBox(path: string): string {
  const coordinates = (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const xs = coordinates.filter((_, index) => index % 2 === 0);
  const ys = coordinates.filter((_, index) => index % 2 === 1);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(...xs) - minX;
  const height = Math.max(...ys) - minY;
  const padding = Math.max(width, height) * 0.08;
  return `${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`;
}
