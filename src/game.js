(() => {
  var phaser_default = globalThis.Phaser;
  var distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  var clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  var angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  function circleRect(x, y, r, box) {
    const dx = x - clamp(x, box.x, box.x + box.w), dy = y - clamp(y, box.y, box.y + box.h);
    return dx * dx + dy * dy < r * r;
  }
  function rayRect(ax, ay, bx, by, box, pad = 0) {
    let lo = 0, hi = 1;
    for (const [a, d, min, max] of [
      [ax, bx - ax, box.x - pad, box.x + box.w + pad],
      [ay, by - ay, box.y - pad, box.y + box.h + pad]
    ]) {
      if (Math.abs(d) < 1e-9) {
        if (a < min || a > max) return null;
      } else {
        let t1 = (min - a) / d, t2 = (max - a) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        lo = Math.max(lo, t1);
        hi = Math.min(hi, t2);
        if (lo > hi) return null;
      }
    }
    return lo;
  }
  function segmentCircle(ax, ay, bx, by, x, y, r) {
    const dx = bx - ax, dy = by - ay, a = dx * dx + dy * dy;
    if (a < 1e-9) return Math.hypot(ax - x, ay - y) <= r ? 0 : null;
    const fx = ax - x, fy = ay - y, c = fx * fx + fy * fy - r * r;
    if (c <= 0) return 0;
    const b = 2 * (fx * dx + fy * dy), disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t >= 0 && t <= 1 ? t : null;
  }
  var SpatialIndex = class {
    constructor(rects, size = 64) {
      this.size = size;
      this.buckets =  new Map();
      for (const box of rects)
        for (let y = Math.floor(box.y / size); y <= Math.floor((box.y + box.h) / size); y++)
          for (let x = Math.floor(box.x / size); x <= Math.floor((box.x + box.w) / size); x++) {
            const key = x + "," + y;
            if (!this.buckets.has(key)) this.buckets.set(key, []);
            this.buckets.get(key).push(box);
          }
    }
    query(x, y, w, h) {
      var _a;
      const found =  new Set();
      for (let cy = Math.floor(y / this.size); cy <= Math.floor((y + h) / this.size); cy++)
        for (let cx = Math.floor(x / this.size); cx <= Math.floor((x + w) / this.size); cx++)
          for (const box of this.buckets.get(cx + "," + cy) ?? [])
            if (!((_a = box.entity) == null ? void 0 : _a.broken) || box.entity.glass) found.add(box);
      return [...found];
    }
  };
  var Navigation = class {
    constructor(width, height, blocked, cell = 8) {
      this.cell = cell;
      this.cols = Math.ceil(width / cell);
      this.rows = Math.ceil(height / cell);
      this.blocked = new Uint8Array(this.cols * this.rows);
      for (let y = 0; y < this.rows; y++)
        for (let x = 0; x < this.cols; x++)
          this.blocked[y * this.cols + x] = blocked(
            (x + 0.5) * cell,
            (y + 0.5) * cell
          ) ? 1 : 0;
    }
    point(id) {
      return {
        x: (id % this.cols + 0.5) * this.cell,
        y: (Math.floor(id / this.cols) + 0.5) * this.cell
      };
    }
    nearest(x, y) {
      const cx = clamp(Math.floor(x / this.cell), 0, this.cols - 1), cy = clamp(Math.floor(y / this.cell), 0, this.rows - 1);
      for (let r = 0; r < 12; r++)
        for (let yy = Math.max(0, cy - r); yy <= Math.min(this.rows - 1, cy + r); yy++)
          for (let xx = Math.max(0, cx - r); xx <= Math.min(this.cols - 1, cx + r); xx++) {
            const id = yy * this.cols + xx;
            if (!this.blocked[id]) return id;
          }
      return null;
    }
    path(from, to) {
      const start = this.nearest(from.x, from.y), goal = this.nearest(to.x, to.y);
      if (start === null || goal === null) return [];
      const parent =  new Map(), g =  new Map([[start, 0]]), open =  new Set([start]), closed =  new Set();
      const heuristic = (id) => Math.abs(id % this.cols - goal % this.cols) + Math.abs(Math.floor(id / this.cols) - Math.floor(goal / this.cols));
      let visits = 0;
      while (open.size && visits++ < 12e3) {
        let current = null, best = Infinity;
        for (const id of open) {
          const score = g.get(id) + heuristic(id);
          if (score < best) {
            current = id;
            best = score;
          }
        }
        if (current === goal) {
          const route = [];
          let id = goal;
          while (id !== start) {
            route.push(this.point(id));
            id = parent.get(id);
          }
          return route.reverse();
        }
        open.delete(current);
        closed.add(current);
        const x = current % this.cols, y = Math.floor(current / this.cols);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1]
        ]) {
          const nx = x + dx, ny = y + dy, id = ny * this.cols + nx;
          if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows || this.blocked[id] || closed.has(id))
            continue;
          const next = g.get(current) + 1;
          if (next < (g.get(id) ?? Infinity)) {
            g.set(id, next);
            parent.set(id, current);
            open.add(id);
          }
        }
      }
      return [];
    }
  };
  function drawLevel(ctx, room) {
    if (!room.floor) return;
    const { cell, grid, palette, zoneCount } = room.floor;
    const [base, light, accent, pattern] = palette;
    ctx.fillStyle = "#080d15";
    ctx.fillRect(0, 0, room.width, room.height);
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (grid[y][x] === " ") continue;
        const zone = parseInt(grid[y][x], 36);
        const px = x * cell, py = y * cell;
        ctx.fillStyle = zone === zoneCount ? "#192c37" : base;
        ctx.fillRect(px, py, cell, cell);
        ctx.fillStyle = light;
        ctx.globalAlpha = 0.25;
        if (pattern === "wood") {
          for (let i = 0; i < cell; i += 8) ctx.fillRect(px, py + i, cell, 1);
          ctx.fillRect(px + y % 2 * 16, py, 1, cell);
        } else if (pattern === "dance" || pattern === "checker") {
          if ((x + y + zone) % 2)
            ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
          ctx.fillRect(px, py, cell, 1);
        } else if (pattern === "stripe") {
          ctx.fillRect(px, py, cell, 1);
          if (x % 3 === 0) ctx.fillRect(px + 2, py + 3, 2, cell - 6);
        } else {
          ctx.strokeStyle = light;
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
          ctx.fillRect(px + 7, py + 7, 2, 2);
        }
        ctx.globalAlpha = 1;
      }
    }
    for (const zone of room.zones) {
      ctx.strokeStyle = accent + "35";
      ctx.lineWidth = 1;
      ctx.strokeRect(zone.x + 9, zone.y + 9, zone.w - 18, zone.h - 18);
      ctx.fillStyle = accent + "70";
      ctx.font = "7px Exo2, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(zone.name, zone.x + 12, zone.y + 20, zone.w - 24);
      if (pattern === "carpet" || pattern === "stone") {
        ctx.strokeStyle = accent + "20";
        ctx.strokeRect(zone.x + 16, zone.y + 32, zone.w - 32, zone.h - 48);
      }
    }
    for (const entity of room.entities.filter((e) => e.isWall && e.bounds)) {
      const r = entity.bounds;
      ctx.fillStyle = "#0008";
      ctx.fillRect(r.x + 3, r.y + 4, r.w + 2, r.h + 2);
      ctx.fillStyle = "#52616e";
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.65;
      if (r.w > r.h) ctx.fillRect(r.x, r.y, r.w, 1);
      else ctx.fillRect(r.x, r.y, 1, r.h);
      ctx.globalAlpha = 1;
    }
  }
  function assetUrl(url) {
    const root = globalThis.__EMERGENCY_EXIT_ROOT__;
    if (root && url.startsWith("/")) return new URL(url.slice(1), root).href;
    return url;
  }
  async function readJson(url) {
    const data = globalThis.__EMERGENCY_EXIT_ASSETS__;
    if (data) {
      if (!(url in data.json)) throw new Error("Missing game data: " + url);
      return data.json[url];
    }
    const response = await fetch(assetUrl(url));
    if (!response.ok) throw new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C " + url);
    return response.json();
  }
  var PLAYER_DIRECTIONS = ["down", "up", "left", "right"];
  function directionForVector(x, y, fallback = "down") {
    if (Math.hypot(x, y) < 1e-3) return fallback;
    if (Math.abs(x) > Math.abs(y)) return x > 0 ? "right" : "left";
    return y > 0 ? "down" : "up";
  }
  function attackProgress(player) {
    const duration = player.attackDuration ?? 0.18;
    return clamp(1 - player.attack / duration, 0, 1);
  }
  function facingDirection(player, attacking) {
    if (!attacking) return player.facing ?? "down";
    const angle = player.weapon.gun ? player.angle : player.attackAngle ?? player.angle;
    return directionForVector(Math.cos(angle), Math.sin(angle));
  }
  function playerPose(player) {
    const attacking = player.alive && player.attack > 0;
    const melee = attacking && !player.weapon.gun;
    let frame = 0;
    if (player.alive) frame = Math.floor(player.frame) % 8;
    if (melee) frame = Math.min(6, Math.floor(attackProgress(player) * 7));
    return {
      key: melee ? "punchDirectional" : "heroDirectional",
      row: Math.max(
        0,
        PLAYER_DIRECTIONS.indexOf(facingDirection(player, attacking))
      ),
      frame,
      angle: 0
    };
  }
  var MELEE_ANIMATIONS = {
    Club: ["swing", 2, 0.3],
    Pipe: ["swing", 1.7, 0.35],
    Bat: ["swing", 2.3, 0.42],
    Knife: ["thrust", 7, 0.1],
    Sword: ["swing", 2.6, 0.25],
    Pool: ["thrust", 12, 0.15],
    PoolBroke: ["thrust", 9, 0.2],
    Axe: ["overhead", 2.2, 0.5],
    NightStick: ["swing", 1.8, 0.22],
    Crowbar: ["swing", 2.1, 0.33],
    Machete: ["swing", 2.5, 0.18],
    SledgeHammer: ["overhead", 2.7, 0.6],
    Trophy: ["overhead", 1.5, 0.4],
    Drill: ["thrust", 6, 0.05],
    Pan: ["swing", 1.6, 0.38],
    BoilingPot: ["thrust", 5, 0.45],
    Pot: ["overhead", 1.3, 0.48],
    Bag: ["thrust", 4, 0.28]
  };
  var grips = {
    Club: [16, 23],
    Pipe: [23, 23],
    Bat: [22, 24],
    Knife: [27, 23],
    Sword: [17, 25],
    Pool: [12, 24],
    PoolBroke: [21, 23],
    Axe: [18, 25],
    NightStick: [25, 26],
    Crowbar: [19, 26],
    Machete: [20, 26],
    SledgeHammer: [19, 24],
    Trophy: [27, 24],
    Drill: [25, 25],
    Pan: [23, 25],
    BoilingPot: [25, 25],
    Pot: [25, 25],
    Bag: [21, 25]
  };
  function heldWeaponPose(player) {
    const w = player.weapon;
    if (w.id < 0) return null;
    if (w.gun)
      return {
        x: Math.cos(player.angle) * 9,
        y: Math.sin(player.angle) * 9,
        angle: player.angle,
        scale: 0.65
      };
    const attacking = player.attack > 0 && !w.throwOnly;
    const direction = facingDirection(player, attacking);
    const base = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[direction];
    const [stroke, extent, rest] = MELEE_ANIMATIONS[w.sprite] ?? [
      "thrust",
      3,
      0.2
    ];
    const phase = attacking ? attackProgress(player) : 0;
    const contact = attacking ? Math.sin(Math.PI * phase) : 0;
    const sweep = attacking ? Math.sin(2 * Math.PI * phase) : 0;
    const reach = 5 + (stroke === "thrust" ? contact * extent : contact * 3);
    let rotation = 0;
    if (stroke === "swing") rotation = sweep * extent;
    if (stroke === "overhead") rotation = -contact * extent;
    const angle = base + rest + rotation;
    return {
      x: Math.cos(base) * reach - Math.sin(base) * 4,
      y: 2 + Math.sin(base) * reach + Math.cos(base) * 4 - (stroke === "overhead" ? contact * 5 : 0),
      angle,
      stroke,
      scale: 0.75,
      origin: grips[w.sprite] ?? [30, 24]
    };
  }
  var GameView = class extends phaser_default.Scene {
    constructor() {
      super("world");
      this.images =  new Map();
      this.cameraPoint = { x: 320, y: 240 };
      this.controls = { moveX: 0, moveY: 0 };
      this.shake = 0;
      this.preview = true;
      this.loading = false;
    }
    create() {
      this.texture = this.textures.createCanvas(
        "screen",
        this.scale.width,
        this.scale.height
      );
      this.screen = this.add.image(0, 0, "screen").setOrigin(0);
      this.ctx = this.texture.context;
      this.scale.on("resize", (size) => {
        this.texture.setSize(size.width, size.height);
      });
      this.keys = this.input.keyboard.addKeys(
        "W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,SPACE,E,F,Q,R,ESC"
      );
      this.input.mouse.disableContextMenu();
      this.pending = {};
      this.input.on("pointerdown", (pointer) => {
        var _a;
        if (((_a = this.app) == null ? void 0 : _a.mode) !== "playing") return;
        this.app.audio.start();
        if (pointer.rightButtonDown()) this.pending.weaponAction = true;
        if (pointer.middleButtonDown()) this.pending.throw = true;
      });
      this.input.keyboard.on("keydown", (event) => {
        var _a, _b, _c, _d;
        if (event.code === "Escape") {
          event.preventDefault();
          (_a = this.app) == null ? void 0 : _a.togglePause();
        }
        if (event.code === "KeyR" && ["dead", "playing", "paused"].includes((_b = this.app) == null ? void 0 : _b.mode)) {
          (_c = this.app) == null ? void 0 : _c.restart();
        }
        if (((_d = this.app) == null ? void 0 : _d.mode) === "playing" && !event.repeat) {
          if (event.code === "KeyE") this.pending.pickup = true;
          if (event.code === "KeyF") this.pending.throw = true;
          if (event.code === "KeyQ") this.pending.drop = true;
          if (event.code === "Space") this.pending.execute = true;
        }
      });
      this.input.keyboard.addCapture([
        "W",
        "A",
        "S",
        "D",
        "UP",
        "DOWN",
        "LEFT",
        "RIGHT",
        "SPACE",
        "SHIFT"
      ]);
      this.app.onReady(this);
    }
    async image(key, url) {
      if (this.images.has(key)) return this.images.get(key);
      const image = new Image();
      image.src = assetUrl(url);
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(Error("Asset load failed: " + url));
      });
      this.images.set(key, image);
      return image;
    }
    async setWorld(sim, preview = false) {
      this.loading = true;
      const m = sim.manifest, keys = new Set(
        sim.room.entities.map((e) => e.sprite).filter((k) => m.sprites[k])
      );
      for (const e of sim.room.entities.filter((e2) => e2.glass)) {
        const key = e.sprite.replace(/([HV])$/, "$1Broken");
        if (m.sprites[key]) keys.add(key);
      }
      for (const key of [
        "sprWeapons",
        "sprLegs",
        "sprPoliceLegs",
        "sprPWalkUnarmed",
        "sprEBackBlunt",
        "sprPoliceBackBlunt",
        "sprPoliceBackMachinegun",
        "sprPoliceCrawl",
        "sprBloodSplat",
        "sprBullet",
        "sprDogWalk",
        "sprDogDeadBlunt",
        "sprDogAttack",
        "sprPBackMachinegun",
        "sprPCrawl"
      ])
        if (m.sprites[key]) keys.add(key);
      const backgrounds = new Set(
        sim.room.tiles.map((t) => t.bgName).filter((k) => m.backgrounds[k])
      );
      await Promise.all(
        [...keys].map((k) => this.image(k, m.sprites[k].url)).concat(
          [...backgrounds].map(
            (k) => this.image(
              k,
              k === "tlFloorTiles" ? this.app.skins.floor.url : m.backgrounds[k]
            )
          ),
          Object.entries(this.app.skins).filter(([k]) => k !== "floor").map(([k, v]) => this.image("custom-" + k, v.url))
        )
      );
      this.sim = sim;
      this.preview = preview;
      this.cameraPoint = { x: sim.player.x, y: sim.player.y };
      this.shake = 0;
      this.floor = document.createElement("canvas");
      this.floor.width = sim.room.width;
      this.floor.height = sim.room.height;
      this.front = document.createElement("canvas");
      this.front.width = sim.room.width;
      this.front.height = sim.room.height;
      const ctx = this.floor.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#241a35";
      ctx.fillRect(0, 0, this.floor.width, this.floor.height);
      drawLevel(ctx, sim.room);
      const entries = [
        ...sim.room.tiles.map((tile) => ({ tile, depth: tile.depth })),
        ...sim.room.entities.filter(
          (e) => e.kind === "decor" && e.meta && e.visible && !e.glass && !this.hiddenObject(e)
        ).map((entity) => ({ entity, depth: entity.depth }))
      ].sort((a, b) => b.depth - a.depth);
      for (const entry of entries) {
        const target = entry.depth < -3 ? this.front.getContext("2d") : ctx;
        target.imageSmoothingEnabled = false;
        if (entry.tile) {
          const t = entry.tile, img = this.images.get(t.bgName);
          if (!img) continue;
          const w = Math.min(t.w, img.width - t.xo), h = Math.min(t.h, img.height - t.yo);
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
              h * t.scaleY
            );
        } else this.drawEntity(target, entry.entity);
      }
      this.loading = false;
    }
    hiddenObject(e) {
      return /MaskMenu|Tutorial|Teacher|Score|Arrow|Cursor|Effector|Surfacer|WeaponUnlock|Teleporter|BackgroundColor|Shadow|Transitioner|LevelClearer|RoomStart|LevelStart|CorpseCount|Dialogue|Conversation|SwatSpawn|Boss\dSpawn|Light/.test(
        e.name
      );
    }
    drawSprite(ctx, key, frame, x, y, angle = 0, sx = 1, sy = sx, alpha = 1, origin = null) {
      const m = this.sim.manifest.sprites[key], img = this.images.get(key);
      if (!m || !img) return;
      frame = (Math.floor(frame) % m.frames + m.frames) % m.frames;
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
        -((origin == null ? void 0 : origin[0]) ?? m.originX),
        -((origin == null ? void 0 : origin[1]) ?? m.originY),
        m.width,
        m.height
      );
      ctx.restore();
    }
    drawCustom(ctx, key, frame, x, y, angle = 0, alpha = 1, row = 0) {
      const m = this.app.skins[key], img = this.images.get("custom-" + key);
      if (!img) return;
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.rotate(angle);
      ctx.globalAlpha = alpha;
      ctx.drawImage(
        img,
        Math.floor(frame) % m.frames * m.width,
        clamp(row, 0, (m.rows ?? 1) - 1) * m.height,
        m.width,
        m.height,
        -(m.originX ?? m.width / 2),
        -(m.originY ?? m.height / 2),
        m.width,
        m.height
      );
      ctx.restore();
    }
    drawEntity(ctx, e) {
      if (e.broken) return;
      if (e.sprite === "sprPlayerCar") {
        const frame = this.app.escape ? Math.min(12, Math.floor(this.app.escape.elapsed * 16)) : e.frame;
        this.drawCustom(ctx, "car", frame, e.x, e.y, e.angle);
        return;
      }
      if (e.sprite === "sprAndersDesk") {
        const img = this.images.get("custom-desk"), m = e.meta, custom = this.app.skins.desk;
        if (img) {
          ctx.save();
          ctx.translate(e.x, e.y);
          ctx.rotate(e.angle);
          ctx.scale(e.scaleX, e.scaleY);
          ctx.drawImage(
            img,
            Math.floor(e.frame) % 6 * custom.width,
            0,
            custom.width,
            custom.height,
            -m.originX,
            -m.originY,
            m.width,
            m.height
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
        e.scaleY
      );
    }
    inputState() {
      const keys = this.keys, pointer = this.input.activePointer;
      const down = (name) => {
        var _a;
        return (_a = keys[name]) == null ? void 0 : _a.isDown;
      };
      const input = {
        moveX: (down("D") || down("RIGHT") ? 1 : 0) - (down("A") || down("LEFT") ? 1 : 0),
        moveY: (down("S") || down("DOWN") ? 1 : 0) - (down("W") || down("UP") ? 1 : 0),
        attack: pointer.isDown && pointer.leftButtonDown(),
        weaponAction: !!this.pending.weaponAction,
        drop: phaser_default.Input.Keyboard.JustDown(keys.Q) || this.pending.drop,
        pickup: phaser_default.Input.Keyboard.JustDown(keys.E) || this.pending.pickup,
        execute: phaser_default.Input.Keyboard.JustDown(keys.SPACE) || this.pending.execute,
        throw: phaser_default.Input.Keyboard.JustDown(keys.F) || this.pending.throw,
        aim: this.toWorld(pointer.x, pointer.y),
        look: down("SHIFT")
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
        y: this.cameraPoint.y + (y - this.scale.height / 2) / zoom
      };
    }
    update(time, delta) {
      if (!this.sim || this.loading) return;
      const dt = Math.min(delta / 1e3, 0.05), input = this.inputState();
      if (this.app.mode === "playing") {
        this.sim.update(dt, input);
        for (const event of this.sim.events) {
          if (event.type === "sound") this.app.audio.play(event.key);
          if (event.type === "shake" && this.app.settings.effects)
            this.shake = event.amount;
          this.app.onEvent(event);
        }
        this.app.updateHUD();
      }
      if (this.app.mode === "escaping") this.app.advanceExit(dt);
      const p = this.sim.player, look = input.look && this.app.mode === "playing" ? this.sim.profile.lookDistance ?? 96 : 0;
      const target = {
        x: p.x + Math.cos(p.angle) * look,
        y: p.y + Math.sin(p.angle) * look
      };
      this.cameraPoint.x += (target.x - this.cameraPoint.x) * Math.min(1, dt * 8);
      this.cameraPoint.y += (target.y - this.cameraPoint.y) * Math.min(1, dt * 8);
      if (this.preview) {
        this.cameraPoint.x = this.sim.room.width / 2 + Math.sin(time * 13e-5) * 35;
        this.cameraPoint.y = this.sim.room.height / 2 + Math.cos(time * 12e-5) * 20;
      }
      this.render(time, dt);
    }
    render(time, dt) {
      var _a;
      const ctx = this.ctx, sim = this.sim, w = this.scale.width, h = this.scale.height;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#130d21";
      ctx.fillRect(0, 0, w, h);
      this.zoom = clamp(Math.round(Math.min(w / 480, h / 270)), 1, 5);
      if (this.preview) this.zoom = Math.max(2, this.zoom);
      const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0, sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
      this.shake = Math.max(0, this.shake - dt * 18);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(
        -Math.round(this.cameraPoint.x) + sx,
        -Math.round(this.cameraPoint.y) + sy
      );
      ctx.drawImage(this.floor, 0, 0);
      for (const e of sim.exits)
        if (e.visible && e.meta && !this.hiddenObject(e)) this.drawEntity(ctx, e);
      for (const b of sim.blood)
        this.drawSprite(
          ctx,
          "sprBloodSplat",
          3,
          b.x,
          b.y,
          b.angle,
          b.scale,
          b.scale,
          0.9
        );
      for (const body of sim.bodies) {
        if (body.dog)
          this.drawSprite(ctx, "sprDogDeadBlunt", 4, body.x, body.y, body.angle);
        else
          this.drawCustom(
            ctx,
            "corpse",
            body.method === "shot" ? 2 : body.method === "execute" ? 3 : 0,
            body.x,
            body.y,
            body.angle
          );
      }
      for (const item of sim.items)
        if (!item.taken) {
          ctx.strokeStyle = "#5decce55";
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.arc(
            item.x,
            item.y,
            8 + Math.sin(time * 5e-3) * 1.5,
            0,
            Math.PI * 2
          );
          ctx.stroke();
          this.drawSprite(
            ctx,
            "sprWeapons",
            item.weapon.id,
            item.x,
            item.y,
            item.angle ?? 0
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
            door.scaleY
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
              enemy.angle
            );
          } else if (enemy.stun > 0) {
            this.drawCustom(
              ctx,
              "policeUnarmed",
              0,
              enemy.x,
              enemy.y,
              enemy.angle
            );
            ctx.fillStyle = "#fbd567";
            ctx.font = "8px monospace";
            ctx.fillText("\xB7 \xB7 \xB7", enemy.x - 9, enemy.y - 13);
          } else {
            this.drawCustom(
              ctx,
              enemy.weapon.gun ? "police" : "policeUnarmed",
              enemy.frame,
              enemy.x,
              enemy.y,
              enemy.angle
            );
            if (!enemy.weapon.gun && enemy.weapon.id >= 0)
              this.drawSprite(
                ctx,
                "sprWeapons",
                enemy.weapon.id,
                enemy.x + Math.cos(enemy.angle) * 9,
                enemy.y + Math.sin(enemy.angle) * 9,
                enemy.angle,
                0.6
              );
            if (enemy.fat || enemy.swat || enemy.boss) {
              ctx.strokeStyle = enemy.boss ? "#f54387" : "#7ee2d2";
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
          pose.row
        );
        const held = heldWeaponPose(p);
        if (held)
          this.drawSprite(
            ctx,
            "sprWeapons",
            p.weapon.id,
            p.x + held.x,
            p.y + held.y,
            held.angle,
            held.scale,
            held.scale,
            1,
            held.origin
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
          pose.row
        );
      const target = (_a = sim.tutorial) == null ? void 0 : _a.target;
      if (target && this.app.mode === "playing") {
        ctx.fillStyle = "#79caff";
        ctx.beginPath();
        ctx.moveTo(target.x - 4, target.y - 25);
        ctx.lineTo(target.x + 4, target.y - 25);
        ctx.lineTo(target.x, target.y - 19);
        ctx.fill();
      }
      ctx.drawImage(this.front, 0, 0);
      for (const e of sim.room.entities.filter((e2) => e2.glass && e2.visible)) {
        const broken = e.sprite.replace(/([HV])$/, "$1Broken");
        if (e.broken && this.images.has(broken))
          this.drawSprite(ctx, broken, 0, e.x, e.y, e.angle, e.scaleX, e.scaleY);
        else if (!e.broken) this.drawEntity(ctx, e);
      }
      for (const bullet of sim.bullets) {
        if (bullet.thrown)
          this.drawSprite(
            ctx,
            "sprWeapons",
            bullet.weapon.id,
            bullet.x,
            bullet.y,
            time * 0.02
          );
        else {
          ctx.strokeStyle = bullet.team === "player" ? "#ffebb2" : "#ff5c79";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(bullet.x, bullet.y);
          ctx.lineTo(bullet.x - bullet.vx * 0.012, bullet.y - bullet.vy * 0.012);
          ctx.stroke();
        }
      }
      for (const particle of sim.particles) {
        ctx.fillStyle = particle.blood ? "#da2857" : particle.glass ? "#77dfed" : "#ffcb84";
        ctx.fillRect(particle.x, particle.y, 1, 1);
      }
      for (const f of sim.floating) {
        ctx.fillStyle = "#fcf2c7";
        ctx.font = "bold 8px monospace";
        ctx.globalAlpha = Math.min(1, f.life * 2);
        ctx.fillText(f.text, f.x, f.y);
        ctx.globalAlpha = 1;
      }
      if (sim.cleared && !this.preview) {
        const e = sim.exit;
        const blink = 0.5 + 0.5 * Math.sin(time * 6e-3);
        ctx.strokeStyle = "#6bffe3";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(e.x - 13, e.y - 13, 26, 26);
        ctx.fillStyle = `rgba(70,250,200,${0.1 + blink * 0.14})`;
        ctx.fillRect(e.x - 12, e.y - 12, 24, 24);
        ctx.fillStyle = "#91ffe1";
        ctx.font = "bold 8px monospace";
        ctx.fillText("EXIT", e.x - 10, e.y - 20);
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d > 100) {
          const angle = Math.atan2(e.y - p.y, e.x - p.x);
          ctx.save();
          ctx.translate(p.x + Math.cos(angle) * 54, p.y + Math.sin(angle) * 54);
          ctx.rotate(angle);
          ctx.fillStyle = "#66f7df";
          ctx.beginPath();
          ctx.moveTo(7, 0);
          ctx.lineTo(-3, -4);
          ctx.lineTo(-3, 4);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
      if (this.app.mode === "playing") {
        const pointer = this.input.activePointer, a = this.toWorld(pointer.x, pointer.y);
        ctx.strokeStyle = "#fff3ec";
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
        const px = w / 2 + (p.x - this.cameraPoint.x) * this.zoom, py = h / 2 + (p.y - this.cameraPoint.y) * this.zoom;
        const gradient = ctx.createRadialGradient(
          px,
          py,
          35 * this.zoom,
          px,
          py,
          115 * this.zoom
        );
        gradient.addColorStop(0, "#08000b00");
        gradient.addColorStop(1, "#08000bee");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
      }
      this.texture.refresh();
    }
  };
  var definitions = [
    ["M16", "M16", 24, 2 / 60, 1, 6 * Math.PI / 180, 960, "sndM16"],
    [
      "\u0414\u0440\u043E\u0431\u043E\u0432\u0438\u043A",
      "Shotgun",
      6,
      30 / 60,
      8,
      12 * Math.PI / 180,
      960,
      "sndShotgun"
    ],
    ["\u041A\u043B\u044E\u0448\u043A\u0430", "Club"],
    ["\u0422\u0440\u0443\u0431\u0430", "Pipe"],
    ["\u0411\u0438\u0442\u0430", "Bat"],
    ["\u041D\u043E\u0436", "Knife"],
    [
      "\u0414\u0432\u0443\u0441\u0442\u0432\u043E\u043B\u043A\u0430",
      "DoubleBarrel",
      2,
      8 / 60,
      16,
      20 * Math.PI / 180,
      960,
      "sndDoubleBarrel"
    ],
    [
      "\u041F\u0438\u0441\u0442\u043E\u043B\u0435\u0442 \u0441 \u0433\u043B\u0443\u0448\u0438\u0442\u0435\u043B\u0435\u043C",
      "Silencer",
      13,
      10 / 60,
      1,
      6 * Math.PI / 180,
      960,
      "sndSilencer"
    ],
    ["\u041A\u0430\u0442\u0430\u043D\u0430", "Sword"],
    ["UZI", "Uzi", 30, 1 / 60, 1, 10 * Math.PI / 180, 960, "sndUzi"],
    ["\u041C\u0430\u0433\u043D\u0443\u043C", "Magnum", 6, 8 / 60, 1, 0, 960, "sndMagnum"],
    [
      "Scorpion",
      "Scorpion",
      20,
      2 / 60,
      1,
      6 * Math.PI / 180,
      960,
      "sndScorpion"
    ],
    ["MP5", "MP5", 32, 2 / 60, 1, 10 * Math.PI / 180, 960, "sndMP5"],
    ["\u0411\u0438\u043B\u044C\u044F\u0440\u0434\u043D\u044B\u0439 \u043A\u0438\u0439", "Pool"],
    ["\u0421\u043B\u043E\u043C\u0430\u043D\u043D\u044B\u0439 \u043A\u0438\u0439", "PoolBroke"],
    ["\u0422\u043E\u043F\u043E\u0440", "Axe"],
    ["\u0414\u0443\u0431\u0438\u043D\u043A\u0430", "NightStick"],
    ["\u041B\u043E\u043C", "Crowbar"],
    ["\u041C\u0430\u0447\u0435\u0442\u0435", "Machete"],
    ["\u041A\u0443\u0432\u0430\u043B\u0434\u0430", "SledgeHammer"],
    ["\u041A\u0443\u0431\u043E\u043A", "Trophy"],
    ["\u0414\u0440\u0435\u043B\u044C", "Drill"],
    ["\u0421\u043A\u043E\u0432\u043E\u0440\u043E\u0434\u0430", "Pan"],
    ["\u041A\u0438\u043F\u044F\u0442\u043E\u043A", "BoilingPot"],
    ["\u041A\u0430\u0441\u0442\u0440\u044E\u043B\u044F", "Pot"],
    [
      "UZI \u0441 \u0433\u043B\u0443\u0448\u0438\u0442\u0435\u043B\u0435\u043C",
      "SilencedUzi",
      30,
      2 / 60,
      1,
      10 * Math.PI / 180,
      960,
      "sndSilencer"
    ],
    ["\u041F\u0430\u043A\u0435\u0442", "Bag"],
    ["\u041A\u0438\u0440\u043F\u0438\u0447", "Throw"],
    ["\u0411\u0443\u0442\u044B\u043B\u043A\u0430", "Throw"],
    ["\u0414\u0440\u043E\u0442\u0438\u043A", "Throw"],
    ["\u041D\u043E\u0436 \u0434\u043B\u044F \u043C\u0435\u0442\u0430\u043D\u0438\u044F", "Throw"],
    ["\u041D\u043E\u0436\u043D\u0438\u0446\u044B", "Throw"],
    ["\u041C\u043E\u043B\u043E\u0442\u043E\u043A", "Throw"],
    ["\u0417\u0432\u0435\u0437\u0434\u0430", "Throw"],
    ["\u041C\u043E\u043B\u043E\u0442\u043E\u0432", "Throw"]
  ];
  var meleeReach = {
    Club: 48,
    Pipe: 38,
    Bat: 42,
    Knife: 28,
    Sword: 52,
    Pool: 58,
    PoolBroke: 36,
    Axe: 40,
    NightStick: 34,
    Crowbar: 37,
    Machete: 44,
    SledgeHammer: 50,
    Trophy: 30,
    Drill: 27,
    Pan: 33,
    BoilingPot: 31,
    Pot: 29,
    Bag: 26
  };
  var WEAPONS = definitions.map((d, id) => ({
    id,
    name: d[0],
    sprite: d[1],
    ammo: d[2] ?? 0,
    gun: d[2] > 0,
    cooldown: d[3] ?? (id === 19 ? 0.5 : 0.26),
    pellets: d[4] ?? 0,
    spread: d[5] ?? 0,
    speed: d[6] ?? 0,
    sound: d[7] ?? "sndSwing1",
    range: Math.round((meleeReach[d[1]] ?? 0) * 1.2),
    enemyRange: Math.round((meleeReach[d[1]] ?? 0) * 0.7),
    sharp: [5, 8, 15, 18, 21].includes(id),
    throwOnly: id >= 27,
    silent: [7, 25].includes(id)
  }));
  var meleeReload = {
    Club: 19,
    Pipe: 22,
    Bat: 25,
    Knife: 10,
    Sword: 15,
    Pool: 20,
    PoolBroke: 20,
    Axe: 30,
    NightStick: 15,
    Crowbar: 20,
    Machete: 12,
    SledgeHammer: 30,
    Trophy: 20,
    Drill: 20,
    Pan: 20,
    BoilingPot: 25,
    Pot: 25,
    Bag: 20,
    Throw: 20
  };
  for (const weapon of WEAPONS)
    if (!weapon.gun) weapon.cooldown = (meleeReload[weapon.sprite] ?? 20) / 60;
  var UNARMED = {
    id: -1,
    name: "\u041A\u0443\u043B\u0430\u043A\u0438",
    sprite: "Unarmed",
    gun: false,
    ammo: 0,
    cooldown: 20 / 60,
    range: 25,
    sound: "sndPunch"
  };
  var weaponBySprite = (name = "") => WEAPONS.find(
    (w) => name.replace(/^(sprPolice|sprE|sprP)(Walk|Attack)/, "") === w.sprite
  ) ?? UNARMED;
  var defaults = {
    kind: "decor",
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    frame: 0,
    depth: 0,
    visible: true,
    solid: false,
    isWall: false,
    furniture: false,
    glass: false,
    broken: false
  };
  function buildRoom(manifest, raw) {
    const entities = raw.entities.map((entity, id) => ({
      ...defaults,
      id,
      ...entity,
      solid: entity.solid || /^objWallSoft[HV]$/.test(entity.name),
      isWall: entity.isWall || /^objWallSoft[HV]$/.test(entity.name),
      init: { ...entity.init },
      meta: manifest.sprites[entity.sprite],
      mask: manifest.sprites[entity.mask]
    }));
    return { ...raw, entities };
  }
  function connectsTo(exit, room) {
    var _a;
    return exit.init.nextroom === room || !!((_a = exit.targets) == null ? void 0 : _a.includes(room));
  }
  function rectFor(entity) {
    if (entity.bounds) return { ...entity.bounds, entity };
    const m = entity.mask ?? entity.meta;
    if (!m) return null;
    const b = m.bbox, ox = m.originX, oy = m.originY;
    const corners = [
      [b[0] - ox, b[1] - oy],
      [b[2] - ox + 1, b[1] - oy],
      [b[2] - ox + 1, b[3] - oy + 1],
      [b[0] - ox, b[3] - oy + 1]
    ];
    const c = Math.cos(entity.angle), s = Math.sin(entity.angle);
    const points = corners.map(([x, y]) => [
      entity.x + x * entity.scaleX * c - y * entity.scaleY * s,
      entity.y + x * entity.scaleX * s + y * entity.scaleY * c
    ]);
    return {
      x: Math.min(...points.map((p) => p[0])),
      y: Math.min(...points.map((p) => p[1])),
      w: Math.max(...points.map((p) => p[0])) - Math.min(...points.map((p) => p[0])),
      h: Math.max(...points.map((p) => p[1])) - Math.min(...points.map((p) => p[1])),
      entity
    };
  }
  var STUN_DURATION = 3.1;
  var MAX_ENEMIES = 7;
  var Simulation = class {
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
      this.status = "playing";
      this.bullets = [];
      this.bodies = [];
      this.particles = [];
      this.floating = [];
      this.blood = [];
      this.doors = this.room.entities.filter((e) => e.kind === "door").map((e) => ({
        ...e,
        baseAngle: e.angle,
        swing: 0,
        open: 0,
        locked: false,
        sourceLocked: !!e.init.solid,
        rect: rectFor(e)
      }));
      this.exits = this.room.entities.filter((e) => e.kind === "exit");
      const staticBoxes = this.room.entities.filter(
        (e) => e.solid && !["enemy", "player", "door", "exit"].includes(e.kind)
      ).map(rectFor).filter(Boolean);
      this.index = new SpatialIndex(staticBoxes);
      this.staticBoxes = staticBoxes;
      this.navigation = new Navigation(
        raw.width,
        raw.height,
        (x, y) => this.blocked(x, y, 7, false)
      );
      this.enemies = this.room.entities.filter((e) => e.kind === "enemy").slice(0, MAX_ENEMIES).map((e) => {
        const dog = /Dog/.test(e.name), fat = /Fat/.test(e.name), swat = /Swat/.test(e.name), boss = /Boss/.test(e.name);
        let w = weaponBySprite(e.sprite);
        if (/Melee/.test(e.name) && w.gun) w = WEAPONS[16];
        if (dog) w = UNARMED;
        return {
          ...e,
          angle: -(e.init.direction ?? e.init.dir ?? 0) * Math.PI / 180,
          weapon: w,
          ammo: w.ammo,
          state: "patrol",
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
          stationary: raw.id === "eeTraining" || /Stationary|Guard|Idle/.test(e.name),
          dog,
          fat,
          swat,
          boss,
          hp: fat || swat ? 2 : boss ? 3 : 1
        };
      });
      this.items = this.room.entities.filter((e) => e.kind === "weapon").map((e) => {
        const choices = profile.gunSpawns ? [0, 1, 6] : profile.meleeSpawns ? [2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6];
        const id = typeof e.init.image_index === "number" ? e.init.image_index : choices[Math.floor(this.random() * choices.length)];
        const w = WEAPONS[clamp(Math.floor(id), 0, 34)];
        return {
          ...e,
          weapon: w,
          ammo: e.init.ammo > 0 ? e.init.ammo : w.ammo,
          frame: w.id
        };
      });
      const start = this.room.entities.find((e) => e.kind === "player");
      let position = start ?? this.room.entities.find((e) => /Transitioner|Elevator/.test(e.name)) ?? {
        x: raw.width / 2,
        y: raw.height / 2
      };
      position = this.safeSpawn(position);
      this.player = {
        x: position.x,
        y: position.y,
        angle: 0,
        facing: "down",
        vx: 0,
        vy: 0,
        radius: 7,
        alive: true,
        frame: 0,
        moving: 0,
        weapon: profile.startWeapon !== void 0 ? WEAPONS[profile.startWeapon] : UNARMED,
        ammo: 0,
        fireTimer: 0.3,
        attack: 0,
        execution: 0
      };
      this.player.ammo = this.player.weapon.ammo;
      this.player.armor = profile.armor ?? 0;
      this.grace = 0.6;
      this.total = this.enemies.filter(
        (e) => !e.dog || !profile.friendlyDogs
      ).length;
      this.exit = this.findExit();
      this.cleared = this.total === 0;
      this.context = "";
      this.checkClear();
    }
    random() {
      this.seed = Math.imul(this.seed, 1664525) + 1013904223 >>> 0;
      return this.seed / 4294967296;
    }
    emit(type, data = {}) {
      this.events.push({ type, ...data });
    }
    sound(key) {
      this.emit("sound", { key });
    }
    doorBoxes() {
      return this.doors.filter((d) => !d.broken && (d.locked || Math.abs(d.open) < 0.3)).map((d) => d.rect);
    }
    blocked(x, y, r = 7, doors = true) {
      return this.index.query(x - r, y - r, r * 2, r * 2).some((b) => circleRect(x, y, r, b)) || doors && this.doorBoxes().some((b) => circleRect(x, y, r, b));
    }
    lineBlocked(a, b, furniture = false, glass = true) {
      const boxes = this.index.query(
        Math.min(a.x, b.x),
        Math.min(a.y, b.y),
        Math.abs(a.x - b.x),
        Math.abs(a.y - b.y)
      );
      return [...boxes, ...this.doorBoxes()].some(
        (box) => !box.entity.broken && (glass || !box.entity.glass) && (furniture || !box.entity.furniture) && rayRect(a.x, a.y, b.x, b.y, box) !== null
      );
    }
    safeSpawn(at) {
      if (!this.blocked(at.x, at.y, 7, false)) return { x: at.x, y: at.y };
      for (let radius = 8; radius < 400; radius += 8)
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
          const p = {
            x: at.x + Math.cos(angle) * radius,
            y: at.y + Math.sin(angle) * radius
          };
          if (p.x >= 8 && p.y >= 8 && p.x < this.room.width - 8 && p.y < this.room.height - 8 && !this.blocked(p.x, p.y, 7, false))
            return p;
        }
      return { x: at.x, y: at.y };
    }
    findExit() {
      const candidates = this.exits.filter((e) => /PlayerCarEnter/.test(e.name));
      if (candidates.length) return candidates[0];
      const stairs = this.exits.filter((e) => !e.init.solid);
      if (stairs.length) {
        let result = stairs[0];
        for (const e of stairs)
          if (distance(e, this.player) > distance(result, this.player))
            result = e;
        return result;
      }
      return { x: this.player.x, y: this.player.y };
    }
    canMoveTo(actor, x, y) {
      if (this.blocked(x, y, 7)) return false;
      const others = actor === this.player ? this.enemies : [this.player, ...this.enemies];
      return !others.some((other) => {
        if (!other || other === actor || !other.alive) return false;
        const radius = (actor.radius ?? 7) + (other.radius ?? 7);
        const next = (x - other.x) ** 2 + (y - other.y) ** 2;
        const current = (actor.x - other.x) ** 2 + (actor.y - other.y) ** 2;
        return next < radius ** 2 && next <= current + 1e-6;
      });
    }
    move(actor, dx, dy, dt) {
      const steps2 = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4)), sx = dx / steps2, sy = dy / steps2;
      for (let i = 0; i < steps2; i++) {
        for (const door of this.doors) {
          if (door.locked || door.broken) continue;
          if (circleRect(actor.x + sx, actor.y + sy, 9, door.rect)) {
            if (Math.abs(door.open) < 0.3) {
              door.swing = actor === this.player ? 7 : 4;
              door.open = 0.4;
              this.sound("sndDoorOpen");
              if (actor === this.player) {
                for (const enemy of this.enemies)
                  if (enemy.alive && distance(enemy, door) < 39) {
                    if (this.profile.lethalDoors) this.kill(enemy, "door");
                    else this.stun(enemy, 2.6);
                  }
              }
            }
          }
        }
        if (this.canMoveTo(actor, actor.x + sx, actor.y)) actor.x += sx;
        else if (actor === this.player && sy === 0 && sx !== 0 && this.blocked(actor.x + sx, actor.y, 7)) {
          if (!this.blocked(actor.x + sx, actor.y - 8, 7) && this.canMoveTo(actor, actor.x, actor.y - Math.abs(sx)))
            actor.y -= Math.abs(sx);
          else if (!this.blocked(actor.x + sx, actor.y + 8, 7) && this.canMoveTo(actor, actor.x, actor.y + Math.abs(sx)))
            actor.y += Math.abs(sx);
        }
        if (this.canMoveTo(actor, actor.x, actor.y + sy)) actor.y += sy;
        else if (actor === this.player && sx === 0 && sy !== 0 && this.blocked(actor.x, actor.y + sy, 7)) {
          if (!this.blocked(actor.x - 8, actor.y + sy, 7) && this.canMoveTo(actor, actor.x - Math.abs(sy), actor.y))
            actor.x -= Math.abs(sy);
          else if (!this.blocked(actor.x + 8, actor.y + sy, 7) && this.canMoveTo(actor, actor.x + Math.abs(sy), actor.y))
            actor.x += Math.abs(sy);
        }
      }
      actor.x = clamp(actor.x, -64, this.room.width + 64);
      actor.y = clamp(actor.y, -64, this.room.height + 64);
    }
    update(dt, input) {
      var _a;
      this.events = [];
      if (this.status !== "playing") return;
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
      const acceleration = 1800 * dt, max = this.profile.speed;
      if (this.profile.reversed)
        input = { ...input, moveX: -input.moveX, moveY: -input.moveY };
      const approach = (v, target) => v < target ? Math.min(target, v + acceleration) : Math.max(target, v - acceleration);
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
      const changingWeapon = input.weaponAction || input.pickup || input.drop || input.throw;
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
      (_a = this.tutorial) == null ? void 0 : _a.update(input);
      const nearest = this.items.filter((i) => !i.taken).sort((a, b) => distance(a, p) - distance(b, p))[0];
      const down = this.enemies.find(
        (e) => e.alive && e.stun > 0 && distance(p, e) < 31
      );
      this.context = down ? "SPACE \xB7 \u0414\u041E\u0411\u0418\u0422\u042C" : nearest && distance(nearest, p) < 30 ? (p.weapon === UNARMED ? "E / \u041F\u041A\u041C \xB7 " : "E \xB7 ") + nearest.weapon.name.toUpperCase() : this.cleared ? "\u041A \u0412\u042B\u0425\u041E\u0414\u0423 \u2192 E" : "";
      if (input.interact && this.cleared && (!this.tutorial || this.tutorial.canExit) && distance(p, this.exit) < 48) {
        this.status = "complete";
        this.sound("sndComplete");
        this.emit("complete");
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
      const p = this.player, items = this.items.filter(
        (i) => !i.taken && distance(i, p) < 32 && !this.lineBlocked(i, p) && (!this.tutorial || this.tutorial.allowsPickup(i))
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
          ammoBonusApplied: true
        });
      p.weapon = item.weapon;
      p.ammo = Math.round(
        item.ammo * (item.ammoBonusApplied ? 1 : this.profile.ammoBonus ?? 1)
      );
      item.taken = true;
      p.attack = 0;
      this.sound("sndPickupWeapon");
    }
    attack() {
      const p = this.player, w = p.weapon;
      if (w.throwOnly) {
        this.throwWeapon();
        return;
      }
      if (w.gun) {
        if (p.ammo <= 0) {
          this.sound("sndLock");
          p.fireTimer = 0.2;
          return;
        }
        p.ammo--;
        this.shots++;
        p.fireTimer = w.cooldown;
        p.attack = 0.12;
        this.fire(p, w, "player");
        this.sound(w.sound);
        this.emit("shake", { amount: 1.8 });
      } else {
        p.fireTimer = w.cooldown;
        p.attackDuration = w.id < 0 ? 0.18 : Math.min(0.42, w.cooldown);
        p.attack = p.attackDuration;
        p.attackAngle = p.angle;
        this.sound(w.sound);
        for (const enemy of this.enemies) {
          if (!enemy.alive || this.tutorial && !this.tutorial.allowsHit(enemy) || distance(enemy, p) > w.range + 6 || this.lineBlocked(p, enemy))
            continue;
          const diff = Math.abs(
            angleDelta(Math.atan2(enemy.y - p.y, enemy.x - p.x), p.angle)
          );
          if (diff > 1.1) continue;
          if (w === UNARMED && !this.profile.punchKill && !enemy.dog) {
            const stolen = this.profile.disarm && enemy.weapon !== UNARMED ? { weapon: enemy.weapon, ammo: enemy.ammo } : null;
            this.stun(enemy, STUN_DURATION);
            if (stolen) {
              p.weapon = stolen.weapon;
              p.ammo = stolen.ammo;
              const drop = this.items.at(-1);
              if (drop && drop.weapon === stolen.weapon && Math.hypot(drop.x - enemy.x, drop.y - enemy.y) < 12)
                drop.taken = true;
              this.sound("sndPickupWeapon");
            }
          } else if (enemy.fat && (!w.sharp || w === UNARMED))
            this.stun(enemy, 0.5);
          else this.kill(enemy, w.sharp ? "cut" : "melee");
        }
        for (const box of this.staticBoxes)
          if (box.entity.glass && !box.entity.broken && rayRect(
            p.x,
            p.y,
            p.x + Math.cos(p.angle) * w.range,
            p.y + Math.sin(p.angle) * w.range,
            box,
            6
          ) !== null)
            this.breakGlass(box.entity);
      }
    }
    fire(actor, w, team) {
      for (let i = 0; i < w.pellets; i++) {
        const angle = actor.angle + (this.random() - 0.5) * w.spread * (team === "player" ? this.profile.accuracy ?? 1 : 1);
        const muzzle = {
          x: actor.x + Math.cos(angle) * 12,
          y: actor.y + Math.sin(angle) * 12
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
          weapon: w
        });
      }
      if (!w.silent && !(team === "player" && this.profile.silentShots))
        this.noise(actor, 320);
    }
    dropWeapon() {
      const p = this.player;
      if (p.weapon === UNARMED) return;
      const ahead = {
        x: p.x + Math.cos(p.angle) * 12,
        y: p.y + Math.sin(p.angle) * 12
      };
      const at = !this.blocked(ahead.x, ahead.y, 7) && !this.lineBlocked(p, ahead, true) ? ahead : p;
      this.items.push({
        x: at.x,
        y: at.y,
        angle: p.angle,
        weapon: p.weapon,
        ammo: p.ammo,
        frame: p.weapon.id,
        ammoBonusApplied: true
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
        life: this.profile.longThrows ? 0.95 : 0.65,
        team: "player",
        owner: p,
        weapon: p.weapon,
        ammo: p.ammo,
        thrown: true
      });
      p.weapon = UNARMED;
      p.ammo = 0;
      p.attack = 0;
      p.fireTimer = 0.15;
      this.sound("sndThrow");
    }
    execute() {
      const enemy = this.enemies.find(
        (e) => e.alive && e.stun > 0 && distance(e, this.player) < 32 && !this.lineBlocked(e, this.player)
      );
      if (!enemy || this.player.execution > 0) return;
      this.player.execution = 0.35;
      this.player.attack = 0.35;
      this.kill(enemy, "execute");
      this.sound("sndBonesBreak");
      this.emit("shake", { amount: 3 });
    }
    stun(enemy, time) {
      if (enemy.fat || enemy.boss) {
        time = Math.min(time, 0.6);
      }
      if (enemy.stun <= 0) {
        this.sound("sndHit");
        this.dropEnemyWeapon(enemy);
      }
      enemy.stun = time;
      enemy.meleeWindup = null;
      enemy.state = "stunned";
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
        ammoBonusApplied: !!e.ammoBonusApplied
      });
      e.weapon = UNARMED;
      e.ammo = 0;
    }
    kill(enemy, method) {
      if (!enemy.alive) return;
      enemy.alive = false;
      enemy.state = "dead";
      this.kills++;
      this.dropEnemyWeapon(enemy);
      this.combo++;
      this.comboTimer = this.profile.comboWindow ?? 2.2;
      const points = (method === "execute" ? 600 : 400) * Math.max(1, this.combo);
      this.score += points;
      this.floating.push({
        x: enemy.x,
        y: enemy.y - 12,
        text: "+" + points,
        life: 1
      });
      this.bodies.push({
        x: enemy.x,
        y: enemy.y,
        angle: enemy.angle,
        method,
        dog: enemy.dog,
        frame: 0
      });
      this.blood.push({
        x: enemy.x,
        y: enemy.y,
        angle: this.random() * 6.28,
        scale: 0.6 + this.random() * 0.5
      });
      for (let i = 0; i < 12 * (this.profile.gore ?? 1); i++) {
        const a = this.random() * 6.28, s = 20 + this.random() * 90;
        this.particles.push({
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: 0.4 + this.random() * 0.4,
          blood: true
        });
      }
      this.sound(method === "cut" ? "sndCut1" : "sndHit");
    }
    die() {
      if (!this.player.alive) return;
      this.player.alive = false;
      this.status = "dead";
      this.emit("death");
      this.sound("sndHit");
      this.emit("shake", { amount: 5 });
    }
    takeBullet() {
      if (this.player.armor > 0) {
        this.player.armor--;
        this.sound("sndHit");
        this.emit("shake", { amount: 3 });
      } else this.die();
    }
    noise(at, radius) {
      for (const enemy of this.enemies)
        if (enemy.alive && distance(enemy, at) < radius) {
          enemy.lastSeen = { x: at.x, y: at.y };
          enemy.alert = 5;
          enemy.state = "search";
        }
    }
    breakGlass(entity) {
      entity.broken = true;
      this.sound("sndGlass1");
      this.noise(entity, 200);
      for (let i = 0; i < 9; i++)
        this.particles.push({
          x: entity.x,
          y: entity.y,
          vx: (this.random() - 0.5) * 100,
          vy: (this.random() - 0.5) * 100,
          life: 0.65,
          glass: true
        });
    }
    updateEnemy(e, dt) {
      if (e.dog && this.profile.friendlyDogs) {
        e.state = "friendly";
        return;
      }
      e.fireTimer = Math.max(0, e.fireTimer - dt);
      e.routeTimer -= dt;
      e.patrolTurn = Math.max(0, e.patrolTurn - dt);
      if (e.stun > 0) {
        e.stun = Math.max(0, e.stun - dt);
        if (e.stun === 0) {
          e.state = "search";
          e.alert = 4;
        }
        return;
      }
      const p = this.player, d = distance(e, p), angle = Math.atan2(p.y - e.y, p.x - e.x);
      const cone = Math.abs(angleDelta(angle, e.angle)) < (e.alert > 0 ? Math.PI : 1.45);
      const sees = this.grace <= 0 && d < (this.profile.stealth ? 140 : 260) && cone && !this.lineBlocked(e, p, false, false) && !(this.room.id === "eeTraining" && d > 45);
      if (sees) {
        e.lastSeen = { x: p.x, y: p.y };
        e.alert = 5;
        e.reaction -= dt;
        e.state = "chase";
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
            this.fire(e, e.weapon, "enemy");
            this.sound(e.weapon.sound);
          }
        } else {
          const target = e.lastSeen;
          if (!this.lineBlocked(e, target, true)) {
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
          const ready = inReach && sees && !this.lineBlocked(e, p) && e.reaction <= 0 && e.fireTimer <= 0;
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
        e.state = "patrol";
        e.lastSeen = null;
        e.moving = 0;
        if (!e.stationary) {
          const clear = (angle2) => !this.blocked(
            e.x + Math.cos(angle2) * 12,
            e.y + Math.sin(angle2) * 12,
            8
          );
          if (!clear(e.angle) && e.patrolTurn === 0) {
            const next = [
              e.angle + Math.PI / 2,
              e.angle - Math.PI / 2,
              e.angle + Math.PI
            ].find(clear);
            if (next !== void 0)
              e.angle = Math.atan2(Math.sin(next), Math.cos(next));
            e.patrolTurn = 0.35;
          }
          if (clear(e.angle)) {
            const before = { x: e.x, y: e.y };
            this.move(
              e,
              Math.cos(e.angle) * 60 * dt,
              Math.sin(e.angle) * 60 * dt,
              dt
            );
            e.moving = dt > 0 ? distance(before, e) / dt : 0;
          }
        }
      }
      if (e.moving > 0) e.frame = (e.frame + dt * e.moving * 0.06) % 8;
      if (e.weapon === UNARMED && !e.dog && !e.fat) {
        const item = this.items.find(
          (i) => !i.taken && distance(i, e) < 18 && !this.lineBlocked(i, e)
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
        const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
        let hit = null, hitTime = 1.01;
        const boxes = [
          ...this.index.query(
            Math.min(b.x, nx) - 2,
            Math.min(b.y, ny) - 2,
            Math.abs(nx - b.x) + 4,
            Math.abs(ny - b.y) + 4
          ),
          ...this.doorBoxes()
        ];
        for (const box of boxes) {
          if (box.entity.broken) continue;
          const t = rayRect(b.x, b.y, nx, ny, box, 1);
          if (t !== null && t < hitTime) {
            hitTime = t;
            hit = { box };
          }
        }
        const targets = b.team === "enemy" ? [this.player] : this.enemies.filter((e) => e.alive);
        for (const actor of targets) {
          if (this.tutorial && actor !== this.player && !this.tutorial.allowsHit(actor))
            continue;
          if (actor === b.owner || actor.alive === false) continue;
          const t = segmentCircle(
            b.x,
            b.y,
            nx,
            ny,
            actor.x,
            actor.y,
            actor.fat ? 12 : 8
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
            } else this.sound("sndHitWall");
          } else if (hit.actor === this.player) this.takeBullet();
          else if (b.thrown) {
            this.stun(hit.actor, STUN_DURATION);
          } else {
            hit.actor.hp--;
            if (hit.actor.hp <= 0) this.kill(hit.actor, "shot");
            else this.sound("sndHit");
          }
          b.dead = true;
        } else {
          b.x = nx;
          b.y = ny;
        }
        if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > this.room.width || b.y > this.room.height)
          b.dead = true;
        if (b.dead && b.thrown) {
          const speed = Math.hypot(b.vx, b.vy);
          const offset = (hit == null ? void 0 : hit.box) ? 9 : 0;
          const at = this.safeSpawn({
            x: clamp(b.x - b.vx / speed * offset, 8, this.room.width - 8),
            y: clamp(b.y - b.vy / speed * offset, 8, this.room.height - 8)
          });
          this.items.push({
            x: at.x,
            y: at.y,
            angle: b.angle,
            weapon: b.weapon,
            ammo: b.ammo,
            frame: b.weapon.id,
            ammoBonusApplied: true
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
      if (!this.cleared && this.enemies.every(
        (e) => !e.alive || e.dog && this.profile.friendlyDogs
      )) {
        this.cleared = true;
        this.sound("sndComplete");
        this.emit("clear");
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
          ammo: this.player.ammo
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
          weapon: e.weapon.id
        })),
        drops: this.items.filter((i) => !i.taken).map((i) => ({ x: i.x, y: i.y, weapon: i.weapon.id, ammo: i.ammo }))
      };
    }
  };
  var steps = [
    [
      "move",
      "\u0414\u0432\u0438\u0436\u0435\u043D\u0438\u0435",
      "\u041F\u0440\u043E\u0439\u0434\u0438 \u0432 \u043A\u0430\u0436\u0434\u0443\u044E \u0441\u0442\u043E\u0440\u043E\u043D\u0443: W, A, S, D. \u041D\u0430 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439 \u0434\u0436\u043E\u0439\u0441\u0442\u0438\u043A."
    ],
    [
      "aim",
      "\u041F\u0440\u0438\u0446\u0435\u043B\u0438\u0432\u0430\u043D\u0438\u0435",
      "\u041F\u043E\u0434\u0432\u0438\u0433\u0430\u0439 \u043C\u044B\u0448\u044C\u044E \u0432\u043E\u043A\u0440\u0443\u0433 \u0433\u0435\u0440\u043E\u044F. \u0422\u0435\u043B\u043E \u0441\u043B\u0435\u0434\u0443\u0435\u0442 \u0434\u0432\u0438\u0436\u0435\u043D\u0438\u044E, \u0430 \u0430\u0442\u0430\u043A\u0430 \u2014 \u043F\u0440\u0438\u0446\u0435\u043B\u0443."
    ],
    [
      "punch",
      "\u041E\u0433\u043B\u0443\u0448\u0435\u043D\u0438\u0435",
      "\u041F\u043E\u0434\u043E\u0439\u0434\u0438 \u043A \u043E\u0442\u043C\u0435\u0447\u0435\u043D\u043D\u043E\u043C\u0443 \u0432\u0440\u0430\u0433\u0443 \u0438 \u043D\u0430\u0436\u043C\u0438 \u041B\u041A\u041C \u0431\u0435\u0437 \u043E\u0440\u0443\u0436\u0438\u044F. \u041A\u0443\u043B\u0430\u043A \u043E\u0433\u043B\u0443\u0448\u0430\u0435\u0442."
    ],
    [
      "finish",
      "\u0414\u043E\u0431\u0438\u0432\u0430\u043D\u0438\u0435",
      "\u041F\u043E\u0434\u043E\u0439\u0434\u0438 \u043A \u043E\u0433\u043B\u0443\u0448\u0451\u043D\u043D\u043E\u043C\u0443 \u0432\u0440\u0430\u0433\u0443 \u0438 \u043D\u0430\u0436\u043C\u0438 Space. \u041D\u0435 \u0436\u0434\u0438, \u043F\u043E\u043A\u0430 \u043E\u043D \u0432\u0441\u0442\u0430\u043D\u0435\u0442."
    ],
    [
      "pickup",
      "\u0411\u043B\u0438\u0436\u043D\u0435\u0435 \u043E\u0440\u0443\u0436\u0438\u0435",
      "\u041F\u043E\u0434\u043E\u0439\u0434\u0438 \u043A \u043E\u0442\u043C\u0435\u0447\u0435\u043D\u043D\u043E\u0439 \u0431\u0438\u0442\u0435 \u0438 \u043D\u0430\u0436\u043C\u0438 E. \u041E\u0440\u0443\u0436\u0438\u0435 \u0434\u043E\u0441\u0442\u0430\u0451\u0442 \u0434\u0430\u043B\u044C\u0448\u0435 \u043A\u0443\u043B\u0430\u043A\u0430."
    ],
    ["drop", "\u0421\u0431\u0440\u043E\u0441", "\u041D\u0430\u0436\u043C\u0438 Q: \u043E\u0440\u0443\u0436\u0438\u0435 \u043E\u0441\u0442\u0430\u043D\u0435\u0442\u0441\u044F \u0440\u044F\u0434\u043E\u043C, \u043F\u0430\u0442\u0440\u043E\u043D\u044B \u043D\u0435 \u043F\u043E\u0442\u0435\u0440\u044F\u044E\u0442\u0441\u044F."],
    ["retrieve", "\u041F\u043E\u0432\u0442\u043E\u0440\u043D\u044B\u0439 \u043F\u043E\u0434\u0431\u043E\u0440", "\u041F\u043E\u0434\u043E\u0439\u0434\u0438 \u043A \u0441\u0431\u0440\u043E\u0448\u0435\u043D\u043D\u043E\u0439 \u0431\u0438\u0442\u0435 \u0438 \u043D\u0430\u0436\u043C\u0438 E."],
    [
      "throw",
      "\u0411\u0440\u043E\u0441\u043E\u043A",
      "\u041D\u0430\u0432\u0435\u0434\u0438 \u043F\u0440\u0438\u0446\u0435\u043B \u043D\u0430 \u043E\u0442\u043C\u0435\u0447\u0435\u043D\u043D\u043E\u0433\u043E \u0432\u0440\u0430\u0433\u0430 \u0438 \u043D\u0430\u0436\u043C\u0438 \u041F\u041A\u041C \u0438\u043B\u0438 F. \u041F\u043E\u043F\u0430\u0434\u0430\u043D\u0438\u0435 \u043E\u0433\u043B\u0443\u0448\u0438\u0442 \u0435\u0433\u043E. \u041F\u0440\u0438 \u043F\u0440\u043E\u043C\u0430\u0445\u0435 \u043F\u043E\u0434\u0431\u0435\u0440\u0438 \u0431\u0438\u0442\u0443 \u0447\u0435\u0440\u0435\u0437 E \u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u0438."
    ],
    [
      "recover",
      "\u0412\u0435\u0440\u043D\u0438 \u043E\u0440\u0443\u0436\u0438\u0435",
      "\u041F\u043E\u0434\u043E\u0439\u0434\u0438 \u043A \u0431\u0440\u043E\u0448\u0435\u043D\u043D\u043E\u0439 \u0431\u0438\u0442\u0435 \u0438 \u043F\u043E\u0434\u0431\u0435\u0440\u0438 \u0435\u0451 \u043A\u043B\u0430\u0432\u0438\u0448\u0435\u0439 E."
    ],
    [
      "melee",
      "\u0423\u0434\u0430\u0440 \u043E\u0440\u0443\u0436\u0438\u0435\u043C",
      "\u0414\u043E\u0431\u0435\u0439 \u043E\u0442\u043C\u0435\u0447\u0435\u043D\u043D\u043E\u0433\u043E \u0432\u0440\u0430\u0433\u0430 \u0431\u0438\u0442\u043E\u0439: \u043F\u043E\u0434\u043E\u0439\u0434\u0438 \u0438 \u043D\u0430\u0436\u043C\u0438 \u041B\u041A\u041C."
    ],
    ["gun", "\u0421\u0442\u0440\u0435\u043B\u043A\u043E\u0432\u043E\u0435 \u043E\u0440\u0443\u0436\u0438\u0435", "\u041F\u043E\u0434\u043E\u0439\u0434\u0438 \u043A \u043E\u0442\u043C\u0435\u0447\u0435\u043D\u043D\u043E\u043C\u0443 \u0434\u0440\u043E\u0431\u043E\u0432\u0438\u043A\u0443 \u0438 \u043D\u0430\u0436\u043C\u0438 E."],
    [
      "shoot",
      "\u0412\u044B\u0441\u0442\u0440\u0435\u043B",
      "\u041D\u0430\u0432\u0435\u0434\u0438 \u043F\u0440\u0438\u0446\u0435\u043B \u043D\u0430 \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0435\u0433\u043E \u0432\u0440\u0430\u0433\u0430 \u0438 \u043D\u0430\u0436\u043C\u0438 \u041B\u041A\u041C. \u0421\u043B\u0435\u0434\u0438 \u0437\u0430 \u043F\u0430\u0442\u0440\u043E\u043D\u0430\u043C\u0438 \u0432\u043D\u0438\u0437\u0443."
    ],
    [
      "exit",
      "\u0412\u044B\u0445\u043E\u0434",
      "\u0412\u0441\u0435 \u043F\u0440\u0438\u0451\u043C\u044B \u043E\u0441\u0432\u043E\u0435\u043D\u044B. \u041F\u043E\u0434\u043E\u0439\u0434\u0438 \u043A \u0432\u044B\u0445\u043E\u0434\u0443 \u0438 \u043D\u0430\u0436\u043C\u0438 E. Esc \u2014 \u043F\u0430\u0443\u0437\u0430, R \u2014 \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u043A."
    ]
  ];
  var Tutorial = class {
    constructor(sim) {
      this.sim = sim;
      this.index = 0;
      this.directions =  new Set();
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
        directions: [...this.directions]
      };
    }
    get target() {
      if (["move", "aim", "drop"].includes(this.step)) return null;
      if (["punch", "finish"].includes(this.step)) return this.sim.enemies[0];
      if (["throw", "melee"].includes(this.step)) return this.sim.enemies[1];
      if (this.step === "shoot") return this.sim.enemies[2];
      if (this.step === "exit") return this.sim.exit;
      const id = this.step === "gun" ? 1 : 4;
      return this.sim.items.find((item) => !item.taken && item.weapon.id === id);
    }
    filterInput(input) {
      this.before = { x: this.sim.player.x, y: this.sim.player.y };
      this.startAngle ??= this.sim.player.angle;
      const canPickup = ["pickup", "retrieve", "recover", "gun"].includes(this.step) || this.step === "throw" && this.sim.player.weapon === UNARMED;
      const throwing = this.step === "throw";
      return {
        ...input,
        attack: input.attack && ["punch", "melee", "shoot"].includes(this.step),
        execute: input.execute && this.step === "finish",
        drop: input.drop && this.step === "drop",
        throw: input.throw && throwing,
        weaponAction: input.weaponAction && (throwing || canPickup),
        pickup: input.pickup && canPickup,
        interact: input.interact && this.step === "exit"
      };
    }
    update(input) {
      const sim = this.sim, p = sim.player;
      const [first, second, third] = sim.enemies;
      for (const enemy of sim.enemies) {
        if (enemy.stun > 0) enemy.stun = Math.max(2, enemy.stun);
      }
      if (this.step === "move" && Math.hypot(p.x - this.before.x, p.y - this.before.y) > 0.1) {
        if (input.moveX < 0) this.directions.add("A");
        if (input.moveX > 0) this.directions.add("D");
        if (input.moveY < 0) this.directions.add("W");
        if (input.moveY > 0) this.directions.add("S");
      }
      if (this.step === "shoot" && p.ammo === 0 && third.alive && sim.bullets.length === 0)
        p.ammo = 6;
      const done = {
        move: this.directions.size === 4,
        aim: Math.abs(
          Math.atan2(
            Math.sin(p.angle - this.startAngle),
            Math.cos(p.angle - this.startAngle)
          )
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
        exit: false
      };
      if (done[this.step]) {
        this.index++;
        this.startAngle = p.angle;
      }
    }
    allowsPickup(item) {
      return item.weapon.id === (this.step === "gun" ? 1 : 4);
    }
    allowsHit(enemy) {
      return enemy === this.target;
    }
    get canExit() {
      return this.step === "exit";
    }
  };
  var panels = ["menu", "pause", "briefing", "chapter-panel"];
  var MenuNavigation = class {
    constructor() {
      this.panel = null;
      this.index = 0;
      document.addEventListener("keydown", (event) => this.keydown(event), true);
      for (const panel of panels) {
        const track = (event) => {
          const button = event.target.closest("button");
          if (button && this.buttons.includes(button))
            this.select(this.buttons.indexOf(button), false);
        };
        const element = document.getElementById(panel);
        element.addEventListener("pointerover", track);
        element.addEventListener("focusin", track);
      }
    }
    get buttons() {
      if (!this.panel) return [];
      const buttons = this.panel.id === "chapter-panel" ? [
        ...this.panel.querySelectorAll("#chapter-list button"),
        this.panel.querySelector(".back")
      ] : [...this.panel.querySelectorAll("button")];
      return buttons.filter(
        (button) => button && !button.disabled && button.getClientRects().length
      );
    }
    show(id) {
      document.querySelectorAll(".menu-selected").forEach((button) => button.classList.remove("menu-selected"));
      this.panel = panels.includes(id) ? document.getElementById(id) : null;
      this.index = 0;
      if (this.panel) this.select(0, true);
    }
    select(index, focus) {
      const buttons = this.buttons;
      if (!buttons.length) return;
      this.index = (index + buttons.length) % buttons.length;
      buttons.forEach(
        (button, i) => button.classList.toggle("menu-selected", i === this.index)
      );
      if (focus) buttons[this.index].focus({ preventScroll: true });
      if (focus && this.panel.id === "chapter-panel")
        buttons[this.index].scrollIntoView({ block: "nearest" });
    }
    keydown(event) {
      var _a;
      if (!this.panel || this.panel.classList.contains("hidden")) return;
      if (event.target.matches("select, input")) return;
      const direction = { KeyW: -1, ArrowUp: -1, KeyS: 1, ArrowDown: 1 }[event.code];
      if (!direction && event.code !== "Enter" && event.code !== "NumpadEnter")
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (direction) this.select(this.index + direction, true);
      else (_a = this.buttons[this.index]) == null ? void 0 : _a.click();
    }
  };
  var CHAPTERS = [
    [
      "00",
      "\u042D\u0424\u0418\u0420 \u041E\u041A\u041E\u041D\u0427\u0415\u041D",
      "\u041E\u0441\u0432\u043E\u0439 \u0434\u0432\u0438\u0436\u0435\u043D\u0438\u0435, \u043E\u0433\u043B\u0443\u0448\u0435\u043D\u0438\u0435, \u0434\u043E\u0431\u0438\u0432\u0430\u043D\u0438\u0435, \u043F\u043E\u0434\u0431\u043E\u0440, \u0441\u0431\u0440\u043E\u0441, \u0431\u0440\u043E\u0441\u043E\u043A \u0438 \u0441\u0442\u0440\u0435\u043B\u044C\u0431\u0443. \u041A\u0430\u0436\u0434\u043E\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u0435 \u043E\u0442\u043A\u0440\u044B\u0432\u0430\u0435\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0435\u0433\u043E. \u0412\u0440\u0430\u0433\u0438 \u0437\u0434\u0435\u0441\u044C \u0436\u0434\u0443\u0442 \u0442\u0432\u043E\u0438\u0445 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439.",
      ["eeTraining"]
    ],
    [
      "01",
      "\u041F\u041E\u0421\u041B\u0415\u0414\u041D\u0418\u0419 \u041F\u041E\u0415\u0417\u0414",
      "\u0414\u043E \u0432\u043E\u043A\u0437\u0430\u043B\u0430 \u0434\u043E\u0431\u0440\u0430\u043B\u0430\u0441\u044C \u043F\u0435\u0440\u0432\u0430\u044F \u0433\u0440\u0443\u043F\u043F\u0430. \u041F\u0440\u043E\u0440\u0432\u0438\u0441\u044C \u043A \u043F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0435.",
      ["eeStationHall", "eeStationService"]
    ],
    [
      "02",
      "\u0411\u0415\u0417 \u0421\u0412\u0418\u0414\u0415\u0422\u0415\u041B\u0415\u0419",
      "\u0410\u0434\u0440\u0435\u0441 \u043A\u0432\u0430\u0440\u0442\u0438\u0440\u044B \u0441\u043B\u0438\u043B\u0438 \u0432 \u0447\u0430\u0442. \u041F\u043E\u043B\u0438\u0446\u0438\u044F \u043F\u0435\u0440\u0435\u043A\u0440\u044B\u043B\u0430 \u043F\u043E\u0434\u044A\u0435\u0437\u0434.",
      ["eeCourtyard", "eeLoft"]
    ],
    [
      "03",
      "\u0427\u0423\u0416\u041E\u0419 \u0410\u0414\u0420\u0415\u0421",
      "\u0412\u0442\u043E\u0440\u043E\u0435 \u0443\u0431\u0435\u0436\u0438\u0449\u0435 \u0442\u043E\u0436\u0435 \u0440\u0430\u0441\u043A\u0440\u044B\u0442\u043E. \u0418\u043C \u043D\u0443\u0436\u0435\u043D \u0442\u043E\u0442, \u043A\u0442\u043E \u0432\u043A\u043B\u044E\u0447\u0430\u043B \u043A\u0430\u043C\u0435\u0440\u0443.",
      ["eeCanalEntry", "eeRelayRoom"]
    ],
    [
      "04",
      "OFFLINE",
      "\u0422\u0435\u043B\u0435\u0444\u043E\u043D \u043C\u043E\u043B\u0447\u0438\u0442. \u0412 \u0433\u043E\u0441\u0442\u0438\u043D\u043E\u0439 \u2014 \u043B\u044E\u0434\u0438 \u0432 \u0444\u043E\u0440\u043C\u0435.",
      ["eeQuietReception", "eeRoofFlat"]
    ],
    [
      "05",
      "\u0411\u0415\u0417 \u0414\u041E\u041D\u0410\u0422\u041E\u0412",
      "\u0417\u0434\u0435\u0441\u044C \u043E\u0431\u0435\u0449\u0430\u043B\u0438 \u043F\u0435\u0440\u0435\u0436\u0434\u0430\u0442\u044C \u043D\u043E\u0447\u044C. \u0417\u0434\u0435\u0441\u044C \u0442\u0435\u0431\u044F \u0436\u0434\u0430\u043B\u0438.",
      ["eeWorkshop", "eeMezzanine"]
    ],
    [
      "06",
      "\u0421\u041B\u0418\u0422\u042B\u0419 \u0410\u0414\u0420\u0415\u0421",
      "\u041A\u0442\u043E-\u0442\u043E \u043E\u0441\u0442\u0430\u0432\u0438\u043B \u0441\u0432\u0435\u0442 \u0432\u043A\u043B\u044E\u0447\u0451\u043D\u043D\u044B\u043C. \u041F\u0440\u043E\u0432\u0435\u0440\u044C \u043E\u0431\u0430 \u044D\u0442\u0430\u0436\u0430.",
      ["eeDuplexEntry", "eeDuplexBridge"]
    ],
    [
      "07",
      "\u041D\u0415 \u0411\u0415\u0421\u041F\u041E\u041A\u041E\u0418\u0422\u042C",
      "\u041D\u043E\u043C\u0435\u0440 \u043E\u043F\u043B\u0430\u0447\u0435\u043D \u0434\u043E \u0443\u0442\u0440\u0430. \u041D\u043E \u0434\u043E \u0443\u0442\u0440\u0430 \u0435\u0449\u0451 \u043D\u0443\u0436\u043D\u043E \u0434\u043E\u0436\u0438\u0442\u044C.",
      ["eeHotelLobby", "eeHotelGarden"]
    ],
    [
      "08",
      "\u0427\u0415\u0422\u042B\u0420\u0415 \u042D\u0422\u0410\u0416\u0410",
      "\u041B\u0438\u0444\u0442\u044B \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u044B. \u0415\u0434\u0438\u043D\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u2014 \u0447\u0435\u0440\u0435\u0437 \u0437\u0434\u0430\u043D\u0438\u0435.",
      [
        "eeTowerLoading",
        "eeTowerArchive",
        "eeTowerServers",
        "eeTowerRoof"
      ]
    ],
    [
      "09",
      "\u041F\u041E\u0414\u0412\u0410\u041B",
      "\u0417\u0430\u043F\u0430\u0441\u043D\u043E\u0439 \u0432\u044B\u0445\u043E\u0434 \u043D\u0430\u0445\u043E\u0434\u0438\u0442\u0441\u044F \u0432\u043D\u0438\u0437\u0443. \u0415\u0441\u043B\u0438 \u043E\u043D \u0432\u043E\u043E\u0431\u0449\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442.",
      ["eeLaundry", "eeUtilityFlat", "eePumpBasement"]
    ],
    [
      "10",
      "\u0428\u0422\u0423\u0420\u041C",
      "\u0422\u0435\u043F\u0435\u0440\u044C \u044D\u0442\u043E \u043D\u0435 \u043F\u0430\u0442\u0440\u0443\u043B\u044C. \u041D\u0435 \u043E\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u0439\u0441\u044F.",
      ["eeCheckpoint", "eeResponseDeck"]
    ],
    [
      "11",
      "\u041F\u0415\u0420\u0418\u041C\u0415\u0422\u0420",
      "\u041E\u043D\u0438 \u043E\u0446\u0435\u043F\u0438\u043B\u0438 \u0432\u0435\u0441\u044C \u043A\u0432\u0430\u0440\u0442\u0430\u043B. \u041D\u0430\u0439\u0434\u0438 \u0440\u0430\u0437\u0440\u044B\u0432 \u0432 \u043A\u043E\u043B\u044C\u0446\u0435.",
      ["eeMarketHub", "eeMarketLeft", "eeMarketRight", "eeMarketOffice"]
    ],
    [
      "12",
      "\u041D\u041E\u0427\u041D\u0410\u042F \u0421\u041C\u0415\u041D\u0410",
      "\u0412\u0441\u0435 \u0437\u0430\u043F\u0438\u0441\u0438 \u0442\u0432\u043E\u0438\u0445 \u044D\u0444\u0438\u0440\u043E\u0432 \u0445\u0440\u0430\u043D\u044F\u0442\u0441\u044F \u0432 \u044D\u0442\u043E\u043C \u043E\u0444\u0438\u0441\u0435.",
      ["eeBroadcastLobby", "eeEditing", "eeUplink"]
    ],
    [
      "13",
      "\u041E\u0422\u0414\u0415\u041B",
      "\u041A\u043B\u044E\u0447 \u043E\u0442 \u0432\u044B\u0435\u0437\u0434\u0430 \u0438\u0437 \u0433\u043E\u0440\u043E\u0434\u0430 \u2014 \u043D\u0430 \u0432\u0435\u0440\u0445\u043D\u0435\u043C \u044D\u0442\u0430\u0436\u0435 \u0443\u0447\u0430\u0441\u0442\u043A\u0430.",
      ["eePrecinctGate", "eeEvidence", "eeControlRoom"]
    ],
    [
      "14",
      "\u041F\u041E\u0421\u041B\u0415\u041F\u0410\u0422\u0418",
      "\u041A\u043B\u0443\u0431 \u0437\u0430\u043A\u0440\u044B\u043B\u0441\u044F. \u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 \u0433\u043E\u0441\u0442\u0438 \u0432\u0441\u0451 \u0435\u0449\u0451 \u0432\u043D\u0443\u0442\u0440\u0438.",
      ["eeClubQueue", "eeClubBalcony", "eeClubBooth", "eeClubVault"]
    ],
    [
      "15",
      "EMERGENCY EXIT",
      "\u0417\u0430 \u043E\u0441\u043E\u0431\u043D\u044F\u043A\u043E\u043C \u0436\u0434\u0451\u0442 \u043C\u0430\u0448\u0438\u043D\u0430. \u042D\u0442\u0430 \u043D\u043E\u0447\u044C \u0434\u043E\u043B\u0436\u043D\u0430 \u0437\u0430\u043A\u043E\u043D\u0447\u0438\u0442\u044C\u0441\u044F.",
      ["eeEstateGate", "eeEstateGallery", "eeEstateLanding"]
    ],
    [
      "16",
      "\u0412\u0422\u041E\u0420\u041E\u0419 \u0410\u041A\u041A\u0410\u0423\u041D\u0422",
      "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u043C\u0430\u0440\u0448\u0440\u0443\u0442 \u0447\u0435\u0440\u0435\u0437 \u0440\u0435\u0441\u0442\u043E\u0440\u0430\u043D.",
      ["eeNightKitchen"]
    ],
    [
      "17",
      "GAME OVER",
      "\u0410\u0440\u043A\u0430\u0434\u043D\u044B\u0435 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u044B \u0448\u0443\u043C\u044F\u0442 \u0433\u0440\u043E\u043C\u0447\u0435 \u0440\u0430\u0446\u0438\u0438.",
      ["eeArcadeLobby", "eeArcadeLab"]
    ],
    ["18", "\u0412\u042B\u0421\u041E\u041A\u0410\u042F \u0421\u0422\u0410\u0412\u041A\u0410", "\u0414\u0440\u0443\u0433\u0430\u044F \u043D\u043E\u0447\u044C. \u0422\u043E\u0442 \u0436\u0435 \u0432\u044B\u0445\u043E\u0434.", ["eeSkyLounge"]],
    [
      "19",
      "\u041F\u041E\u0421\u041B\u0415 \u041F\u041E\u041B\u0423\u041D\u041E\u0427\u0418",
      "\u041D\u0430 \u044D\u0442\u043E\u0442 \u0440\u0430\u0437 \u044D\u0444\u0438\u0440 \u043D\u0430\u0447\u0430\u043B\u0441\u044F \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u043F\u043E\u0437\u0434\u043D\u043E.",
      ["eeAfterHours"]
    ],
    ["20", "\u0414\u041E\u0420\u041E\u0413\u0410 \u0414\u041E\u041C\u041E\u0419", "\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0435\u0435 \u0443\u0431\u0435\u0436\u0438\u0449\u0435 \u0437\u0430 \u0433\u043E\u0440\u043E\u0434\u043E\u043C.", ["eeRoadhouse"]],
    ["21", "\u0421\u0422\u0410\u0420\u042B\u0419 \u041E\u0422\u0415\u041B\u042C", "\u041D\u0430 \u0440\u0435\u0441\u0435\u043F\u0448\u0435\u043D\u0435 \u043D\u0438\u043A\u0442\u043E \u043D\u0435 \u043E\u0442\u0432\u0435\u0447\u0430\u0435\u0442.", ["eeOldAtrium"]]
  ].map(([number, title, brief, rooms], index) => ({
    index,
    number,
    title,
    brief,
    rooms
  }));
  var PROFILES = [
    {
      id: "classic",
      name: "MELLSTROY",
      tag: "\u041E\u0431\u044B\u0447\u043D\u044B\u0439 \u0440\u0435\u0436\u0438\u043C",
      speed: 180,
      punchKill: false
    },
    {
      id: "runner",
      name: "\u041D\u0410 \u0425\u0410\u0419\u041F\u0415",
      tag: "\u0414\u0432\u0438\u0436\u0435\u043D\u0438\u0435 \u0431\u044B\u0441\u0442\u0440\u0435\u0435",
      speed: 240,
      punchKill: false
    },
    {
      id: "fighter",
      name: "\u0411\u0415\u0417 \u0422\u041E\u0420\u041C\u041E\u0417\u041E\u0412",
      tag: "\u0421\u043C\u0435\u0440\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043A\u0443\u043B\u0430\u043A\u0438",
      speed: 180,
      punchKill: true
    },
    {
      id: "quiet",
      name: "\u0411\u0415\u0417 \u041A\u0410\u041C\u0415\u0420\u042B",
      tag: "\u041C\u0435\u043D\u044C\u0448\u0435 \u0440\u0430\u0434\u0438\u0443\u0441 \u043E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D\u0438\u044F",
      speed: 180,
      stealth: true
    },
    {
      id: "armed",
      name: "\u0413\u041E\u0422\u041E\u0412 \u041A \u042D\u0424\u0418\u0420\u0423",
      tag: "\u041D\u0430\u0447\u0438\u043D\u0430\u0435\u0442 \u0441 \u043D\u043E\u0436\u043E\u043C",
      speed: 180,
      startWeapon: 5
    },
    {
      id: "marksman",
      name: "\u0422\u041E\u0427\u041D\u042B\u0419 \u0420\u0410\u0421\u0427\u0401\u0422",
      tag: "\u0411\u043E\u043B\u044C\u0448\u0435 \u043F\u0430\u0442\u0440\u043E\u043D\u043E\u0432 \u043F\u0440\u0438 \u043F\u043E\u0434\u0431\u043E\u0440\u0435",
      speed: 180,
      ammoBonus: 2
    },
    {
      id: "guns",
      name: "\u041F\u041E\u041B\u041D\u042B\u0419 \u0410\u0420\u0421\u0415\u041D\u0410\u041B",
      tag: "\u0411\u043E\u043B\u044C\u0448\u0435 \u043E\u0433\u043D\u0435\u0441\u0442\u0440\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u043E\u0440\u0443\u0436\u0438\u044F",
      speed: 180,
      gunSpawns: true
    },
    {
      id: "doors",
      name: "\u0414\u0412\u0415\u0420\u042C \u0421 \u041D\u041E\u0413\u0418",
      tag: "\u0421\u043C\u0435\u0440\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u0443\u0434\u0430\u0440\u044B \u0434\u0432\u0435\u0440\u044C\u044E",
      speed: 180,
      lethalDoors: true
    },
    { id: "fast", name: "\u041D\u0410 \u041D\u041E\u0413\u0410\u0425", tag: "\u0411\u044B\u0441\u0442\u0440\u043E\u0435 \u0434\u0432\u0438\u0436\u0435\u043D\u0438\u0435", speed: 210 },
    {
      id: "look",
      name: "\u0414\u0410\u041B\u042C\u041D\u0418\u0419 \u041F\u041B\u0410\u041D",
      tag: "\u0414\u0430\u043B\u044C\u0448\u0435 \u0441\u043C\u043E\u0442\u0440\u0438\u0442 \u0441 Shift",
      speed: 180,
      lookDistance: 144
    },
    {
      id: "dogs",
      name: "\u0421\u0412\u041E\u0419 \u0412\u041E \u0414\u0412\u041E\u0420\u0415",
      tag: "\u0421\u043E\u0431\u0430\u043A\u0438 \u043D\u0435 \u0430\u0442\u0430\u043A\u0443\u044E\u0442",
      speed: 180,
      friendlyDogs: true
    },
    {
      id: "armor",
      name: "\u0412\u0422\u041E\u0420\u041E\u0419 \u0428\u0410\u041D\u0421",
      tag: "\u041F\u0435\u0440\u0435\u0436\u0438\u0432\u0430\u0435\u0442 \u043E\u0434\u043D\u0443 \u043F\u0443\u043B\u044E",
      speed: 180,
      armor: 1
    },
    {
      id: "steal",
      name: "\u041F\u0415\u0420\u0415\u0425\u0412\u0410\u0422",
      tag: "\u041A\u0443\u043B\u0430\u043A\u0438 \u0432\u044B\u0431\u0438\u0432\u0430\u044E\u0442 \u043E\u0440\u0443\u0436\u0438\u0435",
      speed: 180,
      disarm: true
    },
    {
      id: "silence",
      name: "\u0422\u0418\u0425\u0418\u0419 \u042D\u0424\u0418\u0420",
      tag: "\u0422\u0438\u0445\u0438\u0435 \u0432\u044B\u0441\u0442\u0440\u0435\u043B\u044B",
      speed: 180,
      silentShots: true
    },
    {
      id: "combo",
      name: "\u041D\u0415 \u041F\u0420\u0415\u0420\u042B\u0412\u0410\u0419\u0421\u042F",
      tag: "\u0414\u043B\u0438\u043D\u043D\u0435\u0435 \u043E\u043A\u043D\u043E \u043A\u043E\u043C\u0431\u043E",
      speed: 180,
      comboWindow: 3.5
    },
    {
      id: "dark",
      name: "\u0427\u0401\u0420\u041D\u042B\u0419 \u042D\u041A\u0420\u0410\u041D",
      tag: "\u041E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u043D\u0430\u044F \u0432\u0438\u0434\u0438\u043C\u043E\u0441\u0442\u044C",
      speed: 180,
      darkness: true
    },
    {
      id: "accuracy",
      name: "\u0411\u0415\u0417 \u041F\u0420\u041E\u041C\u0410\u0425\u0410",
      tag: "\u041C\u0435\u043D\u044C\u0448\u0435 \u0440\u0430\u0437\u0431\u0440\u043E\u0441 \u043F\u0443\u043B\u044C",
      speed: 180,
      accuracy: 0.25
    },
    {
      id: "melee",
      name: "\u0411\u041B\u0418\u0416\u041D\u0418\u0419 \u041A\u041E\u041D\u0422\u0410\u041A\u0422",
      tag: "\u0411\u043E\u043B\u044C\u0448\u0435 \u0445\u043E\u043B\u043E\u0434\u043D\u043E\u0433\u043E \u043E\u0440\u0443\u0436\u0438\u044F",
      speed: 180,
      meleeSpawns: true
    },
    {
      id: "reverse",
      name: "\u0417\u0415\u0420\u041A\u0410\u041B\u041E",
      tag: "\u041E\u0431\u0440\u0430\u0442\u043D\u043E\u0435 \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435",
      speed: 180,
      reversed: true
    },
    {
      id: "armor2",
      name: "\u0422\u0420\u0415\u0422\u042C\u042F \u041F\u041E\u041F\u042B\u0422\u041A\u0410",
      tag: "\u041F\u0435\u0440\u0435\u0436\u0438\u0432\u0430\u0435\u0442 \u0434\u0432\u0435 \u043F\u0443\u043B\u0438",
      speed: 180,
      armor: 2
    },
    {
      id: "gore",
      name: "\u041A\u0420\u0410\u0421\u041D\u042B\u0419 \u042D\u0424\u0418\u0420",
      tag: "\u0411\u043E\u043B\u044C\u0448\u0435 \u043A\u0440\u043E\u0432\u0438",
      speed: 180,
      gore: 2
    },
    {
      id: "drill",
      name: "\u0420\u0415\u041C\u041E\u041D\u0422\u041D\u0418\u041A",
      tag: "\u041D\u0430\u0447\u0438\u043D\u0430\u0435\u0442 \u0441 \u0434\u0440\u0435\u043B\u044C\u044E",
      speed: 180,
      startWeapon: 21
    },
    {
      id: "thrower",
      name: "\u0414\u0410\u041B\u042C\u041D\u0418\u0419 \u0411\u0420\u041E\u0421\u041E\u041A",
      tag: "\u041E\u0440\u0443\u0436\u0438\u0435 \u043B\u0435\u0442\u0438\u0442 \u0434\u0430\u043B\u044C\u0448\u0435 \u0438 \u043E\u0433\u043B\u0443\u0448\u0430\u0435\u0442",
      speed: 180,
      longThrows: true
    },
    {
      id: "uzi",
      name: "\u0417\u0410\u041F\u0410\u0421\u041D\u041E\u0419 \u041F\u041B\u0410\u041D",
      tag: "\u041D\u0430\u0447\u0438\u043D\u0430\u0435\u0442 \u0441 UZI \u0441 \u0433\u043B\u0443\u0448\u0438\u0442\u0435\u043B\u0435\u043C",
      speed: 180,
      startWeapon: 25
    }
  ];
  var AudioEngine = class {
    constructor(manifest, settings) {
      this.manifest = manifest;
      this.settings = settings;
      this.voices =  new Map();
      this.last =  new Map();
      this.step = 0;
      this.active = false;
    }
    start() {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.music = this.ctx.createGain();
        this.music.connect(this.ctx.destination);
        this.updateVolumes();
        this.timer = setInterval(() => this.tick(), 125);
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
      this.active = true;
    }
    updateVolumes() {
      for (const voices of this.voices.values()) {
        for (const voice of voices) voice.volume = this.settings.sound / 100;
      }
      if (this.ctx) {
        this.music.gain.value = this.settings.music / 100 * 0.2;
      }
    }
    async play(key) {
      if (!this.ctx || !this.settings.sound) return;
      const now = performance.now();
      if (now - (this.last.get(key) ?? 0) < 45) return;
      this.last.set(key, now);
      const url = this.manifest.audio[key];
      if (!url) return;
      const voices = this.voices.get(key) ?? [];
      let voice = voices.find((audio) => audio.paused || audio.ended);
      if (!voice && voices.length < 8) {
        voice = new Audio(assetUrl(url));
        voices.push(voice);
        this.voices.set(key, voices);
      }
      voice ??= voices[0];
      voice.volume = this.settings.sound / 100;
      voice.currentTime = 0;
      try {
        await voice.play();
      } catch {
      }
    }
    tone(freq, type, time, length, gain = 0.2) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, time);
      g.gain.setValueAtTime(gain, time);
      g.gain.exponentialRampToValueAtTime(1e-3, time + length);
      o.connect(g);
      g.connect(this.music);
      o.start(time);
      o.stop(time + length);
    }
    tick() {
      if (!this.ctx || this.ctx.state !== "running" || !this.active || !this.settings.music)
        return;
      const t = this.ctx.currentTime, s = this.step++ % 32, notes = [55, 55, 65.41, 55, 82.41, 55, 73.42, 65.41];
      this.tone(notes[Math.floor(s / 4)], "sawtooth", t, 0.12, 0.16);
      if (s % 4 === 0) {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.frequency.setValueAtTime(135, t);
        o.frequency.exponentialRampToValueAtTime(35, t + 0.12);
        g.gain.setValueAtTime(0.65, t);
        g.gain.exponentialRampToValueAtTime(1e-3, t + 0.18);
        o.connect(g);
        g.connect(this.music);
        o.start(t);
        o.stop(t + 0.18);
      }
      if (s % 4 === 2) this.tone(185, "triangle", t, 0.07, 0.23);
      if (s % 2 === 1) this.tone(7300, "square", t, 0.018, 0.025);
      if (s % 2 === 0) {
        const melody = [440, 523.25, 659.25, 587.33, 440, 392, 523.25, 349.23];
        this.tone(melody[Math.floor(s / 2) % 8], "triangle", t, 0.22, 0.12);
      }
    }
  };
  var $ = (id) => document.getElementById(id);
  var overlays = [
    "menu",
    "briefing",
    "chapter-panel",
    "pause",
    "death",
    "result",
    "settings"
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
    } catch {
    }
  }
  var app = {
    mode: "loading",
    manifest: null,
    skins: null,
    view: null,
    chapter: CHAPTERS[0],
    floorIndex: 0,
    profile: PROFILES[0],
    runScore: 0,
    runTime: 0,
    deaths: 0,
    progress: stored("emergency-exit-progress", {
      unlocked: 0,
      best: {},
      last: 0
    }),
    settings: stored("emergency-exit-settings", {
      sound: 65,
      music: 35,
      effects: true,
      crt: true
    }),
    cache:  new Map(),
    floorStates:  new Map(),
    checkpoints:  new Map(),
    async room(id) {
      if (!this.cache.has(id)) {
        this.cache.set(id, await readJson("/assets/rooms/" + id + ".json"));
      }
      return this.cache.get(id);
    },
    overlay(id) {
      var _a, _b, _c, _d;
      for (const name of overlays)
        $(name).classList.toggle("hidden", name !== id);
      (_a = this.menuNavigation) == null ? void 0 : _a.show(id);
      if ((_b = this.view) == null ? void 0 : _b.input.keyboard)
        this.view.input.keyboard.enabled = ["playing", "paused", "dead"].includes(
          this.mode
        );
      (_d = (_c = this.view) == null ? void 0 : _c.input.keyboard) == null ? void 0 : _d.resetKeys();
      const playing = [
        "playing",
        "paused",
        "dead",
        "result",
        "escaping"
      ].includes(this.mode);
      $("hud").classList.toggle("hidden", !playing);
      if (id || this.mode !== "playing") $("tutorial").classList.add("hidden");
      $("weapon-hud").classList.toggle("hidden", !playing);
      $("touch-controls").classList.toggle(
        "hidden",
        this.mode !== "playing" || !window.matchMedia("(pointer:coarse)").matches
      );
    },
    async onReady(view) {
      this.view = view;
      try {
        const raw = await this.room("eeHideout");
        const sim = new Simulation(this.manifest, raw, PROFILES[0]);
        await view.setWorld(sim, true);
        $("loading").classList.add("hidden");
        this.mode = "menu";
        this.overlay("menu");
      } catch (error) {
        this.fail(error);
      }
    },
    fail(error) {
      $("loading").classList.remove("hidden");
      $("load-label").textContent = error.message;
      console.error(error);
    },
    async load(id, carry = null, reuse = false) {
      this.mode = "loading";
      this.overlay(null);
      $("loading").classList.remove("hidden");
      $("load-label").textContent = "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 " + id + "\u2026";
      $("load-progress").style.width = "70%";
      try {
        const raw = await this.room(id);
        const sim = reuse && this.floorStates.has(id) ? this.floorStates.get(id) : new Simulation(this.manifest, raw, this.profile);
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
        if (id === "eeTraining") sim.tutorial = new Tutorial(sim);
        sim.status = "playing";
        sim.player.alive = true;
        sim.grace = 0.6;
        if (!reuse)
          this.checkpoints.set(id, {
            weapon: sim.player.weapon,
            ammo: sim.player.ammo,
            armor: sim.player.armor
          });
        this.floorStates.set(id, sim);
        this.configureExit(sim);
        await this.view.setWorld(sim);
        this.sim = sim;
        this.mode = "playing";
        this.overlay(null);
        $("loading").classList.add("hidden");
        this.audio.start();
        this.updateHUD();
        if (!sim.tutorial)
          this.toast(
            sim.total ? `\u041F\u0415\u0420\u0418\u041C\u0415\u0422\u0420: ${sim.total} \u041F\u0420\u041E\u0422\u0418\u0412\u041D\u0418\u041A\u041E\u0412` : "\u041D\u0410\u0419\u0414\u0418 \u0412\u042B\u0425\u041E\u0414"
          );
      } catch (error) {
        this.fail(error);
      }
    },
    briefing(index) {
      this.chapter = CHAPTERS[index];
      this.mode = "briefing";
      this.overlay("briefing");
      $("brief-number").textContent = "\u0413\u041B\u0410\u0412\u0410 " + this.chapter.number + " / \u041F\u041E\u0411\u0415\u0413 \u0418\u0417 \u0413\u041E\u0420\u041E\u0414\u0410";
      $("brief-title").textContent = this.chapter.title;
      $("brief-text").textContent = this.chapter.brief;
      $("profile").disabled = index === 0;
      if (index === 0) $("profile").value = PROFILES[0].id;
      $("deploy").textContent = index === 0 ? "\u041D\u0410\u0427\u0410\u0422\u042C \u041E\u0411\u0423\u0427\u0415\u041D\u0418\u0415" : "\u041D\u0410\u0427\u0410\u0422\u042C \u0413\u041B\u0410\u0412\u0423";
    },
    start() {
      this.profile = PROFILES.find((p) => p.id === $("profile").value) ?? PROFILES[0];
      if (this.chapter.index === 0) this.profile = PROFILES[0];
      this.floorIndex = 0;
      this.runScore = 0;
      this.runTime = 0;
      this.deaths = 0;
      this.floorStates.clear();
      this.checkpoints.clear();
      this.progress.last = this.chapter.index;
      save("emergency-exit-progress", this.progress);
      this.load(this.chapter.rooms[0]);
    },
    restart() {
      if (!this.sim) return;
      this.deaths++;
      this.load(this.sim.room.id, this.checkpoints.get(this.sim.room.id));
    },
    togglePause() {
      if (this.mode === "playing") {
        this.mode = "paused";
        this.overlay("pause");
        this.audio.active = false;
      } else if (this.mode === "paused") {
        this.mode = "playing";
        this.overlay(null);
        this.audio.active = true;
      }
    },
    menu() {
      this.mode = "menu";
      this.overlay("menu");
      $("continue").textContent = this.progress.unlocked ? "\u041F\u0420\u041E\u0414\u041E\u041B\u0416\u0418\u0422\u042C \u041F\u041E\u0411\u0415\u0413" : "\u041D\u0410\u0427\u0410\u0422\u042C \u041F\u041E\u0411\u0415\u0413";
      $("combo").classList.add("hidden");
      clearTimeout(this.toastTimer);
      $("toast").style.opacity = "0";
      $("toast").textContent = "";
      if (this.view) this.view.preview = true;
      this.audio.active = true;
      this.renderChapters();
    },
    onEvent(event) {
      if (event.type === "death") {
        this.mode = "dead";
        this.overlay("death");
        this.audio.active = false;
        $("combo").classList.add("hidden");
      }
      if (event.type === "clear" && !this.sim.tutorial)
        this.toast("\u041F\u0415\u0420\u0418\u041C\u0415\u0422\u0420 \u0427\u0418\u0421\u0422 \xB7 \u041A \u0412\u042B\u0425\u041E\u0414\u0423");
      if (event.type === "complete") this.beginExit();
    },
    beginExit() {
      if (/PlayerCarEnter/.test(this.sim.exit.name ?? "")) {
        this.mode = "escaping";
        this.escape = {
          elapsed: 0,
          start: { x: this.sim.player.x, y: this.sim.player.y },
          target: this.sim.exit
        };
        this.overlay(null);
        this.audio.play("sndCarOpen");
      } else this.complete();
    },
    advanceExit(dt) {
      const e = this.escape;
      e.elapsed += dt;
      const t = Math.min(1, e.elapsed / 0.45);
      this.sim.player.x = e.start.x + (e.target.x - e.start.x) * t;
      this.sim.player.y = e.start.y + (e.target.y - e.start.y) * t;
      this.sim.player.visible = e.elapsed < 0.42;
      if (e.elapsed > 0.85) {
        this.audio.play("sndCarEngine");
        this.escape = null;
        this.complete();
      }
    },
    configureExit(sim) {
      const forward = this.chapter.rooms.slice(this.floorIndex + 1).some((id) => {
        var _a;
        return !((_a = this.floorStates.get(id)) == null ? void 0 : _a.cleared);
      });
      this.returning = !forward && this.floorIndex > 0;
      const target = forward ? this.chapter.rooms[this.floorIndex + 1] : this.returning ? this.chapter.rooms[this.floorIndex - 1] : null;
      if (target) {
        const candidates = sim.exits.filter(
          (e) => !/PlayerCarEnter/.test(e.name)
        );
        sim.exit = candidates.find((e) => connectsTo(e, target)) ?? candidates.find((e) => forward ? e.forward : e.backward) ?? candidates.sort(
          (a, b) => Math.hypot(b.x - sim.player.x, b.y - sim.player.y) - Math.hypot(a.x - sim.player.x, a.y - sim.player.y)
        )[0] ?? sim.exit;
      } else
        sim.exit = sim.exits.find((e) => /PlayerCarEnter/.test(e.name)) ?? sim.exit;
    },
    complete() {
      this.floorStates.set(this.sim.room.id, this.sim);
      const unfinished = this.chapter.rooms.slice(this.floorIndex + 1).some((id) => {
        var _a;
        return !((_a = this.floorStates.get(id)) == null ? void 0 : _a.cleared);
      });
      if (unfinished || this.floorIndex > 0) {
        const carry = {
          weapon: this.sim.player.weapon,
          ammo: this.sim.player.ammo,
          armor: this.sim.player.armor,
          from: this.sim.room.id
        };
        this.floorIndex += unfinished ? 1 : -1;
        this.runScore = [...this.floorStates.entries()].filter(([id]) => id !== this.chapter.rooms[this.floorIndex]).reduce((n, [, s]) => n + s.score, 0);
        this.load(this.chapter.rooms[this.floorIndex], carry, true);
        return;
      }
      this.runScore = [...this.floorStates.values()].reduce(
        (n, s) => n + s.score,
        0
      );
      this.runTime = [...this.floorStates.values()].reduce(
        (n, s) => n + s.elapsed,
        0
      );
      this.mode = "result";
      this.overlay("result");
      $("combo").classList.add("hidden");
      const base = [...this.floorStates.values()].reduce((n, s) => n + s.total, 0) * 400, grade = this.runScore > base * 2.5 ? "A+" : this.runScore > base * 1.6 ? "A" : this.runScore > base ? "B" : "C";
      $("result-score").textContent = this.runScore.toLocaleString("ru-RU");
      $("result-time").textContent = this.runTime.toFixed(1) + "s";
      $("result-grade").textContent = grade;
      $("result-title").textContent = this.chapter.index === 15 ? "\u0413\u041E\u0420\u041E\u0414 \u041F\u041E\u0417\u0410\u0414\u0418." : "\u0427\u0418\u0421\u0422\u041E.";
      this.progress.unlocked = Math.max(
        this.progress.unlocked,
        Math.min(CHAPTERS.length - 1, this.chapter.index + 1)
      );
      const best = this.progress.best[this.chapter.index];
      if (!best || best.score < this.runScore)
        this.progress.best[this.chapter.index] = {
          score: this.runScore,
          grade,
          time: this.runTime
        };
      save("emergency-exit-progress", this.progress);
      this.progress.last = Math.min(CHAPTERS.length - 1, this.chapter.index + 1);
      save("emergency-exit-progress", this.progress);
      $("next").textContent = this.chapter.index === CHAPTERS.length - 1 ? "\u0417\u0410\u0412\u0415\u0420\u0428\u0418\u0422\u042C \u041F\u041E\u0411\u0415\u0413" : "\u0421\u041B\u0415\u0414\u0423\u042E\u0429\u0410\u042F \u0413\u041B\u0410\u0412\u0410";
    },
    updateHUD() {
      var _a, _b;
      const tutorial = (_a = this.sim) == null ? void 0 : _a.tutorial;
      const panel = $("tutorial");
      panel.classList.toggle("hidden", !tutorial || this.mode !== "playing");
      if (tutorial) {
        const hint = tutorial.hint;
        $("tutorial-progress").textContent = `\u041E\u0411\u0423\u0427\u0415\u041D\u0418\u0415 ${hint.number} / ${hint.total}`;
        $("tutorial-title").textContent = hint.title;
        $("tutorial-text").textContent = hint.text;
        $("tutorial-keys").textContent = tutorial.step === "move" ? ["W", "A", "S", "D"].map((key) => hint.directions.includes(key) ? key + " +" : key).join("   ") : "";
      }
      const s = this.sim;
      if (!s) return;
      $("hud-number").textContent = this.chapter.number + " /";
      $("hud-title").textContent = this.chapter.title;
      $("hud-floor").textContent = `\u041B\u041E\u041A\u0410\u0426\u0418\u042F ${this.floorIndex + 1} / ${this.chapter.rooms.length} \xB7 ${this.returning ? "\u041E\u0411\u0420\u0410\u0422\u041D\u041E \u041A \u041C\u0410\u0428\u0418\u041D\u0415" : ((_b = s.room.design) == null ? void 0 : _b.title) ?? this.profile.name}`;
      $("hud-enemies").textContent = s.cleared ? "\u041F\u0415\u0420\u0418\u041C\u0415\u0422\u0420 \u0427\u0418\u0421\u0422" : `${s.total - s.kills} / ${s.total} \u041D\u0410 \u041F\u0415\u0420\u0418\u041C\u0415\u0422\u0420\u0415`;
      $("hud-score").textContent = (this.runScore + s.score).toLocaleString(
        "ru-RU"
      );
      $("weapon-name").textContent = s.player.weapon.name.toUpperCase();
      $("ammo").textContent = s.player.weapon.gun ? String(s.player.ammo).padStart(2, "0") : "";
      $("context").textContent = s.context;
      $("combo").classList.toggle(
        "hidden",
        s.combo < 2 || this.mode !== "playing"
      );
      $("combo").textContent = s.combo + "x COMBO";
    },
    toast(text) {
      $("toast").textContent = text;
      $("toast").style.opacity = "1";
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => $("toast").style.opacity = "0", 2800);
    },
    renderChapters() {
      const list = $("chapter-list");
      list.replaceChildren();
      for (const chapter of CHAPTERS) {
        const b = document.createElement("button"), best = this.progress.best[chapter.index];
        const num = document.createElement("span");
        num.className = "number";
        num.textContent = chapter.number;
        const text = document.createElement("span"), strong = document.createElement("strong"), small = document.createElement("small");
        strong.textContent = chapter.title;
        small.textContent = chapter.rooms.length + " \u041B\u041E\u041A\u0410\u0426\u0418\u0418" + (chapter.index > this.progress.unlocked ? " \xB7 \u0415\u0429\u0401 \u041D\u0415 \u041F\u0420\u041E\u0419\u0414\u0415\u041D\u0410" : "");
        text.append(strong, small);
        b.append(num, text);
        if (best) {
          const grade = document.createElement("span");
          grade.className = "grade";
          grade.textContent = best.grade;
          b.append(grade);
        }
        b.addEventListener("click", () => this.briefing(chapter.index));
        list.append(b);
      }
    },
    settingsFrom: null,
    showSettings() {
      this.settingsFrom = this.mode;
      this.mode = "settings";
      this.overlay("settings");
      this.audio.active = false;
    },
    applySettings() {
      var _a;
      document.body.classList.toggle("no-crt", !this.settings.crt);
      (_a = this.audio) == null ? void 0 : _a.updateVolumes();
      save("emergency-exit-settings", this.settings);
    }
  };
  async function boot() {
    try {
      [app.manifest, app.skins] = await Promise.all([
        readJson("/assets/manifest.json"),
        readJson("/assets/custom/skins.json")
      ]);
      app.audio = new AudioEngine(app.manifest, app.settings);
      app.applySettings();
      for (const profile of PROFILES) {
        const o = document.createElement("option");
        o.value = profile.id;
        o.textContent = profile.name + " \u2014 " + profile.tag;
        $("profile").append(o);
      }
      app.renderChapters();
      $("load-progress").style.width = "35%";
      const scene = new GameView();
      scene.app = app;
      app.game = new phaser_default.Game({
        type: phaser_default.CANVAS,
        parent: "game",
        backgroundColor: "#130d21",
        antialias: false,
        pixelArt: true,
        roundPixels: true,
        scale: {
          mode: phaser_default.Scale.RESIZE,
          width: window.innerWidth,
          height: window.innerHeight
        },
        scene: [scene],
        audio: { noAudio: true },
        input: { activePointers: 3 },
        fps: { target: 60, forceSetTimeOut: false }
      });
      bindUI();
      window.__GAME__ = {
        getState: () => {
          var _a;
          return ((_a = app.sim) == null ? void 0 : _a.snapshot()) ?? { status: app.mode };
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
            zoom: app.view.zoom
          };
        }
      };
    } catch (error) {
      app.fail(error);
    }
  }
  function bindUI() {
    app.menuNavigation = new MenuNavigation();
    $("continue").textContent = app.progress.unlocked ? "\u041F\u0420\u041E\u0414\u041E\u041B\u0416\u0418\u0422\u042C \u041F\u041E\u0411\u0415\u0413" : "\u041D\u0410\u0427\u0410\u0422\u042C \u041F\u041E\u0411\u0415\u0413";
    $("continue").onclick = () => {
      app.audio.start();
      app.briefing(app.progress.last ?? 0);
    };
    $("deploy").onclick = () => app.start();
    $("chapters-button").onclick = () => {
      app.mode = "chapters";
      app.renderChapters();
      app.overlay("chapter-panel");
    };
    for (const b of document.querySelectorAll(".back"))
      b.onclick = () => app.menu();
    $("pause-button").onclick = () => app.togglePause();
    $("resume").onclick = () => app.togglePause();
    $("restart").onclick = () => app.restart();
    for (const id of ["to-menu", "death-menu", "result-menu"])
      $(id).onclick = () => app.menu();
    $("retry").onclick = () => app.restart();
    $("result-retry").onclick = () => {
      app.runScore = 0;
      app.runTime = 0;
      app.floorIndex = 0;
      app.floorStates.clear();
      app.checkpoints.clear();
      app.load(app.chapter.rooms[0]);
    };
    $("next").onclick = () => {
      if (app.chapter.index === CHAPTERS.length - 1) app.menu();
      else app.briefing(app.chapter.index + 1);
    };
    $("settings-button").onclick = () => app.showSettings();
    $("pause-settings").onclick = () => app.showSettings();
    $("settings-back").onclick = () => {
      app.mode = app.settingsFrom;
      if (app.mode === "paused") app.overlay("pause");
      else app.menu();
    };
    for (const [id, key] of [
      ["sound-volume", "sound"],
      ["music-volume", "music"]
    ]) {
      $(id).value = app.settings[key];
      $(id).oninput = () => {
        app.settings[key] = Number($(id).value);
        app.audio.start();
        app.applySettings();
      };
    }
    for (const key of ["effects", "crt"]) {
      $(key).checked = app.settings[key];
      $(key).onchange = () => {
        app.settings[key] = $(key).checked;
        app.applySettings();
      };
    }
    $("fullscreen").onclick = () => {
      var _a, _b, _c;
      if (!document.fullscreenElement)
        (_b = (_a = document.documentElement).requestFullscreen) == null ? void 0 : _b.call(_a);
      else (_c = document.exitFullscreen) == null ? void 0 : _c.call(document);
    };
    window.addEventListener("blur", () => {
      if (app.mode === "playing") app.togglePause();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && app.mode === "playing") app.togglePause();
    });
    touchInput();
  }
  function touchInput() {
    const pad = $("move-pad"), stick = pad.querySelector("i");
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
      const r = pad.getBoundingClientRect(), dx = (e.clientX - r.left - 60) / 45, dy = (e.clientY - r.top - 60) / 45, length = Math.max(1, Math.hypot(dx, dy));
      app.view.controls.moveX = dx / length;
      app.view.controls.moveY = dy / length;
      stick.style.transform = `translate(${dx / length * 35}px,${dy / length * 35}px)`;
    }
    const end = () => {
      touch = null;
      app.view.controls.moveX = 0;
      app.view.controls.moveY = 0;
      stick.style.transform = "";
    };
    pad.onpointerup = end;
    pad.onpointercancel = end;
    for (const b of document.querySelectorAll("[data-action]")) {
      b.onpointerdown = (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        const a = b.dataset.action;
        if (a === "attack") app.view.controls.attack = true;
        else app.view.pending[a] = true;
        if (a === "pickup") app.view.pending.pickup = true;
      };
      b.onpointerup = () => app.view.controls.attack = false;
      b.onpointercancel = () => app.view.controls.attack = false;
    }
  }
  boot();
})();
