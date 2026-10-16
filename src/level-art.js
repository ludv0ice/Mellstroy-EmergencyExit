export function drawLevel(ctx, room) {
  if (!room.floor) return;
  const { cell, grid, palette, zoneCount } = room.floor;
  const [base, light, accent, pattern] = palette;
  ctx.fillStyle = '#080d15';
  ctx.fillRect(0, 0, room.width, room.height);
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === ' ') continue;
      const zone = parseInt(grid[y][x], 36);
      const px = x * cell,
        py = y * cell;
      ctx.fillStyle = zone === zoneCount ? '#192c37' : base;
      ctx.fillRect(px, py, cell, cell);
      ctx.fillStyle = light;
      ctx.globalAlpha = 0.25;
      if (pattern === 'wood') {
        for (let i = 0; i < cell; i += 8) ctx.fillRect(px, py + i, cell, 1);
        ctx.fillRect(px + (y % 2) * 16, py, 1, cell);
      } else if (pattern === 'dance' || pattern === 'checker') {
        if ((x + y + zone) % 2)
          ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
        ctx.fillRect(px, py, cell, 1);
      } else if (pattern === 'stripe') {
        ctx.fillRect(px, py, cell, 1);
        if (x % 3 === 0) ctx.fillRect(px + 2, py + 3, 2, cell - 6);
      } else {
        ctx.strokeStyle = light;
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
        ctx.fillRect(px + 7, py + 7, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
  }
  for (const zone of room.zones) {
    ctx.strokeStyle = accent + '35';
    ctx.lineWidth = 1;
    ctx.strokeRect(zone.x + 9, zone.y + 9, zone.w - 18, zone.h - 18);
    ctx.fillStyle = accent + '70';
    ctx.font = '7px Exo2, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(zone.name, zone.x + 12, zone.y + 20, zone.w - 24);
    if (pattern === 'carpet' || pattern === 'stone') {
      ctx.strokeStyle = accent + '20';
      ctx.strokeRect(zone.x + 16, zone.y + 32, zone.w - 32, zone.h - 48);
    }
  }
  for (const entity of room.entities.filter((e) => e.isWall && e.bounds)) {
    const r = entity.bounds;
    ctx.fillStyle = '#0008';
    ctx.fillRect(r.x + 3, r.y + 4, r.w + 2, r.h + 2);
    ctx.fillStyle = '#52616e';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.65;
    if (r.w > r.h) ctx.fillRect(r.x, r.y, r.w, 1);
    else ctx.fillRect(r.x, r.y, 1, r.h);
    ctx.globalAlpha = 1;
  }
}
