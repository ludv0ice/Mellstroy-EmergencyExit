export const PLAYER_DIRECTIONS = ['down', 'up', 'left', 'right'];

export function directionForVector(x, y, fallback = 'down') {
  if (Math.hypot(x, y) < 0.001) return fallback;
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left';
  return y > 0 ? 'down' : 'up';
}

export function playerPose(player) {
  const attacking = player.alive && player.attack > 0;
  const direction = attacking
    ? directionForVector(Math.cos(player.angle), Math.sin(player.angle))
    : (player.facing ?? 'down');
  const melee = attacking && !player.weapon.gun;
  return {
    key: melee ? 'punchDirectional' : 'heroDirectional',
    row: Math.max(0, PLAYER_DIRECTIONS.indexOf(direction)),
    frame: melee
      ? Math.max(0, Math.min(6, Math.floor((1 - player.attack / 0.18) * 7)))
      : player.alive
        ? Math.floor(player.frame) % 8
        : 0,
    angle: 0,
  };
}
