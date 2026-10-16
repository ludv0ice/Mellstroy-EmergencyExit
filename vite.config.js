import { defineConfig } from 'vite';
import { cpSync, renameSync, rmdirSync } from 'node:fs';

// Both dev and release use the same root assets/ directory.
export default defineConfig({
  publicDir: false,
  server: { open: false },
  build: {
    rollupOptions: {
      input: 'src/index.html',
      output: {
        assetFileNames: (asset) =>
          asset.names?.some((name) => name.endsWith('.ttf'))
            ? 'assets/fonts/[name][extname]'
            : 'assets/[name]-[hash][extname]',
      },
    },
  },
  plugins: [
    {
      name: 'package-game',
      apply: 'build',
      closeBundle() {
        renameSync('dist/src/index.html', 'dist/index.html');
        rmdirSync('dist/src');
        cpSync('assets', 'dist/assets', { recursive: true });
      },
    },
  ],
});
