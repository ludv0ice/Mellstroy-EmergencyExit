import { readBytes } from './assets.js';

// Original effects, new procedural soundtrack; starts only after a user gesture.
export class AudioEngine {
  constructor(manifest, settings) {
    this.manifest = manifest;
    this.settings = settings;
    this.buffers = new Map();
    this.last = new Map();
    this.step = 0;
    this.active = false;
  }
  start() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.music = this.ctx.createGain();
      this.music.connect(this.ctx.destination);
      this.updateVolumes();
      this.timer = setInterval(() => this.tick(), 125);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.active = true;
  }
  updateVolumes() {
    if (this.ctx) {
      this.master.gain.value = this.settings.sound / 100;
      this.music.gain.value = (this.settings.music / 100) * 0.2;
    }
  }
  async play(key) {
    if (!this.ctx || !this.settings.sound) return;
    const now = performance.now();
    if (now - (this.last.get(key) ?? 0) < 45) return;
    this.last.set(key, now);
    const url = this.manifest.audio[key];
    if (!url) return;
    try {
      if (!this.buffers.has(key))
        this.buffers.set(
          key,
          readBytes(url).then((b) => this.ctx.decodeAudioData(b)),
        );
      const buffer = await this.buffers.get(key);
      if (this.ctx.state !== 'running') return;
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.master);
      source.start();
    } catch {
      this.buffers.delete(key);
    }
  }
  tone(freq, type, time, length, gain = 0.2) {
    const o = this.ctx.createOscillator(),
      g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + length);
    o.connect(g);
    g.connect(this.music);
    o.start(time);
    o.stop(time + length);
  }
  tick() {
    if (
      !this.ctx ||
      this.ctx.state !== 'running' ||
      !this.active ||
      !this.settings.music
    )
      return;
    const t = this.ctx.currentTime,
      s = this.step++ % 32,
      notes = [55, 55, 65.41, 55, 82.41, 55, 73.42, 65.41];
    this.tone(notes[Math.floor(s / 4)], 'sawtooth', t, 0.12, 0.16);
    if (s % 4 === 0) {
      const o = this.ctx.createOscillator(),
        g = this.ctx.createGain();
      o.frequency.setValueAtTime(135, t);
      o.frequency.exponentialRampToValueAtTime(35, t + 0.12);
      g.gain.setValueAtTime(0.65, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g);
      g.connect(this.music);
      o.start(t);
      o.stop(t + 0.18);
    }
    if (s % 4 === 2) this.tone(185, 'triangle', t, 0.07, 0.23);
    if (s % 2 === 1) this.tone(7300, 'square', t, 0.018, 0.025);
    if (s % 2 === 0) {
      const melody = [440, 523.25, 659.25, 587.33, 440, 392, 523.25, 349.23];
      this.tone(melody[Math.floor(s / 2) % 8], 'triangle', t, 0.22, 0.12);
    }
  }
}
