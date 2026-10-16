import { clamp } from './physics.js';

export const PLAYER_DIRECTIONS = ['down', 'up', 'left', 'right'];

export function directionForVector(x, y, fallback = 'down') {
  if (Math.hypot(x, y) < 0.001) return fallback;
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left';
  return y > 0 ? 'down' : 'up';
}

function attackProgress(player) {
  const duration = player.attackDuration ?? 0.18;
  return clamp(1 - player.attack / duration, 0, 1);
}

function facingDirection(player, attacking) {
  if (!attacking) return player.facing ?? 'down';
  const angle = player.weapon.gun
    ? player.angle
    : (player.attackAngle ?? player.angle);
  return directionForVector(Math.cos(angle), Math.sin(angle));
}

export function playerPose(player) {
  const attacking = player.alive && player.attack > 0;
  const melee = attacking && !player.weapon.gun;
  let frame = 0;
  if (player.alive) frame = Math.floor(player.frame) % 8;
  if (melee) frame = Math.min(6, Math.floor(attackProgress(player) * 7));
  return {
    key: melee ? 'punchDirectional' : 'heroDirectional',
    row: Math.max(
      0,
      PLAYER_DIRECTIONS.indexOf(facingDirection(player, attacking)),
    ),
    frame,
    angle: 0,
  };
}

// Fixed grips in the body's four directions; each weapon has its own stroke.
export const MELEE_ANIMATIONS = {
  Club: ['swing', 2.0, 0.3],
  Pipe: ['swing', 1.7, 0.35],
  Bat: ['swing', 2.3, 0.42],
  Knife: ['thrust', 7, 0.1],
  Sword: ['swing', 2.6, 0.25],
  Pool: ['thrust', 12, 0.15],
  PoolBroke: ['thrust', 9, 0.2],
  Axe: ['overhead', 2.2, 0.5],
  NightStick: ['swing', 1.8, 0.22],
  Crowbar: ['swing', 2.1, 0.33],
  Machete: ['swing', 2.5, 0.18],
  SledgeHammer: ['overhead', 2.7, 0.6],
  Trophy: ['overhead', 1.5, 0.4],
  Drill: ['thrust', 6, 0.05],
  Pan: ['swing', 1.6, 0.38],
  BoilingPot: ['thrust', 5, 0.45],
  Pot: ['overhead', 1.3, 0.48],
  Bag: ['thrust', 4, 0.28],
};
const grips = {
  Club: [16, 23],
  Pipe: [23, 23],
  Bat: [22, 24],
  Knife: [27, 23],
  Sword: [17, 25],
  Pool: [12, 24],
  PoolBroke: [21, 23],
  Axe: [18, 25],
  NightStick: [25, 26],
  Crowbar: [19, 26],
  Machete: [20, 26],
  SledgeHammer: [19, 24],
  Trophy: [27, 24],
  Drill: [25, 25],
  Pan: [23, 25],
  BoilingPot: [25, 25],
  Pot: [25, 25],
  Bag: [21, 25],
};
export function heldWeaponPose(player) {
  const w = player.weapon;
  if (w.id < 0) return null;
  if (w.gun)
    return {
      x: Math.cos(player.angle) * 9,
      y: Math.sin(player.angle) * 9,
      angle: player.angle,
      scale: 0.65,
    };
  const attacking = player.attack > 0 && !w.throwOnly;
  const direction = facingDirection(player, attacking);
  const base = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[
    direction
  ];
  const [stroke, extent, rest] = MELEE_ANIMATIONS[w.sprite] ?? [
    'thrust',
    3,
    0.2,
  ];
  const phase = attacking ? attackProgress(player) : 0;
  // Wind-up, contact, return; no cursor-driven orbit while holding a melee weapon.
  const contact = attacking ? Math.sin(Math.PI * phase) : 0;
  const sweep = attacking ? Math.sin(2 * Math.PI * phase) : 0;
  const reach = 5 + (stroke === 'thrust' ? contact * extent : contact * 3);
  let rotation = 0;
  if (stroke === 'swing') rotation = sweep * extent;
  if (stroke === 'overhead') rotation = -contact * extent;
  const angle = base + rest + rotation;
  return {
    x: Math.cos(base) * reach - Math.sin(base) * 4,
    y:
      2 +
      Math.sin(base) * reach +
      Math.cos(base) * 4 -
      (stroke === 'overhead' ? contact * 5 : 0),
    angle,
    stroke,
    scale: 0.75,
    origin: grips[w.sprite] ?? [30, 24],
  };
}
