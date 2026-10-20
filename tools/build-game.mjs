import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  copyFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build, transform } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const assets = path.join(root, 'assets');

function readData(directory, data = {}) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      readData(file, data);
    } else if (entry.name.endsWith('.json')) {
      const url = '/' + path.relative(root, file).split(path.sep).join('/');
      data[url] = JSON.parse(readFileSync(file, 'utf8'));
    }
  }
  return data;
}

mkdirSync(path.join(assets, 'vendor'), { recursive: true });
const engineFile = require.resolve('phaser/dist/phaser.min.js');
const engine = await transform(readFileSync(engineFile, 'utf8'), {
  loader: 'js',
  minify: true,
  legalComments: 'none',
});
writeFileSync(path.join(assets, 'vendor/phaser.js'), engine.code);
copyFileSync(
  path.join(path.dirname(engineFile), '../LICENSE.md'),
  path.join(root, 'docs/PHASER-LICENSE.md'),
);

writeFileSync(
  path.join(assets, 'data.js'),
  'globalThis.__EMERGENCY_EXIT_ROOT__ = new URL("../", document.currentScript.src).href;\n' +
    'globalThis.__EMERGENCY_EXIT_ASSETS__ = ' +
    JSON.stringify({ json: readData(assets) }, null, 2) +
    ';\n',
);

const result = await build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  target: ['chrome90', 'firefox90', 'safari15'],
  legalComments: 'none',
  write: false,
});
const runtime = await transform(result.outputFiles[0].text, {
  loader: 'js',
  legalComments: 'none',
});
writeFileSync(
  path.join(assets, 'game.js'),
  runtime.code.replace(/\/\* @__PURE__ \*\//g, ''),
);
console.log('Game built. Open index.html.');
