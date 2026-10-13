import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Simulation } from '../src/simulation.js';
import { buildRoom } from '../src/rooms.js';
import { PROFILES } from '../src/campaign.js';

// Captured before removing the source archive and converting room data.
const baseline = JSON.parse(
  readFileSync(new URL('./fixtures/campaign-baseline.json', import.meta.url)),
);
const manifest = JSON.parse(
  readFileSync(new URL('../public/assets/manifest.json', import.meta.url)),
);
const raw = (id) =>
  JSON.parse(
    readFileSync(
      new URL('../public/assets/rooms/' + id + '.json', import.meta.url),
    ),
  );
const hash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

function geometry(room) {
  const entityFields = [
    'id',
    'name',
    'kind',
    'sprite',
    'x',
    'y',
    'scaleX',
    'scaleY',
    'angle',
    'frame',
    'depth',
    'visible',
    'solid',
    'isWall',
    'furniture',
    'glass',
    'broken',
  ];
  const tileFields = [
    'bgName',
    'x',
    'y',
    'w',
    'h',
    'xo',
    'yo',
    'depth',
    'scaleX',
    'scaleY',
  ];
  const select = (value, fields) =>
    Object.fromEntries(fields.map((key) => [key, value[key]]));
  return {
    id: room.id,
    width: room.width,
    height: room.height,
    entities: room.entities.map((e) => select(e, entityFields)),
    tiles: room.tiles.map((t) => select(t, tileFields)),
  };
}

function trace(sim) {
  const states = [sim.snapshot()];
  for (let frame = 0; frame < 120; frame++) {
    sim.update(1 / 60, {
      moveX: frame < 30 ? 1 : frame < 60 ? -1 : 0,
      moveY: frame >= 60 && frame < 90 ? 1 : 0,
      aim: { x: 320, y: 120 },
      attack: frame % 3 === 0,
      pickup: frame % 30 === 0,
      throw: frame === 80,
      execute: frame === 100,
    });
    states.push({ state: sim.snapshot(), events: sim.events });
  }
  return hash(states);
}

test('Every retained room preserves the original geometry, transforms and draw order', () => {
  for (const [id, expected] of Object.entries(baseline.geometry)) {
    assert.equal(hash(geometry(buildRoom(manifest, raw(id)))), expected, id);
  }
});

test('Every retained room produces the same deterministic gameplay trace', () => {
  for (const [id, expected] of Object.entries(baseline.traces)) {
    assert.equal(
      trace(new Simulation(manifest, raw(id), PROFILES[0])),
      expected,
      id,
    );
  }
});

test('All 24 gameplay modifiers preserve their original behavior', () => {
  for (const profile of PROFILES) {
    assert.equal(
      trace(new Simulation(manifest, raw('rmTutorial'), profile)),
      baseline.profiles[profile.id],
      profile.id,
    );
  }
});
