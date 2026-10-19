import Phaser from 'phaser';
import './style.css';
import { GameView } from './renderer.js';
import { Simulation } from './simulation.js';
import { Tutorial } from './tutorial.js';
import { MenuNavigation } from './menu-navigation.js';
import { CHAPTERS, PROFILES } from './campaign.js';
import { AudioEngine } from './audio.js';
import { connectsTo } from './rooms.js';
import { readJson } from './assets.js';
import { EndingPlayer } from './ending.js';
import { endingUnlocked } from './ending-sequence.js';

const $ = (id) => document.getElementById(id);
const overlays = [
  'menu',
  'briefing',
  'chapter-panel',
  'pause',
  'death',
  'result',
  'settings',
];
function stored(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
const app = {
  mode: 'loading',
  manifest: null,
  skins: null,
  view: null,
  chapter: CHAPTERS[0],
  floorIndex: 0,
  profile: PROFILES[0],
  runScore: 0,
  runTime: 0,
  deaths: 0,
  progress: stored('emergency-exit-progress', {
    unlocked: 0,
    best: {},
    last: 0,
  }),
  settings: stored('emergency-exit-settings', {
    sound: 65,
    music: 35,
    effects: true,
    crt: true,
  }),
  cache: new Map(),
  floorStates: new Map(),
  checkpoints: new Map(),
  async room(id) {
    if (!this.cache.has(id)) {
      this.cache.set(id, await readJson('/assets/rooms/' + id + '.json'));
    }
    return this.cache.get(id);
  },
  overlay(id) {
    for (const name of overlays)
      $(name).classList.toggle('hidden', name !== id);
    this.menuNavigation?.show(id);
    if (this.view?.input.keyboard)
      this.view.input.keyboard.enabled = ['playing', 'paused', 'dead'].includes(
        this.mode,
      );
    this.view?.input.keyboard?.resetKeys();
    const playing = ['playing', 'paused', 'dead', 'result'].includes(this.mode);
    $('hud').classList.toggle('hidden', !playing);
    if (id || this.mode !== 'playing') $('tutorial').classList.add('hidden');
    $('weapon-hud').classList.toggle('hidden', !playing);
    $('touch-controls').classList.toggle(
      'hidden',
      this.mode !== 'playing' || !window.matchMedia('(pointer:coarse)').matches,
    );
  },
  async onReady(view) {
    this.view = view;
    try {
      const raw = await this.room('eeHideout');
      const sim = new Simulation(this.manifest, raw, PROFILES[0]);
      await view.setWorld(sim, true);
      $('loading').classList.add('hidden');
      this.menu();
    } catch (error) {
      this.fail(error);
    }
  },
  fail(error) {
    $('loading').classList.remove('hidden');
    $('load-label').textContent = error.message;
    console.error(error);
  },
  async load(id, carry = null, reuse = false) {
    this.mode = 'loading';
    this.overlay(null);
    $('loading').classList.remove('hidden');
    $('load-label').textContent = 'Загрузка ' + id + '…';
    $('load-progress').style.width = '70%';
    try {
      const raw = await this.room(id);
      const sim =
        reuse && this.floorStates.has(id)
          ? this.floorStates.get(id)
          : new Simulation(this.manifest, raw, this.profile);
      if (carry) {
        sim.player.weapon = carry.weapon;
        sim.player.ammo = carry.ammo;
        sim.player.armor = carry.armor;
        const entry =
          carry.from && sim.exits.find((e) => connectsTo(e, carry.from));
        if (entry) {
          const pos = sim.safeSpawn(entry);
          sim.player.x = pos.x;
          sim.player.y = pos.y;
        }
      }
      if (id === 'eeTraining') sim.tutorial = new Tutorial(sim);
      sim.status = 'playing';
      sim.player.alive = true;
      sim.grace = 0.6;
      if (!reuse || !this.checkpoints.has(id))
        this.checkpoints.set(id, {
          weapon: sim.player.weapon,
          ammo: sim.player.ammo,
          armor: sim.player.armor,
        });
      this.floorStates.set(id, sim);
      this.configureExit(sim);
      await this.view.setWorld(sim);
      this.sim = sim;
      this.mode = 'playing';
      this.overlay(null);
      $('loading').classList.add('hidden');
      this.audio.start();
      this.updateHUD();
      if (!sim.tutorial)
        this.toast(
          sim.total ? `ПЕРИМЕТР: ${sim.total} ПРОТИВНИКОВ` : 'НАЙДИ ВЫХОД',
        );
    } catch (error) {
      this.fail(error);
    }
  },
  briefing(index) {
    this.chapter = CHAPTERS[index];
    this.mode = 'briefing';
    this.overlay('briefing');
    $('brief-number').textContent =
      'ГЛАВА ' + this.chapter.number + ' / ПОБЕГ ИЗ ГОРОДА';
    $('brief-title').textContent = this.chapter.title;
    $('brief-text').textContent = this.chapter.brief;
    $('profile').disabled = index === 0;
    if (index === 0) $('profile').value = PROFILES[0].id;
    $('deploy').textContent = index === 0 ? 'НАЧАТЬ ОБУЧЕНИЕ' : 'НАЧАТЬ ГЛАВУ';
  },
  start() {
    this.profile =
      PROFILES.find((p) => p.id === $('profile').value) ?? PROFILES[0];
    if (this.chapter.index === 0) this.profile = PROFILES[0];
    this.floorIndex = 0;
    this.runScore = 0;
    this.runTime = 0;
    this.deaths = 0;
    this.floorStates.clear();
    this.checkpoints.clear();
    this.progress.last = this.chapter.index;
    save('emergency-exit-progress', this.progress);
    this.load(this.chapter.rooms[0]);
  },
  restart() {
    if (!this.sim) return;
    this.deaths++;
    this.load(this.sim.room.id, this.checkpoints.get(this.sim.room.id));
  },
  togglePause() {
    if (this.mode === 'playing') {
      this.mode = 'paused';
      this.overlay('pause');
      this.audio.active = false;
    } else if (this.mode === 'paused') {
      this.mode = 'playing';
      this.overlay(null);
      this.audio.active = true;
    }
  },
  showEnding() {
    if (!endingUnlocked(this.progress) || this.ending) return false;
    this.mode = 'ending';
    this.overlay(null);
    $('combo').classList.add('hidden');
    clearTimeout(this.toastTimer);
    $('toast').style.opacity = '0';
    this.ending = new EndingPlayer(
      $('ending'),
      this.view.images.get('custom-heroDirectional'),
      this.audio,
      this.settings,
      () => {
        this.ending = null;
        this.menu();
      },
    );
    return true;
  },
  menu() {
    this.mode = 'menu';
    this.overlay('menu');
    $('ending-button').hidden = !endingUnlocked(this.progress);
    $('continue').textContent = this.progress.unlocked
      ? 'ПРОДОЛЖИТЬ ПОБЕГ'
      : 'НАЧАТЬ ПОБЕГ';
    $('combo').classList.add('hidden');
    clearTimeout(this.toastTimer);
    $('toast').style.opacity = '0';
    $('toast').textContent = '';
    if (this.view) this.view.preview = true;
    this.audio.active = true;
    this.renderChapters();
  },
  onEvent(event) {
    if (event.type === 'death') {
      this.mode = 'dead';
      this.overlay('death');
      this.audio.active = false;
      $('combo').classList.add('hidden');
    }
    if (event.type === 'clear' && !this.sim.tutorial)
      this.toast('ПЕРИМЕТР ЧИСТ · К ВЫХОДУ');
    if (event.type === 'complete') this.complete();
  },
  configureExit(sim) {
    const next = this.chapter.rooms[this.floorIndex + 1];
    sim.exit =
      sim.exits.find((exit) =>
        next ? connectsTo(exit, next) : exit.transition === 'door',
      ) ?? sim.exit;
  },
  complete() {
    this.floorStates.set(this.sim.room.id, this.sim);
    if (this.floorIndex + 1 < this.chapter.rooms.length) {
      const carry = {
        weapon: this.sim.player.weapon,
        ammo: this.sim.player.ammo,
        armor: this.sim.player.armor,
        from: this.sim.room.id,
      };
      this.floorIndex += 1;
      this.runScore = [...this.floorStates.entries()]
        .filter(([id]) => id !== this.chapter.rooms[this.floorIndex])
        .reduce((n, [, s]) => n + s.score, 0);
      this.load(this.chapter.rooms[this.floorIndex], carry, true);
      return;
    }
    this.runScore = [...this.floorStates.values()].reduce(
      (n, s) => n + s.score,
      0,
    );
    this.runTime = [...this.floorStates.values()].reduce(
      (n, s) => n + s.elapsed,
      0,
    );
    this.mode = 'result';
    this.overlay('result');
    $('combo').classList.add('hidden');
    const base =
        [...this.floorStates.values()].reduce((n, s) => n + s.total, 0) * 400,
      grade =
        this.runScore > base * 2.5
          ? 'A+'
          : this.runScore > base * 1.6
            ? 'A'
            : this.runScore > base
              ? 'B'
              : 'C';
    $('result-score').textContent = this.runScore.toLocaleString('ru-RU');
    $('result-time').textContent = this.runTime.toFixed(1) + 's';
    $('result-grade').textContent = grade;
    $('result-title').textContent =
      this.chapter.index === 15 ? 'ГОРОД ПОЗАДИ.' : 'ЧИСТО.';
    this.progress.unlocked = Math.max(
      this.progress.unlocked,
      Math.min(CHAPTERS.length - 1, this.chapter.index + 1),
    );
    const best = this.progress.best[this.chapter.index];
    if (!best || best.score < this.runScore)
      this.progress.best[this.chapter.index] = {
        score: this.runScore,
        grade,
        time: this.runTime,
      };
    save('emergency-exit-progress', this.progress);
    this.progress.last = Math.min(CHAPTERS.length - 1, this.chapter.index + 1);
    save('emergency-exit-progress', this.progress);
    $('next').textContent =
      this.chapter.index === CHAPTERS.length - 1
        ? 'ЗАВЕРШИТЬ ПОБЕГ'
        : 'СЛЕДУЮЩАЯ ГЛАВА';
    if (
      this.chapter.index === CHAPTERS.length - 1 &&
      endingUnlocked(this.progress)
    )
      this.showEnding();
  },
  updateHUD() {
    const tutorial = this.sim?.tutorial;
    const panel = $('tutorial');
    panel.classList.toggle('hidden', !tutorial || this.mode !== 'playing');
    if (tutorial) {
      const hint = tutorial.hint;
      $('tutorial-progress').textContent =
        `ОБУЧЕНИЕ ${hint.number} / ${hint.total}`;
      $('tutorial-title').textContent = hint.title;
      $('tutorial-text').textContent = hint.text;
      $('tutorial-keys').textContent =
        tutorial.step === 'move'
          ? ['W', 'A', 'S', 'D']
              .map((key) => (hint.directions.includes(key) ? key + ' +' : key))
              .join('   ')
          : '';
    }
    const s = this.sim;
    if (!s) return;
    $('hud-number').textContent = this.chapter.number + ' /';
    $('hud-title').textContent = this.chapter.title;
    $('hud-floor').textContent =
      `ЛОКАЦИЯ ${this.floorIndex + 1} / ${this.chapter.rooms.length} · ${s.room.design?.title ?? this.profile.name}`;
    $('hud-enemies').textContent = s.cleared
      ? 'ПЕРИМЕТР ЧИСТ'
      : `${s.total - s.kills} / ${s.total} НА ПЕРИМЕТРЕ`;
    $('hud-score').textContent = (this.runScore + s.score).toLocaleString(
      'ru-RU',
    );
    $('weapon-name').textContent = s.player.weapon.name.toUpperCase();
    $('ammo').textContent = s.player.weapon.gun
      ? String(s.player.ammo).padStart(2, '0')
      : '';
    $('context').textContent = s.context;
    $('combo').classList.toggle(
      'hidden',
      s.combo < 2 || this.mode !== 'playing',
    );
    $('combo').textContent = s.combo + 'x COMBO';
  },
  toast(text) {
    $('toast').textContent = text;
    $('toast').style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => ($('toast').style.opacity = '0'), 2800);
  },
  renderChapters() {
    const list = $('chapter-list');
    list.replaceChildren();
    for (const chapter of CHAPTERS) {
      const b = document.createElement('button'),
        best = this.progress.best[chapter.index];
      const num = document.createElement('span');
      num.className = 'number';
      num.textContent = chapter.number;
      const text = document.createElement('span'),
        strong = document.createElement('strong'),
        small = document.createElement('small');
      strong.textContent = chapter.title;
      small.textContent =
        chapter.rooms.length +
        ' ЛОКАЦИИ' +
        (chapter.index > this.progress.unlocked ? ' · ЕЩЁ НЕ ПРОЙДЕНА' : '');
      text.append(strong, small);
      b.append(num, text);
      if (best) {
        const grade = document.createElement('span');
        grade.className = 'grade';
        grade.textContent = best.grade;
        b.append(grade);
      }
      b.addEventListener('click', () => this.briefing(chapter.index));
      list.append(b);
    }
  },
  settingsFrom: null,
  showSettings() {
    this.settingsFrom = this.mode;
    this.mode = 'settings';
    this.overlay('settings');
    this.audio.active = false;
  },
  applySettings() {
    document.body.classList.toggle('no-crt', !this.settings.crt);
    this.audio?.updateVolumes();
    save('emergency-exit-settings', this.settings);
  },
};

async function boot() {
  try {
    [app.manifest, app.skins] = await Promise.all([
      readJson('/assets/manifest.json'),
      readJson('/assets/custom/skins.json'),
    ]);
    app.audio = new AudioEngine(app.manifest, app.settings);
    app.applySettings();
    for (const profile of PROFILES) {
      const o = document.createElement('option');
      o.value = profile.id;
      o.textContent = profile.name + ' — ' + profile.tag;
      $('profile').append(o);
    }
    app.renderChapters();
    $('load-progress').style.width = '35%';
    const scene = new GameView();
    scene.app = app;
    app.game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent: 'game',
      backgroundColor: '#130d21',
      antialias: false,
      pixelArt: true,
      roundPixels: true,
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: window.innerWidth,
        height: window.innerHeight,
      },
      scene: [scene],
      audio: { noAudio: true },
      input: { activePointers: 3 },
      fps: { target: 60, forceSetTimeOut: false },
    });
    bindUI();
    window.__GAME__ = {
      getState: () => app.sim?.snapshot() ?? { status: app.mode },
      get mode() {
        return app.mode;
      },
      get stats() {
        return app.manifest.stats;
      },
      get camera() {
        return {
          x: app.view.cameraPoint.x,
          y: app.view.cameraPoint.y,
          zoom: app.view.zoom,
        };
      },
    };
  } catch (error) {
    app.fail(error);
  }
}
function bindUI() {
  app.menuNavigation = new MenuNavigation();
  $('continue').textContent = app.progress.unlocked
    ? 'ПРОДОЛЖИТЬ ПОБЕГ'
    : 'НАЧАТЬ ПОБЕГ';
  $('continue').onclick = () => {
    app.audio.start();
    app.briefing(app.progress.last ?? 0);
  };
  $('deploy').onclick = () => app.start();
  $('ending-button').onclick = () => app.showEnding();
  $('chapters-button').onclick = () => {
    app.mode = 'chapters';
    app.renderChapters();
    app.overlay('chapter-panel');
  };
  for (const b of document.querySelectorAll('.back'))
    b.onclick = () => app.menu();
  $('pause-button').onclick = () => app.togglePause();
  $('resume').onclick = () => app.togglePause();
  $('restart').onclick = () => app.restart();
  for (const id of ['to-menu', 'death-menu', 'result-menu'])
    $(id).onclick = () => app.menu();
  $('retry').onclick = () => app.restart();
  $('result-retry').onclick = () => {
    app.runScore = 0;
    app.runTime = 0;
    app.floorIndex = 0;
    app.floorStates.clear();
    app.checkpoints.clear();
    app.load(app.chapter.rooms[0]);
  };
  $('next').onclick = () => {
    if (app.chapter.index === CHAPTERS.length - 1) app.menu();
    else app.briefing(app.chapter.index + 1);
  };
  $('settings-button').onclick = () => app.showSettings();
  $('pause-settings').onclick = () => app.showSettings();
  $('settings-back').onclick = () => {
    app.mode = app.settingsFrom;
    if (app.mode === 'paused') app.overlay('pause');
    else app.menu();
  };
  for (const [id, key] of [
    ['sound-volume', 'sound'],
    ['music-volume', 'music'],
  ]) {
    $(id).value = app.settings[key];
    $(id).oninput = () => {
      app.settings[key] = Number($(id).value);
      app.audio.start();
      app.applySettings();
    };
  }
  for (const key of ['effects', 'crt']) {
    $(key).checked = app.settings[key];
    $(key).onchange = () => {
      app.settings[key] = $(key).checked;
      app.applySettings();
    };
  }
  $('fullscreen').onclick = () => {
    if (!document.fullscreenElement)
      document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  };
  window.addEventListener('blur', () => {
    if (app.mode === 'playing') app.togglePause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && app.mode === 'playing') app.togglePause();
  });
  touchInput();
}
function touchInput() {
  const pad = $('move-pad'),
    stick = pad.querySelector('i');
  let touch = null;
  pad.onpointerdown = (e) => {
    touch = e.pointerId;
    pad.setPointerCapture(touch);
    app.audio.start();
    update(e);
  };
  pad.onpointermove = (e) => {
    if (e.pointerId === touch) update(e);
  };
  function update(e) {
    const r = pad.getBoundingClientRect(),
      dx = (e.clientX - r.left - 60) / 45,
      dy = (e.clientY - r.top - 60) / 45,
      length = Math.max(1, Math.hypot(dx, dy));
    app.view.controls.moveX = dx / length;
    app.view.controls.moveY = dy / length;
    stick.style.transform = `translate(${(dx / length) * 35}px,${(dy / length) * 35}px)`;
  }
  const end = () => {
    touch = null;
    app.view.controls.moveX = 0;
    app.view.controls.moveY = 0;
    stick.style.transform = '';
  };
  pad.onpointerup = end;
  pad.onpointercancel = end;
  for (const b of document.querySelectorAll('[data-action]')) {
    b.onpointerdown = (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      const a = b.dataset.action;
      if (a === 'attack') app.view.controls.attack = true;
      else app.view.pending[a] = true;
      if (a === 'pickup') app.view.pending.pickup = true;
    };
    b.onpointerup = () => (app.view.controls.attack = false);
    b.onpointercancel = () => (app.view.controls.attack = false);
  }
}
boot();
