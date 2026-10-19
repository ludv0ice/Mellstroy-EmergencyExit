import { CHAPTERS } from './campaign.js';
import { CheatConsole } from './cheats.js';
import { MenuNavigation } from './menu-navigation.js';

const $ = (id) => document.getElementById(id);

function onClick(ids, action) {
  for (const id of ids) $(id).onclick = action;
}

export function updateHUD(app) {
  const tutorial = app.sim?.tutorial;
  const panel = $('tutorial');
  panel.classList.toggle('hidden', !tutorial || app.mode !== 'playing');
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
  const s = app.sim;
  if (!s) return;
  $('hud-number').textContent = app.chapter.number + ' /';
  $('hud-title').textContent = app.chapter.title;
  $('hud-floor').textContent =
    `ЛОКАЦИЯ ${app.floorIndex + 1} / ${app.chapter.rooms.length} · ${s.room.design?.title ?? app.profile.name}`;
  $('hud-enemies').textContent = s.cleared
    ? 'ПЕРИМЕТР ЧИСТ'
    : `${s.total - s.kills} / ${s.total} НА ПЕРИМЕТРЕ`;
  $('hud-score').textContent = (app.runScore + s.score).toLocaleString(
    'ru-RU',
  );
  $('weapon-name').textContent = s.player.weapon.name.toUpperCase();
  $('ammo').textContent = s.player.weapon.gun
    ? String(s.player.ammo).padStart(2, '0')
    : '';
  $('context').textContent = s.context;
  $('combo').classList.toggle(
    'hidden',
    s.combo < 2 || app.mode !== 'playing',
  );
  $('combo').textContent = s.combo + 'x COMBO';
}

export function renderChapters(app) {
  const list = $('chapter-list');
  list.replaceChildren();
  for (const chapter of CHAPTERS) {
    const b = document.createElement('button'),
      best = app.progress.best[chapter.index];
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
      (chapter.index > app.progress.unlocked ? ' · ЕЩЁ НЕ ПРОЙДЕНА' : '');
    text.append(strong, small);
    b.append(num, text);
    if (best) {
      const grade = document.createElement('span');
      grade.className = 'grade';
      grade.textContent = best.grade;
      b.append(grade);
    }
    b.addEventListener('click', () => app.briefing(chapter.index));
    list.append(b);
  }
}

export function bindUI(app, saveProgress) {
  app.cheats = new CheatConsole(app, saveProgress);
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
  onClick(['pause-button', 'resume'], () => app.togglePause());
  onClick(['restart', 'retry'], () => app.restart());
  onClick(['to-menu', 'death-menu', 'result-menu'], () => app.menu());
  $('result-retry').onclick = () => {
    app.resetRun();
    app.load(app.chapter.rooms[0]);
  };
  $('next').onclick = () => {
    if (app.chapter.index === CHAPTERS.length - 1) app.menu();
    else app.briefing(app.chapter.index + 1);
  };
  onClick(['settings-button', 'pause-settings'], () => app.showSettings());
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
  touchInput(app);
}
function touchInput(app) {
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
    };
    b.onpointerup = () => (app.view.controls.attack = false);
    b.onpointercancel = () => (app.view.controls.attack = false);
  }
}
