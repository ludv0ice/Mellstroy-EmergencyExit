import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Simulation } from '../src/simulation.js';
import { CHAPTERS, PROFILES } from '../src/campaign.js';
import { completeCampaign, clearLocation } from '../src/cheats.js';
import { endingUnlocked } from '../src/ending-sequence.js';

const manifest = JSON.parse(
  readFileSync(new URL('../assets/manifest.json', import.meta.url)),
);
const fixture = () =>
  new Simulation(
    manifest,
    {
      id: 'cheat-fixture',
      width: 400,
      height: 300,
      tiles: [],
      entities: [
        {
          kind: 'player',
          name: 'eePlayer',
          sprite: 'sprPWalkUnarmed',
          x: 80,
          y: 80,
        },
        {
          kind: 'enemy',
          name: 'eeGuard',
          sprite: 'sprEWalkUnarmed',
          x: 130,
          y: 80,
        },
        {
          kind: 'enemy',
          name: 'eePatrol',
          sprite: 'sprEWalkUnarmed',
          x: 180,
          y: 80,
        },
      ],
    },
    PROFILES[0],
  );

test('God mode blocks death and bullets without consuming armor, and can be disabled', () => {
  const sim = fixture();
  sim.cheats = { god: true };
  sim.player.armor = 1;
  sim.takeBullet();
  sim.takeBullet();
  sim.die();
  assert.equal(sim.player.alive, true);
  assert.equal(sim.player.armor, 1);
  assert.equal(sim.status, 'playing');
  assert.ok(!sim.events.some((event) => event.type === 'death'));
  sim.cheats.god = false;
  sim.takeBullet();
  assert.equal(sim.player.armor, 0);
  assert.equal(sim.player.alive, true);
  sim.takeBullet();
  assert.equal(sim.player.alive, false);
  assert.equal(sim.status, 'dead');
});

test('A shared god toggle carries across simulations without altering normal default combat', () => {
  const normal = fixture();
  normal.die();
  assert.equal(normal.player.alive, false);
  const flags = { god: true };
  const first = fixture(),
    second = fixture();
  first.cheats = second.cheats = flags;
  second.die();
  assert.equal(second.player.alive, true);
  flags.god = false;
  first.die();
  second.die();
  assert.equal(first.player.alive, false);
  assert.equal(second.player.alive, false);
});

test('Clearing a location removes enemies and hostile bullets, opens the exit and ends tutorial gating', () => {
  const sim = fixture();
  const ownBullet = { team: 'player' };
  sim.bullets = [ownBullet, { team: 'enemy' }];
  sim.tutorial = { canExit: false };
  clearLocation(sim);
  assert.ok(sim.enemies.every((enemy) => !enemy.alive));
  assert.equal(sim.kills, sim.total);
  assert.equal(sim.cleared, true);
  assert.equal(sim.player.alive, true);
  assert.equal(sim.tutorial, null);
  assert.deepEqual(sim.bullets, [ownBullet]);
  clearLocation(sim);
  assert.equal(sim.kills, sim.total);
});

test('Completing the campaign fills all 22 results, preserves real records and unlocks the finale', () => {
  const record = { score: 12500, grade: 'A+', time: 38 };
  const previous = { unlocked: 3, last: 2, best: { 2: record } };
  const completed = completeCampaign(previous);
  assert.equal(previous.unlocked, 3);
  assert.equal(Object.keys(previous.best).length, 1);
  assert.equal(completed.unlocked, 21);
  assert.equal(completed.last, 21);
  assert.equal(Object.keys(completed.best).length, CHAPTERS.length);
  assert.deepEqual(completed.best[2], record);
  assert.equal(endingUnlocked(completed), true);
  assert.deepEqual(completeCampaign(completed), completed);
});
