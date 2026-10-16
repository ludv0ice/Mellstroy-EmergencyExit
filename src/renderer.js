import Phaser from 'phaser';
import { clamp } from './physics.js';
import { drawLevel } from './level-art.js';
import { assetUrl } from './assets.js';
import { playerPose, heldWeaponPose } from './player-animation.js';

export class GameView extends Phaser.Scene {
  constructor() {
    super('world');
    this.images = new Map();
    this.cameraPoint = { x: 320, y: 240 };
    this.controls = { moveX: 0, moveY: 0 };
    this.shake = 0;
    this.preview = true;
    this.loading = false;
  }
  create() {
    this.texture = this.textures.createCanvas(
      'screen',
      this.scale.width,
      this.scale.height,
    );
    this.screen = this.add.image(0, 0, 'screen').setOrigin(0);
    this.ctx = this.texture.context;
    this.scale.on('resize', (size) => {
      this.texture.setSize(size.width, size.height);
    });
    this.keys = this.input.keyboard.addKeys(
      'W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,SPACE,E,F,Q,R,ESC',
    );
    this.input.mouse.disableContextMenu();
    this.pending = {};
    this.input.on('pointerdown', (pointer) => {
      if (this.app?.mode !== 'playing') return;
      this.app.audio.start();
      if (pointer.rightButtonDown()) this.pending.weaponAction = true;
      if (pointer.middleButtonDown()) this.pending.throw = true;
    });
    this.input.keyboard.on('keydown', (event) => {
      if (event.code === 'Escape') {
        event.preventDefault();
        this.app?.togglePause();
      }
      if (
        event.code === 'KeyR' &&
        ['dead', 'playing', 'paused'].includes(this.app?.mode)
      ) {
        this.app?.restart();
      }
      if (this.app?.mode === 'playing' && !event.repeat) {
        if (event.code === 'KeyE') this.pending.pickup = true;
        if (event.code === 'KeyF') this.pending.throw = true;
        if (event.code === 'KeyQ') this.pending.drop = true;
        if (event.code === 'Space') this.pending.execute = true;
      }
    });
    this.input.keyboard.addCapture([
      'W',
      'A',
      'S',
      'D',
      'UP',
      'DOWN',
      'LEFT',
      'RIGHT',
      'SPACE',
      'SHIFT',
    ]);
    this.app.onReady(this);
  }
  async image(key, url) {
    if (this.images.has(key)) return this.images.get(key);
    const image = new Image();
    image.src = assetUrl(url);
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(Error('Asset load failed: ' + url));
    });
    this.images.set(key, image);
    return image;
  }
  async setWorld(sim, preview = false) {
    this.loading = true;
    const m = sim.manifest,
      keys = new Set(
        sim.room.entities.map((e) => e.sprite).filter((k) => m.sprites[k]),
      );
    for (const e of sim.room.entities.filter((e) => e.glass)) {
      const key = e.sprite.replace(/([HV])$/, '$1Broken');
      if (m.sprites[key]) keys.add(key);
    }
    for (const key of [
      'sprWeapons',
      'sprLegs',
      'sprPoliceLegs',
      'sprPWalkUnarmed',
      'sprEBackBlunt',
      'sprPoliceBackBlunt',
      'sprPoliceBackMachinegun',
      'sprPoliceCrawl',
      'sprBloodSplat',
      'sprBullet',
      'sprDogWalk',
      'sprDogDeadBlunt',
      'sprDogAttack',
      'sprPBackMachinegun',
      'sprPCrawl',
    ])
      if (m.sprites[key]) keys.add(key);
    const backgrounds = new Set(
      sim.room.tiles.map((t) => t.bgName).filter((k) => m.backgrounds[k]),
    );
    await Promise.all(
      [...keys]
        .map((k) => this.image(k, m.sprites[k].url))
        .concat(
          [...backgrounds].map((k) =>
            this.image(
              k,
              k === 'tlFloorTiles'
                ? this.app.skins.floor.url
                : m.backgrounds[k],
            ),
          ),
          Object.entries(this.app.skins)
            .filter(([k]) => k !== 'floor')
            .map(([k, v]) => this.image('custom-' + k, v.url)),
        ),
    );
    this.sim = sim;
    this.preview = preview;
    this.cameraPoint = { x: sim.player.x, y: sim.player.y };
    this.shake = 0;
    this.floor = document.createElement('canvas');
    this.floor.width = sim.room.width;
    this.floor.height = sim.room.height;
    this.front = document.createElement('canvas');
    this.front.width = sim.room.width;
    this.front.height = sim.room.height;
    const ctx = this.floor.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#241a35';
    ctx.fillRect(0, 0, this.floor.width, this.floor.height);
    drawLevel(ctx, sim.room);
    const entries = [
      ...sim.room.tiles.map((tile) => ({ tile, depth: tile.depth })),
      ...sim.room.entities
        .filter(
          (e) =>
            e.kind === 'decor' &&
            e.meta &&
            e.visible &&
            !e.glass &&
            !this.hiddenObject(e),
        )
        .map((entity) => ({ entity, depth: entity.depth })),
    ].sort((a, b) => b.depth - a.depth);
    for (const entry of entries) {
      const target = entry.depth < -3 ? this.front.getContext('2d') : ctx;
      target.imageSmoothingEnabled = false;
      if (entry.tile) {
        const t = entry.tile,
          img = this.images.get(t.bgName);
        if (!img) continue;
        const w = Math.min(t.w, img.width - t.xo),
          h = Math.min(t.h, img.height - t.yo);
        if (w > 0 && h > 0)
          target.drawImage(
            img,
            t.xo,
            t.yo,
            w,
            h,
            t.x,
            t.y,
            w * t.scaleX,
            h * t.scaleY,
          );
      } else this.drawEntity(target, entry.entity);
    }
    this.loading = false;
  }
  hiddenObject(e) {
    return /MaskMenu|Tutorial|Teacher|Score|Arrow|Cursor|Effector|Surfacer|WeaponUnlock|Teleporter|BackgroundColor|Shadow|Transitioner|LevelClearer|RoomStart|LevelStart|CorpseCount|Dialogue|Conversation|SwatSpawn|Boss\dSpawn|Light/.test(
      e.name,
    );
  }
  drawSprite(
    ctx,
    key,
    frame,
    x,
    y,
    angle = 0,
    sx = 1,
    sy = sx,
    alpha = 1,
    origin = null,
  ) {
    const m = this.sim.manifest.sprites[key],
      img = this.images.get(key);
    if (!m || !img) return;
    frame = ((Math.floor(frame) % m.frames) + m.frames) % m.frames;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(angle);
    ctx.scale(sx, sy);
    ctx.globalAlpha = alpha;
    ctx.drawImage(
      img,
      frame * m.width,
      0,
      m.width,
      m.height,
      -(origin?.[0] ?? m.originX),
      -(origin?.[1] ?? m.originY),
      m.width,
      m.height,
    );
    ctx.restore();
  }
  drawCustom(ctx, key, frame, x, y, angle = 0, alpha = 1, row = 0) {
    const m = this.app.skins[key],
      img = this.images.get('custom-' + key);
    if (!img) return;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;
    ctx.drawImage(
      img,
      (Math.floor(frame) % m.frames) * m.width,
      clamp(row, 0, (m.rows ?? 1) - 1) * m.height,
      m.width,
      m.height,
      -(m.originX ?? m.width / 2),
      -(m.originY ?? m.height / 2),
      m.width,
      m.height,
    );
    ctx.restore();
  }
  drawEntity(ctx, e) {
    if (e.broken) return;
    if (e.sprite === 'sprPlayerCar') {
      const frame = this.app.escape
        ? Math.min(12, Math.floor(this.app.escape.elapsed * 16))
        : e.frame;
      this.drawCustom(ctx, 'car', frame, e.x, e.y, e.angle);
      return;
    }
    if (e.sprite === 'sprAndersDesk') {
      const img = this.images.get('custom-desk'),
        m = e.meta,
        custom = this.app.skins.desk;
      if (img) {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle);
        ctx.scale(e.scaleX, e.scaleY);
        ctx.drawImage(
          img,
          (Math.floor(e.frame) % 6) * custom.width,
          0,
          custom.width,
          custom.height,
          -m.originX,
          -m.originY,
          m.width,
          m.height,
        );
        ctx.restore();
        return;
      }
    }
    this.drawSprite(
      ctx,
      e.sprite,
      e.frame,
      e.x,
      e.y,
      e.angle,
      e.scaleX,
      e.scaleY,
    );
  }
  inputState() {
    const keys = this.keys,
      pointer = this.input.activePointer;
    const down = (name) => keys[name]?.isDown;
    const input = {
      moveX:
        (down('D') || down('RIGHT') ? 1 : 0) -
        (down('A') || down('LEFT') ? 1 : 0),
      moveY:
        (down('S') || down('DOWN') ? 1 : 0) - (down('W') || down('UP') ? 1 : 0),
      attack: pointer.isDown && pointer.leftButtonDown(),
      weaponAction: !!this.pending.weaponAction,
      drop: Phaser.Input.Keyboard.JustDown(keys.Q) || this.pending.drop,
      pickup: Phaser.Input.Keyboard.JustDown(keys.E) || this.pending.pickup,
      execute:
        Phaser.Input.Keyboard.JustDown(keys.SPACE) || this.pending.execute,
      throw: Phaser.Input.Keyboard.JustDown(keys.F) || this.pending.throw,
      aim: this.toWorld(pointer.x, pointer.y),
      look: down('SHIFT'),
    };
    input.interact = input.pickup;
    if (this.controls.moveX || this.controls.moveY) {
      input.moveX = this.controls.moveX;
      input.moveY = this.controls.moveY;
    }
    if (this.controls.aim) input.aim = this.controls.aim;
    if (this.controls.attack) input.attack = true;
    this.pending = {};
    return input;
  }
  toWorld(x, y) {
    const zoom = this.zoom ?? 3;
    return {
      x: this.cameraPoint.x + (x - this.scale.width / 2) / zoom,
      y: this.cameraPoint.y + (y - this.scale.height / 2) / zoom,
    };
  }
  update(time, delta) {
    if (!this.sim || this.loading) return;
    const dt = Math.min(delta / 1000, 0.05),
      input = this.inputState();
    if (this.app.mode === 'playing') {
      this.sim.update(dt, input);
      for (const event of this.sim.events) {
        if (event.type === 'sound') this.app.audio.play(event.key);
        if (event.type === 'shake' && this.app.settings.effects)
          this.shake = event.amount;
        this.app.onEvent(event);
      }
      this.app.updateHUD();
    }
    if (this.app.mode === 'escaping') this.app.advanceExit(dt);
    const p = this.sim.player,
      look =
        input.look && this.app.mode === 'playing'
          ? (this.sim.profile.lookDistance ?? 96)
          : 0;
    const target = {
      x: p.x + Math.cos(p.angle) * look,
      y: p.y + Math.sin(p.angle) * look,
    };
    this.cameraPoint.x += (target.x - this.cameraPoint.x) * Math.min(1, dt * 8);
    this.cameraPoint.y += (target.y - this.cameraPoint.y) * Math.min(1, dt * 8);
    if (this.preview) {
      this.cameraPoint.x =
        this.sim.room.width / 2 + Math.sin(time * 0.00013) * 35;
      this.cameraPoint.y =
        this.sim.room.height / 2 + Math.cos(time * 0.00012) * 20;
    }
    this.render(time, dt);
  }
  render(time, dt) {
    const ctx = this.ctx,
      sim = this.sim,
      w = this.scale.width,
      h = this.scale.height;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#130d21';
    ctx.fillRect(0, 0, w, h);
    this.zoom = clamp(Math.round(Math.min(w / 480, h / 270)), 1, 5);
    if (this.preview) this.zoom = Math.max(2, this.zoom);
    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0,
      sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    this.shake = Math.max(0, this.shake - dt * 18);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(
      -Math.round(this.cameraPoint.x) + sx,
      -Math.round(this.cameraPoint.y) + sy,
    );
    ctx.drawImage(this.floor, 0, 0);
    for (const e of sim.exits)
      if (e.visible && e.meta && !this.hiddenObject(e)) this.drawEntity(ctx, e);
    for (const b of sim.blood)
      this.drawSprite(
        ctx,
        'sprBloodSplat',
        3,
        b.x,
        b.y,
        b.angle,
        b.scale,
        b.scale,
        0.9,
      );
    for (const body of sim.bodies) {
      if (body.dog)
        this.drawSprite(ctx, 'sprDogDeadBlunt', 4, body.x, body.y, body.angle);
      else
        this.drawCustom(
          ctx,
          'corpse',
          body.method === 'shot' ? 2 : body.method === 'execute' ? 3 : 0,
          body.x,
          body.y,
          body.angle,
        );
    }
    for (const item of sim.items)
      if (!item.taken) {
        ctx.strokeStyle = '#5decce55';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(
          item.x,
          item.y,
          8 + Math.sin(time * 0.005) * 1.5,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        this.drawSprite(
          ctx,
          'sprWeapons',
          item.weapon.id,
          item.x,
          item.y,
          item.angle ?? 0,
        );
      }
    for (const door of sim.doors) {
      if (!door.broken)
        this.drawSprite(
          ctx,
          door.sprite,
          0,
          door.x,
          door.y,
          door.baseAngle + door.open,
          door.scaleX,
          door.scaleY,
        );
    }
    for (const enemy of sim.enemies)
      if (enemy.alive) {
        if (enemy.dog) {
          this.drawSprite(
            ctx,
            enemy.sprite,
            enemy.frame,
            enemy.x,
            enemy.y,
            enemy.angle,
          );
        } else if (enemy.stun > 0) {
          this.drawCustom(
            ctx,
            'policeUnarmed',
            0,
            enemy.x,
            enemy.y,
            enemy.angle,
          );
          ctx.fillStyle = '#fbd567';
          ctx.font = '8px monospace';
          ctx.fillText('· · ·', enemy.x - 9, enemy.y - 13);
        } else {
          this.drawCustom(
            ctx,
            enemy.weapon.gun ? 'police' : 'policeUnarmed',
            enemy.frame,
            enemy.x,
            enemy.y,
            enemy.angle,
          );
          if (!enemy.weapon.gun && enemy.weapon.id >= 0)
            this.drawSprite(
              ctx,
              'sprWeapons',
              enemy.weapon.id,
              enemy.x + Math.cos(enemy.angle) * 9,
              enemy.y + Math.sin(enemy.angle) * 9,
              enemy.angle,
              0.6,
            );
          if (enemy.fat || enemy.swat || enemy.boss) {
            ctx.strokeStyle = enemy.boss ? '#f54387' : '#7ee2d2';
            ctx.lineWidth = 1;
            ctx.strokeRect(enemy.x - 5, enemy.y - 3, 10, 6);
          }
        }
      }
    const p = sim.player;
    const pose = playerPose(p);
    if (p.alive && p.visible !== false) {
      this.drawCustom(
        ctx,
        pose.key,
        pose.frame,
        p.x,
        p.y,
        pose.angle,
        1,
        pose.row,
      );
      const held = heldWeaponPose(p);
      if (held)
        this.drawSprite(
          ctx,
          'sprWeapons',
          p.weapon.id,
          p.x + held.x,
          p.y + held.y,
          held.angle,
          held.scale,
          held.scale,
          1,
          held.origin,
        );
    } else if (!p.alive)
      this.drawCustom(
        ctx,
        pose.key,
        pose.frame,
        p.x,
        p.y,
        pose.angle,
        0.75,
        pose.row,
      );
    const target = sim.tutorial?.target;
    if (target && this.app.mode === 'playing') {
      ctx.fillStyle = '#79caff';
      ctx.beginPath();
      ctx.moveTo(target.x - 4, target.y - 25);
      ctx.lineTo(target.x + 4, target.y - 25);
      ctx.lineTo(target.x, target.y - 19);
      ctx.fill();
    }
    ctx.drawImage(this.front, 0, 0);
    for (const e of sim.room.entities.filter((e) => e.glass && e.visible)) {
      const broken = e.sprite.replace(/([HV])$/, '$1Broken');
      if (e.broken && this.images.has(broken))
        this.drawSprite(ctx, broken, 0, e.x, e.y, e.angle, e.scaleX, e.scaleY);
      else if (!e.broken) this.drawEntity(ctx, e);
    }
    for (const bullet of sim.bullets) {
      if (bullet.thrown)
        this.drawSprite(
          ctx,
          'sprWeapons',
          bullet.weapon.id,
          bullet.x,
          bullet.y,
          time * 0.02,
        );
      else {
        ctx.strokeStyle = bullet.team === 'player' ? '#ffebb2' : '#ff5c79';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bullet.x, bullet.y);
        ctx.lineTo(bullet.x - bullet.vx * 0.012, bullet.y - bullet.vy * 0.012);
        ctx.stroke();
      }
    }
    for (const particle of sim.particles) {
      ctx.fillStyle = particle.blood
        ? '#da2857'
        : particle.glass
          ? '#77dfed'
          : '#ffcb84';
      ctx.fillRect(particle.x, particle.y, 1, 1);
    }
    for (const f of sim.floating) {
      ctx.fillStyle = '#fcf2c7';
      ctx.font = 'bold 8px monospace';
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }
    if (sim.cleared && !this.preview) {
      const e = sim.exit;
      const blink = 0.5 + 0.5 * Math.sin(time * 0.006);
      ctx.strokeStyle = '#6bffe3';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(e.x - 13, e.y - 13, 26, 26);
      ctx.fillStyle = `rgba(70,250,200,${0.1 + blink * 0.14})`;
      ctx.fillRect(e.x - 12, e.y - 12, 24, 24);
      ctx.fillStyle = '#91ffe1';
      ctx.font = 'bold 8px monospace';
      ctx.fillText('EXIT', e.x - 10, e.y - 20);
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d > 100) {
        const angle = Math.atan2(e.y - p.y, e.x - p.x);
        ctx.save();
        ctx.translate(p.x + Math.cos(angle) * 54, p.y + Math.sin(angle) * 54);
        ctx.rotate(angle);
        ctx.fillStyle = '#66f7df';
        ctx.beginPath();
        ctx.moveTo(7, 0);
        ctx.lineTo(-3, -4);
        ctx.lineTo(-3, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    if (this.app.mode === 'playing') {
      const pointer = this.input.activePointer,
        a = this.toWorld(pointer.x, pointer.y);
      ctx.strokeStyle = '#fff3ec';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 4, 0, Math.PI * 2);
      ctx.moveTo(a.x - 7, a.y);
      ctx.lineTo(a.x - 2, a.y);
      ctx.moveTo(a.x + 2, a.y);
      ctx.lineTo(a.x + 7, a.y);
      ctx.moveTo(a.x, a.y - 7);
      ctx.lineTo(a.x, a.y - 2);
      ctx.moveTo(a.x, a.y + 2);
      ctx.lineTo(a.x, a.y + 7);
      ctx.stroke();
    }
    ctx.restore();
    if (sim.profile.darkness && !this.preview) {
      const px = w / 2 + (p.x - this.cameraPoint.x) * this.zoom,
        py = h / 2 + (p.y - this.cameraPoint.y) * this.zoom;
      const gradient = ctx.createRadialGradient(
        px,
        py,
        35 * this.zoom,
        px,
        py,
        115 * this.zoom,
      );
      gradient.addColorStop(0, '#08000b00');
      gradient.addColorStop(1, '#08000bee');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    }
    this.texture.refresh();
  }
}
