const panels = ['menu', 'pause', 'briefing', 'chapter-panel'];

export class MenuNavigation {
  constructor() {
    this.panel = null;
    this.index = 0;
    document.addEventListener('keydown', (event) => this.keydown(event), true);
    for (const panel of panels) {
      const track = (event) => {
        const button = event.target.closest('button');
        if (button && this.buttons.includes(button))
          this.select(this.buttons.indexOf(button), false);
      };
      const element = document.getElementById(panel);
      element.addEventListener('pointerover', track);
      element.addEventListener('focusin', track);
    }
  }
  get buttons() {
    if (!this.panel) return [];
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
    if (this.panel) this.select(0, true);
  }
  select(index, focus) {
    const buttons = this.buttons;
    if (!buttons.length) return;
    this.index = (index + buttons.length) % buttons.length;
    buttons.forEach((button, i) =>
      button.classList.toggle('menu-selected', i === this.index),
    );
    if (focus) buttons[this.index].focus({ preventScroll: true });
    if (focus && this.panel.id === 'chapter-panel')
      buttons[this.index].scrollIntoView({ block: 'nearest' });
  }
  keydown(event) {
    if (!this.panel || this.panel.classList.contains('hidden')) return;
    if (event.target.matches('select, input')) return;
    const direction = { KeyW: -1, ArrowUp: -1, KeyS: 1, ArrowDown: 1 }[
      event.code
    ];
    if (!direction && event.code !== 'Enter' && event.code !== 'NumpadEnter')
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    if (direction) this.select(this.index + direction, true);
    else this.buttons[this.index]?.click();
  }
}
