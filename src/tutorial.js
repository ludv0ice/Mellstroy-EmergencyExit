import { UNARMED } from './weapons.js';

const steps = [
  [
    'move',
    'Движение',
    'Пройди в каждую сторону: W, A, S, D. На телефоне используй джойстик.',
  ],
  [
    'aim',
    'Прицеливание',
    'Подвигай мышью вокруг героя. Тело следует движению, а атака — прицелу.',
  ],
  [
    'punch',
    'Оглушение',
    'Подойди к отмеченному врагу и нажми ЛКМ без оружия. Кулак оглушает.',
  ],
  [
    'finish',
    'Добивание',
    'Подойди к оглушённому врагу и нажми Space. Не жди, пока он встанет.',
  ],
  [
    'pickup',
    'Ближнее оружие',
    'Подойди к отмеченной бите и нажми E. Оружие достаёт дальше кулака.',
  ],
  ['drop', 'Сброс', 'Нажми Q: оружие останется рядом, патроны не потеряются.'],
  ['retrieve', 'Повторный подбор', 'Подойди к сброшенной бите и нажми E.'],
  [
    'throw',
    'Бросок',
    'Наведи прицел на отмеченного врага и нажми ПКМ или F. Попадание оглушит его. При промахе подбери биту через E и повтори.',
  ],
  [
    'recover',
    'Верни оружие',
    'Подойди к брошенной бите и подбери её клавишей E.',
  ],
  [
    'melee',
    'Удар оружием',
    'Добей отмеченного врага битой: подойди и нажми ЛКМ.',
  ],
  ['gun', 'Стрелковое оружие', 'Подойди к отмеченному дробовику и нажми E.'],
  [
    'shoot',
    'Выстрел',
    'Наведи прицел на последнего врага и нажми ЛКМ. Следи за патронами внизу.',
  ],
  [
    'exit',
    'Выход',
    'Все приёмы освоены. Подойди к выходу и нажми E. Esc — пауза, R — перезапуск.',
  ],
];

// Level 00 advances on results in the world, never just on a key press.
export class Tutorial {
  constructor(sim) {
    this.sim = sim;
    this.index = 0;
    this.directions = new Set();
    sim.player.weapon = UNARMED;
    sim.player.ammo = 0;
  }
  get step() {
    return steps[this.index][0];
  }
  get hint() {
    const [, title, text] = steps[this.index];
    return {
      number: this.index + 1,
      total: steps.length,
      title,
      text,
      directions: [...this.directions],
    };
  }
  get target() {
    if (['move', 'aim', 'drop'].includes(this.step)) return null;
    if (['punch', 'finish'].includes(this.step)) return this.sim.enemies[0];
    if (['throw', 'melee'].includes(this.step)) return this.sim.enemies[1];
    if (this.step === 'shoot') return this.sim.enemies[2];
    if (this.step === 'exit') return this.sim.exit;
    const id = this.step === 'gun' ? 1 : 4;
    return this.sim.items.find((item) => !item.taken && item.weapon.id === id);
  }
  filterInput(input) {
    this.before = { x: this.sim.player.x, y: this.sim.player.y };
    this.startAngle ??= this.sim.player.angle;
    const canPickup =
      ['pickup', 'retrieve', 'recover', 'gun'].includes(this.step) ||
      (this.step === 'throw' && this.sim.player.weapon === UNARMED);
    const throwing = this.step === 'throw';
    // Accept the same keyboard, mouse and touch actions as normal play.
    return {
      ...input,
      attack: input.attack && ['punch', 'melee', 'shoot'].includes(this.step),
      execute: input.execute && this.step === 'finish',
      drop: input.drop && this.step === 'drop',
      throw: input.throw && throwing,
      weaponAction: input.weaponAction && (throwing || canPickup),
      pickup: input.pickup && canPickup,
      interact: input.interact && this.step === 'exit',
    };
  }
  update(input) {
    const sim = this.sim,
      p = sim.player;
    const [first, second, third] = sim.enemies;
    // Training targets wait for the lesson and stay down until the follow-up.
    for (const enemy of sim.enemies) {
      if (enemy.stun > 0) enemy.stun = Math.max(2, enemy.stun);
    }
    if (
      this.step === 'move' &&
      Math.hypot(p.x - this.before.x, p.y - this.before.y) > 0.1
    ) {
      if (input.moveX < 0) this.directions.add('A');
      if (input.moveX > 0) this.directions.add('D');
      if (input.moveY < 0) this.directions.add('W');
      if (input.moveY > 0) this.directions.add('S');
    }
    if (
      this.step === 'shoot' &&
      p.ammo === 0 &&
      third.alive &&
      sim.bullets.length === 0
    )
      p.ammo = 6;
    const done = {
      move: this.directions.size === 4,
      aim:
        Math.abs(
          Math.atan2(
            Math.sin(p.angle - this.startAngle),
            Math.cos(p.angle - this.startAngle),
          ),
        ) > 0.6,
      punch: first.stun > 0,
      finish: !first.alive,
      pickup: p.weapon.id === 4,
      drop: p.weapon === UNARMED,
      retrieve: p.weapon.id === 4,
      throw: second.stun > 0,
      recover: p.weapon.id === 4,
      melee: !second.alive,
      gun: p.weapon.id === 1,
      shoot: !third.alive,
      exit: false,
    };
    if (done[this.step]) {
      this.index++;
      this.startAngle = p.angle;
    }
  }
  allowsPickup(item) {
    return item.weapon.id === (this.step === 'gun' ? 1 : 4);
  }
  allowsHit(enemy) {
    return enemy === this.target;
  }
  get canExit() {
    return this.step === 'exit';
  }
}
