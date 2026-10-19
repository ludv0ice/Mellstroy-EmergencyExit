import { WEAPONS, UNARMED, weaponBySprite } from './weapons.js';
import { buildRoom, rectFor } from './rooms.js';
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
export const MAX_ENEMIES = 7;

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
      .filter(
        (e) => e.solid && !['enemy', 'player', 'door', 'exit'].includes(e.kind),
      )
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
      .map((e) => {
        const dog = /Dog/.test(e.name),
          fat = /Fat/.test(e.name),
          swat = /Swat/.test(e.name),
          boss = /Boss/.test(e.name);
        let w = weaponBySprite(e.sprite);
        if (/Melee/.test(e.name) && w.gun) w = WEAPONS[16];
        if (dog) w = UNARMED;
        return {
          ...e,
          angle: (-(e.init.direction ?? e.init.dir ?? 0) * Math.PI) / 180,
          weapon: w,
          ammo: w.ammo,
          state: 'patrol',
          origin: { x: e.x, y: e.y },
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
            raw.id === 'eeTraining' || /Stationary|Guard|Idle/.test(e.name),
          dog,
          fat,
          swat,
          boss,
          hp: fat || swat ? 2 : boss ? 3 : 1,
        };
      });
    this.items = this.room.entities
      .filter((e) => e.kind === 'weapon')
      .map((e) => {
        const choices = profile.gunSpawns
          ? [0, 1, 6]
          : profile.meleeSpawns
            ? [2, 3, 4, 5]
            : [0, 1, 2, 3, 4, 5, 6];
        const id =
          typeof e.init.image_index === 'number'
            ? e.init.image_index
            : choices[Math.floor(this.random() * choices.length)];
        const w = WEAPONS[clamp(Math.floor(id), 0, 34)];
        return {
          ...e,
          weapon: w,
          ammo: e.init.ammo > 0 ? e.init.ammo : w.ammo,
          frame: w.id,
        };
      });
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
      weapon:
        profile.startWeapon !== undefined
          ? WEAPONS[profile.startWeapon]
          : UNARMED,
      ammo: 0,
      fireTimer: 0.3,
      attack: 0,
      execution: 0,
    };
    this.player.ammo = this.player.weapon.ammo;
    this.player.armor = profile.armor ?? 0;
    this.grace = 0.6;
    this.total = this.enemies.filter(
      (e) => !e.dog || !profile.friendlyDogs,
    ).length;
    this.exit = this.findExit();
    this.cleared = this.total === 0;
    this.context = '';
    this.checkClear();
  }
  random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }
  sound(key) {
    this.emit('sound', { key });
  }
  doorBoxes() {
    return this.doors
      .filter((d) => !d.broken && (d.locked || Math.abs(d.open) < 0.3))
      .map((d) => d.rect);
  }
  blocked(x, y, r = 7, doors = true) {
    return (
      this.index
        .query(x - r, y - r, r * 2, r * 2)
        .some((b) => circleRect(x, y, r, b)) ||
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
      )
        return true;
    }
    return false;
  }
  safeSpawn(at) {
    if (!this.blocked(at.x, at.y, 7, false)) return { x: at.x, y: at.y };
    for (let radius = 8; radius < 400; radius += 8)
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        const p = {
          x: at.x + Math.cos(angle) * radius,
          y: at.y + Math.sin(angle) * radius,
        };
        if (
          p.x >= 8 &&
          p.y >= 8 &&
          p.x < this.room.width - 8 &&
          p.y < this.room.height - 8 &&
          !this.blocked(p.x, p.y, 7, false)
        )
          return p;
      }
    return { x: at.x, y: at.y };
  }
  findExit() {
    return (
      this.exits.find((exit) => exit.forward) ??
      this.exits[0] ?? { x: this.player.x, y: this.player.y }
    );
  }

  canMoveTo(actor, x, y) {
    if (this.blocked(x, y, 7)) return false;
    const others =
      actor === this.player ? this.enemies : [this.player, ...this.enemies];
    return !others.some((other) => {
      if (!other || other === actor || !other.alive) return false;
      const radius = (actor.radius ?? 7) + (other.radius ?? 7);
      const next = (x - other.x) ** 2 + (y - other.y) ** 2;
      const current = (actor.x - other.x) ** 2 + (actor.y - other.y) ** 2;
      return next < radius ** 2 && next <= current + 0.000001;
    });
  }
  move(actor, dx, dy, dt) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4)),
      sx = dx / steps,
      sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      for (const door of this.doors) {
        if (door.locked || door.broken) continue;
        if (circleRect(actor.x + sx, actor.y + sy, 9, door.rect)) {
          if (Math.abs(door.open) < 0.3) {
            door.swing = actor === this.player ? 7 : 4;
            door.open = 0.4;
            this.sound('sndDoorOpen');
            if (actor === this.player)
              for (const enemy of this.enemies)
                if (enemy.alive && distance(enemy, door) < 39) {
                  if (this.profile.lethalDoors) this.kill(enemy, 'door');
                  else this.stun(enemy, 2.6);
                }
          }
        }
      }
      if (this.canMoveTo(actor, actor.x + sx, actor.y)) actor.x += sx;
      else if (
        actor === this.player &&
        sy === 0 &&
        sx !== 0 &&
        this.blocked(actor.x + sx, actor.y, 7)
      ) {
        if (
          !this.blocked(actor.x + sx, actor.y - 8, 7) &&
          this.canMoveTo(actor, actor.x, actor.y - Math.abs(sx))
        )
          actor.y -= Math.abs(sx);
        else if (
          !this.blocked(actor.x + sx, actor.y + 8, 7) &&
          this.canMoveTo(actor, actor.x, actor.y + Math.abs(sx))
        )
          actor.y += Math.abs(sx);
      }
      if (this.canMoveTo(actor, actor.x, actor.y + sy)) actor.y += sy;
      else if (
        actor === this.player &&
        sx === 0 &&
        sy !== 0 &&
        this.blocked(actor.x, actor.y + sy, 7)
      ) {
        if (
          !this.blocked(actor.x - 8, actor.y + sy, 7) &&
          this.canMoveTo(actor, actor.x - Math.abs(sy), actor.y)
        )
          actor.x -= Math.abs(sy);
        else if (
          !this.blocked(actor.x + 8, actor.y + sy, 7) &&
          this.canMoveTo(actor, actor.x + Math.abs(sy), actor.y)
        )
          actor.x += Math.abs(sy);
      }
    }
    actor.x = clamp(actor.x, -64, this.room.width + 64);
    actor.y = clamp(actor.y, -64, this.room.height + 64);
  }
  update(dt, input) {
    this.events = [];
    if (this.status !== 'playing') return;
    if (this.tutorial) input = this.tutorial.filterInput(input);
    dt = Math.min(dt, 0.05);
    this.elapsed += dt;
    this.grace = Math.max(0, this.grace - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer === 0) this.combo = 0;
    const p = this.player;
    p.fireTimer = Math.max(0, p.fireTimer - dt);
    p.attack = Math.max(0, p.attack - dt);
    p.execution = Math.max(0, p.execution - dt);
    if (input.aim) p.angle = Math.atan2(input.aim.y - p.y, input.aim.x - p.x);
    const acceleration = 1800 * dt,
      max = this.profile.speed;
    if (this.profile.reversed)
      input = { ...input, moveX: -input.moveX, moveY: -input.moveY };
    const approach = (v, target) =>
      v < target
        ? Math.min(target, v + acceleration)
        : Math.max(target, v - acceleration);
    p.vx = approach(p.vx, input.moveX * max);
    p.vy = approach(p.vy, input.moveY * max);
    if (Math.abs(p.vx) + Math.abs(p.vy) > max + 120) {
      const f = (max + 120) / (Math.abs(p.vx) + Math.abs(p.vy));
      p.vx *= f;
      p.vy *= f;
    }
    p.moving = Math.hypot(p.vx, p.vy);
    if (p.execution <= 0) this.move(p, p.vx * dt, p.vy * dt, dt);
    if (p.moving > 4) {
      p.facing = directionForVector(p.vx, p.vy, p.facing);
      p.frame = (p.frame + dt * p.moving * 0.05) % 8;
    } else p.frame = 0;
    this.updateInventory(input);
    if (input.execute) this.execute();
    const changingWeapon =
      input.weaponAction || input.pickup || input.drop || input.throw;
    if (input.attack && !changingWeapon && p.fireTimer <= 0 && p.execution <= 0)
      this.attack();
    for (const door of this.doors) {
      if (door.swing) {
        door.open = clamp(door.open + door.swing * dt, 0, Math.PI * 0.7);
        door.swing = Math.max(0, door.swing - 7 * dt);
      }
    }
    for (const e of this.enemies) {
      if (e.alive && !this.tutorial) this.updateEnemy(e, dt);
    }
    this.updateBullets(dt);
    this.updateParticles(dt);
    this.checkClear();
    this.tutorial?.update(input);
    const nearest = this.items
      .filter((i) => !i.taken)
      .sort((a, b) => distance(a, p) - distance(b, p))[0];
    const down = this.enemies.find(
      (e) => e.alive && e.stun > 0 && distance(p, e) < 31,
    );
    this.context = down
      ? 'SPACE · ДОБИТЬ'
      : nearest && distance(nearest, p) < 30
        ? (p.weapon === UNARMED ? 'E / ПКМ · ' : 'E · ') +
          nearest.weapon.name.toUpperCase()
        : this.cleared
          ? this.exit.transition === 'stairs'
            ? 'К ЛЕСТНИЦЕ → E'
            : 'К ДВЕРИ → E'
          : '';
    if (
      input.interact &&
      this.cleared &&
      (!this.tutorial || this.tutorial.canExit) &&
      distance(p, this.exit) < 48
    ) {
      this.status = 'complete';
      this.sound('sndComplete');
      this.emit('complete');
    }
  }
  updateInventory(input) {
    if (input.weaponAction) {
      if (this.player.weapon === UNARMED) this.pickup();
      else this.throwWeapon();
    }
    if (input.pickup) this.pickup();
    if (input.drop) this.dropWeapon();
    if (input.throw) this.throwWeapon();
  }
  pickup() {
    const p = this.player,
      items = this.items.filter(
        (i) =>
          !i.taken &&
          distance(i, p) < 32 &&
          !this.lineBlocked(i, p) &&
          (!this.tutorial || this.tutorial.allowsPickup(i)),
      );
    items.sort((a, b) => distance(a, p) - distance(b, p));
    const item = items[0];
    if (!item) return;
    if (p.weapon !== UNARMED)
      this.items.push({
        x: p.x,
        y: p.y,
        angle: p.angle,
        weapon: p.weapon,
        ammo: p.ammo,
        frame: p.weapon.id,
        ammoBonusApplied: true,
      });
    p.weapon = item.weapon;
    p.ammo = Math.round(
      item.ammo * (item.ammoBonusApplied ? 1 : (this.profile.ammoBonus ?? 1)),
    );
    item.taken = true;
    p.attack = 0;
    this.sound('sndPickupWeapon');
  }
  attack() {
    const p = this.player,
      w = p.weapon;
    if (w.throwOnly) {
      this.throwWeapon();
      return;
    }
    if (w.gun) {
      if (p.ammo <= 0) {
        this.sound('sndLock');
        p.fireTimer = 0.2;
        return;
      }
      p.ammo--;
      this.shots++;
      p.fireTimer = w.cooldown;
      p.attack = 0.12;
      this.fire(p, w, 'player');
      this.sound(w.sound);
      this.emit('shake', { amount: 1.8 });
    } else {
      p.fireTimer = w.cooldown;
      p.attackDuration = w.id < 0 ? 0.18 : Math.min(0.42, w.cooldown);
      p.attack = p.attackDuration;
      p.attackAngle = p.angle;
      this.sound(w.sound);
      for (const enemy of this.enemies) {
        if (
          !enemy.alive ||
          (this.tutorial && !this.tutorial.allowsHit(enemy)) ||
          distance(enemy, p) > w.range + 6 ||
          this.lineBlocked(p, enemy)
        )
          continue;
        const diff = Math.abs(
          angleDelta(Math.atan2(enemy.y - p.y, enemy.x - p.x), p.angle),
        );
        if (diff > 1.1) continue;
        if (w === UNARMED && !this.profile.punchKill && !enemy.dog) {
          const stolen =
            this.profile.disarm && enemy.weapon !== UNARMED
              ? { weapon: enemy.weapon, ammo: enemy.ammo }
              : null;
          this.stun(enemy, STUN_DURATION);
          if (stolen) {
            p.weapon = stolen.weapon;
            p.ammo = stolen.ammo;
            const drop = this.items.at(-1);
            if (
              drop &&
              drop.weapon === stolen.weapon &&
              Math.hypot(drop.x - enemy.x, drop.y - enemy.y) < 12
            )
              drop.taken = true;
            this.sound('sndPickupWeapon');
          }
        } else if (enemy.fat && (!w.sharp || w === UNARMED))
          this.stun(enemy, 0.5);
        else this.kill(enemy, w.sharp ? 'cut' : 'melee');
      }
      for (const box of this.staticBoxes)
        if (
          box.entity.glass &&
          !box.entity.broken &&
          rayRect(
            p.x,
            p.y,
            p.x + Math.cos(p.angle) * w.range,
            p.y + Math.sin(p.angle) * w.range,
            box,
            6,
          ) !== null
        )
          this.breakGlass(box.entity);
    }
  }
  fire(actor, w, team) {
    for (let i = 0; i < w.pellets; i++) {
      const angle =
        actor.angle +
        (this.random() - 0.5) *
          w.spread *
          (team === 'player' ? (this.profile.accuracy ?? 1) : 1);
      const muzzle = {
        x: actor.x + Math.cos(angle) * 12,
        y: actor.y + Math.sin(angle) * 12,
      };
      const start = this.lineBlocked(actor, muzzle, true) ? actor : muzzle;
      this.bullets.push({
        x: start.x,
        y: start.y,
        vx: Math.cos(angle) * w.speed,
        vy: Math.sin(angle) * w.speed,
        angle,
        life: 1.5,
        team,
        owner: actor,
        weapon: w,
      });
    }
    if (!w.silent && !(team === 'player' && this.profile.silentShots))
      this.noise(actor, 320);
  }
  dropWeapon() {
    const p = this.player;
    if (p.weapon === UNARMED) return;
    const ahead = {
      x: p.x + Math.cos(p.angle) * 12,
      y: p.y + Math.sin(p.angle) * 12,
    };
    const at =
      !this.blocked(ahead.x, ahead.y, 7) && !this.lineBlocked(p, ahead, true)
        ? ahead
        : p;
    this.items.push({
      x: at.x,
      y: at.y,
      angle: p.angle,
      weapon: p.weapon,
      ammo: p.ammo,
      frame: p.weapon.id,
      ammoBonusApplied: true,
    });
    p.weapon = UNARMED;
    p.ammo = 0;
    p.attack = 0;
  }
  throwWeapon() {
    const p = this.player;
    if (p.weapon === UNARMED) return;
    this.bullets.push({
      x: p.x,
      y: p.y,
      vx: Math.cos(p.angle) * 390,
      vy: Math.sin(p.angle) * 390,
      angle: p.angle,
      life: this.profile.longThrows ? 0.78 : 0.65,
      team: 'player',
      owner: p,
      weapon: p.weapon,
      ammo: p.ammo,
      thrown: true,
    });
    p.weapon = UNARMED;
    p.ammo = 0;
    p.attack = 0;
    p.fireTimer = 0.15;
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
    if (!enemy || this.player.execution > 0) return;
    this.player.execution = 0.35;
    this.player.attack = 0.35;
    this.kill(enemy, 'execute');
    this.sound('sndBonesBreak');
    this.emit('shake', { amount: 3 });
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
    if (e.weapon === UNARMED) return;
    this.items.push({
      x: e.x + 4,
      y: e.y + 4,
      angle: e.angle,
      weapon: e.weapon,
      ammo: e.ammo,
      frame: e.weapon.id,
      ammoBonusApplied: !!e.ammoBonusApplied,
    });
    e.weapon = UNARMED;
    e.ammo = 0;
  }
  kill(enemy, method) {
    if (!enemy.alive) return;
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
      const a = this.random() * 6.28,
        s = 20 + this.random() * 90;
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
    if (!this.player.alive) return;
    this.player.alive = false;
    this.status = 'dead';
    this.emit('death');
    this.sound('sndHit');
    this.emit('shake', { amount: 5 });
  }
  takeBullet() {
    if (this.player.armor > 0) {
      this.player.armor--;
      this.sound('sndHit');
      this.emit('shake', { amount: 3 });
    } else this.die();
  }
  noise(at, radius) {
    for (const enemy of this.enemies)
      if (enemy.alive && distance(enemy, at) < radius) {
        enemy.lastSeen = { x: at.x, y: at.y };
        enemy.alert = 5;
        enemy.state = 'search';
      }
  }
  breakGlass(entity) {
    entity.broken = true;
    this.sound('sndGlass1');
    this.noise(entity, 200);
    for (let i = 0; i < 9; i++)
      this.particles.push({
        x: entity.x,
        y: entity.y,
        vx: (this.random() - 0.5) * 100,
        vy: (this.random() - 0.5) * 100,
        life: 0.65,
        glass: true,
      });
  }
  updateEnemy(e, dt) {
    if (e.dog && this.profile.friendlyDogs) {
      e.state = 'friendly';
      return;
    }
    e.fireTimer = Math.max(0, e.fireTimer - dt);
    e.routeTimer -= dt;
    e.patrolTurn = Math.max(0, e.patrolTurn - dt);
    if (e.stun > 0) {
      e.stun = Math.max(0, e.stun - dt);
      if (e.stun === 0) {
        e.state = 'search';
        e.alert = 4;
      }
      return;
    }
    const p = this.player,
      d = distance(e, p),
      angle = Math.atan2(p.y - e.y, p.x - e.x);
    const cone =
      Math.abs(angleDelta(angle, e.angle)) < (e.alert > 0 ? Math.PI : 1.45);
    const sees =
      this.grace <= 0 &&
      d < (this.profile.stealth ? 140 : 260) &&
      cone &&
      !this.lineBlocked(e, p, false, false) &&
      !(this.room.id === 'eeTraining' && d > 45);
    if (sees) {
      e.lastSeen = { x: p.x, y: p.y };
      e.alert = 5;
      e.reaction -= dt;
      e.state = 'chase';
    } else {
      e.alert = Math.max(0, e.alert - dt);
      e.reaction = 0.45;
    }
    if (e.alert > 0 && e.lastSeen) {
      e.angle = angle;
      if (e.weapon.gun && e.ammo > 0 && sees && d < 280 && d > 55) {
        e.moving = 0;
        if (e.reaction <= 0 && e.fireTimer <= 0) {
          e.ammo--;
          e.fireTimer = e.weapon.cooldown + 0.12;
          this.fire(e, e.weapon, 'enemy');
          this.sound(e.weapon.sound);
        }
      } else {
        const target = e.lastSeen;
        if (!this.pathBlocked(e, target)) {
          this.moveEnemy(e, target, (e.dog ? 180 : 120) * dt, dt);
        } else {
          if (e.routeTimer <= 0) {
            e.route = this.navigation.path(e, target);
            e.routeTimer = 0.6 + this.random() * 0.4;
          }
          if (e.route.length) {
            if (distance(e, e.route[0]) < 9) e.route.shift();
            if (e.route[0])
              this.moveEnemy(e, e.route[0], (e.dog ? 175 : 115) * dt, dt);
          }
        }
        const melee = e.weapon.gun ? UNARMED : e.weapon;
        const inReach = d < (melee.enemyRange ?? melee.range) + p.radius;
        const ready =
          inReach &&
          sees &&
          !this.lineBlocked(e, p) &&
          e.reaction <= 0 &&
          e.fireTimer <= 0;
        if (!ready) e.meleeWindup = null;
        else {
          e.meleeWindup = (e.meleeWindup ?? 0.22) - dt;
          if (e.meleeWindup <= 0) {
            this.die();
            e.fireTimer = 0.4;
            e.meleeWindup = null;
          }
        }
      }
    } else {
      e.state = 'patrol';
      e.lastSeen = null;
      e.moving = 0;
      if (!e.stationary) {
        const clear = (angle) =>
          !this.blocked(
            e.x + Math.cos(angle) * 12,
            e.y + Math.sin(angle) * 12,
            8,
          );
        if (!clear(e.angle) && e.patrolTurn === 0) {
          const next = [
            e.angle + Math.PI / 2,
            e.angle - Math.PI / 2,
            e.angle + Math.PI,
          ].find(clear);
          if (next !== undefined)
            e.angle = Math.atan2(Math.sin(next), Math.cos(next));
          e.patrolTurn = 0.35;
        }
        if (clear(e.angle)) {
          const before = { x: e.x, y: e.y };
          this.move(
            e,
            Math.cos(e.angle) * 60 * dt,
            Math.sin(e.angle) * 60 * dt,
            dt,
          );
          e.moving = dt > 0 ? distance(before, e) / dt : 0;
        }
      }
    }
    if (e.moving > 0) e.frame = (e.frame + dt * e.moving * 0.06) % 8;
    if (e.weapon === UNARMED && !e.dog && !e.fat) {
      const item = this.items.find(
        (i) => !i.taken && distance(i, e) < 18 && !this.lineBlocked(i, e),
      );
      if (item) {
        e.weapon = item.weapon;
        e.ammo = item.ammo;
        e.ammoBonusApplied = !!item.ammoBonusApplied;
        item.taken = true;
      }
    }
  }
  moveEnemy(e, target, step, dt) {
    const a = Math.atan2(target.y - e.y, target.x - e.x);
    e.angle = a;
    e.moving = step / dt;
    this.move(e, Math.cos(a) * step, Math.sin(a) * step, dt);
  }
  updateBullets(dt) {
    for (const b of this.bullets) {
      if (b.dead) continue;
      b.life -= dt;
      const nx = b.x + b.vx * dt,
        ny = b.y + b.vy * dt;
      let hit = null,
        hitTime = 1.01;
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
        if (box.entity.broken) continue;
        const t = rayRect(b.x, b.y, nx, ny, box, 1);
        if (t !== null && t < hitTime) {
          hitTime = t;
          hit = { box };
        }
      }
      const targets =
        b.team === 'enemy'
          ? [this.player]
          : this.enemies.filter((e) => e.alive);
      for (const actor of targets) {
        if (
          this.tutorial &&
          actor !== this.player &&
          !this.tutorial.allowsHit(actor)
        )
          continue;
        if (actor === b.owner || actor.alive === false) continue;
        const t = segmentCircle(
          b.x,
          b.y,
          nx,
          ny,
          actor.x,
          actor.y,
          actor.fat ? 12 : 8,
        );
        if (t !== null && t < hitTime) {
          hitTime = t;
          hit = { actor };
        }
      }
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
          } else this.sound('sndHitWall');
        } else if (hit.actor === this.player) this.takeBullet();
        else if (b.thrown) {
          this.stun(hit.actor, STUN_DURATION);
        } else {
          hit.actor.hp--;
          if (hit.actor.hp <= 0) this.kill(hit.actor, 'shot');
          else this.sound('sndHit');
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
      )
        b.dead = true;
      if (b.dead && b.thrown) {
        const speed = Math.hypot(b.vx, b.vy);
        const offset = hit?.box ? 9 : 0;
        const at = this.safeSpawn({
          x: clamp(b.x - (b.vx / speed) * offset, 8, this.room.width - 8),
          y: clamp(b.y - (b.vy / speed) * offset, 8, this.room.height - 8),
        });
        this.items.push({
          x: at.x,
          y: at.y,
          angle: b.angle,
          weapon: b.weapon,
          ammo: b.ammo,
          frame: b.weapon.id,
          ammoBonusApplied: true,
        });
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);
  }
  updateParticles(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.91;
      p.vy *= 0.91;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floating) {
      f.life -= dt;
      f.y -= dt * 18;
    }
    this.floating = this.floating.filter((f) => f.life > 0);
  }
  checkClear() {
    if (
      !this.cleared &&
      this.enemies.every(
        (e) => !e.alive || (e.dog && this.profile.friendlyDogs),
      )
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
      exit: { x: this.exit.x, y: this.exit.y },
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
        .map((i) => ({ x: i.x, y: i.y, weapon: i.weapon.id, ammo: i.ammo })),
    };
  }
}
