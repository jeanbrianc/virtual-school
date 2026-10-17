/** Original fictional picture records. Content scope: docs/nova-weather-review.md. */
import { LessonRun } from './engine';
import { shuffle, type Rng } from '../util/random';
import type { LessonDefinition, Problem } from './types';

export type WeatherPicture = 'sun' | 'cloud' | 'rain' | 'snow';
export const WEATHER_PICTURES: readonly WeatherPicture[] = ['sun', 'cloud', 'rain', 'snow'];
export const WEATHER_LABELS: Record<WeatherPicture, string> = {
  sun: 'Sun, no clouds drawn',
  cloud: 'Clouds, no rain drawn',
  rain: 'Falling rain',
  snow: 'Falling snow',
};
const DETAILS: Record<WeatherPicture, string> = {
  sun: 'Find the round sun and its rays. No clouds are drawn.',
  cloud: 'Find the clouds. No falling rain or snow is drawn.',
  rain: 'Find the falling drops under the cloud.',
  snow: 'Find the falling snowflakes under the cloud.',
};
export const WEATHER_CEILING =
  'This lab records picture matching and comparisons in made-up charts. It does not record real weather observations, explanations, or forecasts. With a grown-up, look safely through a window and describe what you notice. Aquarium friends celebrate visits, not science proficiency.';
export const weatherLesson: LessonDefinition = {
  id: 'weather-pictures',
  teacherId: 'nova',
  title: 'Weather picture lab (picture matching and fictional chart comparison)',
  childTitle: 'Sky picture detectives',
  completeTitle: 'Sky picture lab complete!',
  intro: ['Let’s explore made-up sky pictures. Choose matching pictures or compare a short picture chart.'],
  outro: WEATHER_CEILING,
  rounds: 4,
  manualProgression: true,
  tiers: [
    { skillId: 'sci.weather-picture-match', label: 'Level 1 · Match pictures' },
    { skillId: 'sci.weather-chart-compare', label: 'Level 2 · Compare a chart' },
  ],
  ladder: ['hint', 'alternate'],
  generateRound(tier: number, rng: Rng, round: number): Problem[] {
    // Seeded targets, distractors and chart order vary; round index never reveals the answer.
    const target = shuffle(rng, WEATHER_PICTURES)[0]!;
    const other = shuffle(
      rng,
      WEATHER_PICTURES.filter((p) => p !== target),
    )[0]!;
    const chart = tier > 0 ? shuffle(rng, [target, target, ...(round % 2 === 0 ? [target] : []), other]) : [target];
    const comparison = tier > 0 && round % 2 === 0;
    const count = chart.filter((p) => p === target).length;
    const model =
      tier === 0
        ? `${DETAILS[target]} The matching picture is ${WEATHER_LABELS[target].toLowerCase()}.`
        : `${WEATHER_LABELS[target]} appears on ${count} days. ${WEATHER_LABELS[other]} appears on 1 day. ${count} is more than 1. These are made-up records, not tomorrow’s forecast.`;
    return [
      {
        id: `weather-${round}-${Math.floor(rng() * 0xffffff).toString(36)}`,
        skillId: tier === 0 ? 'sci.weather-picture-match' : 'sci.weather-chart-compare',
        tier,
        kind: 'answer',
        prompt:
          tier === 0
            ? 'Look at this made-up sky. Which picture matches?'
            : comparison
              ? 'In this made-up chart, which picture appears on more days?'
              : 'In this made-up chart, which picture appears more than once?',
        visual: { type: 'weather', pictures: chart, chart: tier > 0 },
        choices: shuffle(rng, [target, other]).map((weatherPicture) => ({ id: weatherPicture, label: WEATHER_LABELS[weatherPicture], weatherPicture })),
        answerId: target,
        hints: [tier === 0 ? DETAILS[target] : 'Look across the days. Count each kind of picture. You can ask to see the model.', model],
        model,
        success: tier === 0 ? `You matched the picture: ${WEATHER_LABELS[target].toLowerCase()}.` : model,
        difficulty: tier === 0 ? 0 : 1,
        meta: { fictional: true },
      },
    ];
  },
};

/** A run stays with its starting child, including retries and delayed saves. */
export class WeatherRun extends LessonRun {
  constructor(
    readonly childId: string,
    tier: number,
    seed: number,
  ) {
    super(weatherLesson, tier, seed);
    if (!childId.trim()) throw new Error('A weather run needs a child');
  }
}
