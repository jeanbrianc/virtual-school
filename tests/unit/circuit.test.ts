/**
 * The dance & gym circuit on the classroom rug: the rules (1 → 10), each
 * child's stations, the move animations and where the numbers are.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stationPitch } from '../../src/audio/AudioEngine';
import { DEFAULT_AVATAR } from '../../src/domain/avatar';
import {
  CIRCUIT_DONE_LINE,
  DANCE_MOVES,
  DANCE_MOVE_IDS,
  DEFAULT_CIRCUIT,
  STATIONS,
  circuitFor,
  cleanStationName,
  freshRun,
  stationLabel,
  stationLine,
  stepOn,
  type CircuitRun,
} from '../../src/domain/play/circuit';
import { AvatarModel } from '../../src/engine/characters/avatarModel';
import { MOVES, poseAt } from '../../src/engine/characters/moves';
import { TILE_RADIUS, matTiles, tileAt } from '../../src/engine/world/danceMat';

describe('circuit rules', () => {
  it('stepping on 1 starts; the right next number moves on; 10 after 9 completes', () => {
    let run: CircuitRun | null = null;
    const events: string[] = [];
    for (let n = 1; n <= STATIONS; n++) {
      const r = stepOn(run, n);
      run = r.run;
      events.push(r.event);
    }
    assert.deepEqual(events, ['start', 'next', 'next', 'next', 'next', 'next', 'next', 'next', 'next', 'complete']);
    assert.equal(run, null);
  });

  it('any number still does its move; out of order the circuit waits', () => {
    assert.deepEqual(stepOn(null, 4), { run: null, event: 'free' });
    assert.deepEqual(stepOn({ next: 3 }, 7), { run: { next: 3 }, event: 'other' });
    assert.deepEqual(stepOn({ next: 3 }, 3), { run: { next: 4 }, event: 'next' });
    // Number 1 always starts over, and the start flag waits for 1.
    assert.deepEqual(stepOn({ next: 6 }, 1), { run: { next: 2 }, event: 'start' });
    assert.deepEqual(stepOn(freshRun(), 2), { run: { next: 1 }, event: 'other' });
    assert.deepEqual(stepOn(freshRun(), 1).event, 'start');
    // 10 only completes after 9.
    assert.equal(stepOn({ next: 5 }, 10).event, 'other');
  });

  it('the coach counts along', () => {
    const plie = { move: 'plie' as const };
    assert.equal(stationLine(1, plie, 'start', { next: 2 }), 'One! Plié! Now find number two!');
    assert.equal(stationLine(3, { move: 'sunshineTwirl' }, 'next', { next: 4 }), 'Three! Sunshine twirl! Next, number four!');
    assert.equal(stationLine(7, { move: 'cartwheel', name: 'wheelie' }, 'other', { next: 4 }), 'Seven! wheelie! Now, where’s number four?');
    assert.equal(stationLine(5, { move: 'curtsey' }, 'free', null), 'Five! Curtsey!');
    assert.match(CIRCUIT_DONE_LINE, /one, two, three/i);
  });
});

describe('her stations', () => {
  it('defaults to a warm-up, big tricks in the middle, and a ta-da', () => {
    const c = circuitFor(null);
    assert.equal(c.length, STATIONS);
    assert.deepEqual(
      c.map((s) => s.move),
      [...DEFAULT_CIRCUIT],
    );
    assert.equal(c[2]!.move, 'sunshineTwirl');
    assert.equal(c[8]!.move, 'backflip');
    assert.equal(c[9]!.move, 'tada');
  });

  it('uses the family’s choices and names, fixing anything broken', () => {
    const c = circuitFor({
      circuit: [{ move: 'backflip', name: '  flippy   flip ' }, { move: 'moonwalk' as never }, { move: 'curtsey', name: '<b>' + 'x'.repeat(50) }],
    });
    assert.deepEqual(c[0], { move: 'backflip', name: 'flippy flip' });
    assert.deepEqual(c[1], { move: DEFAULT_CIRCUIT[1] });
    assert.equal(c[2]!.name!.length, 30);
    assert.ok(!c[2]!.name!.includes('<'));
    assert.deepEqual(c[9], { move: 'tada' });
    assert.equal(stationLabel(c[0]!), 'flippy flip');
    assert.equal(stationLabel(c[1]!), 'Bunny hops');
    assert.equal(cleanStationName('\u0007 hi\nthere '), 'hi there');
  });

  it('every move is described for the coach and the parent editor', () => {
    for (const id of DANCE_MOVE_IDS) {
      const m = DANCE_MOVES[id];
      assert.equal(m.id, id);
      assert.ok(m.name && m.emoji && m.cue.length > 10, id);
    }
    assert.deepEqual(Object.keys(MOVES).sort(), [...DANCE_MOVE_IDS].sort());
  });
});

describe('move animations', () => {
  const TAU = Math.PI * 2;
  const nearTurn = (a: number) => Math.abs(a - Math.round(a / TAU) * TAU) < 1e-6;

  it('every move starts and ends standing', () => {
    for (const id of DANCE_MOVE_IDS) {
      for (const t of [0, 1]) {
        const p = poseAt(id, t);
        for (const limb of [p.armL, p.armR, p.legL, p.legR]) {
          assert.ok(Math.abs(limb.out) < 1e-6 && Math.abs(limb.fwd) < 1e-6, `${id} limbs at t=${t}`);
        }
        assert.ok(Math.abs(p.lean) < 1e-6 && Math.abs(p.headX) < 1e-6 && Math.abs(p.headZ) < 1e-6, `${id} body at t=${t}`);
        assert.ok(Math.abs(p.squash - 1) < 1e-6, `${id} squash at t=${t}`);
        assert.ok(Math.abs(p.lift) < 0.005, `${id} lift at t=${t}`);
        assert.ok(nearTurn(p.spinY) && nearTurn(p.flipX) && nearTurn(p.rollZ), `${id} turns at t=${t}`);
      }
    }
  });

  it('moves are short, and their sounds happen in order', () => {
    for (const id of DANCE_MOVE_IDS) {
      const m = MOVES[id];
      assert.ok(m.seconds >= 1.4 && m.seconds <= 2.6, id);
      const at = m.cues.map((c) => c.at);
      assert.deepEqual(
        at,
        [...at].sort((a, b) => a - b),
        id,
      );
      assert.ok(
        at.every((a) => a > 0 && a < 1),
        id,
      );
    }
  });

  it('the big tricks really go: a backflip turns over, a star jump leaves the floor', () => {
    assert.ok(Math.abs(poseAt('backflip', 0.52).flipX) > 2);
    assert.ok(poseAt('starJump', 0.51).lift > 0.3);
    assert.ok(poseAt('cartwheel', 0.53).rollZ < -2);
    assert.ok(poseAt('sunshineTwirl', 0.3).armL.out > 2, 'sunshine arms up');
  });

  it('the avatar plays a move to the end — sounds or no listener — and stands again', async () => {
    const model = new AvatarModel(DEFAULT_AVATAR);
    // No cue listener (the parent preview): must not get stuck on the first cue.
    let done = false;
    const finished = model.perform('backflip').then(() => (done = true));
    assert.equal(model.performing, true);
    for (let i = 0; i < 40; i++) model.update(0.1, 0);
    await finished;
    assert.equal(done, true);
    assert.equal(model.performing, false);

    const heard: string[] = [];
    model.onMoveCue = (c) => heard.push(c);
    const twirl = model.perform('sunshineTwirl');
    for (let i = 0; i < 30; i++) model.update(0.1, 0);
    await twirl;
    assert.deepEqual(heard, ['sparkle', 'twirl']);
  });

  it('a new move replaces one in progress (the first one still resolves)', async () => {
    const model = new AvatarModel(DEFAULT_AVATAR);
    const first = model.perform('plie');
    model.update(0.3, 0);
    const second = model.perform('bow');
    await first;
    assert.equal(model.performing, true);
    for (let i = 0; i < 30; i++) model.update(0.1, 0);
    await second;
    assert.equal(model.performing, false);
  });
});

describe('the rug', () => {
  it('numbers sit where the rug paints them, in two rows of five', () => {
    const tiles = matTiles();
    assert.equal(tiles.length, 10);
    const one = tiles[0]!;
    assert.ok(Math.abs(one.x + 2.652) < 0.01 && Math.abs(one.z + 4.83) < 0.01, `1 at ${one.x}, ${one.z}`);
    assert.ok(Math.abs(tiles[5]!.z + 3.36) < 0.01, '6 starts the front row');
    for (const a of tiles) for (const b of tiles) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 2 * TILE_RADIUS);
  });

  it('knows which number she is standing on', () => {
    const tiles = matTiles();
    for (const t of tiles) assert.equal(tileAt(tiles, t.x + 0.2, t.z - 0.2), t.n);
    assert.equal(tileAt(tiles, 0, 0), null);
    assert.equal(tileAt(tiles, tiles[0]!.x + TILE_RADIUS + 0.05, tiles[0]!.z), null);
  });

  it('each number plays the next note up the scale', () => {
    assert.equal(stationPitch(1), 1);
    assert.ok(Math.abs(stationPitch(8) - 2) < 1e-9, 'number 8 is an octave up');
    for (let n = 2; n <= 10; n++) assert.ok(stationPitch(n) > stationPitch(n - 1));
  });
});
