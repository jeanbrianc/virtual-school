/** Fixed, offline facts. Planets are ordered outward from the Sun. */
export interface SolarSystemPlanet {
  id: string;
  name: string;
  color: string;
  orderFromSun: number;
  kind: string;
  tagline: string;
  facts: readonly string[];
}

export const SOLAR_SYSTEM_PLANETS: readonly SolarSystemPlanet[] = [
  {
    id: 'mercury',
    name: 'Mercury',
    color: '#b8aaa0',
    orderFromSun: 1,
    kind: 'Rocky planet',
    tagline: 'Small planet, speedy trip!',
    facts: [
      'Mercury is the smallest planet and the closest to the Sun.',
      'One trip around the Sun takes just 88 Earth days.',
      'Its rocky surface is covered with craters.',
    ],
  },
  {
    id: 'venus',
    name: 'Venus',
    color: '#efc477',
    orderFromSun: 2,
    kind: 'Rocky planet',
    tagline: 'Our very hot neighbor!',
    facts: [
      'Venus is the hottest planet, even though Mercury is closer to the Sun.',
      'Its thick atmosphere traps heat like a blanket.',
      'Venus is almost the same size as Earth.',
    ],
  },
  {
    id: 'earth',
    name: 'Earth',
    color: '#60b5ef',
    orderFromSun: 3,
    kind: 'Rocky planet',
    tagline: 'Our blue home!',
    facts: [
      'Earth is our home and the only planet where we know life exists.',
      'Oceans cover most of its surface.',
      'Earth has one Moon and takes about 365 days to travel around the Sun.',
    ],
  },
  {
    id: 'mars',
    name: 'Mars',
    color: '#e58b65',
    orderFromSun: 4,
    kind: 'Rocky planet',
    tagline: 'Meet the red planet!',
    facts: ['Rusty iron in its dust makes Mars look red.', 'Mars has two small moons, Phobos and Deimos.', 'Robot rovers explore its rocky ground.'],
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    color: '#e1b58c',
    orderFromSun: 5,
    kind: 'Gas giant',
    tagline: 'The biggest planet!',
    facts: [
      'Jupiter is the largest planet in our solar system.',
      'Its Great Red Spot is a huge storm.',
      'Jupiter is mostly gas, with no solid surface to stand on.',
    ],
  },
  {
    id: 'saturn',
    name: 'Saturn',
    color: '#edd5a0',
    orderFromSun: 6,
    kind: 'Gas giant',
    tagline: 'Look at those amazing rings!',
    facts: [
      'Saturn has bright rings made mostly of pieces of ice.',
      'It is the second-largest planet.',
      'Saturn is mostly gas, with no solid surface to stand on.',
    ],
  },
  {
    id: 'uranus',
    name: 'Uranus',
    color: '#a0e5e6',
    orderFromSun: 7,
    kind: 'Ice giant',
    tagline: 'A planet that spins on its side!',
    facts: [
      'Uranus is tilted so far that it spins almost on its side.',
      'Methane gas in its atmosphere helps give it a blue-green color.',
      'One trip around the Sun takes about 84 Earth years.',
    ],
  },
  {
    id: 'neptune',
    name: 'Neptune',
    color: '#7198f5',
    orderFromSun: 8,
    kind: 'Ice giant',
    tagline: 'Cold, windy, and far away!',
    facts: [
      'Neptune is the farthest planet from the Sun.',
      'Powerful winds race through its cold atmosphere.',
      'One trip around the Sun takes about 165 Earth years.',
    ],
  },
];

export function getSolarSystemPlanet(id?: string): SolarSystemPlanet {
  return SOLAR_SYSTEM_PLANETS.find((planet) => planet.id === id) ?? SOLAR_SYSTEM_PLANETS[2]!;
}
