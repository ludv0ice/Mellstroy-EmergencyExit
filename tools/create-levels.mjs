import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { CHAPTERS } from '../src/campaign.js';
import { LEVEL_DESIGNS } from './level-designs.mjs';
import { INTERIORS } from './level-interiors.mjs';

const directory = new URL('../assets/rooms/', import.meta.url);
const manifestFile = new URL('../assets/manifest.json', import.meta.url);
const manifest = JSON.parse(readFileSync(manifestFile));
const cell = 32;
const themes = {
  studio: ['#324958', '#4f7486', '#7bd7ea', 'grid'],
  station: ['#263343', '#394d5b', '#f0c87a', 'stripe'],
  residential: ['#75544d', '#a17f68', '#ffb1a2', 'wood'],
  industrial: ['#273834', '#3b5045', '#c6d77a', 'stripe'],
  hotel: ['#26363f', '#3d5662', '#c49beb', 'carpet'],
  office: ['#25323c', '#3b4a53', '#8cc8bb', 'grid'],
  security: ['#24323f', '#3a4755', '#77bfe0', 'grid'],
  club: ['#593756', '#86516c', '#f381cf', 'dance'],
  garden: ['#263c38', '#3c5342', '#8bd5a7', 'stone'],
  food: ['#5e7570', '#afbb9b', '#f2b87b', 'checker'],
  arcade: ['#252a46', '#3d4164', '#a19af6', 'dance'],
};
const rooms = [];
for (let number = 0; number < LEVEL_DESIGNS.length; number++) {
  const [id, title, theme, coordinates, landmark] = LEVEL_DESIGNS[number];
  const interiors = INTERIORS[id].split(';').map((area) => area.split(':'));
  const zones = coordinates.split(';').map((record, i) => {
    const [x, y, w, h] = record.split(',').map(Number);
    return {
      x,
      y,
      w,
      h,
      name: interiors[i][0].replaceAll('_', ' '),
      style: interiors[i][1],
      furnishing: 'spr' + interiors[i][2],
    };
  });
  const cols = Math.max(...zones.map((z) => z.x + z.w)) + 2;
  const rows = Math.max(...zones.map((z) => z.y + z.h)) + 2;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(-1));
  const centers = zones.map((z) => ({
    x: Math.floor(z.x + z.w / 2),
    y: Math.floor(z.y + z.h / 2),
  }));
  const doors = [];
  zones.forEach((zone, i) => {
    for (let y = zone.y; y < zone.y + zone.h; y++)
      for (let x = zone.x; x < zone.x + zone.w; x++) grid[y][x] = i;
  });
  const candidates = [];
  for (let a = 0; a < zones.length; a++)
    for (let b = a + 1; b < zones.length; b++) {
      const first = zones[a],
        second = zones[b];
      const overlapX =
        Math.min(first.x + first.w, second.x + second.w) -
        Math.max(first.x, second.x);
      const overlapY =
        Math.min(first.y + first.h, second.y + second.h) -
        Math.max(first.y, second.y);
      if (overlapY > 0) {
        const left = first.x < second.x ? first : second;
        const right = left === first ? second : first;
        const y = Math.floor(Math.max(first.y, second.y) + overlapY / 2);
        candidates.push({
          a,
          b,
          gap: right.x - left.x - left.w,
          from: { x: left.x + left.w - 1, y },
          to: { x: right.x, y },
        });
      } else if (overlapX > 0) {
        const top = first.y < second.y ? first : second;
        const bottom = top === first ? second : first;
        const x = Math.floor(Math.max(first.x, second.x) + overlapX / 2);
        candidates.push({
          a,
          b,
          gap: bottom.y - top.y - top.h,
          from: { x, y: top.y + top.h - 1 },
          to: { x, y: bottom.y },
        });
      }
    }
  const groups = zones.map((_, i) => i);
  const root = (i) => (groups[i] === i ? i : (groups[i] = root(groups[i])));
  for (const edge of candidates.sort((a, b) => a.gap - b.gap)) {
    if (edge.gap > 1 && root(edge.a) === root(edge.b)) continue;
    groups[root(edge.a)] = root(edge.b);
    let { x, y } = edge.from;
    while (x !== edge.to.x || y !== edge.to.y) {
      x += Math.sign(edge.to.x - x);
      y += Math.sign(edge.to.y - y);
      if (grid[y][x] < 0) grid[y][x] = zones.length;
    }
  }
  if (new Set(zones.map((_, i) => root(i))).size !== 1)
    throw Error('Disconnected design: ' + id);
  const palette = themes[theme];
  const entities = [];
  const wall = (x, y, w, h) =>
    entities.push({
      name: 'eeWall',
      kind: 'decor',
      x,
      y,
      solid: true,
      isWall: true,
      bounds: { x, y, w, h },
      depth: -5,
    });
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (grid[y][x] < 0) continue;
      if (grid[y - 1]?.[x] === -1) wall(x * cell, y * cell - 6, cell, 6);
      if (grid[y + 1]?.[x] === -1) wall(x * cell, (y + 1) * cell, cell, 6);
      if (grid[y]?.[x - 1] === -1) wall(x * cell - 6, y * cell, 6, cell);
      if (grid[y]?.[x + 1] === -1) wall((x + 1) * cell, y * cell, 6, cell);
    }
  const point = (zone, dx = 0, dy = 0) => ({
    x: Math.max(
      zones[zone].x * cell + 20,
      Math.min(
        (zones[zone].x + zones[zone].w) * cell - 20,
        (centers[zone].x + 0.5) * cell + dx,
      ),
    ),
    y: Math.max(
      zones[zone].y * cell + 20,
      Math.min(
        (zones[zone].y + zones[zone].h) * cell - 20,
        (centers[zone].y + 0.5) * cell + dy,
      ),
    ),
  });
  const spawn = point(0, 0, 16);
  entities.push({
    name: 'eePlayer',
    kind: 'player',
    sprite: 'sprPWalkUnarmed',
    ...spawn,
    depth: -2,
  });
  const chapter = CHAPTERS.find((c) => c.rooms.includes(id));
  const floor = chapter?.rooms.indexOf(id) ?? 0;
  const training = id === 'eeTraining';
  const menu = id === 'eeHideout';
  const total = training
    ? 3
    : menu
      ? 0
      : chapter.index === 14 || chapter.index === 15
        ? 7
        : 6;
  const area = zones.reduce((sum, zone) => sum + zone.w * zone.h, 0);
  const openHall = Math.max(...zones.map((zone) => zone.w * zone.h));
  const reinforcements = area >= 300 && openHall >= 75 ? 3 : 2;
  const count = training
    ? 3
    : menu
      ? 0
      : Math.floor(total / chapter.rooms.length) +
        (floor < total % chapter.rooms.length ? 1 : 0) +
        reinforcements;
  for (let i = 0; i < count; i++) {
    const boss =
      !training &&
      chapter.index === 14 &&
      floor === chapter.rooms.length - 1 &&
      i === count - 1;
    const zone = training
      ? i + 1
      : boss
        ? zones.length - 1
        : 1 + (i % (zones.length - 1));
    const lap = Math.floor(i / (zones.length - 1));
    const at = point(zone, lap ? 40 : 0, training ? 0 : i % 2 ? -16 : 16);
    const gun = !training && chapter.index > 2 && i === count - 1;
    const dog =
      !training &&
      chapter.index >= 9 &&
      ['garden', 'industrial'].includes(theme) &&
      i === 1;
    const swat = !training && theme === 'security' && i === count - 1;
    const fat =
      !training &&
      !boss &&
      ['club', 'hotel'].includes(theme) &&
      chapter.index >= 14 &&
      i === 0;
    entities.push({
      name: boss
        ? 'eeBoss'
        : dog
          ? 'eeDog'
          : swat
            ? 'eeSwat'
            : fat
              ? 'eeFat'
              : i % 2
                ? 'eeGuard'
                : 'eePatrol',
      kind: 'enemy',
      sprite: dog
        ? 'sprDogWalk'
        : swat
          ? 'sprPoliceWalkM16'
          : gun
            ? 'sprEWalkSilencer'
            : i % 2
              ? 'sprEWalkClub'
              : 'sprEWalkUnarmed',
      ...at,
      depth: -1,
      init: {
        direction:
          (-Math.atan2(at.y - spawn.y, at.x - spawn.x) * 180) / Math.PI,
      },
    });
  }
  if (training) {
    entities.push({
      name: 'eeWeapon',
      kind: 'weapon',
      sprite: 'sprWeapons',
      ...point(0, -32, -16),
      frame: 1,
      init: { image_index: 1, ammo: 6 },
    });
    entities.push({
      name: 'eeWeapon',
      kind: 'weapon',
      sprite: 'sprWeapons',
      ...point(2, -40, 16),
      frame: 4,
      init: { image_index: 4, ammo: 0 },
    });
  } else if (!menu) {
    const melee = [
      2, 3, 4, 5, 8, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 26,
    ][(number - 1) % 18];
    const gun = [0, 1, 6, 7, 9, 10, 11, 12, 25][(number - 1) % 9];
    const item = (zone, dx, dy, id) =>
      entities.push({
        name: 'eeWeapon',
        kind: 'weapon',
        sprite: 'sprWeapons',
        ...point(zone, dx, dy),
        frame: id ?? 0,
        init: id === undefined ? {} : { image_index: id },
      });
    item(0, 32, 16, melee);
    item(Math.min(2, zones.length - 1), -32, 16, gun);
    item(1, -32, 32, 27 + (Math.floor((number - 1) / 2) % 8));
    if (number % 3 === 0) item(zones.length - 1, -32, 32);
  }
  if (chapter) {
    const previous = chapter.rooms[floor - 1],
      next = chapter.rooms[floor + 1];
    if (previous)
      entities.push({
        name: 'eeStairsBack',
        kind: 'exit',
        transition: 'stairs',
        ...point(0, 0, -24),
        backward: true,
        targets: [previous],
        visible: true,
        init: { nextroom: previous },
      });
    entities.push({
      name: next ? 'eeStairsForward' : 'eeChapterDoor',
      kind: 'exit',
      transition: next ? 'stairs' : 'door',
      ...(next
        ? point(zones.length - 1, 32, 16)
        : {
            x: point(zones.length - 1).x,
            y: (zones.at(-1).y + zones.at(-1).h) * cell - 18,
          }),
      forward: true,
      visible: true,
      targets: next ? [next] : [],
      init: next ? { nextroom: next } : {},
    });
  }
  const important = entities.filter((e) =>
    ['player', 'enemy', 'weapon', 'exit'].includes(e.kind),
  );
  const placed = [];
  zones.forEach((zone, i) => {
    const openings = [];
    for (let y = 1; y < rows - 1; y++)
      for (let x = 1; x < cols - 1; x++) {
        if (grid[y][x] !== i) continue;
        if (
          [
            [x - 1, y],
            [x + 1, y],
            [x, y - 1],
            [x, y + 1],
          ].some(([nx, ny]) => grid[ny][nx] >= 0 && grid[ny][nx] !== i)
        )
          openings.push({ x: (x + 0.5) * cell, y: (y + 0.5) * cell });
      }
    const sprite = zone.furnishing;
    const meta = manifest.sprites[sprite];
    if (!meta) throw Error('Unknown furnishing: ' + sprite);
    const marginX = Math.ceil(meta.width / 2) + 12;
    const marginY = Math.ceil(meta.height / 2) + 14;
    const spots = [];
    for (let dx = marginX; dx <= zone.w * cell - marginX; dx += meta.width + 32)
      spots.push([dx, marginY], [dx, zone.h * cell - marginY]);
    for (
      let dy = marginY + meta.height + 32;
      dy < zone.h * cell - marginY - 30;
      dy += meta.height + 32
    )
      spots.push([marginX, dy], [zone.w * cell - marginX, dy]);
    if (zone.w >= 9 && zone.h >= 7)
      spots.push(
        [(zone.w * cell) / 3, (zone.h * cell) / 3],
        [(zone.w * cell * 2) / 3, (zone.h * cell * 2) / 3],
      );
    const alternatives = /Bed/.test(sprite)
      ? ['sprSmallTable', 'sprFileCabinet']
      : /Stove/.test(sprite)
        ? ['sprDoubleFridge', 'sprKitchenSinkDown', 'sprPlayerKitchenShelf']
        : /Couch|Sofa/.test(sprite)
          ? ['sprPlayerLivingRoomTable', 'sprTVBlack', 'sprCyanPlant']
          : /Toilet/.test(sprite)
            ? ['sprSink', 'sprFileCabinet']
            : /DiscoBar|FancyBar/.test(sprite)
              ? ['sprBarStool', 'sprBarTable']
              : /DJTable/.test(sprite)
                ? ['sprSpeaker', 'sprComputer']
                : /ReceptionDesk|OwnerDesk|AndersDesk/.test(sprite)
                  ? ['sprComputer', 'sprOfficeCouch', 'sprCyanPlant']
                  : [sprite];
    let furnishingCount = 0;
    for (const [dx, dy] of spots) {
      if (
        furnishingCount >= (['residential', 'hotel'].includes(theme) ? 5 : 10)
      )
        break;
      const furnishing =
        furnishingCount === 0
          ? sprite
          : alternatives[(furnishingCount - 1) % alternatives.length];
      const itemMeta = manifest.sprites[furnishing];
      const at = { x: zone.x * cell + dx, y: zone.y * cell + dy };
      const center = point(i);
      if (
        openings.some(
          (p) => Math.abs(at.x - p.x) < 48 && Math.abs(at.y - p.y) < 48,
        )
      )
        continue;
      if (Math.hypot(at.x - center.x, at.y - center.y) < 36) continue;
      if (important.some((e) => Math.hypot(e.x - at.x, e.y - at.y) < 58))
        continue;
      const bounds = {
        x: at.x - itemMeta.width / 2,
        y: at.y - itemMeta.height / 2,
        w: itemMeta.width,
        h: itemMeta.height,
      };
      if (
        important.some((entity) => {
          const nearestX = Math.max(
            bounds.x,
            Math.min(bounds.x + bounds.w, entity.x),
          );
          const nearestY = Math.max(
            bounds.y,
            Math.min(bounds.y + bounds.h, entity.y),
          );
          return Math.hypot(entity.x - nearestX, entity.y - nearestY) < 28;
        })
      )
        continue;
      if (
        bounds.x < zone.x * cell + 8 ||
        bounds.y < zone.y * cell + 8 ||
        bounds.x + bounds.w > (zone.x + zone.w) * cell - 8 ||
        bounds.y + bounds.h > (zone.y + zone.h) * cell - 8 ||
        placed.some(
          (r) =>
            bounds.x < r.x + r.w + 8 &&
            bounds.x + bounds.w + 8 > r.x &&
            bounds.y < r.y + r.h + 8 &&
            bounds.y + bounds.h + 8 > r.y,
        )
      )
        continue;
      placed.push(bounds);
      furnishingCount++;
      entities.push({
        name: 'eeFurnishing',
        kind: 'decor',
        sprite: furnishing,
        x: bounds.x + itemMeta.originX,
        y: bounds.y + itemMeta.originY,
        depth: 0,
        solid: true,
        furniture: true,
      });
    }
  });
  for (let y = 1; y < rows - 1; y++)
    for (let x = 1; x < cols - 1; x++) {
      if (grid[y][x] !== zones.length) continue;
      const vertical =
        grid[y - 1][x] >= 0 &&
        grid[y + 1][x] >= 0 &&
        grid[y][x - 1] < 0 &&
        grid[y][x + 1] < 0;
      const horizontal =
        grid[y][x - 1] >= 0 &&
        grid[y][x + 1] >= 0 &&
        grid[y - 1][x] < 0 &&
        grid[y + 1][x] < 0;
      if (
        (vertical || horizontal) &&
        (x + y + number) % 7 === 0 &&
        doors.every((d) => Math.hypot(d.x - x * cell, d.y - y * cell) > 96)
      ) {
        const door = {
          name: 'eeDoor',
          kind: 'door',
          sprite: vertical ? 'sprDoorH' : 'sprDoorV',
          x: x * cell + (vertical ? 0 : 16),
          y: y * cell + (vertical ? 16 : 0),
          depth: -1,
        };
        doors.push(door);
        entities.push(door);
      }
    }
  const room = {
    id,
    width: cols * cell,
    height: rows * cell,
    design: { title, theme, landmark, revision: 2 },
    floor: {
      cell,
      grid: grid.map((row) =>
        row.map((i) => (i < 0 ? ' ' : i.toString(36))).join(''),
      ),
      palette,
      zoneCount: zones.length,
    },
    zones: zones.map((z) => ({
      ...z,
      x: z.x * cell,
      y: z.y * cell,
      w: z.w * cell,
      h: z.h * cell,
    })),
    entities,
    tiles: [],
  };
  writeFileSync(
    new URL(id + '.json', directory),
    JSON.stringify(room, null, 2) + '\n',
  );
  rooms.push({
    id,
    width: room.width,
    height: room.height,
    enemies: count,
    entities: entities.length,
    tiles: 0,
  });
}
for (const name of readdirSync(directory))
  if (name.endsWith('.json') && !rooms.some((r) => r.id + '.json' === name))
    unlinkSync(new URL(name, directory));
manifest.rooms = rooms;
manifest.stats.rooms = rooms.length;
manifest.stats.combatRooms = rooms.filter((r) => r.enemies).length;
writeFileSync(manifestFile, JSON.stringify(manifest));
console.log('Created ' + rooms.length + ' original level designs.');
