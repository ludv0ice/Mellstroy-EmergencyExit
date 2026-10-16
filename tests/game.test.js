import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Simulation } from '../src/simulation.js';
import { PROFILES } from '../src/campaign.js';
import { rayRect, segmentCircle, Navigation } from '../src/physics.js';
import { buildRoom } from '../src/rooms.js';
import { CHAPTERS } from '../src/campaign.js';

const manifest = JSON.parse(
  readFileSync(new URL('../assets/manifest.json', import.meta.url)),
);
const raw = (id) =>
  JSON.parse(
    readFileSync(new URL('../assets/rooms/' + id + '.json', import.meta.url)),
  );
const prototypes = {
  objPlayerMouse: {
    kind: 'player',
    sprite: 'sprPWalkUnarmed',
    depth: -2,
    init: { ammo: 0, dir: 0 },
  },
  objEnemy: {
    kind: 'enemy',
    sprite: 'sprEWalkM16',
    depth: -1,
    init: { ammo: 24 },
  },
  objSpecificWeapon: {
    kind: 'weapon',
    sprite: 'sprWeapons',
    depth: -1,
    init: { ammo: 0 },
  },
  objWallHeavyV: {
    sprite: 'sprWallHeavyV',
    depth: -10,
    solid: true,
    isWall: true,
  },
  objDoorV: { kind: 'door', sprite: 'sprDoorV' },
};
const instance = (name, x, y, overrides = {}) => ({
  ...prototypes[name],
  ...overrides,
  name,
  x,
  y,
  init: { ...prototypes[name].init, ...overrides.init },
});
function fixture(entities) {
  return { id: 'fixture', width: 400, height: 300, entities, tiles: [] };
}
const empty = { moveX: 0, moveY: 0, attack: false };

test('Loading rooms keeps mutable entity state separate from cached JSON', () => {
  const data = fixture([
    instance('objSpecificWeapon', 40, 40, { init: { ammo: 6 } }),
  ]);
  const room = buildRoom(manifest, data);
  room.entities[0].broken = true;
  room.entities[0].init.ammo = 0;
  const restarted = buildRoom(manifest, data);
  assert.equal(restarted.entities[0].broken, false);
  assert.equal(restarted.entities[0].init.ammo, 6);
});
test('Room data preserves weapon IDs, ammunition and sprite anchors', () => {
  const room = buildRoom(manifest, raw('rmTutorial'));
  const weapons = room.entities.filter((e) => e.kind === 'weapon');
  assert.equal(weapons.length, 2);
  const sim = new Simulation(manifest, raw('rmTutorial'), PROFILES[0]);
  assert.equal(sim.items[0].weapon.id, 1);
  assert.equal(sim.items[0].ammo, 6);
  assert.equal(manifest.sprites.sprPWalkUnarmed.width, 60);
  assert.equal(manifest.sprites.sprPWalkUnarmed.originX, 30);
});
test('Swept projectile collision catches thin walls and small moving targets', () => {
  assert.equal(rayRect(0, 30, 100, 30, { x: 49, y: 0, w: 2, h: 60 }), 0.49);
  assert.ok(segmentCircle(0, 30, 100, 30, 50, 30, 4) < 0.5);
  assert.equal(segmentCircle(0, 0, 100, 0, 50, 30, 4), null);
});
test('Shotgun consumes one cartridge per shot and cannot fire empty', () => {
  const sim = new Simulation(
    manifest,
    fixture([
      instance('objPlayerMouse', 40, 40),
      instance('objSpecificWeapon', 40, 40, { init: { image_index: 1 } }),
    ]),
    PROFILES[0],
  );
  sim.pickup();
  assert.equal(sim.player.ammo, 6);
  sim.player.fireTimer = 0;
  sim.attack();
  assert.equal(sim.player.ammo, 5);
  assert.equal(sim.bullets.length, 8);
  sim.player.ammo = 0;
  sim.player.fireTimer = 0;
  sim.attack();
  assert.equal(sim.bullets.length, 8);
});
test('Thrown blunt weapon stuns, execution kills, dropped ammo persists', () => {
  const sim = new Simulation(
    manifest,
    fixture([
      instance('objPlayerMouse', 40, 40),
      instance('objEnemy', 63, 40, { sprite: 'sprEWalkUnarmed' }),
      instance('objSpecificWeapon', 40, 40, { init: { image_index: 4 } }),
    ]),
    PROFILES[0],
  );
  sim.pickup();
  sim.player.angle = 0;
  sim.throwWeapon();
  sim.updateBullets(0.05);
  assert.ok(sim.enemies[0].stun > 0);
  assert.equal(sim.enemies[0].alive, true);
  assert.equal(sim.player.weapon.id, -1);
  sim.execute();
  assert.equal(sim.kills, 1);
  assert.equal(sim.enemies[0].alive, false);
  assert.ok(sim.score >= 600);
  sim.checkClear();
  assert.equal(sim.cleared, true);
});
test('Walls block enemy vision and projectiles', () => {
  const sim = new Simulation(
    manifest,
    fixture([
      instance('objPlayerMouse', 40, 40),
      instance('objEnemy', 100, 40),
      instance('objWallHeavyV', 70, 16, { scaleY: 10 }),
    ]),
    PROFILES[0],
  );
  assert.equal(sim.lineBlocked(sim.player, sim.enemies[0]), true);
  sim.enemies[0].angle = Math.PI;
  for (let i = 0; i < 100; i++) sim.update(1 / 60, empty);
  assert.equal(sim.player.alive, true);
});
test('A door hit knocks down a nearby enemy', () => {
  const sim = new Simulation(
    manifest,
    fixture([
      instance('objPlayerMouse', 40, 40),
      instance('objDoorV', 52, 35),
      instance('objEnemy', 65, 40, { sprite: 'sprEWalkUnarmed' }),
    ]),
    PROFILES[0],
  );
  sim.move(sim.player, 5, 0, 1 / 60);
  assert.ok(sim.doors[0].open > 0);
  assert.ok(sim.enemies[0].stun > 0);
});
test('Disarm modifier steals a gun without duplicating it on the ground', () => {
  const sim = new Simulation(
    manifest,
    fixture([instance('objPlayerMouse', 40, 40), instance('objEnemy', 60, 40)]),
    PROFILES.find((p) => p.id === 'steal'),
  );
  sim.player.angle = 0;
  sim.player.fireTimer = 0;
  sim.attack();
  assert.equal(sim.player.weapon.id, 0);
  assert.equal(sim.player.ammo, 24);
  assert.ok(sim.enemies[0].stun > 0);
  assert.equal(sim.items.filter((i) => !i.taken).length, 0);
});
test('Navigation finds a route around walls', () => {
  const nav = new Navigation(
    120,
    120,
    (x, y) => x > 45 && x < 75 && y < 80,
    10,
  );
  const path = nav.path({ x: 20, y: 20 }, { x: 100, y: 20 });
  assert.ok(path.some((p) => p.y >= 85));
});
test('Every campaign room and declared asset exists', () => {
  const ids = ['rmSequence1', ...CHAPTERS.flatMap((c) => c.rooms)];
  assert.deepEqual(new Set(manifest.rooms.map((r) => r.id)), new Set(ids));
  for (const r of manifest.rooms) {
    const data = raw(r.id);
    assert.equal(data.id, r.id);
    assert.equal(data.entities.length, r.entities);
  }
  for (const s of Object.values(manifest.sprites))
    assert.ok(existsSync(new URL('..' + s.url, import.meta.url)), s.url);
});
test('All campaign combat maps construct a simulation with valid spawn and finite collision geometry', () => {
  for (const r of manifest.rooms.filter((r) => r.enemies > 0)) {
    const sim = new Simulation(manifest, raw(r.id), PROFILES[0]);
    assert.ok(Number.isFinite(sim.player.x), r.id);
    assert.equal(
      sim.blocked(sim.player.x, sim.player.y, 7, false),
      false,
      r.id + ' spawn',
    );
    assert.ok(sim.total > 0, r.id);
    for (const b of sim.staticBoxes)
      assert.ok([b.x, b.y, b.w, b.h].every(Number.isFinite), r.id);
  }
});
test('Custom sheets preserve source canvas size, frame count, and origin', () => {
  const skins = JSON.parse(
    readFileSync(new URL('../assets/custom/skins.json', import.meta.url)),
  );
  const pairs = {
    hero: 'sprPWalkUnarmed',
    police: 'sprPoliceWalkM16',
    policeUnarmed: 'sprPoliceWalkUnarmed',
    punch: 'sprPAttackPunch',
    corpse: 'sprPoliceBackMachinegun',
    desk: 'sprAndersDesk',
    car: 'sprPlayerCar',
  };
  for (const [key, sprite] of Object.entries(pairs)) {
    const s = skins[key],
      m = manifest.sprites[sprite];
    const png = readFileSync(new URL('..' + s.url, import.meta.url));
    assert.equal(png.readUInt32BE(16), m.width * m.frames, key + ' width');
    assert.equal(png.readUInt32BE(20), m.height, key + ' height');
    assert.equal(s.frames, m.frames, key + ' frames');
    assert.equal(s.originX, m.originX, key + ' originX');
    assert.equal(s.originY, m.originY, key + ' originY');
  }
  const floor = readFileSync(new URL('..' + skins.floor.url, import.meta.url));
  assert.equal(floor.readUInt32BE(16), 816);
  assert.equal(floor.readUInt32BE(20), 368);
});
test('All retained textures, sounds and fonts remain byte-identical to the original game', () => {
  const baseline = JSON.parse(
    readFileSync(new URL('./fixtures/campaign-baseline.json', import.meta.url)),
  );
  for (const [url, expected] of Object.entries(baseline.assets)) {
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL('..' + url, import.meta.url)))
        .digest('hex'),
      expected,
      url,
    );
  }
});
