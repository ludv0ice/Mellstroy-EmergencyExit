const defaults = {
  kind: 'decor',
  scaleX: 1,
  scaleY: 1,
  angle: 0,
  frame: 0,
  depth: 0,
  visible: true,
  solid: false,
  isWall: false,
  furniture: false,
  glass: false,
  broken: false,
};
export function buildRoom(manifest, raw) {
  const entities = raw.entities.map((entity, id) => ({
    ...defaults,
    id,
    ...entity,
    solid: entity.solid || /^objWallSoft[HV]$/.test(entity.name),
    isWall: entity.isWall || /^objWallSoft[HV]$/.test(entity.name),
    init: {
      ...entity.init,
    },
    meta: manifest.sprites[entity.sprite],
    mask: manifest.sprites[entity.mask],
  }));
  return {
    ...raw,
    entities,
  };
}
export function connectsTo(exit, room) {
  return exit.init.nextroom === room || !!exit.targets?.includes(room);
}
export function rectFor(entity) {
  if (entity.bounds) {
    return {
      ...entity.bounds,
      entity,
    };
  }
  const metadata = entity.mask ?? entity.meta;
  if (!metadata) {
    return null;
  }
  const bounds = metadata.bbox;
  const originX = metadata.originX;
  const originY = metadata.originY;
  const corners = [
    [bounds[0] - originX, bounds[1] - originY],
    [bounds[2] - originX + 1, bounds[1] - originY],
    [bounds[2] - originX + 1, bounds[3] - originY + 1],
    [bounds[0] - originX, bounds[3] - originY + 1],
  ];
  const cosine = Math.cos(entity.angle);
  const sine = Math.sin(entity.angle);
  const points = corners.map(([x, y]) => [
    entity.x + x * entity.scaleX * cosine - y * entity.scaleY * sine,
    entity.y + x * entity.scaleX * sine + y * entity.scaleY * cosine,
  ]);
  const left = Math.min(...points.map((point) => point[0]));
  const top = Math.min(...points.map((point) => point[1]));
  const right = Math.max(...points.map((point) => point[0]));
  const bottom = Math.max(...points.map((point) => point[1]));
  return {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
    entity,
  };
}
const FLOORS = {
  tile: ['#567377', '#6f9090'],
  wood: ['#846247', '#a7835c'],
  checker: ['#9eb7a5', '#46676b'],
  carpet: ['#70465b', '#81546b'],
  marble: ['#789599', '#9cb1af'],
  concrete: ['#57666c', '#63757b'],
  stripe: ['#555c55', '#79816c'],
  grid: ['#365969', '#4a7182'],
  dance: ['#553d68', '#77517e'],
  stone: ['#757c73', '#949b88'],
  garden: ['#335b4c', '#49705a'],
  platform: ['#636e76', '#7e8990'],
};
function floorTile(ctx, x, y, cell, style, index) {
  const [base, light] = FLOORS[style] ?? FLOORS.tile;
  ctx.fillStyle = base;
  ctx.fillRect(x, y, cell, cell);
  ctx.fillStyle = light;
  if (style === 'wood') {
    for (let offset = 0; offset < cell; offset += 8) {
      ctx.fillRect(x, y + offset, cell, 1);
      ctx.fillRect(x + ((y / cell + offset) % 3) * 10, y + offset, 1, 8);
    }
  } else if (style === 'checker' || style === 'dance') {
    for (let yy = 0; yy < 2; yy++) {
      for (let xx = 0; xx < 2; xx++) {
        if ((x / 16 + y / 16 + xx + yy) % 2) {
          ctx.fillRect(x + xx * 16 + 1, y + yy * 16 + 1, 14, 14);
        }
      }
    }
    if (style === 'dance' && (x / cell + y / cell) % 4 === 0) {
      ctx.fillStyle = ['#a75e86', '#5a9298', '#918152'][index % 3];
      ctx.fillRect(x + 4, y + 4, 8, 8);
    }
  } else if (style === 'carpet') {
    ctx.globalAlpha = 0.5;
    for (let i = 3; i < cell; i += 8) {
      ctx.fillRect(x + i, y + i, 2, 2);
    }
    ctx.globalAlpha = 1;
  } else if (style === 'garden') {
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(x + ((i * 11 + y) % 29), y + ((i * 7 + x) % 29), 2, 3);
    }
  } else {
    ctx.fillRect(x, y, cell, 1);
    ctx.fillRect(x, y, 1, cell);
    if (style === 'marble') {
      ctx.fillStyle = '#c1c7b54a';
      ctx.fillRect(x + (y % 23), y + 7, 1, 17);
    }
    if (style === 'stripe' && (x / cell) % 3 === 0) {
      ctx.fillStyle = '#d3b565';
      ctx.fillRect(x + 4, y + 4, 2, cell - 8);
    }
    if (style === 'platform') {
      ctx.fillStyle = '#dfb86b';
      ctx.fillRect(x + 3, y + 5, 3, 3);
      ctx.fillRect(x + 3, y + 13, 3, 3);
      ctx.fillRect(x + 3, y + 21, 3, 3);
    }
  }
}
export function drawLevel(ctx, room) {
  if (!room.floor) {
    return;
  }
  const { cell, grid, palette } = room.floor;
  const accent = palette[2];
  ctx.fillStyle = '#111a25';
  ctx.fillRect(0, 0, room.width, room.height);
  ctx.fillStyle = '#1a2630';
  for (let y = 0; y < room.height; y += 16) {
    for (let x = (y % 32) / 2; x < room.width; x += 32) {
      ctx.fillRect(x, y, 1, 1);
    }
  }
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === ' ') {
        continue;
      }
      const index = parseInt(grid[y][x], 36);
      floorTile(ctx, x * cell, y * cell, cell, room.zones[index]?.style ?? 'tile', index);
    }
  }
  for (const [index, zone] of room.zones.entries()) {
    if (['carpet', 'wood', 'marble'].includes(zone.style)) {
      ctx.fillStyle = zone.style === 'wood' ? '#6c4653' : '#3b5863';
      ctx.fillRect(zone.x + 24, zone.y + 36, zone.w - 48, zone.h - 60);
      ctx.strokeStyle = '#d1b78d88';
      ctx.lineWidth = 1;
      ctx.strokeRect(zone.x + 28, zone.y + 40, zone.w - 56, zone.h - 68);
    }
    if (zone.style === 'dance') {
      ctx.strokeStyle = '#d78dbf';
      ctx.lineWidth = 2;
      ctx.strokeRect(zone.x + 14, zone.y + 28, zone.w - 28, zone.h - 42);
    }
    ctx.fillStyle = '#111c28';
    ctx.fillRect(
      zone.x + 8,
      zone.y + 7,
      Math.min(zone.w - 16, zone.name.length * 5 + 12),
      13,
    );
    ctx.fillStyle = '#ecdbc3';
    ctx.font = 'bold 7px Exo2, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(zone.name, zone.x + 13, zone.y + 16, zone.w - 26);
    ctx.fillStyle = accent + '70';
    if (index % 2 === 0) {
      ctx.fillRect(zone.x + 9, zone.y + zone.h - 4, zone.w - 18, 2);
    }
  }
  for (const entity of room.entities.filter((e) => e.isWall && e.bounds)) {
    const bounds = entity.bounds;
    ctx.fillStyle = '#0008';
    ctx.fillRect(bounds.x + 3, bounds.y + 5, bounds.w + 2, bounds.h + 2);
    ctx.fillStyle = '#243340';
    ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
    ctx.fillStyle = '#afad9b';
    if (bounds.w > bounds.h) {
      ctx.fillRect(bounds.x, bounds.y, bounds.w, 2);
    } else {
      ctx.fillRect(bounds.x, bounds.y, 2, bounds.h);
    }
    ctx.fillStyle = accent;
    if ((bounds.x + bounds.y) % 128 === 0) {
      if (bounds.w > bounds.h) {
        ctx.fillRect(bounds.x + 5, bounds.y + 2, Math.min(22, bounds.w - 5), 2);
      } else {
        ctx.fillRect(bounds.x + 2, bounds.y + 5, 2, Math.min(22, bounds.h - 5));
      }
    }
  }
}
export function drawTransition(ctx, exit, active, unlocked) {
  ctx.save();
  ctx.translate(Math.round(exit.x), Math.round(exit.y));
  const color = active && unlocked ? '#8de2c3' : '#cbac88';
  if (exit.transition === 'stairs') {
    ctx.fillStyle = '#17232e';
    ctx.fillRect(-23, -25, 46, 50);
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i % 2 ? '#7d8991' : '#a4aaa5';
      ctx.fillRect(-17, -21 + i * 6, 34, 4);
      ctx.fillStyle = '#32434c';
      ctx.fillRect(-17, -17 + i * 6, 34, 2);
    }
    ctx.fillStyle = color;
    ctx.fillRect(-22, -24, 3, 48);
    ctx.fillRect(19, -24, 3, 48);
    ctx.fillStyle = '#182d3b';
    ctx.fillRect(-5, -10, 10, 21);
    ctx.fillStyle = color;
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(exit.backward ? '↓' : '↑', 0, 5);
    ctx.fillStyle = color;
    ctx.fillRect(-19, -33, 38, 7);
    ctx.fillStyle = '#14232a';
    ctx.font = 'bold 6px Exo2, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ЛЕСТНИЦА', 0, -27);
  } else {
    ctx.translate(0, 18);
    ctx.fillStyle = '#10232e';
    ctx.fillRect(-23, -7, 46, 14);
    ctx.fillStyle = '#82a9b7';
    ctx.fillRect(-24, -8, 6, 16);
    ctx.fillRect(18, -8, 6, 16);
    ctx.fillStyle = '#235b7d';
    ctx.fillRect(-18, -5, 36, 10);
    ctx.fillStyle = '#4ec4ed';
    ctx.fillRect(-18, -5, 36, 2);
    ctx.fillStyle = '#357eaa';
    ctx.fillRect(-18, 3, 36, 2);
    ctx.fillStyle = '#d8e8df';
    ctx.fillRect(11, -3, 2, 6);
    ctx.fillStyle = unlocked ? '#9be7a4' : '#ecb86c';
    ctx.fillRect(-22, -3, 2, 6);
  }
  if (active && unlocked && exit.transition === 'stairs') {
    ctx.fillStyle = '#9bf2d1';
    ctx.font = 'bold 8px Exo2, sans-serif';
    ctx.fillText('E', 0, 36);
  }
  ctx.restore();
}
