import { drawEnding } from './ending-art.js';
import { ENDING, endingCaption, endingPhase } from './ending-sequence.js';

export class EndingPlayer {
  constructor(root, image, audio, settings, onClose) {
    this.root = root;
    this.image = image;
    this.audio = audio;
    this.settings = settings;
    this.onClose = onClose;
    this.time = 0;
    this.disposed = false;
    this.musicStarted = false;
    this.played = new Set();
    this.listeners = new AbortController();
    this.canvas = root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.caption = root.querySelector('[data-ending-caption]');
    this.skip = root.querySelector('[data-ending-skip]');
    this.close = root.querySelector('[data-ending-close]');
    this.skip.hidden = false;
    this.skip.addEventListener('click', () => this.skipToCredits(), {
      signal: this.listeners.signal,
    });
    this.close.addEventListener('click', () => this.finish(), {
      signal: this.listeners.signal,
    });
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.repeat || !['Escape', 'Space', 'Enter'].includes(event.code))
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.code === 'Escape') this.finish();
        else if (event.target === this.close) this.finish();
        else if (this.time >= ENDING.credits) this.finish();
        else this.skipToCredits();
      },
      { capture: true, signal: this.listeners.signal },
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        this.lastFrame = null;
        this.audio.active = !document.hidden && this.musicStarted;
      },
      { signal: this.listeners.signal },
    );
    this.audio.start();
    this.audio.active = false;
    root.classList.remove('hidden');
    document.body.classList.add('ending-active');
    this.skip.focus({ preventScroll: true });
    this.render();
    this.frame = requestAnimationFrame((now) => this.animate(now));
  }
  animate(now) {
    if (this.disposed) return;
    const dt =
      this.lastFrame === null || this.lastFrame === undefined
        ? 0
        : Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (!document.hidden) this.advance(dt);
    this.render();
    this.frame = requestAnimationFrame((next) => this.animate(next));
  }
  advance(dt) {
    const previous = this.time;
    this.time += dt;
    for (const [time, sound] of [
      [2.1, 'door'],
      [7.7, 'detonator'],
      [9, 'explosion'],
      [19.3, 'door'],
      [21, 'engine'],
    ]) {
      if (previous < time && this.time >= time && !this.played.has(time)) {
        this.played.add(time);
        this.audio.cinematicSound(sound);
      }
    }
    if (this.time >= ENDING.highway && !this.musicStarted) {
      this.musicStarted = true;
      this.audio.startEndingMusic();
    }
  }
  render() {
    const effects =
      this.settings.effects &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    drawEnding(this.ctx, this.time, this.image, effects);
    const phase = endingPhase(this.time);
    if (phase !== this.phase) {
      this.phase = phase;
      this.root.dataset.phase = phase;
      this.caption.textContent = endingCaption(this.time);
      const focused = document.activeElement === this.skip;
      this.skip.hidden = this.time >= ENDING.credits;
      if (this.skip.hidden && focused)
        this.close.focus({ preventScroll: true });
    }
  }
  skipToCredits() {
    if (this.time >= ENDING.credits) return;
    this.audio.stopCinematicSounds();
    this.time = ENDING.credits;
    this.lastFrame = null;
    this.advance(0);
    this.render();
  }
  finish() {
    if (this.disposed) return;
    this.dispose();
    this.onClose();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.listeners.abort();
    this.audio.stopCinematicSounds();
    this.audio.stopEndingMusic();
    this.root.classList.add('hidden');
    document.body.classList.remove('ending-active');
  }
}
