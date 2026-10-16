import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Simulation } from '../src/simulation.js';
import { PROFILES } from '../src/campaign.js';
const manifest = JSON.parse(
  readFileSync(new URL('../assets/manifest.json', import.meta.url)),
);
const raw = (id) =>
  JSON.parse(
    readFileSync(new URL('../assets/rooms/' + id + '.json', import.meta.url)),
  );
const hash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

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
    const snapshot = sim.snapshot();
    for (const actor of [snapshot.player, ...snapshot.actors]) {
      assert.ok(
        Number.isFinite(actor.x) && Number.isFinite(actor.y),
        sim.room.id + ' coordinates',
      );
    }
    states.push({ state: sim.snapshot(), events: sim.events });
  }
  return hash(states);
}

test('Every retained room remains deterministic and finite with the corrected mechanics', () => {
  for (const { id } of manifest.rooms) {
    assert.equal(
      trace(new Simulation(manifest, raw(id), PROFILES[0])),
      trace(new Simulation(manifest, raw(id), PROFILES[0])),
      id,
    );
  }
});

test('All 24 gameplay modifiers construct valid simulations with consistent weapon and armor setup', () => {
  for (const profile of PROFILES) {
    const sim = new Simulation(manifest, raw('eeTraining'), profile);
    assert.equal(sim.player.weapon.id, profile.startWeapon ?? -1, profile.id);
    assert.equal(sim.player.ammo, sim.player.weapon.ammo, profile.id);
    assert.equal(sim.player.armor, profile.armor ?? 0, profile.id);
    assert.equal(
      trace(sim),
      trace(new Simulation(manifest, raw('eeTraining'), profile)),
      profile.id,
    );
  }
});

test('Each chapter has at most seven enemies across all of its floors', async () => {
  const { CHAPTERS } = await import('../src/campaign.js');
  for (const chapter of CHAPTERS) {
    const enemies = chapter.rooms.flatMap((id) =>
      raw(id).entities.filter((e) => e.kind === 'enemy'),
    );
    assert.ok(enemies.length <= 7, chapter.number + ': ' + enemies.length);
    for (const id of chapter.rooms) {
      const sim = new Simulation(manifest, raw(id), PROFILES[0]);
      assert.ok(sim.enemies.length <= 7, id);
    }
  }
});
