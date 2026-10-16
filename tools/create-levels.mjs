import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { CHAPTERS } from '../src/campaign.js';
import { LEVEL_DESIGNS } from './level-designs.mjs';

const directory = new URL('../assets/rooms/', import.meta.url);
const manifestFile = new URL('../assets/manifest.json', import.meta.url);
const manifest = JSON.parse(readFileSync(manifestFile));
const cell = 32;
const themes = {
  studio: ['#172c3d', '#24475c', '#6fd6fa', 'grid'],
  station: ['#263343', '#394d5b', '#f0c87a', 'stripe'],
  residential: ['#3b2938', '#564153', '#ff8eae', 'wood'],
  industrial: ['#273834', '#3b5045', '#c6d77a', 'stripe'],
  hotel: ['#26363f', '#3d5662', '#c49beb', 'carpet'],
  office: ['#25323c', '#3b4a53', '#8cc8bb', 'grid'],
  security: ['#24323f', '#3a4755', '#77bfe0', 'grid'],
  club: ['#29203d', '#462c52', '#f381cf', 'dance'],
  garden: ['#263c38', '#3c5342', '#8bd5a7', 'stone'],
  food: ['#3b3031', '#554442', '#f2b87b', 'checker'],
  arcade: ['#252a46', '#3d4164', '#a19af6', 'dance'],
};
const rooms = [];
for (let number = 0; number < LEVEL_DESIGNS.length; number++) {
  const [id, title, theme, coordinates, connections, landmark] =
    LEVEL_DESIGNS[number];
  const zones = coordinates.split(';').map((record, i) => {
    const [x, y, w, h] = record.split(',').map(Number);
    return {
      x,
      y,
      w,
      h,
      name:
        i === 0
          ? 'ВХОД'
          : i === coordinates.split(';').length - 1
            ? landmark
            : 'СЕКТОР ' + String(i).padStart(2, '0'),
    };
  });
  const cols = Math.max(...zones.map((z) => z.x + z.w)) + 2;
  const rows = Math.max(...zones.map((z) => z.y + z.h)) + 2;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(-1));
  const centers = zones.map((z) => ({
    x: Math.floor(z.x + z.w / 2),
    y: Math.floor(z.y + z.h / 2),
  }));
  const edges = connections
    .split(' ')
    .map((pair) => [Number(pair[0]), Number(pair[1])]);
  const doors = [];
  function connect(a, b, index) {
    const from = centers[a],
      to = centers[b];
    let x = from.x,
      y = from.y;
    const horizontalFirst = (index + number) % 2 === 0;
    const carve = () => {
      if (grid[y][x] < 0) grid[y][x] = zones.length;
    };
    carve();
    const walkX = () => {
      while (x !== to.x) {
        x += Math.sign(to.x - x);
        carve();
      }
    };
    const walkY = () => {
      while (y !== to.y) {
        y += Math.sign(to.y - y);
        carve();
      }
    };
    if (horizontalFirst) {
      walkX();
      walkY();
    } else {
      walkY();
      walkX();
    }
  }
  zones.forEach((zone, i) => {
    for (let y = zone.y; y < zone.y + zone.h; y++)
      for (let x = zone.x; x < zone.x + zone.w; x++) grid[y][x] = i;
  });
  edges.forEach(([a, b], i) => connect(a, b, i));
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
    x: (centers[zone].x + 0.5) * cell + dx,
    y: (centers[zone].y + 0.5) * cell + dy,
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
  const count = training
    ? 3
    : menu
      ? 0
      : Math.floor(total / chapter.rooms.length) +
        (floor < total % chapter.rooms.length ? 1 : 0);
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
        ...point(0, 0, -24),
        backward: true,
        targets: [previous],
        visible: false,
        init: { nextroom: previous },
      });
    if (next)
      entities.push({
        name: 'eeStairsForward',
        kind: 'exit',
        ...point(zones.length - 1, 32, 16),
        forward: true,
        targets: [next],
        visible: false,
        init: { nextroom: next },
      });
    if (floor === 0) {
      if (training)
        entities.push({
          name: 'eeTrainingExit',
          kind: 'exit',
          ...point(3, 32, 16),
          forward: true,
          visible: false,
          init: {},
        });
      else
        entities.push({
          name: 'objPlayerCarEnter',
          kind: 'exit',
          sprite: 'sprPlayerCar',
          x: spawn.x,
          y: zones[0].y * cell + 48,
          depth: -3,
          visible: true,
          init: { nextroom: 'eeHideout' },
        });
    }
  }
  const important = entities.filter((e) =>
    ['player', 'enemy', 'weapon', 'exit'].includes(e.kind),
  );
  const props =
    theme === 'food'
      ? ['sprBarTable', 'sprRestaurantChair']
      : theme === 'garden'
        ? ['sprCyanPlant', 'sprPlant3']
        : theme === 'office' || theme === 'studio' || theme === 'security'
          ? ['sprComputer', 'sprAndersTable']
          : theme === 'club'
            ? ['sprBarTable', 'sprSofaH48']
            : theme === 'industrial'
              ? ['sprCocaineCrate', 'sprAndersTable']
              : ['sprSofaH48', 'sprCyanPlant'];
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
    for (const [dx, dy] of [
      [28, 28],
      [zone.w * cell - 28, 28],
      [28, zone.h * cell - 28],
      [zone.w * cell - 28, zone.h * cell - 28],
    ]) {
      const at = { x: zone.x * cell + dx, y: zone.y * cell + dy };
      const center = point(i);
      if (
        openings.some(
          (p) => Math.abs(at.x - p.x) < 48 && Math.abs(at.y - p.y) < 48,
        )
      )
        continue;
      if (Math.abs(at.x - center.x) < 40 || Math.abs(at.y - center.y) < 40)
        continue;
      if (important.some((e) => Math.hypot(e.x - at.x, e.y - at.y) < 58))
        continue;
      const sprite = props[(i + number) % props.length];
      if (!manifest.sprites[sprite]) continue;
      entities.push({
        name: 'eeFurnishing',
        kind: 'decor',
        sprite,
        ...at,
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
    design: { title, theme, landmark, revision: 1 },
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
