import { UNARMED } from './weapons.js';
const steps = [
  {
    id: 'move',
    title: 'Движение',
    text: 'Пройди в каждую сторону: W, A, S, D. На телефоне используй джойстик.',
  },
  {
    id: 'aim',
    title: 'Прицеливание',
    text: 'Подвигай мышью вокруг героя. Тело следует движению, а атака — прицелу.',
  },
  {
    id: 'punch',
    title: 'Оглушение',
    text: 'Подойди к отмеченному врагу и нажми ЛКМ без оружия. Кулак оглушает.',
  },
  {
    id: 'finish',
    title: 'Добивание',
    text: 'Подойди к оглушённому врагу и нажми Space. Не жди, пока он встанет.',
  },
  {
    id: 'pickup',
    title: 'Ближнее оружие',
    text: 'Подойди к отмеченной бите и нажми E. Оружие достаёт дальше кулака.',
  },
  {
    id: 'drop',
    title: 'Сброс',
    text: 'Нажми Q: оружие останется рядом, патроны не потеряются.',
  },
  {
    id: 'retrieve',
    title: 'Повторный подбор',
    text: 'Подойди к сброшенной бите и нажми E.',
  },
  {
    id: 'throw',
    title: 'Бросок',
    text: 'Наведи прицел на отмеченного врага и нажми ПКМ или F. Попадание оглушит его. При промахе подбери биту через E и повтори.',
  },
  {
    id: 'recover',
    title: 'Верни оружие',
    text: 'Подойди к брошенной бите и подбери её клавишей E.',
  },
  {
    id: 'melee',
    title: 'Удар оружием',
    text: 'Добей отмеченного врага битой: подойди и нажми ЛКМ.',
  },
  {
    id: 'gun',
    title: 'Стрелковое оружие',
    text: 'Подойди к отмеченному дробовику и нажми E.',
  },
  {
    id: 'shoot',
    title: 'Выстрел',
    text: 'Наведи прицел на последнего врага и нажми ЛКМ. Следи за патронами внизу.',
  },
  {
    id: 'exit',
    title: 'Выход',
    text: 'Все приёмы освоены. Подойди к выходу и нажми E. Esc — пауза, R — перезапуск.',
  },
];
export class Tutorial {
  constructor(sim) {
    this.sim = sim;
    this.index = 0;
    this.directions = new Set();
    sim.player.weapon = UNARMED;
    sim.player.ammo = 0;
  }
  get step() {
    return steps[this.index].id;
  }
  get hint() {
    const { title, text } = steps[this.index];
    return {
      number: this.index + 1,
      total: steps.length,
      title,
      text,
      directions: [...this.directions],
    };
  }
  get target() {
    if (['move', 'aim', 'drop'].includes(this.step)) {
      return null;
    }
    if (['punch', 'finish'].includes(this.step)) {
      return this.sim.enemies[0];
    }
    if (['throw', 'melee'].includes(this.step)) {
      return this.sim.enemies[1];
    }
    if (this.step === 'shoot') {
      return this.sim.enemies[2];
    }
    if (this.step === 'exit') {
      return this.sim.exit;
    }
    const id = this.step === 'gun' ? 1 : 4;
    return this.sim.items.find((item) => !item.taken && item.weapon.id === id);
  }
  filterInput(input) {
    this.before = {
      x: this.sim.player.x,
      y: this.sim.player.y,
    };
    this.startAngle ??= this.sim.player.angle;
    const canPickup =
      ['pickup', 'retrieve', 'recover', 'gun'].includes(this.step) ||
      (this.step === 'throw' && this.sim.player.weapon === UNARMED);
    const throwing = this.step === 'throw';
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
    const sim = this.sim;
    const player = sim.player;
    const [first, second, third] = sim.enemies;
    for (const enemy of sim.enemies) {
      if (enemy.stun > 0) {
        enemy.stun = Math.max(2, enemy.stun);
      }
    }
    if (
      this.step === 'move' &&
      Math.hypot(player.x - this.before.x, player.y - this.before.y) > 0.1
    ) {
      if (input.moveX < 0) {
        this.directions.add('A');
      }
      if (input.moveX > 0) {
        this.directions.add('D');
      }
      if (input.moveY < 0) {
        this.directions.add('W');
      }
      if (input.moveY > 0) {
        this.directions.add('S');
      }
    }
    if (
      this.step === 'shoot' &&
      player.ammo === 0 &&
      third.alive &&
      sim.bullets.length === 0
    ) {
      player.ammo = 6;
    }
    const done = {
      move: this.directions.size === 4,
      aim:
        Math.abs(
          Math.atan2(
            Math.sin(player.angle - this.startAngle),
            Math.cos(player.angle - this.startAngle),
          ),
        ) > 0.6,
      punch: first.stun > 0,
      finish: !first.alive,
      pickup: player.weapon.id === 4,
      drop: player.weapon === UNARMED,
      retrieve: player.weapon.id === 4,
      throw: second.stun > 0,
      recover: player.weapon.id === 4,
      melee: !second.alive,
      gun: player.weapon.id === 1,
      shoot: !third.alive,
      exit: false,
    };
    if (done[this.step]) {
      this.index++;
      this.startAngle = player.angle;
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
