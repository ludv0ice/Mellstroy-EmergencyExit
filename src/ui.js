import { CHAPTERS } from './campaign.js';
import { CheatConsole } from './cheats.js';
const elementById = (id) => document.getElementById(id);
function onClick(ids, action) {
  for (const id of ids) {
    elementById(id).onclick = action;
  }
}
export function updateHUD(app) {
  const tutorial = app.sim?.tutorial;
  const panel = elementById('tutorial');
  panel.classList.toggle('hidden', !tutorial || app.mode !== 'playing');
  if (tutorial) {
    const hint = tutorial.hint;
    elementById('tutorial-progress').textContent =
      `ОБУЧЕНИЕ ${hint.number} / ${hint.total}`;
    elementById('tutorial-title').textContent = hint.title;
    elementById('tutorial-text').textContent = hint.text;
    elementById('tutorial-keys').textContent =
      tutorial.step === 'move'
        ? ['W', 'A', 'S', 'D']
            .map((key) => (hint.directions.includes(key) ? key + ' +' : key))
            .join('   ')
        : '';
  }
  const sim = app.sim;
  if (!sim) {
    return;
  }
  elementById('hud-number').textContent = app.chapter.number + ' /';
  elementById('hud-title').textContent = app.chapter.title;
  elementById('hud-floor').textContent =
    `ЛОКАЦИЯ ${app.floorIndex + 1} / ${app.chapter.rooms.length} · ${sim.room.design?.title ?? app.profile.name}`;
  elementById('hud-enemies').textContent = sim.cleared
    ? 'ПЕРИМЕТР ЧИСТ'
    : `${sim.total - sim.kills} / ${sim.total} НА ПЕРИМЕТРЕ`;
  elementById('hud-score').textContent = (app.runScore + sim.score).toLocaleString(
    'ru-RU',
  );
  elementById('weapon-name').textContent = sim.player.weapon.name.toUpperCase();
  elementById('ammo').textContent = sim.player.weapon.gun
    ? String(sim.player.ammo).padStart(2, '0')
    : '';
  elementById('context').textContent = sim.context;
  elementById('combo').classList.toggle(
    'hidden',
    sim.combo < 2 || app.mode !== 'playing',
  );
  elementById('combo').textContent = sim.combo + 'x COMBO';
}
export function renderChapters(app) {
  const list = elementById('chapter-list');
  list.replaceChildren();
  for (const chapter of CHAPTERS) {
    const button = document.createElement('button');
    const best = app.progress.best[chapter.index];
    const number = document.createElement('span');
    number.className = 'number';
    number.textContent = chapter.number;
    const text = document.createElement('span');
    const strong = document.createElement('strong');
    const small = document.createElement('small');
    strong.textContent = chapter.title;
    small.textContent =
      chapter.rooms.length +
      ' ЛОКАЦИИ' +
      (chapter.index > app.progress.unlocked ? ' · ЕЩЁ НЕ ПРОЙДЕНА' : '');
    text.append(strong, small);
    button.append(number, text);
    if (best) {
      const grade = document.createElement('span');
      grade.className = 'grade';
      grade.textContent = best.grade;
      button.append(grade);
    }
    button.addEventListener('click', () => app.briefing(chapter.index));
    list.append(button);
  }
}
export function bindUI(app, saveProgress) {
  app.cheats = new CheatConsole(app, saveProgress);
  app.menuNavigation = new MenuNavigation();
  elementById('continue').textContent = app.progress.unlocked
    ? 'ПРОДОЛЖИТЬ ПОБЕГ'
    : 'НАЧАТЬ ПОБЕГ';
  elementById('continue').onclick = () => {
    app.audio.start();
    app.briefing(app.progress.last ?? 0);
  };
  elementById('deploy').onclick = () => app.start();
  elementById('ending-button').onclick = () => app.showEnding();
  elementById('chapters-button').onclick = () => {
    app.mode = 'chapters';
    app.renderChapters();
    app.overlay('chapter-panel');
  };
  for (const button of document.querySelectorAll('.back')) {
    button.onclick = () => app.menu();
  }
  onClick(['pause-button', 'resume'], () => app.togglePause());
  onClick(['restart', 'retry'], () => app.restart());
  onClick(['to-menu', 'death-menu', 'result-menu'], () => app.menu());
  elementById('result-retry').onclick = () => {
    app.resetRun();
    app.load(app.chapter.rooms[0]);
  };
  elementById('next').onclick = () => {
    if (app.chapter.index === CHAPTERS.length - 1) {
      app.menu();
    } else {
      app.briefing(app.chapter.index + 1);
    }
  };
  onClick(['settings-button', 'pause-settings'], () => app.showSettings());
  elementById('settings-back').onclick = () => {
    app.mode = app.settingsFrom;
    if (app.mode === 'paused') {
      app.overlay('pause');
    } else {
      app.menu();
    }
  };
  for (const [id, key] of [
    ['sound-volume', 'sound'],
    ['music-volume', 'music'],
  ]) {
    elementById(id).value = app.settings[key];
    elementById(id).oninput = () => {
      app.settings[key] = Number(elementById(id).value);
      app.audio.start();
      app.applySettings();
    };
  }
  for (const key of ['effects', 'crt']) {
    elementById(key).checked = app.settings[key];
    elementById(key).onchange = () => {
      app.settings[key] = elementById(key).checked;
      app.applySettings();
    };
  }
  elementById('fullscreen').onclick = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };
  window.addEventListener('blur', () => {
    if (app.mode === 'playing') {
      app.togglePause();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && app.mode === 'playing') {
      app.togglePause();
    }
  });
  touchInput(app);
}
function touchInput(app) {
  const pad = elementById('move-pad');
  const stick = pad.querySelector('i');
  let touch = null;
  pad.onpointerdown = (event) => {
    touch = event.pointerId;
    pad.setPointerCapture(touch);
    app.audio.start();
    update(event);
  };
  pad.onpointermove = (event) => {
    if (event.pointerId === touch) {
      update(event);
    }
  };
  function update(event) {
    const bounds = pad.getBoundingClientRect();
    const dx = (event.clientX - bounds.left - 60) / 45;
    const dy = (event.clientY - bounds.top - 60) / 45;
    const length = Math.max(1, Math.hypot(dx, dy));
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
  for (const button of document.querySelectorAll('[data-action]')) {
    button.onpointerdown = (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      const action = button.dataset.action;
      if (action === 'attack') {
        app.view.controls.attack = true;
      } else {
        app.view.pending[action] = true;
      }
    };
    button.onpointerup = () => (app.view.controls.attack = false);
    button.onpointercancel = () => (app.view.controls.attack = false);
  }
}
const panels = ['menu', 'pause', 'briefing', 'chapter-panel'];
export class MenuNavigation {
  constructor() {
    this.panel = null;
    this.index = 0;
    document.addEventListener('keydown', (event) => this.keydown(event), true);
    for (const panel of panels) {
      const track = (event) => {
        const button = event.target.closest('button');
        if (button && this.buttons.includes(button)) {
          this.select(this.buttons.indexOf(button), false);
        }
      };
      const element = document.getElementById(panel);
      element.addEventListener('pointerover', track);
      element.addEventListener('focusin', track);
    }
  }
  get buttons() {
    if (!this.panel) {
      return [];
    }
    const buttons =
      this.panel.id === 'chapter-panel'
        ? [
            ...this.panel.querySelectorAll('#chapter-list button'),
            this.panel.querySelector('.back'),
          ]
        : [...this.panel.querySelectorAll('button')];
    return buttons.filter(
      (button) => button && !button.disabled && button.getClientRects().length,
    );
  }
  show(id) {
    document
      .querySelectorAll('.menu-selected')
      .forEach((button) => button.classList.remove('menu-selected'));
    this.panel = panels.includes(id) ? document.getElementById(id) : null;
    this.index = 0;
    if (this.panel) {
      this.select(0, true);
    }
  }
  select(index, focus) {
    const buttons = this.buttons;
    if (!buttons.length) {
      return;
    }
    this.index = (index + buttons.length) % buttons.length;
    buttons.forEach((button, i) =>
      button.classList.toggle('menu-selected', i === this.index),
    );
    if (focus) {
      buttons[this.index].focus({
        preventScroll: true,
      });
    }
    if (focus && this.panel.id === 'chapter-panel') {
      buttons[this.index].scrollIntoView({
        block: 'nearest',
      });
    }
  }
  keydown(event) {
    if (!this.panel || this.panel.classList.contains('hidden')) {
      return;
    }
    if (event.target.matches('select, input')) {
      return;
    }
    const direction = {
      KeyW: -1,
      ArrowUp: -1,
      KeyS: 1,
      ArrowDown: 1,
    }[event.code];
    if (!direction && event.code !== 'Enter' && event.code !== 'NumpadEnter') {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) {
      return;
    }
    if (direction) {
      this.select(this.index + direction, true);
    } else {
      this.buttons[this.index]?.click();
    }
  }
}
