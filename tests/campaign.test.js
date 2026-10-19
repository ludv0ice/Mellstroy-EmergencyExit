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

test('All five balanced profiles construct valid simulations with consistent weapon and armor setup', () => {
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

test('Each combat floor receives two or three extra enemies without truncation at runtime', async () => {
  const { CHAPTERS } = await import('../src/campaign.js');
  const additions = new Set();
  for (const chapter of CHAPTERS) {
    chapter.rooms.forEach((id, index) => {
      const room = raw(id);
      const declared = room.entities.filter(
        (entity) => entity.kind === 'enemy',
      ).length;
      const sim = new Simulation(manifest, room, PROFILES[0]);
      assert.equal(sim.enemies.length, declared, id + ' silently truncated');
      assert.ok(declared <= 10, id);
      if (chapter.index === 0) assert.equal(declared, 3);
      else {
        const previousTotal = [14, 15].includes(chapter.index) ? 7 : 6;
        const previous =
          Math.floor(previousTotal / chapter.rooms.length) +
          (index < previousTotal % chapter.rooms.length ? 1 : 0);
        const extra = declared - previous;
        assert.ok(extra === 2 || extra === 3, id + ': +' + extra);
        additions.add(extra);
      }
      for (let a = 0; a < sim.enemies.length; a++)
        for (let b = a + 1; b < sim.enemies.length; b++)
          assert.ok(
            Math.hypot(
              sim.enemies[a].x - sim.enemies[b].x,
              sim.enemies[a].y - sim.enemies[b].y,
            ) >= 14,
            id + ' overlapping spawns',
          );
    });
  }
  assert.deepEqual([...additions].sort(), [2, 3]);
});

test('The five retained profiles grant modest bonuses without combat immunity or free weapons', () => {
  assert.equal(PROFILES.length, 5);
  assert.equal(new Set(PROFILES.map((profile) => profile.id)).size, 5);
  for (const profile of PROFILES) {
    assert.ok(profile.speed >= 180 && profile.speed <= 194, profile.id);
    assert.ok((profile.ammoBonus ?? 1) <= 1.2, profile.id);
    for (const removed of [
      'armor',
      'punchKill',
      'startWeapon',
      'friendlyDogs',
      'lethalDoors',
      'silentShots',
      'stealth',
      'disarm',
    ])
      assert.ok(!profile[removed], profile.id + ' ' + removed);
  }
});
