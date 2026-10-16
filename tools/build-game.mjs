import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  cpSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve('vite'));
const { build, transform } = viteRequire('esbuild');
const assets = path.join(root, 'assets');

function readData(directory, json = {}) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) readData(file, json);
    else if (entry.name.endsWith('.json')) {
      const url = '/' + path.relative(root, file).split(path.sep).join('/');
      json[url] = JSON.parse(readFileSync(file, 'utf8'));
    }
  }
  return json;
}

const vendor = path.join(assets, 'vendor');
mkdirSync(vendor, { recursive: true });
const engineFile = require.resolve('phaser/dist/phaser.min.js');
const engine = await transform(readFileSync(engineFile, 'utf8'), {
  loader: 'js',
  minify: true,
  legalComments: 'none',
});
writeFileSync(path.join(vendor, 'phaser.js'), engine.code);
cpSync(
  path.join(path.dirname(engineFile), '../LICENSE.md'),
  path.join(root, 'docs/PHASER-LICENSE.md'),
);

const data = JSON.stringify({ json: readData(assets) }, null, 2);
writeFileSync(
  path.join(assets, 'data.js'),
  'globalThis.__EMERGENCY_EXIT_ROOT__ = new URL("../", document.currentScript.src).href;\n' +
    'globalThis.__EMERGENCY_EXIT_ASSETS__ = ' +
    data +
    ';\n',
);

const bundle = await build({
  absWorkingDir: root,
  entryPoints: ['src/main.js'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['chrome90', 'firefox90', 'safari15'],
  legalComments: 'none',
  write: false,
  plugins: [
    {
      name: 'browser-dependencies',
      setup(builder) {
        builder.onResolve({ filter: /^phaser$/ }, () => ({
          path: 'phaser',
          namespace: 'global',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'global' }, () => ({
          contents: 'export default globalThis.Phaser;',
          loader: 'js',
        }));
        builder.onLoad({ filter: /\.css$/ }, () => ({
          contents: '',
          loader: 'js',
        }));
      },
    },
  ],
});
const runtime = await transform(bundle.outputFiles[0].text, {
  loader: 'js',
  legalComments: 'none',
});
writeFileSync(
  path.join(root, 'src/game.js'),
  runtime.code.replace(/\/\* @__PURE__ \*\//g, ''),
);

let html = readFileSync(path.join(root, 'src/index.html'), 'utf8');
html = html.replace(
  '</head>',
  '  <link rel="stylesheet" href="./src/style.css" />\n  </head>',
);
html = html.replace(
  /<script\s+type="module"\s+src="\.\/main\.js"><\/script>/,
  '<script src="./assets/vendor/phaser.js"></script>\n    <script src="./assets/data.js"></script>\n    <script src="./src/game.js"></script>',
);
writeFileSync(path.join(root, 'index.html'), html);
const dist = path.join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(path.join(dist, 'src'), { recursive: true });
cpSync(assets, path.join(dist, 'assets'), { recursive: true });
for (const file of ['game.js', 'style.css'])
  cpSync(path.join(root, 'src', file), path.join(dist, 'src', file));
cpSync(path.join(root, 'index.html'), path.join(dist, 'index.html'));
console.log('Game built. Open index.html together with assets/ and src/.');
