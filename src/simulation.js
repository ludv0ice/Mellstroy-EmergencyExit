import { WEAPONS, UNARMED, weaponBySprite } from './weapons.js';
import { buildRoom, rectFor } from './levels.js';
import { directionForVector } from './player-animation.js';
import {
  distance,
  clamp,
  angleDelta,
  circleRect,
  rayRect,
  segmentCircle,
  SpatialIndex,
  Navigation,
} from './physics.js';
export const STUN_DURATION = 3.1;
export const MAX_ENEMIES = 10;
export class Simulation {
  constructor(manifest, raw, profile, seed = 1) {
    this.manifest = manifest;
    this.room = buildRoom(manifest, raw);
    this.profile = profile;
    this.seed = seed;
    this.events = [];
    this.elapsed = 0;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.kills = 0;
    this.shots = 0;
    this.status = 'playing';
    this.bullets = [];
    this.bodies = [];
    this.particles = [];
    this.floating = [];
    this.blood = [];
    this.doors = this.room.entities
      .filter((e) => e.kind === 'door')
      .map((e) => ({
        ...e,
        baseAngle: e.angle,
        swing: 0,
        open: 0,
        locked: false,
        sourceLocked: !!e.init.solid,
        rect: rectFor(e),
      }));
    this.exits = this.room.entities.filter((e) => e.kind === 'exit');
    const staticBoxes = this.room.entities
      .filter((e) => e.solid && !['enemy', 'player', 'door', 'exit'].includes(e.kind))
      .map(rectFor)
      .filter(Boolean);
    this.index = new SpatialIndex(staticBoxes);
    this.staticBoxes = staticBoxes;
    this.navigation = new Navigation(raw.width, raw.height, (x, y) =>
      this.blocked(x, y, 7, false),
    );
    this.enemies = this.room.entities
      .filter((e) => e.kind === 'enemy')
      .slice(0, MAX_ENEMIES)
      .map((entity) => this.createEnemy(entity));
    this.items = this.room.entities
      .filter((e) => e.kind === 'weapon')
      .map((entity) => this.createItem(entity));
    const start = this.room.entities.find((e) => e.kind === 'player');
    let position = start ??
      this.room.entities.find((e) => /Transitioner|Elevator/.test(e.name)) ?? {
        x: raw.width / 2,
        y: raw.height / 2,
      };
    position = this.safeSpawn(position);
    this.player = {
      x: position.x,
      y: position.y,
      angle: 0,
      facing: 'down',
      vx: 0,
      vy: 0,
      radius: 7,
      alive: true,
      frame: 0,
      moving: 0,
      weapon: profile.startWeapon !== undefined ? WEAPONS[profile.startWeapon] : UNARMED,
      ammo: 0,
      fireTimer: 0.3,
      attack: 0,
      execution: 0,
    };
    this.player.ammo = this.player.weapon.ammo;
    this.player.armor = profile.armor ?? 0;
    this.grace = 0.6;
    this.total = this.enemies.filter((e) => !e.dog || !profile.friendlyDogs).length;
    this.exit = this.findExit();
    this.cleared = this.total === 0;
    this.context = '';
    this.checkClear();
  }
  createEnemy(entity) {
    const dog = /Dog/.test(entity.name);
    const fat = /Fat/.test(entity.name);
    const swat = /Swat/.test(entity.name);
    const boss = /Boss/.test(entity.name);
    let weapon = weaponBySprite(entity.sprite);
    if (/Melee/.test(entity.name) && weapon.gun) {
      weapon = WEAPONS[16];
    }
    if (dog) {
      weapon = UNARMED;
    }
    let hp = 1;
    if (fat || swat) {
      hp = 2;
    } else if (boss) {
      hp = 3;
    }
    return {
      ...entity,
      angle: (-(entity.init.direction ?? entity.init.dir ?? 0) * Math.PI) / 180,
      weapon: weapon,
      ammo: weapon.ammo,
      state: 'patrol',
      origin: {
        x: entity.x,
        y: entity.y,
      },
      alive: true,
      radius: fat ? 12 : 7,
      stun: 0,
      reaction: 0.45,
      fireTimer: 0.35,
      frame: 0,
      moving: 0,
      alert: 0,
      lastSeen: null,
      route: [],
      routeTimer: 0,
      patrolTurn: 0,
      stationary:
        this.room.id === 'eeTraining' || /Stationary|Guard|Idle/.test(entity.name),
      dog,
      fat,
      swat,
      boss,
      hp,
    };
  }
  createItem(entity) {
    let choices = [0, 1, 2, 3, 4, 5, 6];
    if (this.profile.gunSpawns) {
      choices = [0, 1, 6];
    } else if (this.profile.meleeSpawns) {
      choices = [2, 3, 4, 5];
    }
    let id = entity.init.image_index;
    if (typeof id !== 'number') {
      id = choices[Math.floor(this.random() * choices.length)];
    }
    const weapon = WEAPONS[clamp(Math.floor(id), 0, 34)];
    return {
      ...entity,
      weapon: weapon,
      ammo: entity.init.ammo > 0 ? entity.init.ammo : weapon.ammo,
      frame: weapon.id,
    };
  }
  random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  emit(type, data = {}) {
    this.events.push({
      type,
      ...data,
    });
  }
  sound(key) {
    this.emit('sound', {
      key,
    });
  }
  doorBoxes() {
    return this.doors
      .filter((d) => !d.broken && (d.locked || Math.abs(d.open) < 0.3))
      .map((d) => d.rect);
  }
  blocked(x, y, r = 7, doors = true) {
    return (
      this.index.query(x - r, y - r, r * 2, r * 2).some((b) => circleRect(x, y, r, b)) ||
      (doors && this.doorBoxes().some((b) => circleRect(x, y, r, b)))
    );
  }
  lineBlocked(a, b, furniture = false, glass = true) {
    const boxes = this.index.query(
      Math.min(a.x, b.x),
      Math.min(a.y, b.y),
      Math.abs(a.x - b.x),
      Math.abs(a.y - b.y),
    );
    return [...boxes, ...this.doorBoxes()].some(
      (box) =>
        !box.entity.broken &&
        (glass || !box.entity.glass) &&
        (furniture || !box.entity.furniture) &&
        rayRect(a.x, a.y, b.x, b.y, box) !== null,
    );
  }
  pathBlocked(from, to) {
    const steps = Math.max(1, Math.ceil(distance(from, to) / 4));
    for (let i = 0; i <= steps; i++) {
      const fraction = i / steps;
      if (
        this.blocked(
          from.x + (to.x - from.x) * fraction,
          from.y + (to.y - from.y) * fraction,
          7,
          false,
        )
      ) {
        return true;
      }
    }
    return false;
  }
  safeSpawn(at) {
    if (!this.blocked(at.x, at.y, 7, false)) {
      return {
        x: at.x,
        y: at.y,
      };
    }
    for (let radius = 8; radius < 400; radius += 8) {
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        const player = {
          x: at.x + Math.cos(angle) * radius,
          y: at.y + Math.sin(angle) * radius,
        };
        if (
          player.x >= 8 &&
          player.y >= 8 &&
          player.x < this.room.width - 8 &&
          player.y < this.room.height - 8 &&
          !this.blocked(player.x, player.y, 7, false)
        ) {
          return player;
        }
      }
    }
    return {
      x: at.x,
      y: at.y,
    };
  }
  findExit() {
    return (
      this.exits.find((exit) => exit.forward) ??
      this.exits[0] ?? {
        x: this.player.x,
        y: this.player.y,
      }
    );
  }
  canMoveTo(actor, x, y) {
    if (this.blocked(x, y, 7)) {
      return false;
    }
    const others = actor === this.player ? this.enemies : [this.player, ...this.enemies];
    return !others.some((other) => {
      if (!other || other === actor || !other.alive) {
        return false;
      }
      const radius = (actor.radius ?? 7) + (other.radius ?? 7);
      const next = (x - other.x) ** 2 + (y - other.y) ** 2;
      const current = (actor.x - other.x) ** 2 + (actor.y - other.y) ** 2;
      return next < radius ** 2 && next <= current + 0.000001;
    });
  }
  move(actor, dx, dy, dt) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4));
    const sx = dx / steps;
    const sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      for (const door of this.doors) {
        if (door.locked || door.broken) {
          continue;
        }
        if (circleRect(actor.x + sx, actor.y + sy, 9, door.rect)) {
          if (Math.abs(door.open) < 0.3) {
            door.swing = actor === this.player ? 7 : 4;
            door.open = 0.4;
            this.sound('sndDoorOpen');
            if (actor === this.player) {
              for (const enemy of this.enemies) {
                if (enemy.alive && distance(enemy, door) < 39) {
                  if (this.profile.lethalDoors) {
                    this.kill(enemy, 'door');
                  } else {
                    this.stun(enemy, 2.6);
                  }
                }
              }
            }
          }
        }
      }
      if (this.canMoveTo(actor, actor.x + sx, actor.y)) {
        actor.x += sx;
      } else if (
        actor === this.player &&
        sy === 0 &&
        sx !== 0 &&
        this.blocked(actor.x + sx, actor.y, 7)
      ) {
        if (
          !this.blocked(actor.x + sx, actor.y - 8, 7) &&
          this.canMoveTo(actor, actor.x, actor.y - Math.abs(sx))
        ) {
          actor.y -= Math.abs(sx);
        } else if (
          !this.blocked(actor.x + sx, actor.y + 8, 7) &&
          this.canMoveTo(actor, actor.x, actor.y + Math.abs(sx))
        ) {
          actor.y += Math.abs(sx);
        }
      }
      if (this.canMoveTo(actor, actor.x, actor.y + sy)) {
        actor.y += sy;
      } else if (
        actor === this.player &&
        sx === 0 &&
        sy !== 0 &&
        this.blocked(actor.x, actor.y + sy, 7)
      ) {
        if (
          !this.blocked(actor.x - 8, actor.y + sy, 7) &&
          this.canMoveTo(actor, actor.x - Math.abs(sy), actor.y)
        ) {
          actor.x -= Math.abs(sy);
        } else if (
          !this.blocked(actor.x + 8, actor.y + sy, 7) &&
          this.canMoveTo(actor, actor.x + Math.abs(sy), actor.y)
        ) {
          actor.x += Math.abs(sy);
        }
      }
    }
    actor.x = clamp(actor.x, -64, this.room.width + 64);
    actor.y = clamp(actor.y, -64, this.room.height + 64);
  }
  update(dt, input) {
    this.events = [];
    if (this.status !== 'playing') {
      return;
    }
    if (this.tutorial) {
      input = this.tutorial.filterInput(input);
    }
    dt = Math.min(dt, 0.05);
    this.elapsed += dt;
    this.grace = Math.max(0, this.grace - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer === 0) {
      this.combo = 0;
    }
    input = this.updatePlayer(dt, input);
    const player = this.player;
    this.updateInventory(
      input.interact && this.exitReady
        ? {
            ...input,
            pickup: false,
          }
        : input,
    );
    if (input.execute) {
      this.execute();
    }
    const changingWeapon =
      input.weaponAction || input.pickup || input.drop || input.throw;
    if (
      input.attack &&
      !changingWeapon &&
      player.fireTimer <= 0 &&
      player.execution <= 0
    ) {
      this.attack();
    }
    for (const door of this.doors) {
      if (door.swing) {
        door.open = clamp(door.open + door.swing * dt, 0, Math.PI * 0.7);
        door.swing = Math.max(0, door.swing - 7 * dt);
      }
    }
    for (const e of this.enemies) {
      if (e.alive && !this.tutorial) {
        this.updateEnemy(e, dt);
      }
    }
    this.updateBullets(dt);
    this.updateParticles(dt);
    this.checkClear();
    this.tutorial?.update(input);
    this.context = this.contextHint();
    if (input.interact && this.exitReady) {
      this.status = 'complete';
      this.sound('sndComplete');
      this.emit('complete');
    }
  }
  updatePlayer(dt, input) {
    const player = this.player;
    player.fireTimer = Math.max(0, player.fireTimer - dt);
    player.attack = Math.max(0, player.attack - dt);
    player.execution = Math.max(0, player.execution - dt);
    if (input.aim) {
      player.angle = Math.atan2(input.aim.y - player.y, input.aim.x - player.x);
    }
    const acceleration = 1800 * dt;
    const max = this.profile.speed;
    if (this.profile.reversed) {
      input = {
        ...input,
        moveX: -input.moveX,
        moveY: -input.moveY,
      };
    }
    const approach = (v, target) =>
      v < target
        ? Math.min(target, v + acceleration)
        : Math.max(target, v - acceleration);
    player.vx = approach(player.vx, input.moveX * max);
    player.vy = approach(player.vy, input.moveY * max);
    if (Math.abs(player.vx) + Math.abs(player.vy) > max + 120) {
      const f = (max + 120) / (Math.abs(player.vx) + Math.abs(player.vy));
      player.vx *= f;
      player.vy *= f;
    }
    player.moving = Math.hypot(player.vx, player.vy);
    if (player.execution <= 0) {
      this.move(player, player.vx * dt, player.vy * dt, dt);
    }
    if (player.moving > 4) {
      player.facing = directionForVector(player.vx, player.vy, player.facing);
      player.frame = (player.frame + dt * player.moving * 0.05) % 8;
    } else {
      player.frame = 0;
    }
    return input;
  }
  contextHint() {
    const player = this.player;
    const stairs = this.exit.transition === 'stairs';
    if (this.exitReady) {
      if (stairs) {
        return 'E · СЛЕДУЮЩИЙ ЭТАЖ';
      } else {
        return 'E · ВЫЙТИ';
      }
    }
    const stunned = this.enemies.some(
      (enemy) => enemy.alive && enemy.stun > 0 && distance(player, enemy) < 31,
    );
    if (stunned) {
      return 'SPACE · ДОБИТЬ';
    }
    const nearest = this.items
      .filter((item) => !item.taken)
      .sort((a, b) => distance(a, player) - distance(b, player))[0];
    if (nearest && distance(nearest, player) < 30) {
      const key = player.weapon === UNARMED ? 'E / ПКМ · ' : 'E · ';
      return key + nearest.weapon.name.toUpperCase();
    }
    if (this.cleared) {
      if (stairs) {
        return 'К ЛЕСТНИЦЕ → E';
      } else {
        return 'К ДВЕРИ → E';
      }
    }
    return '';
  }
  get exitReady() {
    return (
      this.exits.includes(this.exit) &&
      this.cleared &&
      (!this.tutorial || this.tutorial.canExit) &&
      distance(this.player, this.exit) < 48
    );
  }
  updateInventory(input) {
    if (input.weaponAction) {
      if (this.player.weapon === UNARMED) {
        this.pickup();
      } else {
        this.throwWeapon();
      }
    }
    if (input.pickup) {
      this.pickup();
    }
    if (input.drop) {
      this.dropWeapon();
    }
    if (input.throw) {
      this.throwWeapon();
    }
  }
  pickup() {
    const player = this.player;
    const items = this.items.filter(
      (i) =>
        !i.taken &&
        distance(i, player) < 32 &&
        !this.lineBlocked(i, player) &&
        (!this.tutorial || this.tutorial.allowsPickup(i)),
    );
    items.sort((a, b) => distance(a, player) - distance(b, player));
    const item = items[0];
    if (!item) {
      return;
    }
    if (player.weapon !== UNARMED) {
      this.dropItem(player);
    }
    player.weapon = item.weapon;
    player.ammo = Math.round(
      item.ammo * (item.ammoBonusApplied ? 1 : (this.profile.ammoBonus ?? 1)),
    );
    item.taken = true;
    player.attack = 0;
    this.sound('sndPickupWeapon');
  }
  attack() {
    const weapon = this.player.weapon;
    if (weapon.throwOnly) {
      this.throwWeapon();
    } else if (weapon.gun) {
      this.shoot();
    } else {
      this.meleeAttack();
    }
  }
  shoot() {
    const player = this.player;
    const weapon = player.weapon;
    if (player.ammo <= 0) {
      this.sound('sndLock');
      player.fireTimer = 0.2;
      return;
    }
    player.ammo--;
    this.shots++;
    player.fireTimer = weapon.cooldown;
    player.attack = 0.12;
    this.fire(player, weapon, 'player');
    this.sound(weapon.sound);
    this.emit('shake', {
      amount: 1.8,
    });
  }
  meleeAttack() {
    const player = this.player;
    const weapon = player.weapon;
    player.fireTimer = weapon.cooldown;
    player.attackDuration = weapon.id < 0 ? 0.18 : Math.min(0.42, weapon.cooldown);
    player.attack = player.attackDuration;
    player.attackAngle = player.angle;
    this.sound(weapon.sound);
    for (const enemy of this.enemies) {
      if (
        !enemy.alive ||
        (this.tutorial && !this.tutorial.allowsHit(enemy)) ||
        distance(enemy, player) > weapon.range + 6 ||
        this.lineBlocked(player, enemy)
      ) {
        continue;
      }
      const diff = Math.abs(
        angleDelta(Math.atan2(enemy.y - player.y, enemy.x - player.x), player.angle),
      );
      if (diff > 1.1) {
        continue;
      }
      if (weapon === UNARMED && !this.profile.punchKill && !enemy.dog) {
        const stolen =
          this.profile.disarm && enemy.weapon !== UNARMED
            ? {
                weapon: enemy.weapon,
                ammo: enemy.ammo,
              }
            : null;
        this.stun(enemy, STUN_DURATION);
        if (stolen) {
          player.weapon = stolen.weapon;
          player.ammo = stolen.ammo;
          const drop = this.items.at(-1);
          if (
            drop &&
            drop.weapon === stolen.weapon &&
            Math.hypot(drop.x - enemy.x, drop.y - enemy.y) < 12
          ) {
            drop.taken = true;
          }
          this.sound('sndPickupWeapon');
        }
      } else if (enemy.fat && (!weapon.sharp || weapon === UNARMED)) {
        this.stun(enemy, 0.5);
      } else {
        this.kill(enemy, weapon.sharp ? 'cut' : 'melee');
      }
    }
    for (const box of this.staticBoxes) {
      if (
        box.entity.glass &&
        !box.entity.broken &&
        rayRect(
          player.x,
          player.y,
          player.x + Math.cos(player.angle) * weapon.range,
          player.y + Math.sin(player.angle) * weapon.range,
          box,
          6,
        ) !== null
      ) {
        this.breakGlass(box.entity);
      }
    }
  }
  fire(actor, weapon, team) {
    for (let i = 0; i < weapon.pellets; i++) {
      const angle =
        actor.angle +
        (this.random() - 0.5) *
          weapon.spread *
          (team === 'player' ? (this.profile.accuracy ?? 1) : 1);
      const muzzle = {
        x: actor.x + Math.cos(angle) * 12,
        y: actor.y + Math.sin(angle) * 12,
      };
      const start = this.lineBlocked(actor, muzzle, true) ? actor : muzzle;
      this.bullets.push({
        x: start.x,
        y: start.y,
        vx: Math.cos(angle) * weapon.speed,
        vy: Math.sin(angle) * weapon.speed,
        angle,
        life: 1.5,
        team,
        owner: actor,
        weapon: weapon,
      });
    }
    if (!weapon.silent && !(team === 'player' && this.profile.silentShots)) {
      this.noise(actor, 320);
    }
  }
  dropItem(actor, position = actor, ammoBonusApplied = true) {
    this.items.push({
      x: position.x,
      y: position.y,
      angle: actor.angle,
      weapon: actor.weapon,
      ammo: actor.ammo,
      frame: actor.weapon.id,
      ammoBonusApplied,
    });
  }
  dropWeapon() {
    const player = this.player;
    if (player.weapon === UNARMED) {
      return;
    }
    const ahead = {
      x: player.x + Math.cos(player.angle) * 12,
      y: player.y + Math.sin(player.angle) * 12,
    };
    const at =
      !this.blocked(ahead.x, ahead.y, 7) && !this.lineBlocked(player, ahead, true)
        ? ahead
        : player;
    this.dropItem(player, at);
    player.weapon = UNARMED;
    player.ammo = 0;
    player.attack = 0;
  }
  throwWeapon() {
    const player = this.player;
    if (player.weapon === UNARMED) {
      return;
    }
    this.bullets.push({
      x: player.x,
      y: player.y,
      vx: Math.cos(player.angle) * 390,
      vy: Math.sin(player.angle) * 390,
      angle: player.angle,
      life: this.profile.longThrows ? 0.78 : 0.65,
      team: 'player',
      owner: player,
      weapon: player.weapon,
      ammo: player.ammo,
      thrown: true,
    });
    player.weapon = UNARMED;
    player.ammo = 0;
    player.attack = 0;
    player.fireTimer = 0.15;
    this.sound('sndThrow');
  }
  execute() {
    const enemy = this.enemies.find(
      (e) =>
        e.alive &&
        e.stun > 0 &&
        distance(e, this.player) < 32 &&
        !this.lineBlocked(e, this.player),
    );
    if (!enemy || this.player.execution > 0) {
      return;
    }
    this.player.execution = 0.35;
    this.player.attack = 0.35;
    this.kill(enemy, 'execute');
    this.sound('sndBonesBreak');
    this.emit('shake', {
      amount: 3,
    });
  }
  stun(enemy, time) {
    if (enemy.fat || enemy.boss) {
      time = Math.min(time, 0.6);
    }
    if (enemy.stun <= 0) {
      this.sound('sndHit');
      this.dropEnemyWeapon(enemy);
    }
    enemy.stun = time;
    enemy.meleeWindup = null;
    enemy.state = 'stunned';
    enemy.moving = 0;
  }
  dropEnemyWeapon(e) {
    if (e.weapon === UNARMED) {
      return;
    }
    this.dropItem(
      e,
      {
        x: e.x + 4,
        y: e.y + 4,
      },
      !!e.ammoBonusApplied,
    );
    e.weapon = UNARMED;
    e.ammo = 0;
  }
  kill(enemy, method) {
    if (!enemy.alive) {
      return;
    }
    enemy.alive = false;
    enemy.state = 'dead';
    this.kills++;
    this.dropEnemyWeapon(enemy);
    this.combo++;
    this.comboTimer = this.profile.comboWindow ?? 2.2;
    const points = (method === 'execute' ? 600 : 400) * Math.max(1, this.combo);
    this.score += points;
    this.floating.push({
      x: enemy.x,
      y: enemy.y - 12,
      text: '+' + points,
      life: 1,
    });
    this.bodies.push({
      x: enemy.x,
      y: enemy.y,
      angle: enemy.angle,
      method,
      dog: enemy.dog,
      frame: 0,
    });
    this.blood.push({
      x: enemy.x,
      y: enemy.y,
      angle: this.random() * 6.28,
      scale: 0.6 + this.random() * 0.5,
    });
    for (let i = 0; i < 12 * (this.profile.gore ?? 1); i++) {
      const a = this.random() * 6.28;
      const s = 20 + this.random() * 90;
      this.particles.push({
        x: enemy.x,
        y: enemy.y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.4 + this.random() * 0.4,
        blood: true,
      });
    }
    this.sound(method === 'cut' ? 'sndCut1' : 'sndHit');
  }
  die() {
    if (!this.player.alive || this.cheats?.god) {
      return;
    }
    this.player.alive = false;
    this.status = 'dead';
    this.emit('death');
    this.sound('sndHit');
    this.emit('shake', {
      amount: 5,
    });
  }
  takeBullet() {
    if (this.cheats?.god) {
      return;
    }
    if (this.player.armor > 0) {
      this.player.armor--;
      this.sound('sndHit');
      this.emit('shake', {
        amount: 3,
      });
    } else {
      this.die();
    }
  }
  noise(at, radius) {
    for (const enemy of this.enemies) {
      if (enemy.alive && distance(enemy, at) < radius) {
        enemy.lastSeen = {
          x: at.x,
          y: at.y,
        };
        enemy.alert = 5;
        enemy.state = 'search';
      }
    }
  }
  breakGlass(entity) {
    entity.broken = true;
    this.sound('sndGlass1');
    this.noise(entity, 200);
    for (let i = 0; i < 9; i++) {
      this.particles.push({
        x: entity.x,
        y: entity.y,
        vx: (this.random() - 0.5) * 100,
        vy: (this.random() - 0.5) * 100,
        life: 0.65,
        glass: true,
      });
    }
  }
  updateEnemy(enemy, dt) {
    if (enemy.dog && this.profile.friendlyDogs) {
      enemy.state = 'friendly';
      return;
    }
    enemy.fireTimer = Math.max(0, enemy.fireTimer - dt);
    enemy.routeTimer -= dt;
    enemy.patrolTurn = Math.max(0, enemy.patrolTurn - dt);
    if (enemy.stun > 0) {
      enemy.stun = Math.max(0, enemy.stun - dt);
      if (enemy.stun === 0) {
        enemy.state = 'search';
        enemy.alert = 4;
      }
      return;
    }
    const player = this.player;
    const d = distance(enemy, player);
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const cone =
      Math.abs(angleDelta(angle, enemy.angle)) < (enemy.alert > 0 ? Math.PI : 1.45);
    const sees =
      this.grace <= 0 &&
      d < (this.profile.stealth ? 140 : 260) &&
      cone &&
      !this.lineBlocked(enemy, player, false, false) &&
      !(this.room.id === 'eeTraining' && d > 45);
    if (sees) {
      enemy.lastSeen = {
        x: player.x,
        y: player.y,
      };
      enemy.alert = 5;
      enemy.reaction -= dt;
      enemy.state = 'chase';
    } else {
      enemy.alert = Math.max(0, enemy.alert - dt);
      enemy.reaction = 0.45;
    }
    if (enemy.alert > 0 && enemy.lastSeen) {
      enemy.angle = angle;
      this.chaseEnemy(enemy, dt, sees, d);
    } else {
      this.patrolEnemy(enemy, dt);
    }
    if (enemy.moving > 0) {
      enemy.frame = (enemy.frame + dt * enemy.moving * 0.06) % 8;
    }
    if (enemy.weapon === UNARMED && !enemy.dog && !enemy.fat) {
      const item = this.items.find(
        (i) => !i.taken && distance(i, enemy) < 18 && !this.lineBlocked(i, enemy),
      );
      if (item) {
        enemy.weapon = item.weapon;
        enemy.ammo = item.ammo;
        enemy.ammoBonusApplied = !!item.ammoBonusApplied;
        item.taken = true;
      }
    }
  }
  chaseEnemy(enemy, dt, sees, d) {
    const player = this.player;
    if (enemy.weapon.gun && enemy.ammo > 0 && sees && d < 280 && d > 55) {
      enemy.moving = 0;
      if (enemy.reaction <= 0 && enemy.fireTimer <= 0) {
        enemy.ammo--;
        enemy.fireTimer = enemy.weapon.cooldown + 0.12;
        this.fire(enemy, enemy.weapon, 'enemy');
        this.sound(enemy.weapon.sound);
      }
    } else {
      const target = enemy.lastSeen;
      if (!this.pathBlocked(enemy, target)) {
        this.moveEnemy(enemy, target, (enemy.dog ? 180 : 120) * dt, dt);
      } else {
        if (enemy.routeTimer <= 0) {
          enemy.route = this.navigation.path(enemy, target);
          enemy.routeTimer = 0.6 + this.random() * 0.4;
        }
        if (enemy.route.length) {
          if (distance(enemy, enemy.route[0]) < 9) {
            enemy.route.shift();
          }
          if (enemy.route[0]) {
            this.moveEnemy(enemy, enemy.route[0], (enemy.dog ? 175 : 115) * dt, dt);
          }
        }
      }
      const melee = enemy.weapon.gun ? UNARMED : enemy.weapon;
      const inReach = d < (melee.enemyRange ?? melee.range) + player.radius;
      const ready =
        inReach &&
        sees &&
        !this.lineBlocked(enemy, player) &&
        enemy.reaction <= 0 &&
        enemy.fireTimer <= 0;
      if (!ready) {
        enemy.meleeWindup = null;
      } else {
        enemy.meleeWindup = (enemy.meleeWindup ?? 0.22) - dt;
        if (enemy.meleeWindup <= 0) {
          this.die();
          enemy.fireTimer = 0.4;
          enemy.meleeWindup = null;
        }
      }
    }
  }
  patrolEnemy(enemy, dt) {
    enemy.state = 'patrol';
    enemy.lastSeen = null;
    enemy.moving = 0;
    if (!enemy.stationary) {
      const clear = (angle) =>
        !this.blocked(enemy.x + Math.cos(angle) * 12, enemy.y + Math.sin(angle) * 12, 8);
      if (!clear(enemy.angle) && enemy.patrolTurn === 0) {
        const next = [
          enemy.angle + Math.PI / 2,
          enemy.angle - Math.PI / 2,
          enemy.angle + Math.PI,
        ].find(clear);
        if (next !== undefined) {
          enemy.angle = Math.atan2(Math.sin(next), Math.cos(next));
        }
        enemy.patrolTurn = 0.35;
      }
      if (clear(enemy.angle)) {
        const before = {
          x: enemy.x,
          y: enemy.y,
        };
        this.move(
          enemy,
          Math.cos(enemy.angle) * 60 * dt,
          Math.sin(enemy.angle) * 60 * dt,
          dt,
        );
        enemy.moving = dt > 0 ? distance(before, enemy) / dt : 0;
      }
    }
  }
  moveEnemy(enemy, target, step, dt) {
    const a = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    enemy.angle = a;
    enemy.moving = step / dt;
    this.move(enemy, Math.cos(a) * step, Math.sin(a) * step, dt);
  }
  findBulletHit(b, nx, ny) {
    let hit = null;
    let hitTime = 1.01;
    const boxes = [
      ...this.index.query(
        Math.min(b.x, nx) - 2,
        Math.min(b.y, ny) - 2,
        Math.abs(nx - b.x) + 4,
        Math.abs(ny - b.y) + 4,
      ),
      ...this.doorBoxes(),
    ];
    for (const box of boxes) {
      if (box.entity.broken) {
        continue;
      }
      const t = rayRect(b.x, b.y, nx, ny, box, 1);
      if (t !== null && t < hitTime) {
        hitTime = t;
        hit = {
          box,
        };
      }
    }
    const targets =
      b.team === 'enemy' ? [this.player] : this.enemies.filter((e) => e.alive);
    for (const actor of targets) {
      if (this.tutorial && actor !== this.player && !this.tutorial.allowsHit(actor)) {
        continue;
      }
      if (actor === b.owner || actor.alive === false) {
        continue;
      }
      const t = segmentCircle(b.x, b.y, nx, ny, actor.x, actor.y, actor.fat ? 12 : 8);
      if (t !== null && t < hitTime) {
        hitTime = t;
        hit = {
          actor,
        };
      }
    }
    return { hit, hitTime };
  }
  updateBullets(dt) {
    for (const b of this.bullets) {
      if (b.dead) {
        continue;
      }
      b.life -= dt;
      const nx = b.x + b.vx * dt;
      const ny = b.y + b.vy * dt;
      const { hit, hitTime } = this.findBulletHit(b, nx, ny);
      if (hit) {
        b.x += (nx - b.x) * hitTime;
        b.y += (ny - b.y) * hitTime;
        if (hit.box) {
          if (hit.box.entity.glass) {
            this.breakGlass(hit.box.entity);
            if (!b.thrown) {
              b.x = nx;
              b.y = ny;
              continue;
            }
          } else {
            this.sound('sndHitWall');
          }
        } else if (hit.actor === this.player) {
          this.takeBullet();
        } else if (b.thrown) {
          this.stun(hit.actor, STUN_DURATION);
        } else {
          hit.actor.hp--;
          if (hit.actor.hp <= 0) {
            this.kill(hit.actor, 'shot');
          } else {
            this.sound('sndHit');
          }
        }
        b.dead = true;
      } else {
        b.x = nx;
        b.y = ny;
      }
      if (
        b.life <= 0 ||
        b.x < 0 ||
        b.y < 0 ||
        b.x > this.room.width ||
        b.y > this.room.height
      ) {
        b.dead = true;
      }
      if (b.dead && b.thrown) {
        const speed = Math.hypot(b.vx, b.vy);
        const offset = hit?.box ? 9 : 0;
        const at = this.safeSpawn({
          x: clamp(b.x - (b.vx / speed) * offset, 8, this.room.width - 8),
          y: clamp(b.y - (b.vy / speed) * offset, 8, this.room.height - 8),
        });
        this.dropItem(b, at);
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);
  }
  updateParticles(dt) {
    for (const player of this.particles) {
      player.life -= dt;
      player.x += player.vx * dt;
      player.y += player.vy * dt;
      player.vx *= 0.91;
      player.vy *= 0.91;
    }
    this.particles = this.particles.filter((player) => player.life > 0);
    for (const f of this.floating) {
      f.life -= dt;
      f.y -= dt * 18;
    }
    this.floating = this.floating.filter((f) => f.life > 0);
  }
  checkClear() {
    if (
      !this.cleared &&
      this.enemies.every((e) => !e.alive || (e.dog && this.profile.friendlyDogs))
    ) {
      this.cleared = true;
      this.sound('sndComplete');
      this.emit('clear');
    }
  }
  snapshot() {
    return {
      status: this.status,
      room: this.room.id,
      player: {
        x: this.player.x,
        y: this.player.y,
        weapon: this.player.weapon.id,
        ammo: this.player.ammo,
      },
      enemies: this.enemies.filter((e) => e.alive).length,
      total: this.total,
      kills: this.kills,
      score: this.score,
      cleared: this.cleared,
      exit: {
        x: this.exit.x,
        y: this.exit.y,
      },
      items: this.items.filter((i) => !i.taken).length,
      actors: this.enemies.map((e) => ({
        x: e.x,
        y: e.y,
        alive: e.alive,
        stun: e.stun,
        state: e.state,
        weapon: e.weapon.id,
      })),
      drops: this.items
        .filter((i) => !i.taken)
        .map((i) => ({
          x: i.x,
          y: i.y,
          weapon: i.weapon.id,
          ammo: i.ammo,
        })),
    };
  }
}
