import { GameView } from './renderer.js';
import { Simulation } from './simulation.js';
import { Tutorial } from './tutorial.js';
import { CHAPTERS, PROFILES } from './campaign.js';
import { AudioEngine } from './audio.js';
import { connectsTo } from './levels.js';
import { readJson } from './assets.js';
import { EndingPlayer, endingSprites } from './ending.js';
import { endingUnlocked } from './ending-data.js';
import { bindUI, updateHUD, renderChapters } from './ui.js';
const Phaser = globalThis.Phaser;
const elementById = (id) => document.getElementById(id);
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
    for (const name of overlays) {
      elementById(name).classList.toggle('hidden', name !== id);
    }
    this.menuNavigation?.show(id);
    if (this.view?.input.keyboard) {
      this.view.input.keyboard.enabled = ['playing', 'paused', 'dead'].includes(
        this.mode,
      );
    }
    this.view?.input.keyboard?.resetKeys();
    const playing = ['playing', 'paused', 'dead', 'result'].includes(this.mode);
    elementById('hud').classList.toggle('hidden', !playing);
    if (id || this.mode !== 'playing') {
      elementById('tutorial').classList.add('hidden');
    }
    elementById('weapon-hud').classList.toggle('hidden', !playing);
    elementById('touch-controls').classList.toggle(
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
      elementById('loading').classList.add('hidden');
      this.menu();
    } catch (error) {
      this.fail(error);
    }
  },
  fail(error) {
    elementById('loading').classList.remove('hidden');
    elementById('load-label').textContent = error.message;
    console.error(error);
  },
  async load(id, carry = null, reuse = false) {
    this.mode = 'loading';
    this.overlay(null);
    elementById('loading').classList.remove('hidden');
    elementById('load-label').textContent = 'Загрузка ' + id + '…';
    elementById('load-progress').style.width = '70%';
    try {
      const raw = await this.room(id);
      const sim =
        reuse && this.floorStates.has(id)
          ? this.floorStates.get(id)
          : new Simulation(this.manifest, raw, this.profile);
      if (this.cheats) {
        sim.cheats = this.cheats.flags;
      }
      if (carry) {
        sim.player.weapon = carry.weapon;
        sim.player.ammo = carry.ammo;
        sim.player.armor = carry.armor;
        const entry = carry.from && sim.exits.find((e) => connectsTo(e, carry.from));
        if (entry) {
          const pos = sim.safeSpawn(entry);
          sim.player.x = pos.x;
          sim.player.y = pos.y;
        }
      }
      if (id === 'eeTraining') {
        sim.tutorial = new Tutorial(sim);
      }
      sim.status = 'playing';
      sim.player.alive = true;
      sim.grace = 0.6;
      if (!reuse || !this.checkpoints.has(id)) {
        this.checkpoints.set(id, {
          weapon: sim.player.weapon,
          ammo: sim.player.ammo,
          armor: sim.player.armor,
        });
      }
      this.floorStates.set(id, sim);
      this.configureExit(sim);
      await this.view.setWorld(sim);
      this.sim = sim;
      this.mode = 'playing';
      this.overlay(null);
      elementById('loading').classList.add('hidden');
      this.audio.start();
      this.updateHUD();
      if (!sim.tutorial) {
        this.toast(sim.total ? `ПЕРИМЕТР: ${sim.total} ПРОТИВНИКОВ` : 'НАЙДИ ВЫХОД');
      }
    } catch (error) {
      this.fail(error);
    }
  },
  briefing(index) {
    this.chapter = CHAPTERS[index];
    this.mode = 'briefing';
    this.overlay('briefing');
    elementById('brief-number').textContent =
      'ГЛАВА ' + this.chapter.number + ' / ПОБЕГ ИЗ ГОРОДА';
    elementById('brief-title').textContent = this.chapter.title;
    elementById('brief-text').textContent = this.chapter.brief;
    elementById('profile').disabled = index === 0;
    if (index === 0) {
      elementById('profile').value = PROFILES[0].id;
    }
    elementById('deploy').textContent = index === 0 ? 'НАЧАТЬ ОБУЧЕНИЕ' : 'НАЧАТЬ ГЛАВУ';
  },
  start() {
    this.profile =
      PROFILES.find((p) => p.id === elementById('profile').value) ?? PROFILES[0];
    if (this.chapter.index === 0) {
      this.profile = PROFILES[0];
    }
    this.resetRun();
    this.deaths = 0;
    this.progress.last = this.chapter.index;
    save('emergency-exit-progress', this.progress);
    this.load(this.chapter.rooms[0]);
  },
  resetRun() {
    this.floorIndex = 0;
    this.runScore = 0;
    this.runTime = 0;
    this.floorStates.clear();
    this.checkpoints.clear();
  },
  restart() {
    if (!this.sim) {
      return;
    }
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
    if (!endingUnlocked(this.progress) || this.ending) {
      return false;
    }
    this.mode = 'ending';
    this.overlay(null);
    elementById('combo').classList.add('hidden');
    clearTimeout(this.toastTimer);
    elementById('toast').style.opacity = '0';
    this.ending = new EndingPlayer(
      elementById('ending'),
      endingSprites(this.view.images, this.skins, this.manifest),
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
    elementById('ending-button').hidden = !endingUnlocked(this.progress);
    elementById('continue').textContent = this.progress.unlocked
      ? 'ПРОДОЛЖИТЬ ПОБЕГ'
      : 'НАЧАТЬ ПОБЕГ';
    elementById('combo').classList.add('hidden');
    clearTimeout(this.toastTimer);
    elementById('toast').style.opacity = '0';
    elementById('toast').textContent = '';
    if (this.view) {
      this.view.preview = true;
    }
    this.audio.active = true;
    this.renderChapters();
  },
  onEvent(event) {
    if (event.type === 'death') {
      this.mode = 'dead';
      this.overlay('death');
      this.audio.active = false;
      elementById('combo').classList.add('hidden');
    }
    if (event.type === 'clear' && !this.sim.tutorial) {
      this.toast('ПЕРИМЕТР ЧИСТ · К ВЫХОДУ');
    }
    if (event.type === 'complete') {
      this.complete();
    }
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
    this.runScore = [...this.floorStates.values()].reduce((n, s) => n + s.score, 0);
    this.runTime = [...this.floorStates.values()].reduce((n, s) => n + s.elapsed, 0);
    this.mode = 'result';
    this.overlay('result');
    elementById('combo').classList.add('hidden');
    const base = [...this.floorStates.values()].reduce(
      (total, floor) => total + floor.total * 400,
      0,
    );
    const grade = gradeFor(this.runScore, base);
    elementById('result-score').textContent = this.runScore.toLocaleString('ru-RU');
    elementById('result-time').textContent = this.runTime.toFixed(1) + 's';
    elementById('result-grade').textContent = grade;
    elementById('result-title').textContent =
      this.chapter.index === 15 ? 'ГОРОД ПОЗАДИ.' : 'ЧИСТО.';
    this.progress.unlocked = Math.max(
      this.progress.unlocked,
      Math.min(CHAPTERS.length - 1, this.chapter.index + 1),
    );
    const best = this.progress.best[this.chapter.index];
    if (!best || best.score < this.runScore) {
      this.progress.best[this.chapter.index] = {
        score: this.runScore,
        grade,
        time: this.runTime,
      };
    }
    this.progress.last = Math.min(CHAPTERS.length - 1, this.chapter.index + 1);
    save('emergency-exit-progress', this.progress);
    elementById('next').textContent =
      this.chapter.index === CHAPTERS.length - 1 ? 'ЗАВЕРШИТЬ ПОБЕГ' : 'СЛЕДУЮЩАЯ ГЛАВА';
    if (this.chapter.index === CHAPTERS.length - 1 && endingUnlocked(this.progress)) {
      this.showEnding();
    }
  },
  updateHUD() {
    updateHUD(this);
  },
  toast(text) {
    elementById('toast').textContent = text;
    elementById('toast').style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (elementById('toast').style.opacity = '0'), 2800);
  },
  renderChapters() {
    renderChapters(this);
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
function gradeFor(score, base) {
  if (score > base * 2.5) {
    return 'A+';
  }
  if (score > base * 1.6) {
    return 'A';
  }
  if (score > base) {
    return 'B';
  }
  return 'C';
}
async function boot() {
  try {
    [app.manifest, app.skins] = await Promise.all([
      readJson('/assets/manifest.json'),
      readJson('/assets/custom/skins.json'),
    ]);
    app.audio = new AudioEngine(app.manifest, app.settings);
    app.applySettings();
    for (const profile of PROFILES) {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.name + ' — ' + profile.tag;
      elementById('profile').append(option);
    }
    app.renderChapters();
    elementById('load-progress').style.width = '35%';
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
      audio: {
        noAudio: true,
      },
      input: {
        activePointers: 3,
      },
      fps: {
        target: 60,
        forceSetTimeOut: false,
      },
    });
    bindUI(app, () => save('emergency-exit-progress', app.progress));
    window.__GAME__ = {
      getState: () =>
        app.sim?.snapshot() ?? {
          status: app.mode,
        },
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
boot();
