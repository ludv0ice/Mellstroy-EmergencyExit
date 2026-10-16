import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAPTERS } from '../src/campaign.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = path.join(root, 'assets');
const manifest = JSON.parse(readFileSync(path.join(assets, 'manifest.json')));
const skins = JSON.parse(readFileSync(path.join(assets, 'custom/skins.json')));
const rooms = new Set([
  'rmSequence1',
  ...CHAPTERS.flatMap((chapter) => chapter.rooms),
]);
assert.deepEqual(new Set(manifest.rooms.map((room) => room.id)), rooms);
const expected = new Set([
  '/assets/manifest.json',
  '/assets/custom/skins.json',
  '/assets/fonts/justice.ttf',
  '/assets/fonts/exo2.ttf',
  ...[...rooms].map((id) => `/assets/rooms/${id}.json`),
  ...Object.values(manifest.sprites).map((sprite) => sprite.url),
  ...Object.values(manifest.backgrounds),
  ...Object.values(manifest.audio),
  ...Object.values(skins).map((skin) => skin.url),
]);

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const location = path.join(directory, entry.name);
    return entry.isDirectory() ? files(location) : [location];
  });
}

const actual = new Set(
  files(assets).map(
    (file) => '/' + path.relative(root, file).split(path.sep).join('/'),
  ),
);
assert.deepEqual(
  actual,
  expected,
  'Assets must contain exactly the declared game files',
);
for (const id of rooms) {
  const room = JSON.parse(
    readFileSync(path.join(assets, 'rooms', `${id}.json`)),
  );
  assert.equal(room.id, id);
  for (const entity of room.entities) {
    assert.ok(!('code' in entity), 'Rooms must use data, not source scripts');
    if (entity.mask)
      assert.ok(manifest.sprites[entity.mask], `${id}: mask ${entity.mask}`);
  }
  for (const tile of room.tiles)
    assert.ok(
      tile.bgName === '<undefined>' || manifest.backgrounds[tile.bgName],
      `${id}: tiles ${tile.bgName}`,
    );
}

const assetBytes = files(path.join(root, 'assets')).reduce(
  (n, file) => n + statSync(file).size,
  0,
);
const buildDirectory = path.join(root, 'dist');
const buildBytes = existsSync(buildDirectory)
  ? files(buildDirectory).reduce((n, file) => n + statSync(file).size, 0)
  : null;
assert.ok(assetBytes < 100_000_000, 'Game assets exceed the 100 MB budget');
if (buildBytes !== null) {
  assert.ok(
    buildBytes < 100_000_000,
    'Production build exceeds the 100 MB budget',
  );
  const buildAssets = new Set(
    files(path.join(buildDirectory, 'assets'))
      .filter((file) => !/^index-[^/]+\.(?:js|css)$/.test(path.basename(file)))
      .map(
        (file) =>
          '/' + path.relative(buildDirectory, file).split(path.sep).join('/'),
      ),
  );
  assert.deepEqual(
    buildAssets,
    expected,
    'Rebuild dist when game assets change',
  );
}
console.log(
  JSON.stringify(
    {
      rooms: rooms.size,
      sprites: Object.keys(manifest.sprites).length,
      sounds: Object.keys(manifest.audio).length,
      assetBytes,
      buildBytes,
    },
    null,
    2,
  ),
);
