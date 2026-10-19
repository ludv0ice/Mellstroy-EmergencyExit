import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { readJson, assetUrl } from '../src/assets.js';
import { AudioEngine } from '../src/audio.js';

test('Local resources use the game folder and preloaded room data without fetch', async (t) => {
  const room = JSON.parse(
    readFileSync(new URL('../assets/rooms/eeTraining.json', import.meta.url)),
  );
  globalThis.__EMERGENCY_EXIT_ASSETS__ = {
    json: { '/assets/rooms/eeTraining.json': room },
  };
  globalThis.__EMERGENCY_EXIT_ROOT__ = 'file:///Games/My%20Game/';
  t.after(() => {
    delete globalThis.__EMERGENCY_EXIT_ASSETS__;
    delete globalThis.__EMERGENCY_EXIT_ROOT__;
  });
  t.mock.method(globalThis, 'fetch', () => {
    throw new Error('No fetch allowed');
  });
  assert.deepEqual(await readJson('/assets/rooms/eeTraining.json'), room);
  assert.equal(
    assetUrl('/assets/audio/sndDoorOpen.wav'),
    'file:///Games/My%20Game/assets/audio/sndDoorOpen.wav',
  );
  await assert.rejects(readJson('/missing.json'), /Missing game data/);
});

test('Development requests preserve HTTP errors', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) =>
    url === '/missing'
      ? new Response('', { status: 404 })
      : Response.json({ id: 'eeTraining' }),
  );
  assert.equal(assetUrl('/assets/image.png'), '/assets/image.png');
  assert.deepEqual(await readJson('/room'), { id: 'eeTraining' });
  await assert.rejects(readJson('/missing'), /Не удалось загрузить/);
});

test('The launch page contains only markup and external file references', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(Buffer.byteLength(html) < 15000);
  assert.doesNotMatch(html, /base64|<style|<script(?![^>]*src=)/i);
  const files = [...html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)].map(
    (match) => match[1],
  );
  assert.ok(files.length >= 4);
  for (const file of files)
    assert.ok(existsSync(new URL('../' + file, import.meta.url)), file);
});

test('Sound effects play local WAV files and follow the volume setting', async (t) => {
  const voices = [];
  const original = globalThis.Audio;
  globalThis.Audio = class {
    constructor(src) {
      this.src = src;
      this.paused = true;
      voices.push(this);
    }
    async play() {
      this.paused = false;
      this.played = true;
    }
  };
  t.after(() => {
    if (original) globalThis.Audio = original;
    else delete globalThis.Audio;
  });
  const audio = new AudioEngine(
    { audio: { sndHit: '/assets/audio/sndHit.wav' } },
    { sound: 50, music: 0 },
  );
  audio.ctx = {};
  audio.master = { gain: {} };
  audio.music = { gain: {} };
  await audio.play('sndHit');
  assert.equal(voices[0].src, '/assets/audio/sndHit.wav');
  assert.equal(voices[0].volume, 0.5);
  assert.equal(voices[0].played, true);
  audio.settings.sound = 25;
  audio.updateVolumes();
  assert.equal(voices[0].volume, 0.25);
});
