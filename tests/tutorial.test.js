import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Simulation } from '../src/simulation.js';
import { Tutorial } from '../src/tutorial.js';
import { PROFILES } from '../src/campaign.js';

const manifest = JSON.parse(
  readFileSync(new URL('../assets/manifest.json', import.meta.url)),
);
function create() {
  const entities = [
    {
      kind: 'player',
      name: 'objPlayerMouse',
      sprite: 'sprPWalkUnarmed',
      x: 100,
      y: 100,
    },
    ...[160, 220, 300].map((x) => ({
      kind: 'enemy',
      name: 'objEnemy',
      sprite: 'sprEWalkUnarmed',
      x,
      y: 100,
    })),
    ...[4, 1].map((id, i) => ({
      kind: 'weapon',
      name: 'objSpecificWeapon',
      sprite: 'sprWeapons',
      x: 100,
      y: 160 + i * 40,
      init: { image_index: id },
    })),
  ];
  const sim = new Simulation(
    manifest,
    { id: 'fixture', width: 600, height: 400, entities, tiles: [] },
    PROFILES[0],
  );
  sim.tutorial = new Tutorial(sim);
  return sim;
}
const step = (sim, input = {}) =>
  sim.update(1 / 60, { moveX: 0, moveY: 0, ...input });
function act(sim, input = {}) {
  sim.player.vx = sim.player.vy = 0;
  sim.player.fireTimer = 0;
  step(sim, input);
}
function movement(sim) {
  for (const [moveX, moveY] of [
    [0, -1],
    [-1, 0],
    [0, 1],
    [1, 0],
  ]) {
    sim.player.vx = sim.player.vy = 0;
    step(sim, { moveX, moveY });
  }
}
function stand(sim, x, y) {
  Object.assign(sim.player, { x, y, vx: 0, vy: 0, execution: 0 });
}

test('Tutorial blocks out-of-order actions and requires all four movement directions', () => {
  const sim = create();
  stand(sim, 100, 160);
  act(sim, {
    pickup: true,
    throw: true,
    drop: true,
    execute: true,
    attack: true,
  });
  assert.equal(sim.player.weapon.id, -1);
  for (let i = 0; i < 5; i++) step(sim, { moveX: 1 });
  assert.equal(sim.tutorial.step, 'move');
  assert.deepEqual([...sim.tutorial.directions], ['D']);
  movement(sim);
  assert.equal(sim.tutorial.step, 'aim');
  assert.ok(sim.enemies.every((e) => e.alive && e.x === e.origin.x));
});

test('Every lesson completes through gameplay results, and all 13 steps can be finished', () => {
  const sim = create();
  movement(sim);
  assert.equal(sim.tutorial.step, 'aim');
  act(sim, { aim: { x: sim.player.x, y: sim.player.y + 100 } });
  assert.equal(sim.tutorial.step, 'punch');
  act(sim, { attack: true, aim: { x: 0, y: 0 } });
  assert.equal(sim.tutorial.step, 'punch');
  stand(sim, 140, 100);
  act(sim, { attack: true, aim: { x: 160, y: 100 } });
  assert.equal(sim.tutorial.step, 'finish');
  act(sim, { execute: true });
  assert.equal(sim.tutorial.step, 'pickup');
  stand(sim, 100, 200);
  act(sim, { pickup: true });
  assert.equal(sim.player.weapon.id, -1, 'cannot skip to the shotgun');
  stand(sim, 100, 160);
  act(sim, { pickup: true });
  assert.equal(sim.tutorial.step, 'drop');
  act(sim, { drop: true });
  assert.equal(sim.tutorial.step, 'retrieve');
  act(sim, { pickup: true });
  assert.equal(sim.tutorial.step, 'throw');
  stand(sim, 200, 100);
  act(sim, { throw: true, aim: { x: 220, y: 100 } });
  for (let i = 0; i < 5; i++) step(sim);
  assert.equal(sim.tutorial.step, 'recover');
  assert.equal(sim.enemies[1].alive, true);
  act(sim, { pickup: true });
  assert.equal(sim.tutorial.step, 'melee');
  act(sim, { attack: true, aim: { x: 220, y: 100 } });
  assert.equal(sim.tutorial.step, 'gun');
  stand(sim, 100, 200);
  act(sim, { pickup: true });
  assert.equal(sim.tutorial.step, 'shoot');
  assert.equal(sim.player.ammo, 6);
  stand(sim, 270, 100);
  act(sim, { attack: true, aim: { x: 300, y: 100 } });
  for (let i = 0; i < 5; i++) step(sim);
  assert.equal(sim.tutorial.step, 'exit');
  assert.equal(sim.kills, 3);
  stand(sim, sim.exit.x, sim.exit.y);
  act(sim, { interact: true });
  assert.equal(sim.status, 'complete');
});

test('A missed training throw can be recovered and retried without restarting', async () => {
  const { WEAPONS } = await import('../src/weapons.js');
  const sim = create();
  sim.tutorial.index = 7;
  sim.player.weapon = WEAPONS[4];
  act(sim, { throw: true, aim: { x: 100, y: 300 } });
  for (let i = 0; i < 60; i++) step(sim);
  assert.equal(sim.tutorial.step, 'throw');
  const item = sim.items.find(
    (i) => !i.taken && i.weapon.id === 4 && i.ammoBonusApplied,
  );
  stand(sim, item.x, item.y);
  act(sim, { pickup: true });
  assert.equal(sim.player.weapon.id, 4);
  stand(sim, 200, 100);
  act(sim, { throw: true, aim: { x: 220, y: 100 } });
  for (let i = 0; i < 5; i++) step(sim);
  assert.equal(sim.tutorial.step, 'recover');
});

test('The shooting lesson replenishes empty ammunition after stray pellets finish flying', async () => {
  const { WEAPONS } = await import('../src/weapons.js');
  const sim = create();
  sim.tutorial.index = 11;
  sim.player.weapon = WEAPONS[1];
  sim.player.ammo = 0;
  step(sim);
  assert.equal(sim.player.ammo, 6);
  assert.equal(sim.tutorial.step, 'shoot');
});

test('The training exit stays locked until the final lesson, including after accidental clear', () => {
  const sim = create();
  sim.enemies.forEach((e) => (e.alive = false));
  stand(sim, sim.exit.x, sim.exit.y);
  act(sim, { interact: true });
  assert.equal(sim.status, 'playing');
  assert.equal(sim.tutorial.step, 'move');
});
