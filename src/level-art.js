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
    for (let yy = 0; yy < 2; yy++)
      for (let xx = 0; xx < 2; xx++)
        if ((x / 16 + y / 16 + xx + yy) % 2)
          ctx.fillRect(x + xx * 16 + 1, y + yy * 16 + 1, 14, 14);
    if (style === 'dance' && (x / cell + y / cell) % 4 === 0) {
      ctx.fillStyle = ['#a75e86', '#5a9298', '#918152'][index % 3];
      ctx.fillRect(x + 4, y + 4, 8, 8);
    }
  } else if (style === 'carpet') {
    ctx.globalAlpha = 0.5;
    for (let i = 3; i < cell; i += 8) ctx.fillRect(x + i, y + i, 2, 2);
    ctx.globalAlpha = 1;
  } else if (style === 'garden') {
    for (let i = 0; i < 4; i++)
      ctx.fillRect(x + ((i * 11 + y) % 29), y + ((i * 7 + x) % 29), 2, 3);
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
  if (!room.floor) return;
  const { cell, grid, palette } = room.floor;
  const accent = palette[2];
  ctx.fillStyle = '#111a25';
  ctx.fillRect(0, 0, room.width, room.height);
  ctx.fillStyle = '#1a2630';
  for (let y = 0; y < room.height; y += 16)
    for (let x = (y % 32) / 2; x < room.width; x += 32)
      ctx.fillRect(x, y, 1, 1);
  for (let y = 0; y < grid.length; y++)
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === ' ') continue;
      const index = parseInt(grid[y][x], 36);
      floorTile(
        ctx,
        x * cell,
        y * cell,
        cell,
        room.zones[index]?.style ?? 'tile',
        index,
      );
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
    if (index % 2 === 0)
      ctx.fillRect(zone.x + 9, zone.y + zone.h - 4, zone.w - 18, 2);
  }
  for (const entity of room.entities.filter((e) => e.isWall && e.bounds)) {
    const r = entity.bounds;
    ctx.fillStyle = '#0008';
    ctx.fillRect(r.x + 3, r.y + 5, r.w + 2, r.h + 2);
    ctx.fillStyle = '#243340';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = '#afad9b';
    if (r.w > r.h) ctx.fillRect(r.x, r.y, r.w, 2);
    else ctx.fillRect(r.x, r.y, 2, r.h);
    ctx.fillStyle = accent;
    if ((r.x + r.y) % 128 === 0) {
      if (r.w > r.h) ctx.fillRect(r.x + 5, r.y + 2, Math.min(22, r.w - 5), 2);
      else ctx.fillRect(r.x + 2, r.y + 5, 2, Math.min(22, r.h - 5));
    }
  }
}

export function drawTransition(ctx, exit, active, unlocked) {
  ctx.save();
  ctx.translate(Math.round(exit.x), Math.round(exit.y));
  const color = active && unlocked ? '#8de2c3' : '#cbac88';
  ctx.fillStyle = '#17232e';
  ctx.fillRect(-23, -25, 46, 50);
  if (exit.transition === 'stairs') {
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
  } else {
    ctx.fillStyle = '#b5bbb4';
    ctx.fillRect(-23, -25, 46, 5);
    ctx.fillRect(-23, -25, 5, 50);
    ctx.fillRect(18, -25, 5, 50);
    ctx.fillStyle = unlocked ? '#25483e' : '#70524c';
    ctx.fillRect(-17, -19, 34, 42);
    ctx.strokeStyle = '#182a30';
    ctx.strokeRect(-13, -15, 26, 32);
    ctx.fillStyle = '#e1ca8c';
    ctx.fillRect(9, 0, 3, 5);
  }
  ctx.fillStyle = color;
  ctx.fillRect(-19, -33, 38, 7);
  ctx.fillStyle = '#14232a';
  ctx.font = 'bold 6px Exo2, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(exit.transition === 'stairs' ? 'ЛЕСТНИЦА' : 'ВЫХОД', 0, -27);
  if (active && unlocked) {
    ctx.fillStyle = '#9bf2d1';
    ctx.font = 'bold 8px Exo2, sans-serif';
    ctx.fillText('E', 0, 36);
  }
  ctx.restore();
}
