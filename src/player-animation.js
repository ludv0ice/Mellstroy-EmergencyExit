import { clamp } from './physics.js';
export const PLAYER_DIRECTIONS = ['down', 'up', 'left', 'right'];
export function directionForVector(x, y, fallback = 'down') {
  if (Math.hypot(x, y) < 0.001) {
    return fallback;
  }
  if (Math.abs(x) > Math.abs(y)) {
    if (x > 0) {
      return 'right';
    } else {
      return 'left';
    }
  }
  if (y > 0) {
    return 'down';
  } else {
    return 'up';
  }
}
function attackProgress(player) {
  const duration = player.attackDuration ?? 0.18;
  return clamp(1 - player.attack / duration, 0, 1);
}
function facingDirection(player, attacking) {
  if (!attacking) {
    return player.facing ?? 'down';
  }
  const angle = player.weapon.gun ? player.angle : (player.attackAngle ?? player.angle);
  return directionForVector(Math.cos(angle), Math.sin(angle));
}
export function playerPose(player) {
  const attacking = player.alive && player.attack > 0;
  const melee = attacking && !player.weapon.gun;
  let frame = 0;
  if (player.alive) {
    frame = Math.floor(player.frame) % 8;
  }
  if (melee) {
    frame = Math.min(6, Math.floor(attackProgress(player) * 7));
  }
  return {
    key: melee ? 'punchDirectional' : 'heroDirectional',
    row: Math.max(0, PLAYER_DIRECTIONS.indexOf(facingDirection(player, attacking))),
    frame,
    angle: 0,
  };
}
export const MELEE_ANIMATIONS = {
  Club: {
    stroke: 'swing',
    extent: 2,
    rest: 0.3,
  },
  Pipe: {
    stroke: 'swing',
    extent: 1.7,
    rest: 0.35,
  },
  Bat: {
    stroke: 'swing',
    extent: 2.3,
    rest: 0.42,
  },
  Knife: {
    stroke: 'thrust',
    extent: 7,
    rest: 0.1,
  },
  Sword: {
    stroke: 'swing',
    extent: 2.6,
    rest: 0.25,
  },
  Pool: {
    stroke: 'thrust',
    extent: 12,
    rest: 0.15,
  },
  PoolBroke: {
    stroke: 'thrust',
    extent: 9,
    rest: 0.2,
  },
  Axe: {
    stroke: 'overhead',
    extent: 2.2,
    rest: 0.5,
  },
  NightStick: {
    stroke: 'swing',
    extent: 1.8,
    rest: 0.22,
  },
  Crowbar: {
    stroke: 'swing',
    extent: 2.1,
    rest: 0.33,
  },
  Machete: {
    stroke: 'swing',
    extent: 2.5,
    rest: 0.18,
  },
  SledgeHammer: {
    stroke: 'overhead',
    extent: 2.7,
    rest: 0.6,
  },
  Trophy: {
    stroke: 'overhead',
    extent: 1.5,
    rest: 0.4,
  },
  Drill: {
    stroke: 'thrust',
    extent: 6,
    rest: 0.05,
  },
  Pan: {
    stroke: 'swing',
    extent: 1.6,
    rest: 0.38,
  },
  BoilingPot: {
    stroke: 'thrust',
    extent: 5,
    rest: 0.45,
  },
  Pot: {
    stroke: 'overhead',
    extent: 1.3,
    rest: 0.48,
  },
  Bag: {
    stroke: 'thrust',
    extent: 4,
    rest: 0.28,
  },
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
  const weapon = player.weapon;
  if (weapon.id < 0) {
    return null;
  }
  if (weapon.gun) {
    return {
      x: Math.cos(player.angle) * 9,
      y: Math.sin(player.angle) * 9,
      angle: player.angle,
      scale: 0.65,
    };
  }
  const attacking = player.attack > 0 && !weapon.throwOnly;
  const direction = facingDirection(player, attacking);
  const base = {
    right: 0,
    down: Math.PI / 2,
    left: Math.PI,
    up: -Math.PI / 2,
  }[direction];
  const { stroke, extent, rest } = MELEE_ANIMATIONS[weapon.sprite] ?? {
    stroke: 'thrust',
    extent: 3,
    rest: 0.2,
  };
  const phase = attacking ? attackProgress(player) : 0;
  const contact = attacking ? Math.sin(Math.PI * phase) : 0;
  const sweep = attacking ? Math.sin(2 * Math.PI * phase) : 0;
  const reach = 5 + (stroke === 'thrust' ? contact * extent : contact * 3);
  let rotation = 0;
  if (stroke === 'swing') {
    rotation = sweep * extent;
  }
  if (stroke === 'overhead') {
    rotation = -contact * extent;
  }
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
    origin: grips[weapon.sprite] ?? [30, 24],
  };
}
