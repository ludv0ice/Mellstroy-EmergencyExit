import { CHAPTERS } from './campaign.js';
import { endingUnlocked } from './ending-sequence.js';

export function completeCampaign(progress) {
  const best = { ...progress.best };
  for (const chapter of CHAPTERS)
    if (!Number.isFinite(best[chapter.index]?.score))
      best[chapter.index] = { score: 0, grade: 'C', time: 0 };
  return {
    ...progress,
    best,
    unlocked: CHAPTERS.length - 1,
    last: CHAPTERS.length - 1,
  };
}

export function clearLocation(sim) {
  sim.tutorial = null;
  for (const enemy of sim.enemies) sim.kill(enemy, 'cheat');
  sim.bullets = sim.bullets.filter((bullet) => bullet.team === 'player');
  sim.checkClear();
}

export class CheatConsole {
  constructor(app, persist) {
    this.app = app;
    this.persist = persist;
    this.flags = { god: false };
    this.root = document.getElementById('cheat-console');
    this.input = this.root.querySelector('input');
    this.output = this.root.querySelector('[data-cheat-output]');
    this.history = [];
    this.historyIndex = 0;
    this.lines = ['Консоль. help — список команд. F2 / Ё / Esc — закрыть.'];
    this.output.textContent = this.lines[0];
    this.root.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      this.submit();
    });
    this.root.querySelector('[data-cheat-close]').onclick = () => this.close();
    document.addEventListener('keydown', (event) => this.keydown(event), true);
    document.addEventListener(
      'keyup',
      (event) => {
        if (this.opened) event.stopImmediatePropagation();
      },
      true,
    );
  }
  keydown(event) {
    if (['F2', 'Backquote'].includes(event.code)) {
      if (!this.opened && ['loading', 'ending'].includes(this.app.mode)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) this.opened ? this.close() : this.open();
      return;
    }
    if (!this.opened) return;
    event.stopImmediatePropagation();
    if (event.code === 'Tab') {
      event.preventDefault();
      const controls = [...this.root.querySelectorAll('button, input')];
      const index = controls.indexOf(document.activeElement);
      const next =
        (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
      controls[next].focus({ preventScroll: true });
    } else if (event.code === 'Escape') {
      event.preventDefault();
      this.close();
    } else if (event.code === 'Enter' && event.target === this.input) {
      event.preventDefault();
      if (!event.repeat) this.submit();
    } else if (
      ['ArrowUp', 'ArrowDown'].includes(event.code) &&
      event.target === this.input
    ) {
      event.preventDefault();
      this.historyIndex = Math.max(
        0,
        Math.min(
          this.history.length,
          this.historyIndex + (event.code === 'ArrowUp' ? -1 : 1),
        ),
      );
      this.input.value = this.history[this.historyIndex] ?? '';
    }
  }
  open() {
    if (this.opened || !this.app.view) return;
    this.previousMode = this.app.mode;
    this.previousPanel =
      document.querySelector('.overlay:not(.hidden)')?.id ?? null;
    this.app.mode = 'console';
    this.app.menuNavigation.show(null);
    this.app.view.input.keyboard.enabled = false;
    this.app.view.input.keyboard.resetKeys();
    this.app.view.pending = {};
    Object.assign(this.app.view.controls, {
      moveX: 0,
      moveY: 0,
      attack: false,
    });
    document.getElementById('touch-controls').classList.add('hidden');
    this.opened = true;
    this.root.classList.remove('hidden');
    this.input.value = '';
    this.input.focus({ preventScroll: true });
  }
  close() {
    if (!this.opened) return;
    this.opened = false;
    this.root.classList.add('hidden');
    this.input.blur();
    if (this.returnToMenu) {
      this.returnToMenu = false;
      this.app.menu();
    } else {
      this.app.mode = this.previousMode;
      this.app.overlay(this.previousPanel);
    }
  }
  log(text) {
    this.lines.push(text);
    this.lines = this.lines.slice(-30);
    this.output.textContent = this.lines.join('\n');
    this.output.scrollTop = this.output.scrollHeight;
  }
  submit() {
    const line = this.input.value.trim();
    this.input.value = '';
    if (!line) return;
    this.history.push(line);
    this.history = this.history.slice(-30);
    this.historyIndex = this.history.length;
    this.log('> ' + line);
    this.log(this.execute(line));
    if (this.opened) this.input.focus({ preventScroll: true });
  }
  execute(line) {
    const [command, argument, ...extra] = line
      .toLowerCase()
      .trim()
      .split(/\s+/);
    if (command === 'help' && !argument)
      return 'god [on/off] — неуязвимость\nclear — зачистить текущую локацию\nwin — пройти текущую локацию и перейти дальше\nwinall — пройти всю кампанию и открыть финал\nfinale — посмотреть открытый финал';
    if (command === 'god') {
      if (extra.length || (argument && !['on', 'off'].includes(argument)))
        return 'Формат: god, god on или god off';
      this.flags.god = argument ? argument === 'on' : !this.flags.god;
      if (this.app.sim) this.app.sim.cheats = this.flags;
      return 'Неуязвимость: ' + (this.flags.god ? 'ВКЛ' : 'ВЫКЛ');
    }
    if (argument) return 'Лишние аргументы. help — список команд.';
    if (command === 'winall') {
      this.app.progress = completeCampaign(this.app.progress);
      this.persist();
      this.returnToMenu = true;
      return 'Все 22 уровня пройдены. Прогресс сохранён. Закрой консоль — финал доступен в меню.';
    }
    if (command === 'finale') {
      if (!endingUnlocked(this.app.progress))
        return 'Финал ещё закрыт. Сначала пройди все уровни или введи winall.';
      this.close();
      this.app.showEnding();
      return 'Финальная катсцена.';
    }
    if (['clear', 'win'].includes(command)) {
      const sim = this.app.sim;
      if (
        !['playing', 'paused'].includes(this.previousMode) ||
        !sim?.player.alive
      )
        return 'Сначала запусти уровень.';
      clearLocation(sim);
      if (command === 'win') {
        this.returnToMenu = false;
        this.close();
        sim.status = 'complete';
        this.app.complete();
        return 'Локация пройдена.';
      }
      return 'Локация зачищена. Выход открыт.';
    }
    return 'Неизвестная команда. help — список команд.';
  }
}
