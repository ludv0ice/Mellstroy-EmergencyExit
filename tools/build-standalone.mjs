import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url));
// Vite already brings esbuild; resolve through Vite without adding a dependency.
const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve('vite'));
const { build, transform } = viteRequire('esbuild');
const embedded = { json: {}, files: {} };
const mime = { '.png': 'image/png', '.wav': 'audio/wav', '.ttf': 'font/ttf' };

function embed(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      embed(file);
      continue;
    }
    const url = '/' + path.relative(root, file).split(path.sep).join('/');
    const extension = path.extname(file);
    const bytes = readFileSync(file);
    if (extension === '.json') embedded.json[url] = JSON.parse(bytes);
    else {
      if (!mime[extension]) throw new Error('Unsupported asset: ' + url);
      embedded.files[url] =
        `data:${mime[extension]};base64,${bytes.toString('base64')}`;
    }
  }
}
embed(path.join(root, 'assets'));

const bundle = await build({
  absWorkingDir: root,
  entryPoints: ['src/main.js'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['chrome90', 'firefox90', 'safari15'],
  minify: true,
  legalComments: 'inline',
  write: false,
  plugins: [
    {
      name: 'inline-styles',
      setup(builder) {
        builder.onLoad({ filter: /\.css$/ }, () => ({
          contents: '',
          loader: 'js',
        }));
      },
    },
  ],
});
let css = readFileSync(path.join(root, 'src/style.css'), 'utf8');
css = css.replace(
  /url\((['"]?)(\/assets\/[^)'"\s]+)\1\)/g,
  (_match, _quote, url) => {
    if (!embedded.files[url]) throw new Error('Missing CSS asset: ' + url);
    return `url("${embedded.files[url]}")`;
  },
);
css = (await transform(css, { loader: 'css', minify: true })).code;
// Escape HTML-significant characters so data can never terminate a script tag.
const safeScript = (text) =>
  text
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
const dataScript = `globalThis.__EMERGENCY_EXIT_ASSETS__=${safeScript(JSON.stringify(embedded))};`;
// Bundled JavaScript may contain less-than operators; only escape closing tags.
const gameScript = bundle.outputFiles[0].text.replace(
  /<\/script/gi,
  '<\\/script',
);
let html = readFileSync(path.join(root, 'src/index.html'), 'utf8');
html = html.replace('</head>', `<style>${css}</style></head>`);
const moduleScript = /<script\s+type="module"\s+src="\.\/main\.js"><\/script>/;
if (!moduleScript.test(html))
  throw new Error('Cannot find the game entry script');
html = html.replace(
  moduleScript,
  () => `<script>\n${dataScript}\n</script><script>\n${gameScript}\n</script>`,
);
const file = path.join(root, 'index.html');
writeFileSync(file, html);
const size = statSync(file).size;
if (size >= 100_000_000) throw new Error('Standalone game exceeds 100 MB');
console.log(
  `Portable game: ${file} (${size} bytes). Open it directly in a browser.`,
);
