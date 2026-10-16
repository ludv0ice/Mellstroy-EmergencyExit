import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Simulation, STUN_DURATION } from '../src/simulation.js';
import { WEAPONS, UNARMED } from '../src/weapons.js';
import { PROFILES } from '../src/campaign.js';

const manifest = JSON.parse(
  readFileSync(new URL('../assets/manifest.json', import.meta.url)),
);
const actor = (kind, x, y) => ({
  kind,
  name: kind === 'enemy' ? 'objEnemy' : 'objPlayerMouse',
  sprite: kind === 'enemy' ? 'sprEWalkUnarmed' : 'sprPWalkUnarmed',
  x,
  y,
});
const wall = (x, y, angle = 0, scaleX = 1, scaleY = 1) => ({
  name: 'objWallHeavyV',
  sprite: 'sprWallHeavyV',
  x,
  y,
  angle,
  scaleX,
  scaleY,
  solid: true,
  isWall: true,
});
const fixture = (entities, profile = PROFILES[0]) =>
  new Simulation(
    manifest,
    { id: 'fixture', width: 400, height: 300, entities, tiles: [] },
    profile,
  );
const duel = (distance = 23) =>
  fixture([actor('player', 40, 40), actor('enemy', 40 + distance, 40)]);

test('Every melee weapon hits within its own reach and misses outside it', () => {
  for (const weapon of WEAPONS.filter((w) => !w.gun && !w.throwOnly)) {
    assert.ok(weapon.range > UNARMED.range, weapon.name);
    const inside = duel(weapon.range + 5.5);
    inside.player.weapon = weapon;
    inside.attack();
    assert.equal(inside.enemies[0].alive, false, weapon.name + ' inside');
    const outside = duel(weapon.range + 6.5);
    outside.player.weapon = weapon;
    outside.attack();
    assert.equal(outside.enemies[0].alive, true, weapon.name + ' outside');
  }
  const fists = duel(45);
  fists.attack();
  assert.equal(fists.enemies[0].stun, 0);
  const club = duel(45);
  club.player.weapon = WEAPONS[2];
  club.attack();
  assert.equal(club.kills, 1);
});

test('Every enemy melee weapon has less reach than the same weapon held by the hero', () => {
  for (const weapon of WEAPONS.filter((w) => !w.gun && !w.throwOnly)) {
    assert.ok(weapon.enemyRange < weapon.range, weapon.name);
    for (const [distance, killed] of [
      [weapon.enemyRange + 6, true],
      [weapon.enemyRange + 8, false],
    ]) {
      const sim = duel(distance),
        enemy = sim.enemies[0];
      enemy.weapon = weapon;
      enemy.angle = Math.PI;
      enemy.reaction = 0;
      enemy.fireTimer = 0;
      sim.grace = 0;
      sim.moveEnemy = () => {};
      for (let frame = 0; frame < 14; frame++) sim.updateEnemy(enemy, 1 / 60);
      assert.equal(sim.player.alive, !killed, weapon.name + ' ' + distance);
    }
  }
});

test('Enemy bullets never damage allies and still hit the player behind them', () => {
  const sim = fixture([
    actor('player', 200, 40),
    actor('enemy', 40, 40),
    actor('enemy', 80, 40),
  ]);
  const [shooter, ally] = sim.enemies;
  sim.fire(shooter, { ...WEAPONS[0], spread: 0, pellets: 1 }, 'enemy');
  sim.updateBullets(0.2);
  assert.equal(ally.alive, true);
  assert.equal(ally.hp, 1);
  assert.equal(shooter.alive, true);
  assert.equal(sim.player.alive, false);
  assert.equal(sim.kills, 0);
});

test('Player bullets retain damage against enemies', () => {
  const sim = duel(40);
  sim.fire(sim.player, { ...WEAPONS[0], spread: 0, pellets: 1 }, 'player');
  sim.updateBullets(0.1);
  assert.equal(sim.enemies[0].alive, false);
  assert.equal(sim.player.alive, true);
});

test('An enemy boxed in by obstacles waits instead of spinning', () => {
  const sim = fixture([
    actor('player', 40, 40),
    actor('enemy', 150, 150),
    wall(136, 130, 0, 1, 2),
    wall(156, 130, 0, 1, 2),
    wall(136, 136, -Math.PI / 2),
    wall(136, 156, -Math.PI / 2),
  ]);
  const enemy = sim.enemies[0],
    angle = enemy.angle;
  for (let i = 0; i < 180; i++) sim.updateEnemy(enemy, 1 / 60);
  assert.equal(enemy.angle, angle);
  assert.equal(enemy.x, 150);
  assert.equal(enemy.y, 150);
});

test('A patrolling enemy selects an open direction and moves away from a wall', () => {
  const sim = fixture([
    actor('player', 40, 40),
    actor('enemy', 156, 160),
    wall(170, 130, 0, 1, 2),
  ]);
  const enemy = sim.enemies[0];
  for (let i = 0; i < 30; i++) sim.updateEnemy(enemy, 1 / 60);
  assert.ok(enemy.y > 175);
  assert.ok(Math.abs(enemy.angle - Math.PI / 2) < 0.001);
});

test('Drop, swap and pickup preserve ammunition without reapplying the ammo modifier', () => {
  const sim = fixture(
    [
      actor('player', 40, 40),
      {
        kind: 'weapon',
        name: 'objSpecificWeapon',
        sprite: 'sprWeapons',
        x: 40,
        y: 40,
        init: { image_index: 0, ammo: 6 },
      },
    ],
    PROFILES.find((p) => p.id === 'marksman'),
  );
  sim.pickup();
  assert.equal(sim.player.ammo, 12);
  sim.player.ammo = 9;
  for (let i = 0; i < 5; i++) {
    sim.dropWeapon();
    assert.equal(sim.player.weapon, UNARMED);
    assert.equal(sim.player.ammo, 0);
    sim.pickup();
    assert.equal(sim.player.weapon.id, 0);
    assert.equal(sim.player.ammo, 9);
    assert.equal(sim.items.filter((i) => !i.taken).length, 0);
  }
  sim.items.push({ x: 40, y: 40, weapon: WEAPONS[1], ammo: 2 });
  sim.pickup();
  assert.equal(sim.player.weapon.id, 1);
  assert.equal(sim.player.ammo, 4);
  const swapped = sim.items.find((i) => !i.taken);
  assert.equal(swapped.weapon.id, 0);
  assert.equal(swapped.ammo, 9);
});

test('Every ordinary thrown weapon stuns like a punch and can be picked up again', () => {
  for (const weapon of WEAPONS) {
    const sim = duel();
    sim.player.weapon = weapon;
    sim.player.ammo = weapon.gun ? 7 : 0;
    sim.throwWeapon();
    sim.updateBullets(0.05);
    assert.equal(sim.enemies[0].alive, true, weapon.name);
    assert.equal(sim.kills, 0, weapon.name);
    assert.equal(sim.enemies[0].stun, STUN_DURATION, weapon.name);
    assert.equal(sim.items.filter((i) => !i.taken).length, 1, weapon.name);
    sim.pickup();
    assert.equal(sim.player.weapon.id, weapon.id, weapon.name);
    assert.equal(sim.player.ammo, weapon.gun ? 7 : 0, weapon.name);
  }
});

test('An enemy picking up and dropping a player weapon does not duplicate its ammo bonus', () => {
  const sim = fixture(
    [actor('player', 40, 40), actor('enemy', 150, 40)],
    PROFILES.find((p) => p.id === 'marksman'),
  );
  sim.player.weapon = WEAPONS[0];
  sim.player.ammo = 9;
  sim.dropWeapon();
  const enemy = sim.enemies[0];
  enemy.x = 52;
  enemy.stationary = true;
  sim.updateEnemy(enemy, 1 / 60);
  assert.equal(enemy.weapon.id, 0);
  sim.dropEnemyWeapon(enemy);
  sim.pickup();
  assert.equal(sim.player.ammo, 9);
});

test('Dropping beside a wall keeps the weapon on accessible ground', () => {
  const sim = fixture([actor('player', 40, 40), wall(55, 16, 0, 1, 3)]);
  sim.player.weapon = WEAPONS[1];
  sim.player.ammo = 3;
  sim.dropWeapon();
  assert.equal(sim.blocked(sim.items[0].x, sim.items[0].y, 7), false);
  sim.pickup();
  assert.equal(sim.player.weapon.id, 1);
  assert.equal(sim.player.ammo, 3);
});

test('Long melee weapons cannot hit through a solid wall', () => {
  const sim = fixture([
    actor('player', 40, 40),
    actor('enemy', 85, 40),
    wall(60, 16, 0, 1, 3),
  ]);
  sim.player.weapon = WEAPONS[2];
  sim.attack();
  assert.equal(sim.kills, 0);
  assert.equal(sim.enemies[0].alive, true);
});

test('The long-throw profile also stuns instead of killing', () => {
  const sim = fixture(
    [actor('player', 40, 40), actor('enemy', 63, 40)],
    PROFILES.find((p) => p.id === 'thrower'),
  );
  sim.player.weapon = WEAPONS[4];
  sim.throwWeapon();
  sim.updateBullets(0.05);
  assert.equal(sim.kills, 0);
  assert.equal(sim.enemies[0].stun, STUN_DURATION);
});

test('Thrown weapons hitting a wall land on a reachable side with their remaining ammo', () => {
  const sim = fixture([actor('player', 40, 40), wall(70, 16, 0, 1, 3)]);
  sim.player.weapon = WEAPONS[0];
  sim.player.ammo = 7;
  sim.throwWeapon();
  sim.updateBullets(0.15);
  const drop = sim.items[0];
  assert.ok(drop.x < 63);
  assert.equal(sim.blocked(drop.x, drop.y, 7), false);
  assert.equal(sim.lineBlocked(drop, sim.player), false);
  sim.pickup();
  assert.equal(sim.player.weapon.id, 0);
  assert.equal(sim.player.ammo, 7);
});

test('Weapons thrown out of bounds remain on the map for recovery', () => {
  const sim = fixture([actor('player', 16, 16)]);
  sim.player.weapon = WEAPONS[4];
  sim.player.angle = Math.PI;
  sim.throwWeapon();
  sim.updateBullets(0.7);
  assert.ok(sim.items[0].x >= 8);
  sim.pickup();
  assert.equal(sim.player.weapon.id, 4);
});

test('New chapter 03 walls block the hero and navigation with exact bounds', () => {
  const room = JSON.parse(
    readFileSync(new URL('../assets/rooms/eeRelayRoom.json', import.meta.url)),
  );
  const sim = new Simulation(manifest, room, PROFILES[0]);
  const wall = room.entities.find((e) => e.isWall && e.bounds.w > e.bounds.h);
  const b = wall.bounds;
  assert.equal(sim.blocked(b.x + b.w / 2, b.y + b.h / 2, 1), true);
  const at = { x: b.x + b.w / 2, y: b.y + b.h + 10 };
  sim.player.x = at.x;
  sim.player.y = at.y;
  sim.move(sim.player, 0, -20, 1 / 60);
  assert.ok(sim.player.y >= b.y + b.h + 7);
});

test('Mouse inventory action throws immediately during cooldown and picks up with empty hands', () => {
  const sim = duel(23);
  sim.player.weapon = WEAPONS[0];
  sim.player.ammo = 6;
  sim.player.fireTimer = 10;
  sim.update(1 / 60, {
    moveX: 0,
    moveY: 0,
    weaponAction: true,
    attack: true,
    aim: { x: 100, y: 40 },
  });
  assert.equal(sim.player.weapon, UNARMED);
  sim.updateBullets(0.05);
  assert.equal(sim.enemies[0].stun, STUN_DURATION);
  sim.update(1 / 60, { moveX: 0, moveY: 0, weaponAction: true });
  assert.equal(sim.player.weapon.id, 0);
  assert.equal(sim.player.ammo, 6);
});
test('Enemy cannot steal a ground weapon through a wall', () => {
  const sim = fixture([
    actor('player', 40, 40),
    actor('enemy', 70, 40),
    wall(60, 16, 0, 1, 3),
  ]);
  sim.items.push({ x: 55, y: 40, weapon: WEAPONS[0], ammo: 5 });
  sim.updateEnemy(sim.enemies[0], 1 / 60);
  assert.equal(sim.enemies[0].weapon, UNARMED);
});

test('Melee wind-up gives 220 ms to counterattack and resets when the hero escapes', () => {
  const sim = duel(20),
    enemy = sim.enemies[0];
  sim.grace = 0;
  enemy.reaction = 0;
  enemy.fireTimer = 0;
  enemy.angle = Math.PI;
  sim.moveEnemy = () => {};
  for (let i = 0; i < 10; i++) sim.updateEnemy(enemy, 1 / 60);
  assert.equal(sim.player.alive, true);
  sim.player.x = 200;
  sim.updateEnemy(enemy, 1 / 60);
  assert.equal(enemy.meleeWindup, null);
  sim.player.x = 40;
  for (let i = 0; i < 10; i++) sim.updateEnemy(enemy, 1 / 60);
  assert.equal(sim.player.alive, true);
  sim.player.weapon = WEAPONS[4];
  sim.player.angle = 0;
  sim.attack();
  assert.equal(enemy.alive, false);
});
test('A newly alerted gunman waits before his first shot', () => {
  const sim = duel(120),
    enemy = sim.enemies[0];
  sim.grace = 0;
  enemy.weapon = WEAPONS[0];
  enemy.ammo = 10;
  enemy.angle = Math.PI;
  enemy.fireTimer = 0;
  for (let i = 0; i < 20; i++) sim.updateEnemy(enemy, 1 / 60);
  assert.equal(sim.bullets.length, 0);
  for (let i = 0; i < 8; i++) sim.updateEnemy(enemy, 1 / 60);
  assert.ok(sim.bullets.length > 0);
});

test('The player cannot walk through a living or stunned enemy, even with a large movement step', () => {
  for (const stunned of [false, true]) {
    const sim = duel(40),
      enemy = sim.enemies[0];
    if (stunned) sim.stun(enemy, STUN_DURATION);
    sim.move(sim.player, 160, 0, 1);
    assert.ok(sim.player.x <= enemy.x - 14);
    assert.ok(Math.hypot(sim.player.x - enemy.x, sim.player.y - enemy.y) >= 14);
  }
});

test('Enemy movement also respects the player and other enemies', () => {
  const sim = fixture([
    actor('player', 100, 100),
    actor('enemy', 40, 100),
    actor('enemy', 160, 100),
  ]);
  const [first, second] = sim.enemies;
  sim.move(first, 160, 0, 1);
  assert.ok(first.x <= 86);
  sim.move(second, -160, 0, 1);
  assert.ok(second.x >= 114);
  sim.player.y = 160;
  sim.move(first, 160, 0, 1);
  assert.ok(first.x <= second.x - 14);
});

test('Corpses do not block movement and pre-existing overlaps allow actors to separate', () => {
  const sim = duel(40),
    enemy = sim.enemies[0];
  sim.kill(enemy, 'blunt');
  sim.move(sim.player, 100, 0, 1);
  assert.equal(sim.player.x, 140);
  const overlap = duel(0);
  overlap.move(overlap.player, -30, 0, 1);
  assert.equal(overlap.player.x, 10);
});

test('A hero touching an enemy can slide around him and still attack at melee distance', () => {
  const sim = duel(14),
    enemy = sim.enemies[0];
  sim.move(sim.player, 0, 30, 1);
  assert.equal(sim.player.y, 70);
  sim.move(sim.player, 30, 0, 1);
  assert.ok(sim.player.x > enemy.x);
  const contact = duel(14);
  contact.attack();
  assert.equal(contact.enemies[0].stun, STUN_DURATION);
});
