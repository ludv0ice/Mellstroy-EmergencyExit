import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAPTERS } from '../src/campaign.js';
import { roomSpriteKeys } from '../src/assets.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'release');
const readJson = (file) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const manifest = readJson('assets/manifest.json');
const skins = readJson('assets/custom/skins.json');
const files = new Set([
  'index.html',
  'src/style.css',
  'assets/game.js',
  'assets/data.js',
  'assets/vendor/phaser.js',
  'assets/fonts/justice.ttf',
  'assets/fonts/exo2.ttf',
]);
function addAsset(url) {
  files.add(url.replace(/^\//, ''));
}

const rooms = ['eeHideout', ...CHAPTERS.flatMap((chapter) => chapter.rooms)];
for (const id of rooms) {
  const room = readJson('assets/rooms/' + id + '.json');
  for (const key of roomSpriteKeys(manifest, room)) {
    addAsset(manifest.sprites[key].url);
  }
  for (const tile of room.tiles) {
    if (manifest.backgrounds[tile.bgName]) {
      addAsset(
        tile.bgName === 'tlFloorTiles'
          ? skins.floor.url
          : manifest.backgrounds[tile.bgName],
      );
    }
  }
}
for (const [key, skin] of Object.entries(skins)) {
  if (key !== 'floor') {
    addAsset(skin.url);
  }
}
for (const url of Object.values(manifest.audio)) {
  addAsset(url);
}

for (const file of files) {
  statSync(path.join(root, file));
}
rmSync(output, { recursive: true, force: true });
for (const file of files) {
  const target = path.join(output, file);
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(path.join(root, file), target);
}
const licenses = ['docs/ORIGIN.md', 'docs/PHASER-LICENSE.md', 'docs/FONT-LICENSE.txt'];
writeFileSync(
  path.join(output, 'LICENSES.txt'),
  licenses.map((file) => readFileSync(path.join(root, file), 'utf8')).join('\n\n'),
);
let bytes = statSync(path.join(output, 'LICENSES.txt')).size;
for (const file of files) {
  bytes += statSync(path.join(output, file)).size;
}
console.log(JSON.stringify({ directory: output, files: files.size + 1, bytes }, null, 2));
