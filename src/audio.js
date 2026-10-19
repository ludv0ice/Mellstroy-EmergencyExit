import { assetUrl } from './assets.js';
export class AudioEngine {
  constructor(manifest, settings) {
    this.manifest = manifest;
    this.settings = settings;
    this.voices = new Map();
    this.last = new Map();
    this.step = 0;
    this.active = false;
    this.cinematicNodes = new Set();
  }
  start() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.music = this.ctx.createGain();
      this.music.connect(this.ctx.destination);
      this.endingGain = this.ctx.createGain();
      this.endingGain.connect(this.music);
      this.effects = this.ctx.createGain();
      this.effects.connect(this.ctx.destination);
      this.updateVolumes();
      this.timer = setInterval(() => this.tick(), 125);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.active = true;
  }
  updateVolumes() {
    for (const voices of this.voices.values()) {
      for (const voice of voices) voice.volume = this.settings.sound / 100;
    }
    if (this.ctx) {
      this.effects.gain.value = this.settings.sound / 100;
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
    const voices = this.voices.get(key) ?? [];
    let voice = voices.find((audio) => audio.paused || audio.ended);
    if (!voice && voices.length < 8) {
      voice = new Audio(assetUrl(url));
      voices.push(voice);
      this.voices.set(key, voices);
    }
    voice ??= voices[0];
    voice.volume = this.settings.sound / 100;
    voice.currentTime = 0;
    try {
      await voice.play();
    } catch {}
  }
  tone(freq, type, time, length, gain = 0.2, output = this.music) {
    const o = this.ctx.createOscillator(),
      g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + length);
    o.connect(g);
    g.connect(output);
    o.start(time);
    o.stop(time + length);
  }
  startEndingMusic() {
    this.start();
    this.endingGain.gain.value = 1;
    this.endingMusic = true;
    this.step = 0;
  }
  stopEndingMusic() {
    this.endingMusic = false;
    if (this.endingGain) this.endingGain.gain.value = 0;
    this.active = false;
    this.step = 0;
  }
  endingTick(time = this.ctx.currentTime) {
    const step = this.step++;
    const beat = step % 64;
    const roots = [55, 43.65, 65.41, 49];
    const root = roots[Math.floor(beat / 16)];
    const note = (frequency, type, length, volume) =>
      this.tone(frequency, type, time, length, volume, this.endingGain);
    if (beat % 2 === 0) {
      note(root, 'sawtooth', 0.19, 0.14);
      note(root * 2, 'triangle', 0.22, 0.11);
    }
    if (beat % 16 === 0)
      for (const interval of [1, 1.2, 1.5])
        note(root * 4 * interval, 'triangle', 1.85, 0.11);
    const arpeggio = [1, 1.5, 2, 2.4, 2, 1.5, 1.2, 1.5];
    note(root * 4 * arpeggio[beat % 8], 'sine', 0.2, 0.13);
    if (step >= 64 && beat % 4 === 0) {
      const melody = [2, 2.4, 3, 2.4, 2, 1.5, 1.2, 1.5];
      note(root * 4 * melody[Math.floor(beat / 4) % 8], 'triangle', 0.43, 0.24);
    }
    if (beat % 4 === 0) {
      note(53, 'sine', 0.18, 1.15);
      note(106, 'sine', 0.035, 0.32);
    }
    if (beat % 4 === 2) {
      note(175, 'triangle', 0.09, 0.35);
      note(1180, 'triangle', 0.045, 0.14);
    }
    if (beat % 2) note(6500, 'triangle', 0.021, 0.08);
  }
  cinematicSound(kind) {
    if (!this.ctx || !this.settings.sound) return;
    if (kind === 'door') {
      this.play('sndDoorOpen');
      return;
    }
    const now = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.connect(this.effects);
    let source;
    let length;
    if (kind === 'explosion') {
      length = 2.4;
      const buffer = this.ctx.createBuffer(
        1,
        this.ctx.sampleRate * length,
        this.ctx.sampleRate,
      );
      const data = buffer.getChannelData(0);
      let low = 0;
      for (let i = 0; i < data.length; i++) {
        low = low * 0.93 + (Math.random() * 2 - 1) * 0.07;
        data[i] = low * 3;
      }
      source = this.ctx.createBufferSource();
      source.buffer = buffer;
      gain.gain.setValueAtTime(1.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + length);
    } else {
      source = this.ctx.createOscillator();
      source.type = kind === 'engine' ? 'sawtooth' : 'square';
      length = kind === 'engine' ? 3.5 : 0.12;
      source.frequency.setValueAtTime(kind === 'engine' ? 38 : 880, now);
      source.frequency.exponentialRampToValueAtTime(
        kind === 'engine' ? 165 : 440,
        now + length,
      );
      gain.gain.setValueAtTime(kind === 'engine' ? 0.08 : 0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + length);
    }
    source.connect(gain);
    this.cinematicNodes.add(source);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.cinematicNodes.delete(source);
    };
    source.start(now);
    source.stop(now + length);
  }
  stopCinematicSounds() {
    for (const source of this.cinematicNodes) {
      try {
        source.stop();
      } catch {}
    }
  }
  tick() {
    if (
      !this.ctx ||
      this.ctx.state !== 'running' ||
      !this.active ||
      !this.settings.music
    )
      return;
    if (this.endingMusic) {
      this.endingTick();
      return;
    }
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
