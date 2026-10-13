import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Simulation, STUN_DURATION } from '../src/simulation.js';
import { WEAPONS, UNARMED } from '../src/weapons.js';
import { PROFILES } from '../src/campaign.js';

const manifest = JSON.parse(
  readFileSync(new URL('../public/assets/manifest.json', import.meta.url)),
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

test('Enemy melee reach follows its weapon instead of using one distance for all attacks', () => {
  for (const [weapon, killed] of [
    [UNARMED, false],
    [WEAPONS[2], true],
  ]) {
    const sim = duel(45),
      enemy = sim.enemies[0];
    enemy.weapon = weapon;
    enemy.angle = Math.PI;
    enemy.reaction = 0;
    enemy.fireTimer = 0;
    sim.grace = 0;
    sim.updateEnemy(enemy, 1 / 60);
    assert.equal(sim.player.alive, !killed, weapon.name);
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

test('The explicitly selected lethal-throw modifier still works', () => {
  const sim = fixture(
    [actor('player', 40, 40), actor('enemy', 63, 40)],
    PROFILES.find((p) => p.id === 'thrower'),
  );
  sim.player.weapon = WEAPONS[4];
  sim.throwWeapon();
  sim.updateBullets(0.05);
  assert.equal(sim.kills, 1);
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

test('The yellow walls on chapter 03 block the player, enemies and navigation', () => {
  const raw = JSON.parse(
    readFileSync(
      new URL(
        '../public/assets/rooms/rmApartment2Upstairs.json',
        import.meta.url,
      ),
    ),
  );
  const sim = new Simulation(manifest, raw, PROFILES[0]);
  const walls = sim.room.entities.filter((e) =>
    /^objWallSoft[HV]$/.test(e.name),
  );
  assert.equal(walls.length, 19);
  for (const e of walls) {
    assert.equal(e.solid, true);
    assert.equal(e.isWall, true);
    assert.ok(sim.staticBoxes.some((b) => b.entity.id === e.id));
  }
  assert.equal(sim.blocked(452, 240, 1), true);
  for (const actor of [sim.player, sim.enemies[0]]) {
    actor.x = 116;
    actor.y = 400;
    assert.equal(sim.blocked(actor.x, actor.y, 7), false);
    sim.move(actor, 40, 0, 1 / 60);
    assert.ok(actor.x <= 121, 'cannot cross yellow wall');
  }
  assert.equal(
    sim.blocked(240, 324, 7, false),
    false,
    'doorway between wall segments remains open',
  );
});
