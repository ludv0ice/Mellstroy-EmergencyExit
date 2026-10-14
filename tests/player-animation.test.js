import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  playerPose,
  heldWeaponPose,
  MELEE_ANIMATIONS,
  directionForVector,
  PLAYER_DIRECTIONS,
} from '../src/player-animation.js';
import { Simulation } from '../src/simulation.js';
import { PROFILES } from '../src/campaign.js';
import { UNARMED, WEAPONS } from '../src/weapons.js';

const manifest = JSON.parse(
  readFileSync(new URL('../public/assets/manifest.json', import.meta.url)),
);
const create = () =>
  new Simulation(
    manifest,
    {
      id: 'fixture',
      width: 600,
      height: 400,
      entities: [
        {
          kind: 'player',
          name: 'objPlayerMouse',
          sprite: 'sprPWalkUnarmed',
          x: 300,
          y: 200,
        },
      ],
      tiles: [],
    },
    PROFILES[0],
  );

test('Moving the cursor never rotates or reorients an idle character', () => {
  const sim = create();
  for (let i = 0; i < 32; i++) {
    const angle = (i * Math.PI) / 16;
    sim.update(1 / 60, {
      moveX: 0,
      moveY: 0,
      aim: { x: 300 + Math.cos(angle) * 100, y: 200 + Math.sin(angle) * 100 },
    });
    const pose = playerPose(sim.player);
    assert.equal(sim.player.facing, 'down');
    assert.equal(pose.row, 0);
    assert.equal(pose.angle, 0);
    assert.equal(sim.player.x, 300);
    assert.equal(sim.player.y, 200);
  }
});

test('Four movement directions select upright walking rows independently of the cursor', () => {
  for (const [direction, x, y] of [
    ['down', 0, 1],
    ['up', 0, -1],
    ['left', -1, 0],
    ['right', 1, 0],
  ]) {
    const sim = create();
    for (let i = 0; i < 12; i++)
      sim.update(1 / 60, { moveX: x, moveY: y, aim: { x: 450, y: 350 } });
    assert.equal(sim.player.facing, direction);
    assert.ok(sim.player.frame > 0);
    const pose = playerPose(sim.player);
    assert.equal(pose.row, PLAYER_DIRECTIONS.indexOf(direction));
    assert.equal(pose.angle, 0);
    for (let i = 0; i < 20; i++)
      sim.update(1 / 60, { moveX: 0, moveY: 0, aim: { x: 100, y: 100 } });
    assert.equal(sim.player.facing, direction);
    assert.equal(sim.player.frame, 0);
  }
});

test('Punch and melee attacks select seven directional poses without turning the body image', () => {
  for (const [direction, angle] of [
    ['down', Math.PI / 2],
    ['up', -Math.PI / 2],
    ['left', Math.PI],
    ['right', 0],
  ]) {
    for (const weapon of [UNARMED, WEAPONS[2]]) {
      const player = {
        alive: true,
        facing: 'down',
        angle,
        weapon,
        attack: 0.18,
        frame: 0,
      };
      const frames = [];
      for (let i = 0; i < 7; i++) {
        player.attack = 0.18 * (1 - (i + 0.1) / 7);
        const pose = playerPose(player);
        assert.equal(pose.key, 'punchDirectional');
        assert.equal(pose.row, PLAYER_DIRECTIONS.indexOf(direction));
        assert.equal(pose.angle, 0);
        frames.push(pose.frame);
      }
      assert.deepEqual(frames, [0, 1, 2, 3, 4, 5, 6]);
      player.attack = 0;
      assert.equal(playerPose(player).row, 0);
    }
  }
});

test('Shooting and death preserve an upright sprite while aim remains free', () => {
  const player = {
    alive: true,
    facing: 'left',
    angle: -Math.PI / 2,
    weapon: WEAPONS[0],
    attack: 0.1,
    frame: 0,
  };
  assert.equal(playerPose(player).row, 1);
  assert.equal(playerPose(player).angle, 0);
  player.attack = 0;
  assert.equal(playerPose(player).row, 2);
  player.alive = false;
  player.angle = 1.7;
  assert.equal(playerPose(player).row, 2);
  assert.equal(playerPose(player).angle, 0);
});

test('Zero motion keeps the last facing and directional atlases retain fixed anchors', () => {
  assert.equal(directionForVector(0, 0, 'left'), 'left');
  const skins = JSON.parse(
    readFileSync(
      new URL('../public/assets/custom/skins.json', import.meta.url),
    ),
  );
  for (const key of ['heroDirectional', 'punchDirectional']) {
    const skin = skins[key],
      png = readFileSync(new URL('../public' + skin.url, import.meta.url));
    assert.equal(png.readUInt32BE(16), skin.width * skin.frames);
    assert.equal(png.readUInt32BE(20), skin.height * skin.rows);
    assert.deepEqual(skin.directions, PLAYER_DIRECTIONS);
    assert.equal(skin.originX, 30);
    assert.equal(skin.originY, 30);
  }
});

test('All melee weapons have distinct fixed grips and animated attacks in four directions', () => {
  const signatures = new Set();
  for (const weapon of WEAPONS.filter(w => !w.gun && !w.throwOnly)) {
    assert.ok(MELEE_ANIMATIONS[weapon.sprite]);
    const trajectory = [];
    for (const facing of PLAYER_DIRECTIONS) {
      const p = {weapon, facing, angle:0, attack:0, attackDuration:0.3, attackAngle:0};
      const idle = heldWeaponPose(p);
      for(let i=0;i<16;i++) {p.angle=i*Math.PI/8;assert.deepEqual(heldWeaponPose(p),idle);}
      for(let i=0;i<7;i++) {p.attack=0.3*(1-(i+0.1)/7);trajectory.push(heldWeaponPose(p));}
      assert.notDeepEqual(trajectory.at(-4),idle);
      const frozen = heldWeaponPose(p);p.angle+=1;assert.deepEqual(heldWeaponPose(p),frozen);
    }
    signatures.add(JSON.stringify(trajectory));
  }
  assert.equal(signatures.size,18);
});
