import assert from 'node:assert/strict';
import { it } from 'node:test';
import { getSolarSystemPlanet, SOLAR_SYSTEM_PLANETS } from '../../src/domain/solarSystem';

it('offers all eight planets in order from the Sun with unique stable IDs', () => {
  assert.deepEqual(
    SOLAR_SYSTEM_PLANETS.map((planet) => planet.id),
    ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'],
  );
  assert.equal(new Set(SOLAR_SYSTEM_PLANETS.map((planet) => planet.id)).size, 8);
  SOLAR_SYSTEM_PLANETS.forEach((planet, index) => {
    assert.equal(planet.orderFromSun, index + 1);
    assert.match(planet.color, /^#[0-9a-f]{6}$/i);
    assert.ok(planet.name && planet.kind && planet.tagline);
    assert.equal(planet.facts.length, 3);
    assert.ok(planet.facts.every((fact) => fact.length > 20 && fact.length < 120 && !/https?:/.test(fact)));
    assert.equal(getSolarSystemPlanet(planet.id), planet);
  });
});

it('starts with Earth for missing or unrecognized poster selections', () => {
  assert.equal(getSolarSystemPlanet().id, 'earth');
  assert.equal(getSolarSystemPlanet('pluto').id, 'earth');
  assert.equal(getSolarSystemPlanet('toString').id, 'earth');
});

it('distinguishes the hottest planet, gas giants, and the star from the eight planets', () => {
  assert.match(getSolarSystemPlanet('venus').facts.join(' '), /hottest planet/);
  assert.match(getSolarSystemPlanet('jupiter').facts.join(' '), /no solid surface/);
  assert.match(getSolarSystemPlanet('saturn').facts.join(' '), /no solid surface/);
  assert.equal(
    SOLAR_SYSTEM_PLANETS.some((planet) => planet.id === 'sun'),
    false,
  );
});
