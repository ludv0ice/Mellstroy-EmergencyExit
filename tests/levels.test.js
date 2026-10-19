import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Simulation } from '../src/simulation.js';
import { CHAPTERS, PROFILES } from '../src/campaign.js';

const manifest = JSON.parse(
  readFileSync(new URL('../assets/manifest.json', import.meta.url)),
);
const raw = (id) =>
  JSON.parse(
    readFileSync(new URL('../assets/rooms/' + id + '.json', import.meta.url)),
  );
function signature(grid) {
  const cells = [];
  for (let y = 0; y < grid.length; y++)
    for (let x = 0; x < grid[y].length; x++)
      if (grid[y][x] !== ' ') cells.push([x, y]);
  const shapes = [];
  for (let flip = 0; flip < 2; flip++)
    for (let turn = 0; turn < 4; turn++) {
      const points = cells.map(([x, y]) => {
        if (flip) x = -x;
        for (let i = 0; i < turn; i++) [x, y] = [-y, x];
        return [x, y];
      });
      const mx = Math.min(...points.map((p) => p[0])),
        my = Math.min(...points.map((p) => p[1]));
      shapes.push(
        points
          .map(([x, y]) => [x - mx, y - my])
          .sort((a, b) => a[1] - b[1] || a[0] - b[0])
          .map((p) => p.join(','))
          .join(';'),
      );
    }
  return shapes.sort()[0];
}

test('All 49 levels have distinct original footprints, including rotations and reflections', () => {
  const seen = new Map();
  for (const { id } of manifest.rooms) {
    const room = raw(id);
    assert.ok(id.startsWith('ee'), id);
    assert.ok(
      room.design?.title && room.floor?.grid && room.zones.length >= 4,
      id,
    );
    const shape = signature(room.floor.grid);
    assert.ok(!seen.has(shape), id + ' repeats ' + seen.get(shape));
    seen.set(shape, id);
    assert.equal(room.tiles.length, 0);
  }
  assert.equal(seen.size, 49);
});

test('Every spawn, enemy, weapon and exit is on reachable floor with clearance for the hero', () => {
  for (const { id } of manifest.rooms) {
    const room = raw(id),
      sim = new Simulation(manifest, room, PROFILES[0]);
    const step = 8,
      cols = room.width / step,
      rows = room.height / step;
    const start = [
      Math.floor(sim.player.x / step),
      Math.floor(sim.player.y / step),
    ];
    const free = (x, y) => {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
      const wx = x * step + step / 2,
        wy = y * step + step / 2;
      return (
        room.floor.grid[Math.floor(wy / 32)]?.[Math.floor(wx / 32)] !== ' ' &&
        !sim.blocked(wx, wy, 7, false)
      );
    };
    assert.ok(free(...start), id + ' spawn');
    const queue = [start],
      seen = new Set([start.join(',')]);
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          ny = y + dy,
          key = nx + ',' + ny;
        if (!seen.has(key) && free(nx, ny)) {
          seen.add(key);
          queue.push([nx, ny]);
        }
      }
    }
    for (const e of room.entities.filter((e) =>
      ['player', 'enemy', 'weapon', 'exit'].includes(e.kind),
    )) {
      assert.equal(
        sim.blocked(e.x, e.y, 7, false),
        false,
        id + ' blocked ' + e.kind,
      );
      assert.ok(
        seen.has(Math.floor(e.x / step) + ',' + Math.floor(e.y / step)),
        id + ' unreachable ' + e.kind + ' ' + e.x + ',' + e.y,
      );
    }
  }
});

test('Original floors retain reciprocal chapter transitions and the seven-enemy budget', () => {
  for (const chapter of CHAPTERS) {
    let total = 0;
    chapter.rooms.forEach((id, i) => {
      const room = raw(id);
      total += room.entities.filter((e) => e.kind === 'enemy').length;
      const targets = room.entities
        .filter((e) => e.kind === 'exit')
        .flatMap((e) => e.targets ?? []);
      if (i) assert.ok(targets.includes(chapter.rooms[i - 1]), id + ' back');
      if (i < chapter.rooms.length - 1)
        assert.ok(targets.includes(chapter.rooms[i + 1]), id + ' forward');
    });
    assert.ok(total <= 7, chapter.number);
  }
  assert.equal(
    raw('eeTraining').entities.filter((e) => e.kind === 'enemy').length,
    3,
  );
});

test('The redesigned campaign still provides all 35 weapon types', () => {
  const ids = new Set(
    manifest.rooms.flatMap(({ id }) =>
      raw(id)
        .entities.filter(
          (e) => e.kind === 'weapon' && Number.isInteger(e.init?.image_index),
        )
        .map((e) => e.init.image_index),
    ),
  );
  for (let id = 0; id < 35; id++)
    assert.ok(ids.has(id), 'missing weapon ' + id);
});

test('Each stage has visible stairs and only its final floor has the chapter exit door', () => {
  for (const chapter of CHAPTERS)
    chapter.rooms.forEach((id, index) => {
      const room = raw(id);
      const sim = new Simulation(manifest, room, PROFILES[0]);
      assert.equal(sim.exit.forward, true, id);
      assert.ok(
        sim.exits.every((exit) => exit.visible && exit.transition),
        id,
      );
      assert.ok(
        !room.entities.some((entity) =>
          /Car/.test(entity.name + entity.sprite),
        ),
        id,
      );
      if (index < chapter.rooms.length - 1) {
        assert.equal(sim.exit.transition, 'stairs', id);
        assert.equal(sim.exit.init.nextroom, chapter.rooms[index + 1], id);
        assert.equal(
          sim.exits.filter((exit) => exit.transition === 'door').length,
          0,
          id,
        );
      } else {
        assert.equal(sim.exit.transition, 'door', id);
        assert.equal(sim.exit.init.nextroom, undefined, id);
      }
      sim.player.x = sim.exit.x;
      sim.player.y = sim.exit.y;
      sim.grace = 100;
      sim.update(1 / 60, { interact: true });
      assert.notEqual(sim.status, 'complete', id + ' exit before clear');
      for (const enemy of sim.enemies) sim.kill(enemy, 'shot');
      sim.update(1 / 60, { interact: true });
      assert.equal(sim.status, 'complete', id + ' exit after clear');
    });
});
