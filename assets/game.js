(() => {
  var distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  var clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  var angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  function circleRect(x, y, r, box) {
    const dx = x - clamp(x, box.x, box.x + box.w);
    const dy = y - clamp(y, box.y, box.y + box.h);
    return dx * dx + dy * dy < r * r;
  }
  function rayRect(ax, ay, bx, by, box, pad = 0) {
    let lo = 0;
    let hi = 1;
    for (const [a, d, min, max] of [
      [ax, bx - ax, box.x - pad, box.x + box.w + pad],
      [ay, by - ay, box.y - pad, box.y + box.h + pad]
    ]) {
      if (Math.abs(d) < 1e-9) {
        if (a < min || a > max) {
          return null;
        }
      } else {
        let t1 = (min - a) / d;
        let t2 = (max - a) / d;
        if (t1 > t2) {
          [t1, t2] = [t2, t1];
        }
        lo = Math.max(lo, t1);
        hi = Math.min(hi, t2);
        if (lo > hi) {
          return null;
        }
      }
    }
    return lo;
  }
  function segmentCircle(ax, ay, bx, by, x, y, r) {
    const dx = bx - ax;
    const dy = by - ay;
    const a = dx * dx + dy * dy;
    if (a < 1e-9) {
      if (Math.hypot(ax - x, ay - y) <= r) {
        return 0;
      } else {
        return null;
      }
    }
    const fx = ax - x;
    const fy = ay - y;
    const c = fx * fx + fy * fy - r * r;
    if (c <= 0) {
      return 0;
    }
    const b = 2 * (fx * dx + fy * dy);
    const disc = b * b - 4 * a * c;
    if (disc < 0) {
      return null;
    }
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t >= 0 && t <= 1) {
      return t;
    } else {
      return null;
    }
  }
  var SpatialIndex = class {
    constructor(rects, size = 64) {
      this.size = size;
      this.buckets =  new Map();
      for (const box of rects) {
        for (let y = Math.floor(box.y / size); y <= Math.floor((box.y + box.h) / size); y++) {
          for (let x = Math.floor(box.x / size); x <= Math.floor((box.x + box.w) / size); x++) {
            const key = x + "," + y;
            if (!this.buckets.has(key)) {
              this.buckets.set(key, []);
            }
            this.buckets.get(key).push(box);
          }
        }
      }
    }
    query(x, y, w, h) {
      var _a;
      const found =  new Set();
      for (let cy = Math.floor(y / this.size); cy <= Math.floor((y + h) / this.size); cy++) {
        for (let cx = Math.floor(x / this.size); cx <= Math.floor((x + w) / this.size); cx++) {
          for (const box of this.buckets.get(cx + "," + cy) ?? []) {
            if (!((_a = box.entity) == null ? void 0 : _a.broken) || box.entity.glass) {
              found.add(box);
            }
          }
        }
      }
      return [...found];
    }
  };
  var Navigation = class {
    constructor(width, height, blocked, cell = 8) {
      this.cell = cell;
      this.cols = Math.ceil(width / cell);
      this.rows = Math.ceil(height / cell);
      this.blocked = new Uint8Array(this.cols * this.rows);
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.cols; x++) {
          this.blocked[y * this.cols + x] = blocked((x + 0.5) * cell, (y + 0.5) * cell) ? 1 : 0;
        }
      }
    }
    point(id) {
      return {
        x: (id % this.cols + 0.5) * this.cell,
        y: (Math.floor(id / this.cols) + 0.5) * this.cell
      };
    }
    nearest(x, y) {
      const cx = clamp(Math.floor(x / this.cell), 0, this.cols - 1);
      const cy = clamp(Math.floor(y / this.cell), 0, this.rows - 1);
      for (let r = 0; r < 12; r++) {
        for (let yy = Math.max(0, cy - r); yy <= Math.min(this.rows - 1, cy + r); yy++) {
          for (let xx = Math.max(0, cx - r); xx <= Math.min(this.cols - 1, cx + r); xx++) {
            const id = yy * this.cols + xx;
            if (!this.blocked[id]) {
              return id;
            }
          }
        }
      }
      return null;
    }
    path(from, to) {
      const start = this.nearest(from.x, from.y);
      const goal = this.nearest(to.x, to.y);
      if (start === null || goal === null) {
        return [];
      }
      const parent =  new Map();
      const g =  new Map([[start, 0]]);
      const open =  new Set([start]);
      const closed =  new Set();
      const heuristic = (id) => Math.abs(id % this.cols - goal % this.cols) + Math.abs(Math.floor(id / this.cols) - Math.floor(goal / this.cols));
      let visits = 0;
      while (open.size && visits++ < 12e3) {
        let current = null;
        let best = Infinity;
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
        const x = current % this.cols;
        const y = Math.floor(current / this.cols);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1]
        ]) {
          const nx = x + dx;
          const ny = y + dy;
          const id = ny * this.cols + nx;
          if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows || this.blocked[id] || closed.has(id)) {
            continue;
          }
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
      init: {
        ...entity.init
      },
      meta: manifest.sprites[entity.sprite],
      mask: manifest.sprites[entity.mask]
    }));
    return {
      ...raw,
      entities
    };
  }
  function connectsTo(exit, room) {
    var _a;
    return exit.init.nextroom === room || !!((_a = exit.targets) == null ? void 0 : _a.includes(room));
  }
  function rectFor(entity) {
    if (entity.bounds) {
      return {
        ...entity.bounds,
        entity
      };
    }
    const metadata = entity.mask ?? entity.meta;
    if (!metadata) {
      return null;
    }
    const bounds = metadata.bbox;
    const originX = metadata.originX;
    const originY = metadata.originY;
    const corners = [
      [bounds[0] - originX, bounds[1] - originY],
      [bounds[2] - originX + 1, bounds[1] - originY],
      [bounds[2] - originX + 1, bounds[3] - originY + 1],
      [bounds[0] - originX, bounds[3] - originY + 1]
    ];
    const cosine = Math.cos(entity.angle);
    const sine = Math.sin(entity.angle);
    const points = corners.map(([x, y]) => [
      entity.x + x * entity.scaleX * cosine - y * entity.scaleY * sine,
      entity.y + x * entity.scaleX * sine + y * entity.scaleY * cosine
    ]);
    const left = Math.min(...points.map((point) => point[0]));
    const top = Math.min(...points.map((point) => point[1]));
    const right = Math.max(...points.map((point) => point[0]));
    const bottom = Math.max(...points.map((point) => point[1]));
    return {
      x: left,
      y: top,
      w: right - left,
      h: bottom - top,
      entity
    };
  }
  var FLOORS = {
    tile: ["#567377", "#6f9090"],
    wood: ["#846247", "#a7835c"],
    checker: ["#9eb7a5", "#46676b"],
    carpet: ["#70465b", "#81546b"],
    marble: ["#789599", "#9cb1af"],
    concrete: ["#57666c", "#63757b"],
    stripe: ["#555c55", "#79816c"],
    grid: ["#365969", "#4a7182"],
    dance: ["#553d68", "#77517e"],
    stone: ["#757c73", "#949b88"],
    garden: ["#335b4c", "#49705a"],
    platform: ["#636e76", "#7e8990"]
  };
  function floorTile(ctx, x, y, cell, style, index) {
    const [base, light] = FLOORS[style] ?? FLOORS.tile;
    ctx.fillStyle = base;
    ctx.fillRect(x, y, cell, cell);
    ctx.fillStyle = light;
    if (style === "wood") {
      for (let offset = 0; offset < cell; offset += 8) {
        ctx.fillRect(x, y + offset, cell, 1);
        ctx.fillRect(x + (y / cell + offset) % 3 * 10, y + offset, 1, 8);
      }
    } else if (style === "checker" || style === "dance") {
      for (let yy = 0; yy < 2; yy++) {
        for (let xx = 0; xx < 2; xx++) {
          if ((x / 16 + y / 16 + xx + yy) % 2) {
            ctx.fillRect(x + xx * 16 + 1, y + yy * 16 + 1, 14, 14);
          }
        }
      }
      if (style === "dance" && (x / cell + y / cell) % 4 === 0) {
        ctx.fillStyle = ["#a75e86", "#5a9298", "#918152"][index % 3];
        ctx.fillRect(x + 4, y + 4, 8, 8);
      }
    } else if (style === "carpet") {
      ctx.globalAlpha = 0.5;
      for (let i = 3; i < cell; i += 8) {
        ctx.fillRect(x + i, y + i, 2, 2);
      }
      ctx.globalAlpha = 1;
    } else if (style === "garden") {
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(x + (i * 11 + y) % 29, y + (i * 7 + x) % 29, 2, 3);
      }
    } else {
      ctx.fillRect(x, y, cell, 1);
      ctx.fillRect(x, y, 1, cell);
      if (style === "marble") {
        ctx.fillStyle = "#c1c7b54a";
        ctx.fillRect(x + y % 23, y + 7, 1, 17);
      }
      if (style === "stripe" && x / cell % 3 === 0) {
        ctx.fillStyle = "#d3b565";
        ctx.fillRect(x + 4, y + 4, 2, cell - 8);
      }
      if (style === "platform") {
        ctx.fillStyle = "#dfb86b";
        ctx.fillRect(x + 3, y + 5, 3, 3);
        ctx.fillRect(x + 3, y + 13, 3, 3);
        ctx.fillRect(x + 3, y + 21, 3, 3);
      }
    }
  }
  function drawLevel(ctx, room) {
    var _a;
    if (!room.floor) {
      return;
    }
    const { cell, grid, palette } = room.floor;
    const accent = palette[2];
    ctx.fillStyle = "#111a25";
    ctx.fillRect(0, 0, room.width, room.height);
    ctx.fillStyle = "#1a2630";
    for (let y = 0; y < room.height; y += 16) {
      for (let x = y % 32 / 2; x < room.width; x += 32) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (grid[y][x] === " ") {
          continue;
        }
        const index = parseInt(grid[y][x], 36);
        floorTile(ctx, x * cell, y * cell, cell, ((_a = room.zones[index]) == null ? void 0 : _a.style) ?? "tile", index);
      }
    }
    for (const [index, zone] of room.zones.entries()) {
      if (["carpet", "wood", "marble"].includes(zone.style)) {
        ctx.fillStyle = zone.style === "wood" ? "#6c4653" : "#3b5863";
        ctx.fillRect(zone.x + 24, zone.y + 36, zone.w - 48, zone.h - 60);
        ctx.strokeStyle = "#d1b78d88";
        ctx.lineWidth = 1;
        ctx.strokeRect(zone.x + 28, zone.y + 40, zone.w - 56, zone.h - 68);
      }
      if (zone.style === "dance") {
        ctx.strokeStyle = "#d78dbf";
        ctx.lineWidth = 2;
        ctx.strokeRect(zone.x + 14, zone.y + 28, zone.w - 28, zone.h - 42);
      }
      ctx.fillStyle = "#111c28";
      ctx.fillRect(
        zone.x + 8,
        zone.y + 7,
        Math.min(zone.w - 16, zone.name.length * 5 + 12),
        13
      );
      ctx.fillStyle = "#ecdbc3";
      ctx.font = "bold 7px Exo2, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(zone.name, zone.x + 13, zone.y + 16, zone.w - 26);
      ctx.fillStyle = accent + "70";
      if (index % 2 === 0) {
        ctx.fillRect(zone.x + 9, zone.y + zone.h - 4, zone.w - 18, 2);
      }
    }
    for (const entity of room.entities.filter((e) => e.isWall && e.bounds)) {
      const bounds = entity.bounds;
      ctx.fillStyle = "#0008";
      ctx.fillRect(bounds.x + 3, bounds.y + 5, bounds.w + 2, bounds.h + 2);
      ctx.fillStyle = "#243340";
      ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
      ctx.fillStyle = "#afad9b";
      if (bounds.w > bounds.h) {
        ctx.fillRect(bounds.x, bounds.y, bounds.w, 2);
      } else {
        ctx.fillRect(bounds.x, bounds.y, 2, bounds.h);
      }
      ctx.fillStyle = accent;
      if ((bounds.x + bounds.y) % 128 === 0) {
        if (bounds.w > bounds.h) {
          ctx.fillRect(bounds.x + 5, bounds.y + 2, Math.min(22, bounds.w - 5), 2);
        } else {
          ctx.fillRect(bounds.x + 2, bounds.y + 5, 2, Math.min(22, bounds.h - 5));
        }
      }
    }
  }
  function drawTransition(ctx, exit, active, unlocked) {
    ctx.save();
    ctx.translate(Math.round(exit.x), Math.round(exit.y));
    const color = active && unlocked ? "#8de2c3" : "#cbac88";
    if (exit.transition === "stairs") {
      ctx.fillStyle = "#17232e";
      ctx.fillRect(-23, -25, 46, 50);
      for (let i = 0; i < 7; i++) {
        ctx.fillStyle = i % 2 ? "#7d8991" : "#a4aaa5";
        ctx.fillRect(-17, -21 + i * 6, 34, 4);
        ctx.fillStyle = "#32434c";
        ctx.fillRect(-17, -17 + i * 6, 34, 2);
      }
      ctx.fillStyle = color;
      ctx.fillRect(-22, -24, 3, 48);
      ctx.fillRect(19, -24, 3, 48);
      ctx.fillStyle = "#182d3b";
      ctx.fillRect(-5, -10, 10, 21);
      ctx.fillStyle = color;
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(exit.backward ? "\u2193" : "\u2191", 0, 5);
      ctx.fillStyle = color;
      ctx.fillRect(-19, -33, 38, 7);
      ctx.fillStyle = "#14232a";
      ctx.font = "bold 6px Exo2, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("\u041B\u0415\u0421\u0422\u041D\u0418\u0426\u0410", 0, -27);
    } else {
      ctx.translate(0, 18);
      ctx.fillStyle = "#10232e";
      ctx.fillRect(-23, -7, 46, 14);
      ctx.fillStyle = "#82a9b7";
      ctx.fillRect(-24, -8, 6, 16);
      ctx.fillRect(18, -8, 6, 16);
      ctx.fillStyle = "#235b7d";
      ctx.fillRect(-18, -5, 36, 10);
      ctx.fillStyle = "#4ec4ed";
      ctx.fillRect(-18, -5, 36, 2);
      ctx.fillStyle = "#357eaa";
      ctx.fillRect(-18, 3, 36, 2);
      ctx.fillStyle = "#d8e8df";
      ctx.fillRect(11, -3, 2, 6);
      ctx.fillStyle = unlocked ? "#9be7a4" : "#ecb86c";
      ctx.fillRect(-22, -3, 2, 6);
    }
    if (active && unlocked && exit.transition === "stairs") {
      ctx.fillStyle = "#9bf2d1";
      ctx.font = "bold 8px Exo2, sans-serif";
      ctx.fillText("E", 0, 36);
    }
    ctx.restore();
  }
  function assetUrl(url) {
    const root = globalThis.__EMERGENCY_EXIT_ROOT__;
    if (root && url.startsWith("/")) {
      return new URL(url.slice(1), root).href;
    }
    return url;
  }
  async function readJson(url) {
    const data = globalThis.__EMERGENCY_EXIT_ASSETS__;
    if (data) {
      if (!(url in data.json)) {
        throw new Error("Missing game data: " + url);
      }
      return data.json[url];
    }
    const response = await fetch(assetUrl(url));
    if (!response.ok) {
      throw new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C " + url);
    }
    return response.json();
  }
  var PLAYER_DIRECTIONS = ["down", "up", "left", "right"];
  function directionForVector(x, y, fallback = "down") {
    if (Math.hypot(x, y) < 1e-3) {
      return fallback;
    }
    if (Math.abs(x) > Math.abs(y)) {
      if (x > 0) {
        return "right";
      } else {
        return "left";
      }
    }
    if (y > 0) {
      return "down";
    } else {
      return "up";
    }
  }
  function attackProgress(player) {
    const duration = player.attackDuration ?? 0.18;
    return clamp(1 - player.attack / duration, 0, 1);
  }
  function facingDirection(player, attacking) {
    if (!attacking) {
      return player.facing ?? "down";
    }
    const angle = player.weapon.gun ? player.angle : player.attackAngle ?? player.angle;
    return directionForVector(Math.cos(angle), Math.sin(angle));
  }
  function playerPose(player) {
    const attacking = player.alive && player.attack > 0;
    const melee2 = attacking && !player.weapon.gun;
    let frame = 0;
    if (player.alive) {
      frame = Math.floor(player.frame) % 8;
    }
    if (melee2) {
      frame = Math.min(6, Math.floor(attackProgress(player) * 7));
    }
    return {
      key: melee2 ? "punchDirectional" : "heroDirectional",
      row: Math.max(0, PLAYER_DIRECTIONS.indexOf(facingDirection(player, attacking))),
      frame,
      angle: 0
    };
  }
  var MELEE_ANIMATIONS = {
    Club: {
      stroke: "swing",
      extent: 2,
      rest: 0.3
    },
    Pipe: {
      stroke: "swing",
      extent: 1.7,
      rest: 0.35
    },
    Bat: {
      stroke: "swing",
      extent: 2.3,
      rest: 0.42
    },
    Knife: {
      stroke: "thrust",
      extent: 7,
      rest: 0.1
    },
    Sword: {
      stroke: "swing",
      extent: 2.6,
      rest: 0.25
    },
    Pool: {
      stroke: "thrust",
      extent: 12,
      rest: 0.15
    },
    PoolBroke: {
      stroke: "thrust",
      extent: 9,
      rest: 0.2
    },
    Axe: {
      stroke: "overhead",
      extent: 2.2,
      rest: 0.5
    },
    NightStick: {
      stroke: "swing",
      extent: 1.8,
      rest: 0.22
    },
    Crowbar: {
      stroke: "swing",
      extent: 2.1,
      rest: 0.33
    },
    Machete: {
      stroke: "swing",
      extent: 2.5,
      rest: 0.18
    },
    SledgeHammer: {
      stroke: "overhead",
      extent: 2.7,
      rest: 0.6
    },
    Trophy: {
      stroke: "overhead",
      extent: 1.5,
      rest: 0.4
    },
    Drill: {
      stroke: "thrust",
      extent: 6,
      rest: 0.05
    },
    Pan: {
      stroke: "swing",
      extent: 1.6,
      rest: 0.38
    },
    BoilingPot: {
      stroke: "thrust",
      extent: 5,
      rest: 0.45
    },
    Pot: {
      stroke: "overhead",
      extent: 1.3,
      rest: 0.48
    },
    Bag: {
      stroke: "thrust",
      extent: 4,
      rest: 0.28
    }
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
    const weapon = player.weapon;
    if (weapon.id < 0) {
      return null;
    }
    if (weapon.gun) {
      return {
        x: Math.cos(player.angle) * 9,
        y: Math.sin(player.angle) * 9,
        angle: player.angle,
        scale: 0.65
      };
    }
    const attacking = player.attack > 0 && !weapon.throwOnly;
    const direction = facingDirection(player, attacking);
    const base = {
      right: 0,
      down: Math.PI / 2,
      left: Math.PI,
      up: -Math.PI / 2
    }[direction];
    const { stroke, extent, rest } = MELEE_ANIMATIONS[weapon.sprite] ?? {
      stroke: "thrust",
      extent: 3,
      rest: 0.2
    };
    const phase = attacking ? attackProgress(player) : 0;
    const contact = attacking ? Math.sin(Math.PI * phase) : 0;
    const sweep = attacking ? Math.sin(2 * Math.PI * phase) : 0;
    const reach = 5 + (stroke === "thrust" ? contact * extent : contact * 3);
    let rotation = 0;
    if (stroke === "swing") {
      rotation = sweep * extent;
    }
    if (stroke === "overhead") {
      rotation = -contact * extent;
    }
    const angle = base + rest + rotation;
    return {
      x: Math.cos(base) * reach - Math.sin(base) * 4,
      y: 2 + Math.sin(base) * reach + Math.cos(base) * 4 - (stroke === "overhead" ? contact * 5 : 0),
      angle,
      stroke,
      scale: 0.75,
      origin: grips[weapon.sprite] ?? [30, 24]
    };
  }
  var Phaser = globalThis.Phaser;
  var GameView = class extends Phaser.Scene {
    constructor() {
      super("world");
      this.images =  new Map();
      this.cameraPoint = {
        x: 320,
        y: 240
      };
      this.controls = {
        moveX: 0,
        moveY: 0
      };
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
        if (((_a = this.app) == null ? void 0 : _a.mode) !== "playing") {
          return;
        }
        this.app.audio.start();
        if (pointer.rightButtonDown()) {
          this.pending.weaponAction = true;
        }
        if (pointer.middleButtonDown()) {
          this.pending.throw = true;
        }
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
          if (event.code === "KeyE") {
            this.pending.pickup = true;
          }
          if (event.code === "KeyF") {
            this.pending.throw = true;
          }
          if (event.code === "KeyQ") {
            this.pending.drop = true;
          }
          if (event.code === "Space") {
            this.pending.execute = true;
          }
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
      if (this.images.has(key)) {
        return this.images.get(key);
      }
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
      const metadata = sim.manifest;
      const keys = new Set(
        sim.room.entities.map((entity) => entity.sprite).filter((k) => metadata.sprites[k])
      );
      for (const entity of sim.room.entities.filter((e) => e.glass)) {
        const key = entity.sprite.replace(/([HV])$/, "$1Broken");
        if (metadata.sprites[key]) {
          keys.add(key);
        }
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
        "sprBossCar1",
        "sprBossCar2",
        "sprCopCar",
        "sprDogDeadBlunt",
        "sprDogAttack",
        "sprPBackMachinegun",
        "sprPCrawl"
      ]) {
        if (metadata.sprites[key]) {
          keys.add(key);
        }
      }
      const backgrounds = new Set(
        sim.room.tiles.map((t) => t.bgName).filter((k) => metadata.backgrounds[k])
      );
      const loading = [];
      for (const key of keys) {
        loading.push(this.image(key, metadata.sprites[key].url));
      }
      for (const key of backgrounds) {
        let url = metadata.backgrounds[key];
        if (key === "tlFloorTiles") {
          url = this.app.skins.floor.url;
        }
        loading.push(this.image(key, url));
      }
      for (const [key, skin] of Object.entries(this.app.skins)) {
        if (key !== "floor") {
          loading.push(this.image("custom-" + key, skin.url));
        }
      }
      await Promise.all(loading);
      this.sim = sim;
      this.preview = preview;
      this.cameraPoint = {
        x: sim.player.x,
        y: sim.player.y
      };
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
        ...sim.room.tiles.map((tile) => ({
          tile,
          depth: tile.depth
        })),
        ...sim.room.entities.filter(
          (entity) => entity.kind === "decor" && entity.meta && entity.visible && !entity.glass && !this.hiddenObject(entity)
        ).map((entity) => ({
          entity,
          depth: entity.depth
        }))
      ].sort((a, b) => b.depth - a.depth);
      for (const entry of entries) {
        const target = entry.depth < -3 ? this.front.getContext("2d") : ctx;
        target.imageSmoothingEnabled = false;
        if (entry.tile) {
          const t = entry.tile;
          const image = this.images.get(t.bgName);
          if (!image) {
            continue;
          }
          const w = Math.min(t.w, image.width - t.xo);
          const h = Math.min(t.h, image.height - t.yo);
          if (w > 0 && h > 0) {
            target.drawImage(image, t.xo, t.yo, w, h, t.x, t.y, w * t.scaleX, h * t.scaleY);
          }
        } else {
          this.drawEntity(target, entry.entity);
        }
      }
      this.loading = false;
    }
    hiddenObject(entity) {
      return /MaskMenu|Tutorial|Teacher|Score|Arrow|Cursor|Effector|Surfacer|WeaponUnlock|Teleporter|BackgroundColor|Shadow|Transitioner|LevelClearer|RoomStart|LevelStart|CorpseCount|Dialogue|Conversation|SwatSpawn|Boss\dSpawn|Light/.test(
        entity.name
      );
    }
    drawSprite(ctx, key, frame, x, y, angle = 0, sx = 1, sy = sx, alpha = 1, origin = null) {
      const metadata = this.sim.manifest.sprites[key];
      const image = this.images.get(key);
      if (!metadata || !image) {
        return;
      }
      frame = (Math.floor(frame) % metadata.frames + metadata.frames) % metadata.frames;
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.rotate(angle);
      ctx.scale(sx, sy);
      ctx.globalAlpha = alpha;
      ctx.drawImage(
        image,
        frame * metadata.width,
        0,
        metadata.width,
        metadata.height,
        -((origin == null ? void 0 : origin[0]) ?? metadata.originX),
        -((origin == null ? void 0 : origin[1]) ?? metadata.originY),
        metadata.width,
        metadata.height
      );
      ctx.restore();
    }
    drawCustom(ctx, key, frame, x, y, angle = 0, alpha = 1, row = 0) {
      const metadata = this.app.skins[key];
      const image = this.images.get("custom-" + key);
      if (!image) {
        return;
      }
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.rotate(angle);
      ctx.globalAlpha = alpha;
      ctx.drawImage(
        image,
        Math.floor(frame) % metadata.frames * metadata.width,
        clamp(row, 0, (metadata.rows ?? 1) - 1) * metadata.height,
        metadata.width,
        metadata.height,
        -(metadata.originX ?? metadata.width / 2),
        -(metadata.originY ?? metadata.height / 2),
        metadata.width,
        metadata.height
      );
      ctx.restore();
    }
    drawEntity(ctx, entity) {
      if (entity.broken) {
        return;
      }
      if (entity.sprite === "sprAndersDesk") {
        const image = this.images.get("custom-desk");
        const metadata = entity.meta;
        const custom = this.app.skins.desk;
        if (image) {
          ctx.save();
          ctx.translate(entity.x, entity.y);
          ctx.rotate(entity.angle);
          ctx.scale(entity.scaleX, entity.scaleY);
          ctx.drawImage(
            image,
            Math.floor(entity.frame) % 6 * custom.width,
            0,
            custom.width,
            custom.height,
            -metadata.originX,
            -metadata.originY,
            metadata.width,
            metadata.height
          );
          ctx.restore();
          return;
        }
      }
      this.drawSprite(
        ctx,
        entity.sprite,
        entity.frame,
        entity.x,
        entity.y,
        entity.angle,
        entity.scaleX,
        entity.scaleY
      );
    }
    inputState() {
      const keys = this.keys;
      const pointer = this.input.activePointer;
      const down = (name) => {
        var _a;
        return (_a = keys[name]) == null ? void 0 : _a.isDown;
      };
      const input = {
        moveX: (down("D") || down("RIGHT") ? 1 : 0) - (down("A") || down("LEFT") ? 1 : 0),
        moveY: (down("S") || down("DOWN") ? 1 : 0) - (down("W") || down("UP") ? 1 : 0),
        attack: pointer.isDown && pointer.leftButtonDown(),
        weaponAction: !!this.pending.weaponAction,
        drop: Phaser.Input.Keyboard.JustDown(keys.Q) || this.pending.drop,
        pickup: Phaser.Input.Keyboard.JustDown(keys.E) || this.pending.pickup,
        execute: Phaser.Input.Keyboard.JustDown(keys.SPACE) || this.pending.execute,
        throw: Phaser.Input.Keyboard.JustDown(keys.F) || this.pending.throw,
        aim: this.toWorld(pointer.x, pointer.y),
        look: down("SHIFT")
      };
      input.interact = input.pickup;
      if (this.controls.moveX || this.controls.moveY) {
        input.moveX = this.controls.moveX;
        input.moveY = this.controls.moveY;
      }
      if (this.controls.aim) {
        input.aim = this.controls.aim;
      }
      if (this.controls.attack) {
        input.attack = true;
      }
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
      if (!this.sim || this.loading || this.app.mode === "ending") {
        return;
      }
      const dt = Math.min(delta / 1e3, 0.05);
      const input = this.inputState();
      if (this.app.mode === "playing") {
        this.sim.update(dt, input);
        for (const event of this.sim.events) {
          if (event.type === "sound") {
            this.app.audio.play(event.key);
          }
          if (event.type === "shake" && this.app.settings.effects) {
            this.shake = event.amount;
          }
          this.app.onEvent(event);
        }
        this.app.updateHUD();
      }
      const player = this.sim.player;
      const look = input.look && this.app.mode === "playing" ? this.sim.profile.lookDistance ?? 96 : 0;
      const target = {
        x: player.x + Math.cos(player.angle) * look,
        y: player.y + Math.sin(player.angle) * look
      };
      this.cameraPoint.x += (target.x - this.cameraPoint.x) * Math.min(1, dt * 8);
      this.cameraPoint.y += (target.y - this.cameraPoint.y) * Math.min(1, dt * 8);
      if (this.preview) {
        this.cameraPoint.x = this.sim.room.width / 2 + Math.sin(time * 13e-5) * 35;
        this.cameraPoint.y = this.sim.room.height / 2 + Math.cos(time * 12e-5) * 20;
      }
      this.render(time, dt);
    }
    drawEnemy(ctx, enemy) {
      if (enemy.alive) {
        if (enemy.dog) {
          this.drawSprite(ctx, enemy.sprite, enemy.frame, enemy.x, enemy.y, enemy.angle);
        } else if (enemy.stun > 0) {
          this.drawCustom(ctx, "policeUnarmed", 0, enemy.x, enemy.y, enemy.angle);
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
          if (!enemy.weapon.gun && enemy.weapon.id >= 0) {
            this.drawSprite(
              ctx,
              "sprWeapons",
              enemy.weapon.id,
              enemy.x + Math.cos(enemy.angle) * 9,
              enemy.y + Math.sin(enemy.angle) * 9,
              enemy.angle,
              0.6
            );
          }
          if (enemy.fat || enemy.swat || enemy.boss) {
            ctx.strokeStyle = enemy.boss ? "#f54387" : "#7ee2d2";
            ctx.lineWidth = 1;
            ctx.strokeRect(enemy.x - 5, enemy.y - 3, 10, 6);
          }
        }
      }
    }
    drawPlayer(ctx, player) {
      const pose = playerPose(player);
      if (player.alive && player.visible !== false) {
        this.drawCustom(
          ctx,
          pose.key,
          pose.frame,
          player.x,
          player.y,
          pose.angle,
          1,
          pose.row
        );
        const held = heldWeaponPose(player);
        if (held) {
          this.drawSprite(
            ctx,
            "sprWeapons",
            player.weapon.id,
            player.x + held.x,
            player.y + held.y,
            held.angle,
            held.scale,
            held.scale,
            1,
            held.origin
          );
        }
      } else if (!player.alive) {
        this.drawCustom(
          ctx,
          pose.key,
          pose.frame,
          player.x,
          player.y,
          pose.angle,
          0.75,
          pose.row
        );
      }
    }
    render(time, dt) {
      var _a;
      const ctx = this.ctx;
      const sim = this.sim;
      const w = this.scale.width;
      const h = this.scale.height;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#130d21";
      ctx.fillRect(0, 0, w, h);
      this.zoom = clamp(Math.round(Math.min(w / 480, h / 270)), 1, 5);
      if (this.preview) {
        this.zoom = Math.max(2, this.zoom);
      }
      const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
      const sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
      this.shake = Math.max(0, this.shake - dt * 18);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(
        -Math.round(this.cameraPoint.x) + sx,
        -Math.round(this.cameraPoint.y) + sy
      );
      ctx.drawImage(this.floor, 0, 0);
      for (const entity of sim.exits) {
        if (entity.visible && entity.meta && !this.hiddenObject(entity)) {
          this.drawEntity(ctx, entity);
        }
      }
      for (const b of sim.blood) {
        this.drawSprite(ctx, "sprBloodSplat", 3, b.x, b.y, b.angle, b.scale, b.scale, 0.9);
      }
      for (const body of sim.bodies) {
        if (body.dog) {
          this.drawSprite(ctx, "sprDogDeadBlunt", 4, body.x, body.y, body.angle);
        } else {
          this.drawCustom(
            ctx,
            "corpse",
            body.method === "shot" ? 2 : body.method === "execute" ? 3 : 0,
            body.x,
            body.y,
            body.angle
          );
        }
      }
      for (const exit of sim.exits) {
        if (exit.transition) {
          drawTransition(
            ctx,
            exit,
            exit === sim.exit,
            sim.cleared && (!sim.tutorial || sim.tutorial.canExit)
          );
        }
      }
      for (const item of sim.items) {
        if (!item.taken) {
          ctx.strokeStyle = "#5decce55";
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.arc(item.x, item.y, 8 + Math.sin(time * 5e-3) * 1.5, 0, Math.PI * 2);
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
      }
      for (const door of sim.doors) {
        if (!door.broken) {
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
      }
      for (const enemy of sim.enemies) {
        this.drawEnemy(ctx, enemy);
      }
      const player = sim.player;
      this.drawPlayer(ctx, player);
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
      for (const entity of sim.room.entities.filter((e) => e.glass && e.visible)) {
        const broken = entity.sprite.replace(/([HV])$/, "$1Broken");
        if (entity.broken && this.images.has(broken)) {
          this.drawSprite(
            ctx,
            broken,
            0,
            entity.x,
            entity.y,
            entity.angle,
            entity.scaleX,
            entity.scaleY
          );
        } else if (!entity.broken) {
          this.drawEntity(ctx, entity);
        }
      }
      for (const bullet of sim.bullets) {
        if (bullet.thrown) {
          this.drawSprite(
            ctx,
            "sprWeapons",
            bullet.weapon.id,
            bullet.x,
            bullet.y,
            time * 0.02
          );
        } else {
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
      for (const label of sim.floating) {
        ctx.fillStyle = "#fcf2c7";
        ctx.font = "bold 8px monospace";
        ctx.globalAlpha = Math.min(1, label.life * 2);
        ctx.fillText(label.text, label.x, label.y);
        ctx.globalAlpha = 1;
      }
      if (sim.cleared && !this.preview) {
        const entity = sim.exit;
        const d = Math.hypot(entity.x - player.x, entity.y - player.y);
        if (d > 100) {
          const angle = Math.atan2(entity.y - player.y, entity.x - player.x);
          ctx.save();
          ctx.translate(player.x + Math.cos(angle) * 54, player.y + Math.sin(angle) * 54);
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
        const pointer = this.input.activePointer;
        const a = this.toWorld(pointer.x, pointer.y);
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
        const px = w / 2 + (player.x - this.cameraPoint.x) * this.zoom;
        const py = h / 2 + (player.y - this.cameraPoint.y) * this.zoom;
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
    {
      name: "M16",
      sprite: "M16",
      ammo: 24,
      cooldown: 2 / 60,
      pellets: 1,
      spread: 6 * Math.PI / 180,
      sound: "sndM16"
    },
    {
      name: "\u0414\u0440\u043E\u0431\u043E\u0432\u0438\u043A",
      sprite: "Shotgun",
      ammo: 6,
      cooldown: 30 / 60,
      pellets: 8,
      spread: 12 * Math.PI / 180,
      sound: "sndShotgun"
    },
    { name: "\u041A\u043B\u044E\u0448\u043A\u0430", sprite: "Club" },
    { name: "\u0422\u0440\u0443\u0431\u0430", sprite: "Pipe" },
    { name: "\u0411\u0438\u0442\u0430", sprite: "Bat" },
    { name: "\u041D\u043E\u0436", sprite: "Knife" },
    {
      name: "\u0414\u0432\u0443\u0441\u0442\u0432\u043E\u043B\u043A\u0430",
      sprite: "DoubleBarrel",
      ammo: 2,
      cooldown: 8 / 60,
      pellets: 16,
      spread: 20 * Math.PI / 180,
      sound: "sndDoubleBarrel"
    },
    {
      name: "\u041F\u0438\u0441\u0442\u043E\u043B\u0435\u0442 \u0441 \u0433\u043B\u0443\u0448\u0438\u0442\u0435\u043B\u0435\u043C",
      sprite: "Silencer",
      ammo: 13,
      cooldown: 10 / 60,
      pellets: 1,
      spread: 6 * Math.PI / 180,
      sound: "sndSilencer"
    },
    { name: "\u041A\u0430\u0442\u0430\u043D\u0430", sprite: "Sword" },
    {
      name: "UZI",
      sprite: "Uzi",
      ammo: 30,
      cooldown: 1 / 60,
      pellets: 1,
      spread: 10 * Math.PI / 180,
      sound: "sndUzi"
    },
    {
      name: "\u041C\u0430\u0433\u043D\u0443\u043C",
      sprite: "Magnum",
      ammo: 6,
      cooldown: 8 / 60,
      pellets: 1,
      spread: 0 * Math.PI / 180,
      sound: "sndMagnum"
    },
    {
      name: "Scorpion",
      sprite: "Scorpion",
      ammo: 20,
      cooldown: 2 / 60,
      pellets: 1,
      spread: 6 * Math.PI / 180,
      sound: "sndScorpion"
    },
    {
      name: "MP5",
      sprite: "MP5",
      ammo: 32,
      cooldown: 2 / 60,
      pellets: 1,
      spread: 10 * Math.PI / 180,
      sound: "sndMP5"
    },
    { name: "\u0411\u0438\u043B\u044C\u044F\u0440\u0434\u043D\u044B\u0439 \u043A\u0438\u0439", sprite: "Pool" },
    { name: "\u0421\u043B\u043E\u043C\u0430\u043D\u043D\u044B\u0439 \u043A\u0438\u0439", sprite: "PoolBroke" },
    { name: "\u0422\u043E\u043F\u043E\u0440", sprite: "Axe" },
    { name: "\u0414\u0443\u0431\u0438\u043D\u043A\u0430", sprite: "NightStick" },
    { name: "\u041B\u043E\u043C", sprite: "Crowbar" },
    { name: "\u041C\u0430\u0447\u0435\u0442\u0435", sprite: "Machete" },
    { name: "\u041A\u0443\u0432\u0430\u043B\u0434\u0430", sprite: "SledgeHammer" },
    { name: "\u041A\u0443\u0431\u043E\u043A", sprite: "Trophy" },
    { name: "\u0414\u0440\u0435\u043B\u044C", sprite: "Drill" },
    { name: "\u0421\u043A\u043E\u0432\u043E\u0440\u043E\u0434\u0430", sprite: "Pan" },
    { name: "\u041A\u0438\u043F\u044F\u0442\u043E\u043A", sprite: "BoilingPot" },
    { name: "\u041A\u0430\u0441\u0442\u0440\u044E\u043B\u044F", sprite: "Pot" },
    {
      name: "UZI \u0441 \u0433\u043B\u0443\u0448\u0438\u0442\u0435\u043B\u0435\u043C",
      sprite: "SilencedUzi",
      ammo: 30,
      cooldown: 2 / 60,
      pellets: 1,
      spread: 10 * Math.PI / 180,
      sound: "sndSilencer"
    },
    { name: "\u041F\u0430\u043A\u0435\u0442", sprite: "Bag" },
    { name: "\u041A\u0438\u0440\u043F\u0438\u0447", sprite: "Throw" },
    { name: "\u0411\u0443\u0442\u044B\u043B\u043A\u0430", sprite: "Throw" },
    { name: "\u0414\u0440\u043E\u0442\u0438\u043A", sprite: "Throw" },
    { name: "\u041D\u043E\u0436 \u0434\u043B\u044F \u043C\u0435\u0442\u0430\u043D\u0438\u044F", sprite: "Throw" },
    { name: "\u041D\u043E\u0436\u043D\u0438\u0446\u044B", sprite: "Throw" },
    { name: "\u041C\u043E\u043B\u043E\u0442\u043E\u043A", sprite: "Throw" },
    { name: "\u0417\u0432\u0435\u0437\u0434\u0430", sprite: "Throw" },
    { name: "\u041C\u043E\u043B\u043E\u0442\u043E\u0432", sprite: "Throw" }
  ];
  var melee = {
    Club: { reach: 48, cooldown: 19 / 60 },
    Pipe: { reach: 38, cooldown: 22 / 60 },
    Bat: { reach: 42, cooldown: 25 / 60 },
    Knife: { reach: 28, cooldown: 10 / 60 },
    Sword: { reach: 52, cooldown: 15 / 60 },
    Pool: { reach: 58, cooldown: 20 / 60 },
    PoolBroke: { reach: 36, cooldown: 20 / 60 },
    Axe: { reach: 40, cooldown: 30 / 60 },
    NightStick: { reach: 34, cooldown: 15 / 60 },
    Crowbar: { reach: 37, cooldown: 20 / 60 },
    Machete: { reach: 44, cooldown: 12 / 60 },
    SledgeHammer: { reach: 50, cooldown: 30 / 60 },
    Trophy: { reach: 30, cooldown: 20 / 60 },
    Drill: { reach: 27, cooldown: 20 / 60 },
    Pan: { reach: 33, cooldown: 20 / 60 },
    BoilingPot: { reach: 31, cooldown: 25 / 60 },
    Pot: { reach: 29, cooldown: 25 / 60 },
    Bag: { reach: 26, cooldown: 20 / 60 },
    Throw: { reach: 0, cooldown: 20 / 60 }
  };
  var sharpWeapons = ["Knife", "Sword", "Axe", "Machete", "Drill"];
  var silentGuns = ["Silencer", "SilencedUzi"];
  var WEAPONS = definitions.map((definition, id) => {
    var _a;
    const { sprite: sprite2, ammo = 0 } = definition;
    const gun = ammo > 0;
    const reach = ((_a = melee[sprite2]) == null ? void 0 : _a.reach) ?? 0;
    return {
      id,
      name: definition.name,
      sprite: sprite2,
      ammo,
      gun,
      cooldown: gun ? definition.cooldown : melee[sprite2].cooldown,
      pellets: definition.pellets ?? 0,
      spread: definition.spread ?? 0,
      speed: gun ? 960 : 0,
      sound: definition.sound ?? "sndSwing1",
      range: Math.round(reach * 1.2),
      enemyRange: Math.round(reach * 0.7),
      sharp: sharpWeapons.includes(sprite2),
      throwOnly: sprite2 === "Throw",
      silent: silentGuns.includes(sprite2)
    };
  });
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
  function weaponBySprite(name = "") {
    const sprite2 = name.replace(/^(sprPolice|sprE|sprP)(Walk|Attack)/, "");
    return WEAPONS.find((weapon) => weapon.sprite === sprite2) ?? UNARMED;
  }
  var STUN_DURATION = 3.1;
  var MAX_ENEMIES = 10;
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
      const staticBoxes = this.room.entities.filter((e) => e.solid && !["enemy", "player", "door", "exit"].includes(e.kind)).map(rectFor).filter(Boolean);
      this.index = new SpatialIndex(staticBoxes);
      this.staticBoxes = staticBoxes;
      this.navigation = new Navigation(
        raw.width,
        raw.height,
        (x, y) => this.blocked(x, y, 7, false)
      );
      this.enemies = this.room.entities.filter((e) => e.kind === "enemy").slice(0, MAX_ENEMIES).map((entity) => this.createEnemy(entity));
      this.items = this.room.entities.filter((e) => e.kind === "weapon").map((entity) => this.createItem(entity));
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
      this.total = this.enemies.filter((e) => !e.dog || !profile.friendlyDogs).length;
      this.exit = this.findExit();
      this.cleared = this.total === 0;
      this.context = "";
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
        angle: -(entity.init.direction ?? entity.init.dir ?? 0) * Math.PI / 180,
        weapon,
        ammo: weapon.ammo,
        state: "patrol",
        origin: {
          x: entity.x,
          y: entity.y
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
        stationary: this.room.id === "eeTraining" || /Stationary|Guard|Idle/.test(entity.name),
        dog,
        fat,
        swat,
        boss,
        hp
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
      if (typeof id !== "number") {
        id = choices[Math.floor(this.random() * choices.length)];
      }
      const weapon = WEAPONS[clamp(Math.floor(id), 0, 34)];
      return {
        ...entity,
        weapon,
        ammo: entity.init.ammo > 0 ? entity.init.ammo : weapon.ammo,
        frame: weapon.id
      };
    }
    random() {
      this.seed = Math.imul(this.seed, 1664525) + 1013904223 >>> 0;
      return this.seed / 4294967296;
    }
    emit(type, data = {}) {
      this.events.push({
        type,
        ...data
      });
    }
    sound(key) {
      this.emit("sound", {
        key
      });
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
    pathBlocked(from, to) {
      const steps2 = Math.max(1, Math.ceil(distance(from, to) / 4));
      for (let i = 0; i <= steps2; i++) {
        const fraction = i / steps2;
        if (this.blocked(
          from.x + (to.x - from.x) * fraction,
          from.y + (to.y - from.y) * fraction,
          7,
          false
        )) {
          return true;
        }
      }
      return false;
    }
    safeSpawn(at) {
      if (!this.blocked(at.x, at.y, 7, false)) {
        return {
          x: at.x,
          y: at.y
        };
      }
      for (let radius = 8; radius < 400; radius += 8) {
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
          const player = {
            x: at.x + Math.cos(angle) * radius,
            y: at.y + Math.sin(angle) * radius
          };
          if (player.x >= 8 && player.y >= 8 && player.x < this.room.width - 8 && player.y < this.room.height - 8 && !this.blocked(player.x, player.y, 7, false)) {
            return player;
          }
        }
      }
      return {
        x: at.x,
        y: at.y
      };
    }
    findExit() {
      return this.exits.find((exit) => exit.forward) ?? this.exits[0] ?? {
        x: this.player.x,
        y: this.player.y
      };
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
        return next < radius ** 2 && next <= current + 1e-6;
      });
    }
    move(actor, dx, dy, dt) {
      const steps2 = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4));
      const sx = dx / steps2;
      const sy = dy / steps2;
      for (let i = 0; i < steps2; i++) {
        for (const door of this.doors) {
          if (door.locked || door.broken) {
            continue;
          }
          if (circleRect(actor.x + sx, actor.y + sy, 9, door.rect)) {
            if (Math.abs(door.open) < 0.3) {
              door.swing = actor === this.player ? 7 : 4;
              door.open = 0.4;
              this.sound("sndDoorOpen");
              if (actor === this.player) {
                for (const enemy of this.enemies) {
                  if (enemy.alive && distance(enemy, door) < 39) {
                    if (this.profile.lethalDoors) {
                      this.kill(enemy, "door");
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
        } else if (actor === this.player && sy === 0 && sx !== 0 && this.blocked(actor.x + sx, actor.y, 7)) {
          if (!this.blocked(actor.x + sx, actor.y - 8, 7) && this.canMoveTo(actor, actor.x, actor.y - Math.abs(sx))) {
            actor.y -= Math.abs(sx);
          } else if (!this.blocked(actor.x + sx, actor.y + 8, 7) && this.canMoveTo(actor, actor.x, actor.y + Math.abs(sx))) {
            actor.y += Math.abs(sx);
          }
        }
        if (this.canMoveTo(actor, actor.x, actor.y + sy)) {
          actor.y += sy;
        } else if (actor === this.player && sx === 0 && sy !== 0 && this.blocked(actor.x, actor.y + sy, 7)) {
          if (!this.blocked(actor.x - 8, actor.y + sy, 7) && this.canMoveTo(actor, actor.x - Math.abs(sy), actor.y)) {
            actor.x -= Math.abs(sy);
          } else if (!this.blocked(actor.x + 8, actor.y + sy, 7) && this.canMoveTo(actor, actor.x + Math.abs(sy), actor.y)) {
            actor.x += Math.abs(sy);
          }
        }
      }
      actor.x = clamp(actor.x, -64, this.room.width + 64);
      actor.y = clamp(actor.y, -64, this.room.height + 64);
    }
    update(dt, input) {
      var _a;
      this.events = [];
      if (this.status !== "playing") {
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
        input.interact && this.exitReady ? {
          ...input,
          pickup: false
        } : input
      );
      if (input.execute) {
        this.execute();
      }
      const changingWeapon = input.weaponAction || input.pickup || input.drop || input.throw;
      if (input.attack && !changingWeapon && player.fireTimer <= 0 && player.execution <= 0) {
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
      (_a = this.tutorial) == null ? void 0 : _a.update(input);
      this.context = this.contextHint();
      if (input.interact && this.exitReady) {
        this.status = "complete";
        this.sound("sndComplete");
        this.emit("complete");
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
          moveY: -input.moveY
        };
      }
      const approach = (v, target) => v < target ? Math.min(target, v + acceleration) : Math.max(target, v - acceleration);
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
      const stairs = this.exit.transition === "stairs";
      if (this.exitReady) {
        if (stairs) {
          return "E \xB7 \u0421\u041B\u0415\u0414\u0423\u042E\u0429\u0418\u0419 \u042D\u0422\u0410\u0416";
        } else {
          return "E \xB7 \u0412\u042B\u0419\u0422\u0418";
        }
      }
      const stunned = this.enemies.some(
        (enemy) => enemy.alive && enemy.stun > 0 && distance(player, enemy) < 31
      );
      if (stunned) {
        return "SPACE \xB7 \u0414\u041E\u0411\u0418\u0422\u042C";
      }
      const nearest = this.items.filter((item) => !item.taken).sort((a, b) => distance(a, player) - distance(b, player))[0];
      if (nearest && distance(nearest, player) < 30) {
        const key = player.weapon === UNARMED ? "E / \u041F\u041A\u041C \xB7 " : "E \xB7 ";
        return key + nearest.weapon.name.toUpperCase();
      }
      if (this.cleared) {
        if (stairs) {
          return "\u041A \u041B\u0415\u0421\u0422\u041D\u0418\u0426\u0415 \u2192 E";
        } else {
          return "\u041A \u0414\u0412\u0415\u0420\u0418 \u2192 E";
        }
      }
      return "";
    }
    get exitReady() {
      return this.exits.includes(this.exit) && this.cleared && (!this.tutorial || this.tutorial.canExit) && distance(this.player, this.exit) < 48;
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
        (i) => !i.taken && distance(i, player) < 32 && !this.lineBlocked(i, player) && (!this.tutorial || this.tutorial.allowsPickup(i))
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
        item.ammo * (item.ammoBonusApplied ? 1 : this.profile.ammoBonus ?? 1)
      );
      item.taken = true;
      player.attack = 0;
      this.sound("sndPickupWeapon");
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
        this.sound("sndLock");
        player.fireTimer = 0.2;
        return;
      }
      player.ammo--;
      this.shots++;
      player.fireTimer = weapon.cooldown;
      player.attack = 0.12;
      this.fire(player, weapon, "player");
      this.sound(weapon.sound);
      this.emit("shake", {
        amount: 1.8
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
        if (!enemy.alive || this.tutorial && !this.tutorial.allowsHit(enemy) || distance(enemy, player) > weapon.range + 6 || this.lineBlocked(player, enemy)) {
          continue;
        }
        const diff = Math.abs(
          angleDelta(Math.atan2(enemy.y - player.y, enemy.x - player.x), player.angle)
        );
        if (diff > 1.1) {
          continue;
        }
        if (weapon === UNARMED && !this.profile.punchKill && !enemy.dog) {
          const stolen = this.profile.disarm && enemy.weapon !== UNARMED ? {
            weapon: enemy.weapon,
            ammo: enemy.ammo
          } : null;
          this.stun(enemy, STUN_DURATION);
          if (stolen) {
            player.weapon = stolen.weapon;
            player.ammo = stolen.ammo;
            const drop = this.items.at(-1);
            if (drop && drop.weapon === stolen.weapon && Math.hypot(drop.x - enemy.x, drop.y - enemy.y) < 12) {
              drop.taken = true;
            }
            this.sound("sndPickupWeapon");
          }
        } else if (enemy.fat && (!weapon.sharp || weapon === UNARMED)) {
          this.stun(enemy, 0.5);
        } else {
          this.kill(enemy, weapon.sharp ? "cut" : "melee");
        }
      }
      for (const box of this.staticBoxes) {
        if (box.entity.glass && !box.entity.broken && rayRect(
          player.x,
          player.y,
          player.x + Math.cos(player.angle) * weapon.range,
          player.y + Math.sin(player.angle) * weapon.range,
          box,
          6
        ) !== null) {
          this.breakGlass(box.entity);
        }
      }
    }
    fire(actor, weapon, team) {
      for (let i = 0; i < weapon.pellets; i++) {
        const angle = actor.angle + (this.random() - 0.5) * weapon.spread * (team === "player" ? this.profile.accuracy ?? 1 : 1);
        const muzzle = {
          x: actor.x + Math.cos(angle) * 12,
          y: actor.y + Math.sin(angle) * 12
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
          weapon
        });
      }
      if (!weapon.silent && !(team === "player" && this.profile.silentShots)) {
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
        ammoBonusApplied
      });
    }
    dropWeapon() {
      const player = this.player;
      if (player.weapon === UNARMED) {
        return;
      }
      const ahead = {
        x: player.x + Math.cos(player.angle) * 12,
        y: player.y + Math.sin(player.angle) * 12
      };
      const at = !this.blocked(ahead.x, ahead.y, 7) && !this.lineBlocked(player, ahead, true) ? ahead : player;
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
        team: "player",
        owner: player,
        weapon: player.weapon,
        ammo: player.ammo,
        thrown: true
      });
      player.weapon = UNARMED;
      player.ammo = 0;
      player.attack = 0;
      player.fireTimer = 0.15;
      this.sound("sndThrow");
    }
    execute() {
      const enemy = this.enemies.find(
        (e) => e.alive && e.stun > 0 && distance(e, this.player) < 32 && !this.lineBlocked(e, this.player)
      );
      if (!enemy || this.player.execution > 0) {
        return;
      }
      this.player.execution = 0.35;
      this.player.attack = 0.35;
      this.kill(enemy, "execute");
      this.sound("sndBonesBreak");
      this.emit("shake", {
        amount: 3
      });
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
      if (e.weapon === UNARMED) {
        return;
      }
      this.dropItem(
        e,
        {
          x: e.x + 4,
          y: e.y + 4
        },
        !!e.ammoBonusApplied
      );
      e.weapon = UNARMED;
      e.ammo = 0;
    }
    kill(enemy, method) {
      if (!enemy.alive) {
        return;
      }
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
        const a = this.random() * 6.28;
        const s = 20 + this.random() * 90;
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
      var _a;
      if (!this.player.alive || ((_a = this.cheats) == null ? void 0 : _a.god)) {
        return;
      }
      this.player.alive = false;
      this.status = "dead";
      this.emit("death");
      this.sound("sndHit");
      this.emit("shake", {
        amount: 5
      });
    }
    takeBullet() {
      var _a;
      if ((_a = this.cheats) == null ? void 0 : _a.god) {
        return;
      }
      if (this.player.armor > 0) {
        this.player.armor--;
        this.sound("sndHit");
        this.emit("shake", {
          amount: 3
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
            y: at.y
          };
          enemy.alert = 5;
          enemy.state = "search";
        }
      }
    }
    breakGlass(entity) {
      entity.broken = true;
      this.sound("sndGlass1");
      this.noise(entity, 200);
      for (let i = 0; i < 9; i++) {
        this.particles.push({
          x: entity.x,
          y: entity.y,
          vx: (this.random() - 0.5) * 100,
          vy: (this.random() - 0.5) * 100,
          life: 0.65,
          glass: true
        });
      }
    }
    updateEnemy(enemy, dt) {
      if (enemy.dog && this.profile.friendlyDogs) {
        enemy.state = "friendly";
        return;
      }
      enemy.fireTimer = Math.max(0, enemy.fireTimer - dt);
      enemy.routeTimer -= dt;
      enemy.patrolTurn = Math.max(0, enemy.patrolTurn - dt);
      if (enemy.stun > 0) {
        enemy.stun = Math.max(0, enemy.stun - dt);
        if (enemy.stun === 0) {
          enemy.state = "search";
          enemy.alert = 4;
        }
        return;
      }
      const player = this.player;
      const d = distance(enemy, player);
      const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      const cone = Math.abs(angleDelta(angle, enemy.angle)) < (enemy.alert > 0 ? Math.PI : 1.45);
      const sees = this.grace <= 0 && d < (this.profile.stealth ? 140 : 260) && cone && !this.lineBlocked(enemy, player, false, false) && !(this.room.id === "eeTraining" && d > 45);
      if (sees) {
        enemy.lastSeen = {
          x: player.x,
          y: player.y
        };
        enemy.alert = 5;
        enemy.reaction -= dt;
        enemy.state = "chase";
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
          (i) => !i.taken && distance(i, enemy) < 18 && !this.lineBlocked(i, enemy)
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
          this.fire(enemy, enemy.weapon, "enemy");
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
        const melee2 = enemy.weapon.gun ? UNARMED : enemy.weapon;
        const inReach = d < (melee2.enemyRange ?? melee2.range) + player.radius;
        const ready = inReach && sees && !this.lineBlocked(enemy, player) && enemy.reaction <= 0 && enemy.fireTimer <= 0;
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
      enemy.state = "patrol";
      enemy.lastSeen = null;
      enemy.moving = 0;
      if (!enemy.stationary) {
        const clear = (angle) => !this.blocked(enemy.x + Math.cos(angle) * 12, enemy.y + Math.sin(angle) * 12, 8);
        if (!clear(enemy.angle) && enemy.patrolTurn === 0) {
          const next = [
            enemy.angle + Math.PI / 2,
            enemy.angle - Math.PI / 2,
            enemy.angle + Math.PI
          ].find(clear);
          if (next !== void 0) {
            enemy.angle = Math.atan2(Math.sin(next), Math.cos(next));
          }
          enemy.patrolTurn = 0.35;
        }
        if (clear(enemy.angle)) {
          const before = {
            x: enemy.x,
            y: enemy.y
          };
          this.move(
            enemy,
            Math.cos(enemy.angle) * 60 * dt,
            Math.sin(enemy.angle) * 60 * dt,
            dt
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
          Math.abs(ny - b.y) + 4
        ),
        ...this.doorBoxes()
      ];
      for (const box of boxes) {
        if (box.entity.broken) {
          continue;
        }
        const t = rayRect(b.x, b.y, nx, ny, box, 1);
        if (t !== null && t < hitTime) {
          hitTime = t;
          hit = {
            box
          };
        }
      }
      const targets = b.team === "enemy" ? [this.player] : this.enemies.filter((e) => e.alive);
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
            actor
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
              this.sound("sndHitWall");
            }
          } else if (hit.actor === this.player) {
            this.takeBullet();
          } else if (b.thrown) {
            this.stun(hit.actor, STUN_DURATION);
          } else {
            hit.actor.hp--;
            if (hit.actor.hp <= 0) {
              this.kill(hit.actor, "shot");
            } else {
              this.sound("sndHit");
            }
          }
          b.dead = true;
        } else {
          b.x = nx;
          b.y = ny;
        }
        if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > this.room.width || b.y > this.room.height) {
          b.dead = true;
        }
        if (b.dead && b.thrown) {
          const speed = Math.hypot(b.vx, b.vy);
          const offset = (hit == null ? void 0 : hit.box) ? 9 : 0;
          const at = this.safeSpawn({
            x: clamp(b.x - b.vx / speed * offset, 8, this.room.width - 8),
            y: clamp(b.y - b.vy / speed * offset, 8, this.room.height - 8)
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
      if (!this.cleared && this.enemies.every((e) => !e.alive || e.dog && this.profile.friendlyDogs)) {
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
        exit: {
          x: this.exit.x,
          y: this.exit.y
        },
        items: this.items.filter((i) => !i.taken).length,
        actors: this.enemies.map((e) => ({
          x: e.x,
          y: e.y,
          alive: e.alive,
          stun: e.stun,
          state: e.state,
          weapon: e.weapon.id
        })),
        drops: this.items.filter((i) => !i.taken).map((i) => ({
          x: i.x,
          y: i.y,
          weapon: i.weapon.id,
          ammo: i.ammo
        }))
      };
    }
  };
  var steps = [
    {
      id: "move",
      title: "\u0414\u0432\u0438\u0436\u0435\u043D\u0438\u0435",
      text: "\u041F\u0440\u043E\u0439\u0434\u0438 \u0432 \u043A\u0430\u0436\u0434\u0443\u044E \u0441\u0442\u043E\u0440\u043E\u043D\u0443: W, A, S, D. \u041D\u0430 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439 \u0434\u0436\u043E\u0439\u0441\u0442\u0438\u043A."
    },
    {
      id: "aim",
      title: "\u041F\u0440\u0438\u0446\u0435\u043B\u0438\u0432\u0430\u043D\u0438\u0435",
      text: "\u041F\u043E\u0434\u0432\u0438\u0433\u0430\u0439 \u043C\u044B\u0448\u044C\u044E \u0432\u043E\u043A\u0440\u0443\u0433 \u0433\u0435\u0440\u043E\u044F. \u0422\u0435\u043B\u043E \u0441\u043B\u0435\u0434\u0443\u0435\u0442 \u0434\u0432\u0438\u0436\u0435\u043D\u0438\u044E, \u0430 \u0430\u0442\u0430\u043A\u0430 \u2014 \u043F\u0440\u0438\u0446\u0435\u043B\u0443."
    },
    {
      id: "punch",
      title: "\u041E\u0433\u043B\u0443\u0448\u0435\u043D\u0438\u0435",
      text: "\u041F\u043E\u0434\u043E\u0439\u0434\u0438 \u043A \u043E\u0442\u043C\u0435\u0447\u0435\u043D\u043D\u043E\u043C\u0443 \u0432\u0440\u0430\u0433\u0443 \u0438 \u043D\u0430\u0436\u043C\u0438 \u041B\u041A\u041C \u0431\u0435\u0437 \u043E\u0440\u0443\u0436\u0438\u044F. \u041A\u0443\u043B\u0430\u043A \u043E\u0433\u043B\u0443\u0448\u0430\u0435\u0442."
    },
    {
      id: "finish",
      title: "\u0414\u043E\u0431\u0438\u0432\u0430\u043D\u0438\u0435",
      text: "\u041F\u043E\u0434\u043E\u0439\u0434\u0438 \u043A \u043E\u0433\u043B\u0443\u0448\u0451\u043D\u043D\u043E\u043C\u0443 \u0432\u0440\u0430\u0433\u0443 \u0438 \u043D\u0430\u0436\u043C\u0438 Space. \u041D\u0435 \u0436\u0434\u0438, \u043F\u043E\u043A\u0430 \u043E\u043D \u0432\u0441\u0442\u0430\u043D\u0435\u0442."
    },
    {
      id: "pickup",
      title: "\u0411\u043B\u0438\u0436\u043D\u0435\u0435 \u043E\u0440\u0443\u0436\u0438\u0435",
      text: "\u041F\u043E\u0434\u043E\u0439\u0434\u0438 \u043A \u043E\u0442\u043C\u0435\u0447\u0435\u043D\u043D\u043E\u0439 \u0431\u0438\u0442\u0435 \u0438 \u043D\u0430\u0436\u043C\u0438 E. \u041E\u0440\u0443\u0436\u0438\u0435 \u0434\u043E\u0441\u0442\u0430\u0451\u0442 \u0434\u0430\u043B\u044C\u0448\u0435 \u043A\u0443\u043B\u0430\u043A\u0430."
    },
    {
      id: "drop",
      title: "\u0421\u0431\u0440\u043E\u0441",
      text: "\u041D\u0430\u0436\u043C\u0438 Q: \u043E\u0440\u0443\u0436\u0438\u0435 \u043E\u0441\u0442\u0430\u043D\u0435\u0442\u0441\u044F \u0440\u044F\u0434\u043E\u043C, \u043F\u0430\u0442\u0440\u043E\u043D\u044B \u043D\u0435 \u043F\u043E\u0442\u0435\u0440\u044F\u044E\u0442\u0441\u044F."
    },
    {
      id: "retrieve",
      title: "\u041F\u043E\u0432\u0442\u043E\u0440\u043D\u044B\u0439 \u043F\u043E\u0434\u0431\u043E\u0440",
      text: "\u041F\u043E\u0434\u043E\u0439\u0434\u0438 \u043A \u0441\u0431\u0440\u043E\u0448\u0435\u043D\u043D\u043E\u0439 \u0431\u0438\u0442\u0435 \u0438 \u043D\u0430\u0436\u043C\u0438 E."
    },
    {
      id: "throw",
      title: "\u0411\u0440\u043E\u0441\u043E\u043A",
      text: "\u041D\u0430\u0432\u0435\u0434\u0438 \u043F\u0440\u0438\u0446\u0435\u043B \u043D\u0430 \u043E\u0442\u043C\u0435\u0447\u0435\u043D\u043D\u043E\u0433\u043E \u0432\u0440\u0430\u0433\u0430 \u0438 \u043D\u0430\u0436\u043C\u0438 \u041F\u041A\u041C \u0438\u043B\u0438 F. \u041F\u043E\u043F\u0430\u0434\u0430\u043D\u0438\u0435 \u043E\u0433\u043B\u0443\u0448\u0438\u0442 \u0435\u0433\u043E. \u041F\u0440\u0438 \u043F\u0440\u043E\u043C\u0430\u0445\u0435 \u043F\u043E\u0434\u0431\u0435\u0440\u0438 \u0431\u0438\u0442\u0443 \u0447\u0435\u0440\u0435\u0437 E \u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u0438."
    },
    {
      id: "recover",
      title: "\u0412\u0435\u0440\u043D\u0438 \u043E\u0440\u0443\u0436\u0438\u0435",
      text: "\u041F\u043E\u0434\u043E\u0439\u0434\u0438 \u043A \u0431\u0440\u043E\u0448\u0435\u043D\u043D\u043E\u0439 \u0431\u0438\u0442\u0435 \u0438 \u043F\u043E\u0434\u0431\u0435\u0440\u0438 \u0435\u0451 \u043A\u043B\u0430\u0432\u0438\u0448\u0435\u0439 E."
    },
    {
      id: "melee",
      title: "\u0423\u0434\u0430\u0440 \u043E\u0440\u0443\u0436\u0438\u0435\u043C",
      text: "\u0414\u043E\u0431\u0435\u0439 \u043E\u0442\u043C\u0435\u0447\u0435\u043D\u043D\u043E\u0433\u043E \u0432\u0440\u0430\u0433\u0430 \u0431\u0438\u0442\u043E\u0439: \u043F\u043E\u0434\u043E\u0439\u0434\u0438 \u0438 \u043D\u0430\u0436\u043C\u0438 \u041B\u041A\u041C."
    },
    {
      id: "gun",
      title: "\u0421\u0442\u0440\u0435\u043B\u043A\u043E\u0432\u043E\u0435 \u043E\u0440\u0443\u0436\u0438\u0435",
      text: "\u041F\u043E\u0434\u043E\u0439\u0434\u0438 \u043A \u043E\u0442\u043C\u0435\u0447\u0435\u043D\u043D\u043E\u043C\u0443 \u0434\u0440\u043E\u0431\u043E\u0432\u0438\u043A\u0443 \u0438 \u043D\u0430\u0436\u043C\u0438 E."
    },
    {
      id: "shoot",
      title: "\u0412\u044B\u0441\u0442\u0440\u0435\u043B",
      text: "\u041D\u0430\u0432\u0435\u0434\u0438 \u043F\u0440\u0438\u0446\u0435\u043B \u043D\u0430 \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0435\u0433\u043E \u0432\u0440\u0430\u0433\u0430 \u0438 \u043D\u0430\u0436\u043C\u0438 \u041B\u041A\u041C. \u0421\u043B\u0435\u0434\u0438 \u0437\u0430 \u043F\u0430\u0442\u0440\u043E\u043D\u0430\u043C\u0438 \u0432\u043D\u0438\u0437\u0443."
    },
    {
      id: "exit",
      title: "\u0412\u044B\u0445\u043E\u0434",
      text: "\u0412\u0441\u0435 \u043F\u0440\u0438\u0451\u043C\u044B \u043E\u0441\u0432\u043E\u0435\u043D\u044B. \u041F\u043E\u0434\u043E\u0439\u0434\u0438 \u043A \u0432\u044B\u0445\u043E\u0434\u0443 \u0438 \u043D\u0430\u0436\u043C\u0438 E. Esc \u2014 \u043F\u0430\u0443\u0437\u0430, R \u2014 \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u043A."
    }
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
      return steps[this.index].id;
    }
    get hint() {
      const { title, text: text2 } = steps[this.index];
      return {
        number: this.index + 1,
        total: steps.length,
        title,
        text: text2,
        directions: [...this.directions]
      };
    }
    get target() {
      if (["move", "aim", "drop"].includes(this.step)) {
        return null;
      }
      if (["punch", "finish"].includes(this.step)) {
        return this.sim.enemies[0];
      }
      if (["throw", "melee"].includes(this.step)) {
        return this.sim.enemies[1];
      }
      if (this.step === "shoot") {
        return this.sim.enemies[2];
      }
      if (this.step === "exit") {
        return this.sim.exit;
      }
      const id = this.step === "gun" ? 1 : 4;
      return this.sim.items.find((item) => !item.taken && item.weapon.id === id);
    }
    filterInput(input) {
      this.before = {
        x: this.sim.player.x,
        y: this.sim.player.y
      };
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
      const sim = this.sim;
      const player = sim.player;
      const [first, second, third] = sim.enemies;
      for (const enemy of sim.enemies) {
        if (enemy.stun > 0) {
          enemy.stun = Math.max(2, enemy.stun);
        }
      }
      if (this.step === "move" && Math.hypot(player.x - this.before.x, player.y - this.before.y) > 0.1) {
        if (input.moveX < 0) {
          this.directions.add("A");
        }
        if (input.moveX > 0) {
          this.directions.add("D");
        }
        if (input.moveY < 0) {
          this.directions.add("W");
        }
        if (input.moveY > 0) {
          this.directions.add("S");
        }
      }
      if (this.step === "shoot" && player.ammo === 0 && third.alive && sim.bullets.length === 0) {
        player.ammo = 6;
      }
      const done = {
        move: this.directions.size === 4,
        aim: Math.abs(
          Math.atan2(
            Math.sin(player.angle - this.startAngle),
            Math.cos(player.angle - this.startAngle)
          )
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
        exit: false
      };
      if (done[this.step]) {
        this.index++;
        this.startAngle = player.angle;
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
  var CHAPTERS = [
    {
      index: 0,
      number: "00",
      title: "\u042D\u0424\u0418\u0420 \u041E\u041A\u041E\u041D\u0427\u0415\u041D",
      brief: "\u041E\u0441\u0432\u043E\u0439 \u0434\u0432\u0438\u0436\u0435\u043D\u0438\u0435, \u043E\u0433\u043B\u0443\u0448\u0435\u043D\u0438\u0435, \u0434\u043E\u0431\u0438\u0432\u0430\u043D\u0438\u0435, \u043F\u043E\u0434\u0431\u043E\u0440, \u0441\u0431\u0440\u043E\u0441, \u0431\u0440\u043E\u0441\u043E\u043A \u0438 \u0441\u0442\u0440\u0435\u043B\u044C\u0431\u0443. \u041A\u0430\u0436\u0434\u043E\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u0435 \u043E\u0442\u043A\u0440\u044B\u0432\u0430\u0435\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0435\u0433\u043E. \u0412\u0440\u0430\u0433\u0438 \u0437\u0434\u0435\u0441\u044C \u0436\u0434\u0443\u0442 \u0442\u0432\u043E\u0438\u0445 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439.",
      rooms: ["eeTraining"]
    },
    {
      index: 1,
      number: "01",
      title: "\u041F\u041E\u0421\u041B\u0415\u0414\u041D\u0418\u0419 \u041F\u041E\u0415\u0417\u0414",
      brief: "\u0414\u043E \u0432\u043E\u043A\u0437\u0430\u043B\u0430 \u0434\u043E\u0431\u0440\u0430\u043B\u0430\u0441\u044C \u043F\u0435\u0440\u0432\u0430\u044F \u0433\u0440\u0443\u043F\u043F\u0430. \u041F\u0440\u043E\u0440\u0432\u0438\u0441\u044C \u043A \u043F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0435.",
      rooms: ["eeStationHall", "eeStationService"]
    },
    {
      index: 2,
      number: "02",
      title: "\u0411\u0415\u0417 \u0421\u0412\u0418\u0414\u0415\u0422\u0415\u041B\u0415\u0419",
      brief: "\u0410\u0434\u0440\u0435\u0441 \u043A\u0432\u0430\u0440\u0442\u0438\u0440\u044B \u0441\u043B\u0438\u043B\u0438 \u0432 \u0447\u0430\u0442. \u041F\u043E\u043B\u0438\u0446\u0438\u044F \u043F\u0435\u0440\u0435\u043A\u0440\u044B\u043B\u0430 \u043F\u043E\u0434\u044A\u0435\u0437\u0434.",
      rooms: ["eeCourtyard", "eeLoft"]
    },
    {
      index: 3,
      number: "03",
      title: "\u0427\u0423\u0416\u041E\u0419 \u0410\u0414\u0420\u0415\u0421",
      brief: "\u0412\u0442\u043E\u0440\u043E\u0435 \u0443\u0431\u0435\u0436\u0438\u0449\u0435 \u0442\u043E\u0436\u0435 \u0440\u0430\u0441\u043A\u0440\u044B\u0442\u043E. \u0418\u043C \u043D\u0443\u0436\u0435\u043D \u0442\u043E\u0442, \u043A\u0442\u043E \u0432\u043A\u043B\u044E\u0447\u0430\u043B \u043A\u0430\u043C\u0435\u0440\u0443.",
      rooms: ["eeCanalEntry", "eeRelayRoom"]
    },
    {
      index: 4,
      number: "04",
      title: "OFFLINE",
      brief: "\u0422\u0435\u043B\u0435\u0444\u043E\u043D \u043C\u043E\u043B\u0447\u0438\u0442. \u0412 \u0433\u043E\u0441\u0442\u0438\u043D\u043E\u0439 \u2014 \u043B\u044E\u0434\u0438 \u0432 \u0444\u043E\u0440\u043C\u0435.",
      rooms: ["eeQuietReception", "eeRoofFlat"]
    },
    {
      index: 5,
      number: "05",
      title: "\u0411\u0415\u0417 \u0414\u041E\u041D\u0410\u0422\u041E\u0412",
      brief: "\u0417\u0434\u0435\u0441\u044C \u043E\u0431\u0435\u0449\u0430\u043B\u0438 \u043F\u0435\u0440\u0435\u0436\u0434\u0430\u0442\u044C \u043D\u043E\u0447\u044C. \u0417\u0434\u0435\u0441\u044C \u0442\u0435\u0431\u044F \u0436\u0434\u0430\u043B\u0438.",
      rooms: ["eeWorkshop", "eeMezzanine"]
    },
    {
      index: 6,
      number: "06",
      title: "\u0421\u041B\u0418\u0422\u042B\u0419 \u0410\u0414\u0420\u0415\u0421",
      brief: "\u041A\u0442\u043E-\u0442\u043E \u043E\u0441\u0442\u0430\u0432\u0438\u043B \u0441\u0432\u0435\u0442 \u0432\u043A\u043B\u044E\u0447\u0451\u043D\u043D\u044B\u043C. \u041F\u0440\u043E\u0432\u0435\u0440\u044C \u043E\u0431\u0430 \u044D\u0442\u0430\u0436\u0430.",
      rooms: ["eeDuplexEntry", "eeDuplexBridge"]
    },
    {
      index: 7,
      number: "07",
      title: "\u041D\u0415 \u0411\u0415\u0421\u041F\u041E\u041A\u041E\u0418\u0422\u042C",
      brief: "\u041D\u043E\u043C\u0435\u0440 \u043E\u043F\u043B\u0430\u0447\u0435\u043D \u0434\u043E \u0443\u0442\u0440\u0430. \u041D\u043E \u0434\u043E \u0443\u0442\u0440\u0430 \u0435\u0449\u0451 \u043D\u0443\u0436\u043D\u043E \u0434\u043E\u0436\u0438\u0442\u044C.",
      rooms: ["eeHotelLobby", "eeHotelGarden"]
    },
    {
      index: 8,
      number: "08",
      title: "\u0427\u0415\u0422\u042B\u0420\u0415 \u042D\u0422\u0410\u0416\u0410",
      brief: "\u041B\u0438\u0444\u0442\u044B \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u044B. \u0415\u0434\u0438\u043D\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u2014 \u0447\u0435\u0440\u0435\u0437 \u0437\u0434\u0430\u043D\u0438\u0435.",
      rooms: ["eeTowerLoading", "eeTowerArchive", "eeTowerServers", "eeTowerRoof"]
    },
    {
      index: 9,
      number: "09",
      title: "\u041F\u041E\u0414\u0412\u0410\u041B",
      brief: "\u0417\u0430\u043F\u0430\u0441\u043D\u043E\u0439 \u0432\u044B\u0445\u043E\u0434 \u043D\u0430\u0445\u043E\u0434\u0438\u0442\u0441\u044F \u0432\u043D\u0438\u0437\u0443. \u0415\u0441\u043B\u0438 \u043E\u043D \u0432\u043E\u043E\u0431\u0449\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442.",
      rooms: ["eeLaundry", "eeUtilityFlat", "eePumpBasement"]
    },
    {
      index: 10,
      number: "10",
      title: "\u0428\u0422\u0423\u0420\u041C",
      brief: "\u0422\u0435\u043F\u0435\u0440\u044C \u044D\u0442\u043E \u043D\u0435 \u043F\u0430\u0442\u0440\u0443\u043B\u044C. \u041D\u0435 \u043E\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u0439\u0441\u044F.",
      rooms: ["eeCheckpoint", "eeResponseDeck"]
    },
    {
      index: 11,
      number: "11",
      title: "\u041F\u0415\u0420\u0418\u041C\u0415\u0422\u0420",
      brief: "\u041E\u043D\u0438 \u043E\u0446\u0435\u043F\u0438\u043B\u0438 \u0432\u0435\u0441\u044C \u043A\u0432\u0430\u0440\u0442\u0430\u043B. \u041D\u0430\u0439\u0434\u0438 \u0440\u0430\u0437\u0440\u044B\u0432 \u0432 \u043A\u043E\u043B\u044C\u0446\u0435.",
      rooms: ["eeMarketHub", "eeMarketLeft", "eeMarketRight", "eeMarketOffice"]
    },
    {
      index: 12,
      number: "12",
      title: "\u041D\u041E\u0427\u041D\u0410\u042F \u0421\u041C\u0415\u041D\u0410",
      brief: "\u0412\u0441\u0435 \u0437\u0430\u043F\u0438\u0441\u0438 \u0442\u0432\u043E\u0438\u0445 \u044D\u0444\u0438\u0440\u043E\u0432 \u0445\u0440\u0430\u043D\u044F\u0442\u0441\u044F \u0432 \u044D\u0442\u043E\u043C \u043E\u0444\u0438\u0441\u0435.",
      rooms: ["eeBroadcastLobby", "eeEditing", "eeUplink"]
    },
    {
      index: 13,
      number: "13",
      title: "\u041E\u0422\u0414\u0415\u041B",
      brief: "\u041A\u043B\u044E\u0447 \u043E\u0442 \u0432\u044B\u0435\u0437\u0434\u0430 \u0438\u0437 \u0433\u043E\u0440\u043E\u0434\u0430 \u2014 \u043D\u0430 \u0432\u0435\u0440\u0445\u043D\u0435\u043C \u044D\u0442\u0430\u0436\u0435 \u0443\u0447\u0430\u0441\u0442\u043A\u0430.",
      rooms: ["eePrecinctGate", "eeEvidence", "eeControlRoom"]
    },
    {
      index: 14,
      number: "14",
      title: "\u041F\u041E\u0421\u041B\u0415\u041F\u0410\u0422\u0418",
      brief: "\u041A\u043B\u0443\u0431 \u0437\u0430\u043A\u0440\u044B\u043B\u0441\u044F. \u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 \u0433\u043E\u0441\u0442\u0438 \u0432\u0441\u0451 \u0435\u0449\u0451 \u0432\u043D\u0443\u0442\u0440\u0438.",
      rooms: ["eeClubQueue", "eeClubBalcony", "eeClubBooth", "eeClubVault"]
    },
    {
      index: 15,
      number: "15",
      title: "EMERGENCY EXIT",
      brief: "\u0417\u0430 \u043E\u0441\u043E\u0431\u043D\u044F\u043A\u043E\u043C \u2014 \u0432\u044B\u0445\u043E\u0434 \u0438\u0437 \u0433\u043E\u0440\u043E\u0434\u0430. \u042D\u0442\u0430 \u043D\u043E\u0447\u044C \u0434\u043E\u043B\u0436\u043D\u0430 \u0437\u0430\u043A\u043E\u043D\u0447\u0438\u0442\u044C\u0441\u044F.",
      rooms: ["eeEstateGate", "eeEstateGallery", "eeEstateLanding"]
    },
    {
      index: 16,
      number: "16",
      title: "\u0412\u0422\u041E\u0420\u041E\u0419 \u0410\u041A\u041A\u0410\u0423\u041D\u0422",
      brief: "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u043C\u0430\u0440\u0448\u0440\u0443\u0442 \u0447\u0435\u0440\u0435\u0437 \u0440\u0435\u0441\u0442\u043E\u0440\u0430\u043D.",
      rooms: ["eeNightKitchen"]
    },
    {
      index: 17,
      number: "17",
      title: "GAME OVER",
      brief: "\u0410\u0440\u043A\u0430\u0434\u043D\u044B\u0435 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u044B \u0448\u0443\u043C\u044F\u0442 \u0433\u0440\u043E\u043C\u0447\u0435 \u0440\u0430\u0446\u0438\u0438.",
      rooms: ["eeArcadeLobby", "eeArcadeLab"]
    },
    {
      index: 18,
      number: "18",
      title: "\u0412\u042B\u0421\u041E\u041A\u0410\u042F \u0421\u0422\u0410\u0412\u041A\u0410",
      brief: "\u0414\u0440\u0443\u0433\u0430\u044F \u043D\u043E\u0447\u044C. \u0422\u043E\u0442 \u0436\u0435 \u0432\u044B\u0445\u043E\u0434.",
      rooms: ["eeSkyLounge"]
    },
    {
      index: 19,
      number: "19",
      title: "\u041F\u041E\u0421\u041B\u0415 \u041F\u041E\u041B\u0423\u041D\u041E\u0427\u0418",
      brief: "\u041D\u0430 \u044D\u0442\u043E\u0442 \u0440\u0430\u0437 \u044D\u0444\u0438\u0440 \u043D\u0430\u0447\u0430\u043B\u0441\u044F \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u043F\u043E\u0437\u0434\u043D\u043E.",
      rooms: ["eeAfterHours"]
    },
    {
      index: 20,
      number: "20",
      title: "\u0414\u041E\u0420\u041E\u0413\u0410 \u0414\u041E\u041C\u041E\u0419",
      brief: "\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0435\u0435 \u0443\u0431\u0435\u0436\u0438\u0449\u0435 \u0437\u0430 \u0433\u043E\u0440\u043E\u0434\u043E\u043C.",
      rooms: ["eeRoadhouse"]
    },
    {
      index: 21,
      number: "21",
      title: "\u0421\u0422\u0410\u0420\u042B\u0419 \u041E\u0422\u0415\u041B\u042C",
      brief: "\u041D\u0430 \u0440\u0435\u0441\u0435\u043F\u0448\u0435\u043D\u0435 \u043D\u0438\u043A\u0442\u043E \u043D\u0435 \u043E\u0442\u0432\u0435\u0447\u0430\u0435\u0442.",
      rooms: ["eeOldAtrium"]
    }
  ];
  var PROFILES = [
    {
      id: "classic",
      name: "MELLSTROY",
      tag: "\u041E\u0431\u044B\u0447\u043D\u044B\u0439 \u0440\u0435\u0436\u0438\u043C",
      speed: 180
    },
    {
      id: "runner",
      name: "\u041D\u0410 \u0425\u0410\u0419\u041F\u0415",
      tag: "\u0414\u0432\u0438\u0436\u0435\u043D\u0438\u0435 \u043D\u0430 8% \u0431\u044B\u0441\u0442\u0440\u0435\u0435",
      speed: 194
    },
    {
      id: "marksman",
      name: "\u0422\u041E\u0427\u041D\u042B\u0419 \u0420\u0410\u0421\u0427\u0401\u0422",
      tag: "\u041D\u0430 20% \u0431\u043E\u043B\u044C\u0448\u0435 \u043F\u0430\u0442\u0440\u043E\u043D\u043E\u0432 \u043F\u0440\u0438 \u043F\u0435\u0440\u0432\u043E\u043C \u043F\u043E\u0434\u0431\u043E\u0440\u0435",
      speed: 180,
      ammoBonus: 1.2
    },
    {
      id: "thrower",
      name: "\u0414\u0410\u041B\u042C\u041D\u0418\u0419 \u0411\u0420\u041E\u0421\u041E\u041A",
      tag: "\u0411\u0440\u043E\u0441\u043E\u043A \u043D\u0430 20% \u0434\u0430\u043B\u044C\u0448\u0435",
      speed: 180,
      longThrows: true
    },
    {
      id: "combo",
      name: "\u041D\u0415 \u041F\u0420\u0415\u0420\u042B\u0412\u0410\u0419\u0421\u042F",
      tag: "\u0415\u0449\u0451 \u043F\u043E\u043B\u0441\u0435\u043A\u0443\u043D\u0434\u044B \u0434\u043B\u044F \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0435\u043D\u0438\u044F \u043A\u043E\u043C\u0431\u043E",
      speed: 180,
      comboWindow: 2.7
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
      this.cinematicNodes =  new Set();
    }
    start() {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.music = this.ctx.createGain();
        this.music.connect(this.ctx.destination);
        this.endingGain = this.ctx.createGain();
        this.endingGain.connect(this.music);
        this.effects = this.ctx.createGain();
        this.effects.connect(this.ctx.destination);
        this.updateVolumes();
        this.timer = setInterval(() => this.tick(), 125);
      }
      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }
      this.active = true;
    }
    updateVolumes() {
      for (const voices of this.voices.values()) {
        for (const voice of voices) {
          voice.volume = this.settings.sound / 100;
        }
      }
      if (this.ctx) {
        this.effects.gain.value = this.settings.sound / 100;
        this.music.gain.value = this.settings.music / 100 * 0.2;
      }
    }
    async play(key) {
      if (!this.ctx || !this.settings.sound) {
        return;
      }
      const now = performance.now();
      if (now - (this.last.get(key) ?? 0) < 45) {
        return;
      }
      this.last.set(key, now);
      const url = this.manifest.audio[key];
      if (!url) {
        return;
      }
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
    tone(freq, type, time, length, gain = 0.2, output = this.music) {
      const oscillator = this.ctx.createOscillator();
      const volume = this.ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(freq, time);
      volume.gain.setValueAtTime(gain, time);
      volume.gain.exponentialRampToValueAtTime(1e-3, time + length);
      oscillator.connect(volume);
      volume.connect(output);
      oscillator.start(time);
      oscillator.stop(time + length);
    }
    startEndingMusic() {
      this.start();
      this.endingGain.gain.value = 1;
      this.endingMusic = true;
      this.step = 0;
    }
    stopEndingMusic() {
      this.endingMusic = false;
      if (this.endingGain) {
        this.endingGain.gain.value = 0;
      }
      this.active = false;
      this.step = 0;
    }
    endingTick(time = this.ctx.currentTime) {
      const step = this.step++;
      const beat = step % 64;
      const roots = [55, 43.65, 65.41, 49];
      const root = roots[Math.floor(beat / 16)];
      const note = (frequency, type, length, volume) => this.tone(frequency, type, time, length, volume, this.endingGain);
      if (beat % 2 === 0) {
        note(root, "sawtooth", 0.19, 0.14);
        note(root * 2, "triangle", 0.22, 0.11);
      }
      if (beat % 16 === 0) {
        for (const interval of [1, 1.2, 1.5]) {
          note(root * 4 * interval, "triangle", 1.85, 0.11);
        }
      }
      const arpeggio = [1, 1.5, 2, 2.4, 2, 1.5, 1.2, 1.5];
      note(root * 4 * arpeggio[beat % 8], "sine", 0.2, 0.13);
      if (step >= 64 && beat % 4 === 0) {
        const melody = [2, 2.4, 3, 2.4, 2, 1.5, 1.2, 1.5];
        note(root * 4 * melody[Math.floor(beat / 4) % 8], "triangle", 0.43, 0.24);
      }
      if (beat % 4 === 0) {
        note(53, "sine", 0.18, 1.15);
        note(106, "sine", 0.035, 0.32);
      }
      if (beat % 4 === 2) {
        note(175, "triangle", 0.09, 0.35);
        note(1180, "triangle", 0.045, 0.14);
      }
      if (beat % 2) {
        note(6500, "triangle", 0.021, 0.08);
      }
    }
    cinematicSound(kind) {
      if (!this.ctx || !this.settings.sound) {
        return;
      }
      if (kind === "door") {
        this.play("sndDoorOpen");
        return;
      }
      const now = this.ctx.currentTime;
      const gain = this.ctx.createGain();
      gain.connect(this.effects);
      let source;
      let length;
      if (kind === "explosion") {
        length = 2.4;
        const buffer = this.ctx.createBuffer(
          1,
          this.ctx.sampleRate * length,
          this.ctx.sampleRate
        );
        const data = buffer.getChannelData(0);
        let low = 0;
        for (let i = 0; i < data.length; i++) {
          low = low * 0.93 + (Math.random() * 2 - 1) * 0.07;
          data[i] = low * 3;
        }
        source = this.ctx.createBufferSource();
        source.buffer = buffer;
        gain.gain.setValueAtTime(1.2, now);
        gain.gain.exponentialRampToValueAtTime(1e-3, now + length);
      } else {
        source = this.ctx.createOscillator();
        source.type = kind === "engine" ? "sawtooth" : "square";
        length = kind === "engine" ? 3.5 : 0.12;
        source.frequency.setValueAtTime(kind === "engine" ? 38 : 880, now);
        source.frequency.exponentialRampToValueAtTime(
          kind === "engine" ? 165 : 440,
          now + length
        );
        gain.gain.setValueAtTime(kind === "engine" ? 0.08 : 0.09, now);
        gain.gain.exponentialRampToValueAtTime(1e-3, now + length);
      }
      source.connect(gain);
      this.cinematicNodes.add(source);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        this.cinematicNodes.delete(source);
      };
      source.start(now);
      source.stop(now + length);
    }
    stopCinematicSounds() {
      for (const source of this.cinematicNodes) {
        try {
          source.stop();
        } catch {
        }
      }
    }
    tick() {
      if (!this.ctx || this.ctx.state !== "running" || !this.active || !this.settings.music) {
        return;
      }
      if (this.endingMusic) {
        this.endingTick();
        return;
      }
      const time = this.ctx.currentTime;
      const beat = this.step++ % 32;
      const notes = [55, 55, 65.41, 55, 82.41, 55, 73.42, 65.41];
      this.tone(notes[Math.floor(beat / 4)], "sawtooth", time, 0.12, 0.16);
      if (beat % 4 === 0) {
        const oscillator = this.ctx.createOscillator();
        const volume = this.ctx.createGain();
        oscillator.frequency.setValueAtTime(135, time);
        oscillator.frequency.exponentialRampToValueAtTime(35, time + 0.12);
        volume.gain.setValueAtTime(0.65, time);
        volume.gain.exponentialRampToValueAtTime(1e-3, time + 0.18);
        oscillator.connect(volume);
        volume.connect(this.music);
        oscillator.start(time);
        oscillator.stop(time + 0.18);
      }
      if (beat % 4 === 2) {
        this.tone(185, "triangle", time, 0.07, 0.23);
      }
      if (beat % 2 === 1) {
        this.tone(7300, "square", time, 0.018, 0.025);
      }
      if (beat % 2 === 0) {
        const melody = [440, 523.25, 659.25, 587.33, 440, 392, 523.25, 349.23];
        this.tone(melody[Math.floor(beat / 2) % 8], "triangle", time, 0.22, 0.12);
      }
    }
  };
  var ENDING = {
    walk: 2,
    detonator: 6,
    explosion: 9,
    approach: 15,
    boarding: 19,
    departure: 21,
    highway: 26,
    credits: 30,
    finished: 82
  };
  var CREDITS = [
    {
      title: "\u0421\u041E\u0417\u0414\u0410\u0422\u0415\u041B\u0418",
      lines: ["Ruslan Chentsov (ludv0ice)", "Maksim Barbolin (Macan PRIME67)"]
    },
    { title: "\u0412 \u0413\u041B\u0410\u0412\u041D\u041E\u0419 \u0420\u041E\u041B\u0418", lines: ["\u041C\u0435\u043B\u043B\u0441\u0442\u0440\u043E\u0439"] },
    {
      title: "\u041C\u0423\u0417\u042B\u041A\u0410 \u0424\u0418\u041D\u0410\u041B\u0410",
      lines: ["NIGHT DRIVE", "\u041E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u0441\u0438\u043D\u0442\u0432\u0435\u0439\u0432-\u043A\u043E\u043C\u043F\u043E\u0437\u0438\u0446\u0438\u044F"]
    },
    { title: "\u0414\u0412\u0418\u0416\u041E\u041A", lines: ["Phaser 3", "JavaScript"] },
    { title: "\u0418\u0421\u0425\u041E\u0414\u041D\u042B\u0415 \u041C\u0410\u0422\u0415\u0420\u0418\u0410\u041B\u042B", lines: ["Hotline Miami", "Dennaton Games"] },
    { title: "\u0421\u041F\u0410\u0421\u0418\u0411\u041E \u0417\u0410 \u0418\u0413\u0420\u0423", lines: ["\u0422\u044B \u0432\u044B\u0431\u0440\u0430\u043B\u0441\u044F."] }
  ];
  function endingUnlocked(progress) {
    return CHAPTERS.every(
      (chapter) => {
        var _a, _b;
        return Number.isFinite((_b = (_a = progress.best) == null ? void 0 : _a[chapter.index]) == null ? void 0 : _b.score);
      }
    );
  }
  function endingPhase(time) {
    if (time < ENDING.walk) {
      return "establish";
    }
    if (time < ENDING.detonator) {
      return "walk";
    }
    if (time < ENDING.explosion) {
      return "detonator";
    }
    if (time < ENDING.approach) {
      return "explosion";
    }
    if (time < ENDING.boarding) {
      return "approach";
    }
    if (time < ENDING.departure) {
      return "boarding";
    }
    if (time < ENDING.highway) {
      return "departure";
    }
    if (time < ENDING.credits) {
      return "highway";
    }
    if (time < ENDING.finished) {
      return "credits";
    } else {
      return "finished";
    }
  }
  function detonatorFrame(time) {
    if (time < ENDING.detonator) {
      return 0;
    }
    if (time < 7.7) {
      return 1;
    }
    if (time < 8.1) {
      return 2;
    } else {
      return 3;
    }
  }
  function endingCaption(time) {
    const phase = endingPhase(time);
    if (phase === "establish") {
      return "\u041F\u043E\u043B\u0438\u0446\u0435\u0439\u0441\u043A\u0438\u0439 \u0443\u0447\u0430\u0441\u0442\u043E\u043A. \u041F\u043E\u0441\u043B\u0435\u0434\u043D\u044F\u044F \u043D\u043E\u0447\u044C.";
    }
    if (phase === "walk") {
      return "\u041C\u0435\u043B\u043B\u0441\u0442\u0440\u043E\u0439 \u0432\u044B\u0445\u043E\u0434\u0438\u0442 \u0438\u0437 \u0443\u0447\u0430\u0441\u0442\u043A\u0430 \u0441 \u0434\u0435\u0442\u043E\u043D\u0430\u0442\u043E\u0440\u043E\u043C \u0432 \u0440\u0443\u043A\u0435.";
    }
    if (phase === "detonator") {
      return "\u041E\u043D \u043D\u0430\u0436\u0438\u043C\u0430\u0435\u0442 \u043A\u043D\u043E\u043F\u043A\u0443 \u0434\u0435\u0442\u043E\u043D\u0430\u0442\u043E\u0440\u0430.";
    }
    if (phase === "explosion") {
      return "\u041F\u043E\u0437\u0430\u0434\u0438 \u0432\u0437\u0440\u044B\u0432\u0430\u0435\u0442\u0441\u044F \u043C\u043D\u043E\u0433\u043E\u044D\u0442\u0430\u0436\u043D\u044B\u0439 \u0443\u0447\u0430\u0441\u0442\u043E\u043A.";
    }
    if (phase === "approach" || phase === "boarding") {
      return "\u041C\u0435\u043B\u043B\u0441\u0442\u0440\u043E\u0439 \u0441\u0430\u0434\u0438\u0442\u0441\u044F \u0432 \u043C\u0430\u0448\u0438\u043D\u0443.";
    }
    if (phase === "departure") {
      return "\u041C\u0430\u0448\u0438\u043D\u0430 \u0443\u0435\u0437\u0436\u0430\u0435\u0442 \u043E\u0442 \u0440\u0430\u0437\u0440\u0443\u0448\u0435\u043D\u043D\u043E\u0433\u043E \u0443\u0447\u0430\u0441\u0442\u043A\u0430.";
    }
    if (phase === "finished") {
      return "\u041A\u043E\u043D\u0435\u0446. \u0421\u043F\u0430\u0441\u0438\u0431\u043E \u0437\u0430 \u0438\u0433\u0440\u0443.";
    } else {
      return "\u0412\u0438\u0434 \u0441\u0432\u0435\u0440\u0445\u0443: \u043C\u0430\u0448\u0438\u043D\u0430 \u043E\u0431\u0433\u043E\u043D\u044F\u0435\u0442 \u0442\u0440\u0430\u0444\u0438\u043A \u043D\u0430 \u043D\u043E\u0447\u043D\u043E\u0439 \u0442\u0440\u0430\u0441\u0441\u0435. \u041C\u0443\u0437\u044B\u043A\u0430 \u0438 \u0444\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u0442\u0438\u0442\u0440\u044B.";
    }
  }
  var LANES = [88, 188, 288];
  var CYCLE = 18;
  var TRAFFIC = [
    [0, 0.5],
    [2, 0.5],
    [1, 4],
    [2, 4],
    [2, 7.5],
    [0, 8],
    [1, 11],
    [0, 11],
    [2, 15],
    [0, 15.5],
    [0, 17.5],
    [2, 17.5]
  ];
  var ROUTE = [
    [0, 1],
    [2, 1],
    [3, 0],
    [6, 0],
    [7, 1],
    [9, 1],
    [10, 2],
    [13, 2],
    [14, 1],
    [18, 1]
  ];
  function lanePosition(time) {
    const phase = (time % CYCLE + CYCLE) % CYCLE;
    for (let i = 1; i < ROUTE.length; i++) {
      const [end, lane] = ROUTE[i];
      if (phase > end) {
        continue;
      }
      const [start, previous] = ROUTE[i - 1];
      const fraction = (phase - start) / (end - start);
      const smooth2 = fraction * fraction * (3 - 2 * fraction);
      return LANES[previous] + (LANES[lane] - LANES[previous]) * smooth2;
    }
    return LANES[1];
  }
  function endingDriveFrame(time) {
    const drive = Math.max(0, time - ENDING.highway);
    const traffic = [];
    for (let index = 0; index < TRAFFIC.length; index++) {
      const [lane, encounter] = TRAFFIC[index];
      const cycle = Math.floor((drive - encounter) / CYCLE);
      for (let offset = 0; offset <= 1; offset++) {
        const passage = (cycle + offset) * CYCLE + encounter;
        const y = 252 + (drive - passage) * 92;
        if (y > -90 && y < 450) {
          traffic.push({
            id: `${index}:${cycle + offset}`,
            lane,
            x: LANES[lane],
            y,
            type: index % 3
          });
        }
      }
    }
    const velocityX = (lanePosition(drive + 0.025) - lanePosition(drive - 0.025)) / 0.05;
    return {
      player: {
        x: lanePosition(drive),
        y: 252,
        angle: -Math.PI / 2 + Math.atan2(velocityX, 580)
      },
      traffic,
      roadOffset: drive * 480 % 64
    };
  }
  var limit = (value) => Math.max(0, Math.min(1, value));
  var blend = (a, b, fraction) => a + (b - a) * limit(fraction);
  var smooth = (value) => {
    const t = limit(value);
    return t * t * (3 - 2 * t);
  };
  var random = (seed) => {
    const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  function rectangle(ctx, color, x, y, w, h) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  function polygon(ctx, color, points) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let index = 0; index < points.length; index++) {
      const [x, y] = points[index];
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.fill();
  }
  function text(ctx, value, x, y, size = 16, color = "#d9e6df", width = 600) {
    ctx.fillStyle = color;
    ctx.font = `600 ${size}px Exo2, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(value, x, y, width);
  }
  function nightSky(ctx, time) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 270);
    gradient.addColorStop(0, "#0b1025");
    gradient.addColorStop(0.6, "#29213c");
    gradient.addColorStop(1, "#624254");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 640, 360);
    for (let i = 0; i < 68; i++) {
      const x = random(i + 1) * 640;
      const y = random(i + 101) * 164;
      rectangle(ctx, i % 3 ? "#7294b5" : "#d4cbbd", x, y, 1, 1);
    }
    ctx.fillStyle = "#bdc8c6";
    ctx.beginPath();
    ctx.arc(548, 67, 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#182039";
    ctx.beginPath();
    ctx.arc(556, 62, 18, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 20; i++) {
      const height = 30 + random(i + 320) * 65;
      const x = i * 35 - 10;
      rectangle(ctx, "#142233", x, 223 - height, 29, height);
      for (let yy = 223 - height + 7; yy < 218; yy += 11) {
        if (random(yy + i) > 0.5) {
          rectangle(ctx, "#43616c", x + 7, yy, 3, 3);
        }
      }
    }
  }
  function station(ctx, time) {
    const collapse = smooth((time - ENDING.explosion - 0.7) / 4.4);
    rectangle(ctx, "#132735", 78, 237, 484, 20);
    rectangle(ctx, "#1e3240", 88, 58 + collapse * 176, 464, 182 * (1 - collapse));
    for (let floor = 0; floor < 6; floor++) {
      const y = 65 + floor * 28;
      const fall = collapse * (229 - y) * (0.87 + floor * 0.015);
      ctx.save();
      ctx.globalAlpha = 1 - collapse * 0.85;
      const shift = collapse * Math.sin(floor * 3.7) * 12;
      rectangle(
        ctx,
        floor % 2 ? "#334755" : "#3d4f5a",
        98 + shift,
        y + fall,
        444,
        27 * (1 - collapse * 0.65)
      );
      rectangle(ctx, "#61717a", 94 + shift, y + fall + 24, 452, 3);
      for (let window2 = 0; window2 < 13; window2++) {
        const x = 111 + window2 * 33 + shift;
        const lit = random(floor * 23 + window2) > 0.35;
        const destroyed = time > ENDING.explosion + random(floor * 13 + window2) * 1.4;
        rectangle(ctx, "#172b38", x - 2, y + 4 + fall, 24, 18);
        rectangle(
          ctx,
          destroyed ? "#ae643a" : lit ? "#89afb3" : "#284654",
          x,
          y + 5 + fall,
          20,
          14
        );
        rectangle(ctx, "#344d5a", x + 9, y + 5 + fall, 2, 14);
      }
      ctx.restore();
    }
    if (collapse < 0.8) {
      const drop = collapse * 160;
      rectangle(ctx, "#526570", 90, 44 + drop, 460, 15);
      rectangle(ctx, "#2d6682", 215, 45 + drop, 210, 14);
      text(ctx, "\u041F\u041E\u041B\u0418\u0426\u0418\u042F", 320, 57 + drop, 12, "#d9f1ed");
      rectangle(ctx, "#66747b", 300, 27 + drop, 40, 17);
      text(ctx, "\u2605", 320, 41 + drop, 15, "#9bc4d2");
      rectangle(ctx, "#0b1c29", 292, 207 + drop * 0.1, 56, 34);
      rectangle(ctx, "#5c8b9a", 298, 213 + drop * 0.1, 44, 26);
      rectangle(ctx, "#223d4c", 318, 213 + drop * 0.1, 3, 26);
    }
    rectangle(ctx, "#879297", 281, 240, 78, 4);
    rectangle(ctx, "#5b6b74", 274, 244, 92, 4);
    rectangle(ctx, "#3e505e", 267, 248, 106, 5);
    if (collapse > 0) {
      for (let i = 0; i < 75; i++) {
        const width = 3 + random(i + 62) * 15;
        const x = 90 + random(i + 10) * 460;
        const y = 235 - random(i + 50) * 24 * collapse;
        rectangle(
          ctx,
          ["#37404a", "#637078", "#232c39"][i % 3],
          x,
          y,
          width,
          4 + random(i) * 8
        );
      }
    }
  }
  function blast(ctx, time, effects) {
    const age = time - ENDING.explosion;
    if (age < 0) {
      return;
    }
    const burst = limit(age / 0.9);
    for (let i = 0; i < 17; i++) {
      const delay = random(i + 25) * 0.7;
      if (age < delay) {
        continue;
      }
      const local = age - delay;
      const x = 113 + random(i + 12) * 413;
      const y = 109 + random(i + 19) * 115;
      const radius = (24 + random(i + 44) * 35) * Math.min(1, local * 3);
      ctx.globalAlpha = Math.min(1, Math.max(0, 1 - local / 3.2));
      for (let layer = 0; layer < 3; layer++) {
        const points = [];
        const size = radius * (1 - layer * 0.28);
        for (let point = 0; point < 18; point++) {
          const angle = point / 18 * Math.PI * 2;
          const edge = size * (0.75 + random(i * 71 + point) * 0.3);
          points.push([x + Math.cos(angle) * edge, y + Math.sin(angle) * edge]);
        }
        polygon(ctx, ["#a7402b", "#e77c36", "#ffd282"][layer], points);
      }
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 100; i++) {
      const life = 1.2 + random(i + 80) * 2.4;
      const local = age - random(i + 70) * 1.2;
      if (local < 0 || local > life) {
        continue;
      }
      const direction = random(i + 31) * Math.PI * 2;
      const speed = 25 + random(i + 59) * 80;
      const x = 320 + Math.cos(direction) * speed * local;
      const y = 155 + Math.sin(direction) * speed * local + local * local * 24;
      rectangle(ctx, i % 3 ? "#f9ae58" : "#536474", x, y, i % 3 ? 2 : 4, 3);
    }
    for (let i = 0; i < 34; i++) {
      const x = 92 + random(i + 83) * 458;
      const cycle = (age + random(i + 90) * 2) % 2.3;
      const height = 8 + random(i + 91) * 34;
      polygon(ctx, i % 2 ? "#de7236" : "#edb65c", [
        [x, 240],
        [x + 4, 240 - height * (1 - cycle / 3)],
        [x + 10, 240]
      ]);
    }
    for (let i = 0; i < 24; i++) {
      const local = Math.max(0, age - random(i + 12) * 1.5);
      const x = 90 + random(i + 14) * 460 + Math.sin(local * 0.2 + i) * local * 2;
      const y = Math.max(20, 212 - local * (7 + random(i) * 7));
      ctx.globalAlpha = Math.min(0.78, local * 0.3);
      ctx.fillStyle = i % 2 ? "#242936" : "#3a3541";
      ctx.beginPath();
      ctx.arc(x, y, (20 + random(i + 33) * 26) * Math.min(1, local), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (effects && age < 0.28) {
      ctx.fillStyle = `rgba(255,208,143,${(1 - age / 0.28) * 0.5 * burst})`;
      ctx.fillRect(0, 0, 640, 360);
    }
  }
  function sprite(ctx, asset, frame, x, y, angle = 0, scale = 1) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.drawImage(
      asset.image,
      frame * asset.width,
      0,
      asset.width,
      asset.height,
      -asset.originX,
      -asset.originY,
      asset.width,
      asset.height
    );
    ctx.restore();
  }
  function hero(ctx, assets, x, y, walking, direction, time, detonator) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    const frame = walking ? Math.floor(time * 8) % 8 : 0;
    const row = direction === "left" ? 2 : 0;
    if (detonator) {
      const pose = detonatorFrame(time);
      if (walking) {
        ctx.drawImage(assets.detonator.image, pose * 60, 0, 60, 35, -39, -58, 78, 45.5);
        ctx.drawImage(
          assets.hero.image,
          frame * 60,
          row * 60 + 35,
          60,
          25,
          -39,
          -12.5,
          78,
          32.5
        );
      } else {
        ctx.drawImage(assets.detonator.image, pose * 60, 0, 60, 60, -39, -58, 78, 78);
      }
    } else {
      ctx.drawImage(assets.hero.image, frame * 60, row * 60, 60, 60, -39, -58, 78, 78);
    }
    ctx.restore();
  }
  function street(ctx, time, assets, effects) {
    nightSky(ctx, time);
    rectangle(ctx, "#293747", 0, 251, 640, 23);
    rectangle(ctx, "#43505b", 0, 270, 640, 5);
    rectangle(ctx, "#172231", 0, 275, 640, 85);
    for (let i = 0; i < 13; i++) {
      rectangle(ctx, "#69716d", i * 60 - 8, 340, 28, 2);
    }
    for (let i = 0; i < 50; i++) {
      rectangle(ctx, "#293645", random(i + 500) * 640, 280 + random(i + 600) * 80, 4, 1);
    }
    ctx.save();
    const shake = effects && time >= 9 && time < 12 ? (12 - time) * 1.5 : 0;
    ctx.translate(Math.sin(time * 59) * shake, Math.cos(time * 43) * shake);
    station(ctx, time);
    blast(ctx, time, effects);
    ctx.restore();
    const departing = smooth((time - ENDING.departure) / 3.5);
    const carX = 126 + departing * 700;
    if (time < 20.2) {
      const approach = smooth((time - ENDING.approach) / 4.4);
      const x = blend(320, 135, approach);
      const y = time < 6 ? blend(229, 276, (time - 2) / 4) : blend(276, 296, approach);
      ctx.globalAlpha = time < 19.6 ? 1 : 1 - limit((time - 19.6) / 0.6);
      hero(
        ctx,
        assets,
        x,
        y,
        time >= 2 && time < 6 || time >= 15 && time < 19,
        time >= 15 ? "left" : "down",
        time,
        time >= 2 && time < 15
      );
      ctx.globalAlpha = 1;
    }
    const carFrame = time >= 19 && time < 20.9 ? Math.min(12, Math.floor((time - 19) * 7)) : 0;
    sprite(ctx, assets.car, carFrame, carX, 308, 0, 1.08);
    if (time < 2.8) {
      ctx.globalAlpha = Math.min(1, time) * (1 - limit((time - 2) / 0.8));
      text(ctx, "\u041F\u041E\u0421\u041B\u0415\u0414\u041D\u0418\u0419 \u0412\u042B\u0425\u041E\u0414", 320, 315, 19, "#c9dce0");
      ctx.globalAlpha = 1;
    }
  }
  function highwayCar(ctx, asset, x, y, angle, scale) {
    ctx.fillStyle = "#0007";
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 5, 21, 42, 0, 0, Math.PI * 2);
    ctx.fill();
    const beam = ctx.createLinearGradient(x, y - 100, x, y - 20);
    beam.addColorStop(0, "#aec8b900");
    beam.addColorStop(1, "#aec8b92c");
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(x - 13, y - 25);
    ctx.lineTo(x - 32, y - 105);
    ctx.lineTo(x + 32, y - 105);
    ctx.lineTo(x + 13, y - 25);
    ctx.fill();
    sprite(ctx, asset, 0, x, y, angle, scale);
  }
  function highway(ctx, time, assets) {
    const drive = time - ENDING.highway;
    const frame = endingDriveFrame(time);
    rectangle(ctx, "#14262c", 0, 0, 640, 360);
    for (let i = 0; i < 40; i++) {
      const x = i % 2 ? 360 + random(i + 700) * 280 : random(i + 700) * 28 - 12;
      const y = (random(i + 730) * 500 + drive * 260) % 500 - 70;
      rectangle(ctx, "#1c3639", x, y, 18 + random(i) * 22, 42);
      rectangle(ctx, "#10242c", x + 3, y + 5, 14 + random(i) * 16, 24);
    }
    rectangle(ctx, "#2b343f", 38, 0, 300, 360);
    rectangle(ctx, "#727b7b", 31, 0, 5, 360);
    rectangle(ctx, "#727b7b", 340, 0, 5, 360);
    rectangle(ctx, "#e2d4a2", 41, 0, 2, 360);
    rectangle(ctx, "#e2d4a2", 333, 0, 2, 360);
    for (let y = frame.roadOffset - 64; y < 360; y += 64) {
      rectangle(ctx, "#c2c9c6", 137, y, 2, 29);
      rectangle(ctx, "#c2c9c6", 237, y, 2, 29);
      rectangle(ctx, "#a6b2b0", 22, y, 4, 15);
      rectangle(ctx, "#a6b2b0", 350, y, 4, 15);
      rectangle(ctx, "#f4c78b", 22, y, 3, 3);
      rectangle(ctx, "#f4c78b", 351, y, 3, 3);
    }
    for (let i = 0; i < 28; i++) {
      const x = 48 + random(i + 900) * 278;
      const y = (random(i + 901) * 440 + drive * 480) % 440 - 40;
      rectangle(ctx, "#34414d", x, y, 1, 5 + random(i) * 17);
    }
    for (const car of frame.traffic) {
      highwayCar(ctx, assets.traffic[car.type], car.x, car.y, -Math.PI / 2, 0.7);
    }
    highwayCar(ctx, assets.car, frame.player.x, frame.player.y, frame.player.angle, 1.08);
    if (time >= ENDING.credits) {
      const shade = ctx.createLinearGradient(306, 0, 640, 0);
      shade.addColorStop(0, "#0a122000");
      shade.addColorStop(0.35, "#0a1220b8");
      shade.addColorStop(1, "#0a1220ed");
      ctx.fillStyle = shade;
      ctx.fillRect(306, 0, 334, 360);
      if (time < ENDING.finished) {
        let y = 398 - (time - ENDING.credits) * 17;
        text(ctx, "MELLSTROY", 458, y, 29, "#b2dded", 290);
        y += 28;
        text(ctx, "EMERGENCY EXIT", 458, y, 14, "#a6b8c7");
        y += 72;
        for (const credit of CREDITS) {
          text(ctx, credit.title, 458, y, 12, "#7ec5e3", 286);
          y += 29;
          for (const line of credit.lines) {
            text(ctx, line, 458, y, 17, "#e5e6df", 294);
            y += 25;
          }
          y += 42;
        }
      } else {
        text(ctx, "\u0422\u042B \u0412\u042B\u0411\u0420\u0410\u041B\u0421\u042F.", 452, 157, 26, "#b2dded", 292);
        text(ctx, "\u0421\u043F\u0430\u0441\u0438\u0431\u043E \u0437\u0430 \u0438\u0433\u0440\u0443", 452, 190, 17, "#e5e6df");
      }
    }
  }
  function drawEnding(ctx, time, assets, effects = true) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#080d18";
    ctx.fillRect(0, 0, 640, 360);
    if (time < ENDING.highway) {
      const closeup = 1 + 1.6 * smooth((time - 6) / 0.65) * (1 - smooth((time - 8.15) / 0.75));
      ctx.save();
      ctx.translate(320, 180);
      ctx.scale(closeup, closeup);
      ctx.translate(-320, -(180 + (closeup - 1) * 40));
      street(ctx, time, assets, effects);
      ctx.restore();
    } else {
      highway(ctx, time, assets);
    }
    const fadeIn = 1 - limit(time / 1.2);
    const fadeOut = time < ENDING.highway ? limit((time - 24.8) / 1.2) : 1 - limit((time - ENDING.highway) / 1.2);
    ctx.fillStyle = `rgba(4,8,16,${Math.max(fadeIn, fadeOut)})`;
    ctx.fillRect(0, 0, 640, 360);
    rectangle(ctx, "#050a12", 0, 0, 640, 19);
    rectangle(ctx, "#050a12", 0, 341, 640, 19);
    ctx.restore();
  }
  function endingSprites(images, skins, manifest) {
    const custom = (name) => ({
      ...skins[name],
      image: images.get("custom-" + name)
    });
    const original = (name) => ({
      ...manifest.sprites[name],
      image: images.get(name)
    });
    return {
      hero: custom("heroDirectional"),
      detonator: custom("heroDetonator"),
      car: custom("endingCar"),
      traffic: ["sprBossCar1", "sprBossCar2", "sprCopCar"].map(original)
    };
  }
  var EndingPlayer = class {
    constructor(root, sprites, audio, settings, onClose) {
      this.root = root;
      this.sprites = sprites;
      this.audio = audio;
      this.settings = settings;
      this.onClose = onClose;
      this.time = 0;
      this.disposed = false;
      this.musicStarted = false;
      this.played =  new Set();
      this.listeners = new AbortController();
      this.canvas = root.querySelector("canvas");
      this.ctx = this.canvas.getContext("2d");
      this.caption = root.querySelector("[data-ending-caption]");
      this.skip = root.querySelector("[data-ending-skip]");
      this.close = root.querySelector("[data-ending-close]");
      this.skip.hidden = false;
      this.skip.addEventListener("click", () => this.skipToCredits(), {
        signal: this.listeners.signal
      });
      this.close.addEventListener("click", () => this.finish(), {
        signal: this.listeners.signal
      });
      document.addEventListener(
        "keydown",
        (event) => {
          if (event.repeat || !["Escape", "Space", "Enter"].includes(event.code)) {
            return;
          }
          event.preventDefault();
          event.stopImmediatePropagation();
          if (event.code === "Escape") {
            this.finish();
          } else if (event.target === this.close) {
            this.finish();
          } else if (this.time >= ENDING.credits) {
            this.finish();
          } else {
            this.skipToCredits();
          }
        },
        { capture: true, signal: this.listeners.signal }
      );
      document.addEventListener(
        "visibilitychange",
        () => {
          this.lastFrame = null;
          this.audio.active = !document.hidden && this.musicStarted;
        },
        { signal: this.listeners.signal }
      );
      this.audio.start();
      this.audio.active = false;
      root.classList.remove("hidden");
      document.body.classList.add("ending-active");
      this.skip.focus({ preventScroll: true });
      this.render();
      this.frame = requestAnimationFrame((now) => this.animate(now));
    }
    animate(now) {
      if (this.disposed) {
        return;
      }
      const dt = this.lastFrame === null || this.lastFrame === void 0 ? 0 : Math.min(0.1, (now - this.lastFrame) / 1e3);
      this.lastFrame = now;
      if (!document.hidden) {
        this.advance(dt);
      }
      this.render();
      this.frame = requestAnimationFrame((next) => this.animate(next));
    }
    advance(dt) {
      const previous = this.time;
      this.time += dt;
      for (const [time, sound] of [
        [2.1, "door"],
        [7.7, "detonator"],
        [9, "explosion"],
        [19.3, "door"],
        [21, "engine"]
      ]) {
        if (previous < time && this.time >= time && !this.played.has(time)) {
          this.played.add(time);
          this.audio.cinematicSound(sound);
        }
      }
      if (this.time >= ENDING.highway && !this.musicStarted) {
        this.musicStarted = true;
        this.audio.startEndingMusic();
      }
    }
    render() {
      const effects = this.settings.effects && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      drawEnding(this.ctx, this.time, this.sprites, effects);
      const phase = endingPhase(this.time);
      if (phase !== this.phase) {
        this.phase = phase;
        this.root.dataset.phase = phase;
        this.caption.textContent = endingCaption(this.time);
        const focused = document.activeElement === this.skip;
        this.skip.hidden = this.time >= ENDING.credits;
        if (this.skip.hidden && focused) {
          this.close.focus({ preventScroll: true });
        }
      }
    }
    skipToCredits() {
      if (this.time >= ENDING.credits) {
        return;
      }
      this.audio.stopCinematicSounds();
      this.time = ENDING.credits;
      this.lastFrame = null;
      this.advance(0);
      this.render();
    }
    finish() {
      if (this.disposed) {
        return;
      }
      this.dispose();
      this.onClose();
    }
    dispose() {
      if (this.disposed) {
        return;
      }
      this.disposed = true;
      cancelAnimationFrame(this.frame);
      this.listeners.abort();
      this.audio.stopCinematicSounds();
      this.audio.stopEndingMusic();
      this.root.classList.add("hidden");
      document.body.classList.remove("ending-active");
    }
  };
  function completeCampaign(progress) {
    var _a;
    const best = { ...progress.best };
    for (const chapter of CHAPTERS) {
      if (!Number.isFinite((_a = best[chapter.index]) == null ? void 0 : _a.score)) {
        best[chapter.index] = { score: 0, grade: "C", time: 0 };
      }
    }
    return {
      ...progress,
      best,
      unlocked: CHAPTERS.length - 1,
      last: CHAPTERS.length - 1
    };
  }
  function clearLocation(sim) {
    sim.tutorial = null;
    for (const enemy of sim.enemies) {
      sim.kill(enemy, "cheat");
    }
    sim.bullets = sim.bullets.filter((bullet) => bullet.team === "player");
    sim.checkClear();
  }
  var CheatConsole = class {
    constructor(app2, persist) {
      this.app = app2;
      this.persist = persist;
      this.flags = { god: false };
      this.root = document.getElementById("cheat-console");
      this.input = this.root.querySelector("input");
      this.output = this.root.querySelector("[data-cheat-output]");
      this.history = [];
      this.historyIndex = 0;
      this.lines = ["\u041A\u043E\u043D\u0441\u043E\u043B\u044C. help \u2014 \u0441\u043F\u0438\u0441\u043E\u043A \u043A\u043E\u043C\u0430\u043D\u0434. F2 / \u0401 / Esc \u2014 \u0437\u0430\u043A\u0440\u044B\u0442\u044C."];
      this.output.textContent = this.lines[0];
      this.root.querySelector("form").addEventListener("submit", (event) => {
        event.preventDefault();
        this.submit();
      });
      this.root.querySelector("[data-cheat-close]").onclick = () => this.close();
      document.addEventListener("keydown", (event) => this.keydown(event), true);
      document.addEventListener(
        "keyup",
        (event) => {
          if (this.opened) {
            event.stopImmediatePropagation();
          }
        },
        true
      );
    }
    keydown(event) {
      if (["F2", "Backquote"].includes(event.code)) {
        if (!this.opened && ["loading", "ending"].includes(this.app.mode)) {
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!event.repeat) {
          this.opened ? this.close() : this.open();
        }
        return;
      }
      if (!this.opened) {
        return;
      }
      event.stopImmediatePropagation();
      if (event.code === "Tab") {
        event.preventDefault();
        const controls = [...this.root.querySelectorAll("button, input")];
        const index = controls.indexOf(document.activeElement);
        const next = (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
        controls[next].focus({ preventScroll: true });
      } else if (event.code === "Escape") {
        event.preventDefault();
        this.close();
      } else if (event.code === "Enter" && event.target === this.input) {
        event.preventDefault();
        if (!event.repeat) {
          this.submit();
        }
      } else if (["ArrowUp", "ArrowDown"].includes(event.code) && event.target === this.input) {
        event.preventDefault();
        this.historyIndex = Math.max(
          0,
          Math.min(
            this.history.length,
            this.historyIndex + (event.code === "ArrowUp" ? -1 : 1)
          )
        );
        this.input.value = this.history[this.historyIndex] ?? "";
      }
    }
    open() {
      var _a;
      if (this.opened || !this.app.view) {
        return;
      }
      this.previousMode = this.app.mode;
      this.previousPanel = ((_a = document.querySelector(".overlay:not(.hidden)")) == null ? void 0 : _a.id) ?? null;
      this.app.mode = "console";
      this.app.menuNavigation.show(null);
      this.app.view.input.keyboard.enabled = false;
      this.app.view.input.keyboard.resetKeys();
      this.app.view.pending = {};
      Object.assign(this.app.view.controls, {
        moveX: 0,
        moveY: 0,
        attack: false
      });
      document.getElementById("touch-controls").classList.add("hidden");
      this.opened = true;
      this.root.classList.remove("hidden");
      this.input.value = "";
      this.input.focus({ preventScroll: true });
    }
    close() {
      if (!this.opened) {
        return;
      }
      this.opened = false;
      this.root.classList.add("hidden");
      this.input.blur();
      if (this.returnToMenu) {
        this.returnToMenu = false;
        this.app.menu();
      } else {
        this.app.mode = this.previousMode;
        this.app.overlay(this.previousPanel);
      }
    }
    log(text2) {
      this.lines.push(text2);
      this.lines = this.lines.slice(-30);
      this.output.textContent = this.lines.join("\n");
      this.output.scrollTop = this.output.scrollHeight;
    }
    submit() {
      const line = this.input.value.trim();
      this.input.value = "";
      if (!line) {
        return;
      }
      this.history.push(line);
      this.history = this.history.slice(-30);
      this.historyIndex = this.history.length;
      this.log("> " + line);
      this.log(this.execute(line));
      if (this.opened) {
        this.input.focus({ preventScroll: true });
      }
    }
    execute(line) {
      const [command, argument, ...extra] = line.toLowerCase().trim().split(/\s+/);
      if (command === "help" && !argument) {
        return "god [on/off] \u2014 \u043D\u0435\u0443\u044F\u0437\u0432\u0438\u043C\u043E\u0441\u0442\u044C\nclear \u2014 \u0437\u0430\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u0442\u0435\u043A\u0443\u0449\u0443\u044E \u043B\u043E\u043A\u0430\u0446\u0438\u044E\nwin \u2014 \u043F\u0440\u043E\u0439\u0442\u0438 \u0442\u0435\u043A\u0443\u0449\u0443\u044E \u043B\u043E\u043A\u0430\u0446\u0438\u044E \u0438 \u043F\u0435\u0440\u0435\u0439\u0442\u0438 \u0434\u0430\u043B\u044C\u0448\u0435\nwinall \u2014 \u043F\u0440\u043E\u0439\u0442\u0438 \u0432\u0441\u044E \u043A\u0430\u043C\u043F\u0430\u043D\u0438\u044E \u0438 \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0444\u0438\u043D\u0430\u043B\nfinale \u2014 \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u043E\u0442\u043A\u0440\u044B\u0442\u044B\u0439 \u0444\u0438\u043D\u0430\u043B";
      }
      if (command === "god") {
        if (extra.length || argument && !["on", "off"].includes(argument)) {
          return "\u0424\u043E\u0440\u043C\u0430\u0442: god, god on \u0438\u043B\u0438 god off";
        }
        this.flags.god = argument ? argument === "on" : !this.flags.god;
        if (this.app.sim) {
          this.app.sim.cheats = this.flags;
        }
        return "\u041D\u0435\u0443\u044F\u0437\u0432\u0438\u043C\u043E\u0441\u0442\u044C: " + (this.flags.god ? "\u0412\u041A\u041B" : "\u0412\u042B\u041A\u041B");
      }
      if (argument) {
        return "\u041B\u0438\u0448\u043D\u0438\u0435 \u0430\u0440\u0433\u0443\u043C\u0435\u043D\u0442\u044B. help \u2014 \u0441\u043F\u0438\u0441\u043E\u043A \u043A\u043E\u043C\u0430\u043D\u0434.";
      }
      if (command === "winall") {
        this.app.progress = completeCampaign(this.app.progress);
        this.persist();
        this.returnToMenu = true;
        return "\u0412\u0441\u0435 22 \u0443\u0440\u043E\u0432\u043D\u044F \u043F\u0440\u043E\u0439\u0434\u0435\u043D\u044B. \u041F\u0440\u043E\u0433\u0440\u0435\u0441\u0441 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D. \u0417\u0430\u043A\u0440\u043E\u0439 \u043A\u043E\u043D\u0441\u043E\u043B\u044C \u2014 \u0444\u0438\u043D\u0430\u043B \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0432 \u043C\u0435\u043D\u044E.";
      }
      if (command === "finale") {
        if (!endingUnlocked(this.app.progress)) {
          return "\u0424\u0438\u043D\u0430\u043B \u0435\u0449\u0451 \u0437\u0430\u043A\u0440\u044B\u0442. \u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u0440\u043E\u0439\u0434\u0438 \u0432\u0441\u0435 \u0443\u0440\u043E\u0432\u043D\u0438 \u0438\u043B\u0438 \u0432\u0432\u0435\u0434\u0438 winall.";
        }
        this.close();
        this.app.showEnding();
        return "\u0424\u0438\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u043A\u0430\u0442\u0441\u0446\u0435\u043D\u0430.";
      }
      if (["clear", "win"].includes(command)) {
        const sim = this.app.sim;
        if (!["playing", "paused"].includes(this.previousMode) || !(sim == null ? void 0 : sim.player.alive)) {
          return "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u043F\u0443\u0441\u0442\u0438 \u0443\u0440\u043E\u0432\u0435\u043D\u044C.";
        }
        clearLocation(sim);
        if (command === "win") {
          this.returnToMenu = false;
          this.close();
          sim.status = "complete";
          this.app.complete();
          return "\u041B\u043E\u043A\u0430\u0446\u0438\u044F \u043F\u0440\u043E\u0439\u0434\u0435\u043D\u0430.";
        }
        return "\u041B\u043E\u043A\u0430\u0446\u0438\u044F \u0437\u0430\u0447\u0438\u0449\u0435\u043D\u0430. \u0412\u044B\u0445\u043E\u0434 \u043E\u0442\u043A\u0440\u044B\u0442.";
      }
      return "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u0430. help \u2014 \u0441\u043F\u0438\u0441\u043E\u043A \u043A\u043E\u043C\u0430\u043D\u0434.";
    }
  };
  var elementById = (id) => document.getElementById(id);
  function onClick(ids, action) {
    for (const id of ids) {
      elementById(id).onclick = action;
    }
  }
  function updateHUD(app2) {
    var _a, _b;
    const tutorial = (_a = app2.sim) == null ? void 0 : _a.tutorial;
    const panel = elementById("tutorial");
    panel.classList.toggle("hidden", !tutorial || app2.mode !== "playing");
    if (tutorial) {
      const hint = tutorial.hint;
      elementById("tutorial-progress").textContent = `\u041E\u0411\u0423\u0427\u0415\u041D\u0418\u0415 ${hint.number} / ${hint.total}`;
      elementById("tutorial-title").textContent = hint.title;
      elementById("tutorial-text").textContent = hint.text;
      elementById("tutorial-keys").textContent = tutorial.step === "move" ? ["W", "A", "S", "D"].map((key) => hint.directions.includes(key) ? key + " +" : key).join("   ") : "";
    }
    const sim = app2.sim;
    if (!sim) {
      return;
    }
    elementById("hud-number").textContent = app2.chapter.number + " /";
    elementById("hud-title").textContent = app2.chapter.title;
    elementById("hud-floor").textContent = `\u041B\u041E\u041A\u0410\u0426\u0418\u042F ${app2.floorIndex + 1} / ${app2.chapter.rooms.length} \xB7 ${((_b = sim.room.design) == null ? void 0 : _b.title) ?? app2.profile.name}`;
    elementById("hud-enemies").textContent = sim.cleared ? "\u041F\u0415\u0420\u0418\u041C\u0415\u0422\u0420 \u0427\u0418\u0421\u0422" : `${sim.total - sim.kills} / ${sim.total} \u041D\u0410 \u041F\u0415\u0420\u0418\u041C\u0415\u0422\u0420\u0415`;
    elementById("hud-score").textContent = (app2.runScore + sim.score).toLocaleString(
      "ru-RU"
    );
    elementById("weapon-name").textContent = sim.player.weapon.name.toUpperCase();
    elementById("ammo").textContent = sim.player.weapon.gun ? String(sim.player.ammo).padStart(2, "0") : "";
    elementById("context").textContent = sim.context;
    elementById("combo").classList.toggle(
      "hidden",
      sim.combo < 2 || app2.mode !== "playing"
    );
    elementById("combo").textContent = sim.combo + "x COMBO";
  }
  function renderChapters(app2) {
    const list = elementById("chapter-list");
    list.replaceChildren();
    for (const chapter of CHAPTERS) {
      const button = document.createElement("button");
      const best = app2.progress.best[chapter.index];
      const number = document.createElement("span");
      number.className = "number";
      number.textContent = chapter.number;
      const text2 = document.createElement("span");
      const strong = document.createElement("strong");
      const small = document.createElement("small");
      strong.textContent = chapter.title;
      small.textContent = chapter.rooms.length + " \u041B\u041E\u041A\u0410\u0426\u0418\u0418" + (chapter.index > app2.progress.unlocked ? " \xB7 \u0415\u0429\u0401 \u041D\u0415 \u041F\u0420\u041E\u0419\u0414\u0415\u041D\u0410" : "");
      text2.append(strong, small);
      button.append(number, text2);
      if (best) {
        const grade = document.createElement("span");
        grade.className = "grade";
        grade.textContent = best.grade;
        button.append(grade);
      }
      button.addEventListener("click", () => app2.briefing(chapter.index));
      list.append(button);
    }
  }
  function bindUI(app2, saveProgress) {
    app2.cheats = new CheatConsole(app2, saveProgress);
    app2.menuNavigation = new MenuNavigation();
    elementById("continue").textContent = app2.progress.unlocked ? "\u041F\u0420\u041E\u0414\u041E\u041B\u0416\u0418\u0422\u042C \u041F\u041E\u0411\u0415\u0413" : "\u041D\u0410\u0427\u0410\u0422\u042C \u041F\u041E\u0411\u0415\u0413";
    elementById("continue").onclick = () => {
      app2.audio.start();
      app2.briefing(app2.progress.last ?? 0);
    };
    elementById("deploy").onclick = () => app2.start();
    elementById("ending-button").onclick = () => app2.showEnding();
    elementById("chapters-button").onclick = () => {
      app2.mode = "chapters";
      app2.renderChapters();
      app2.overlay("chapter-panel");
    };
    for (const button of document.querySelectorAll(".back")) {
      button.onclick = () => app2.menu();
    }
    onClick(["pause-button", "resume"], () => app2.togglePause());
    onClick(["restart", "retry"], () => app2.restart());
    onClick(["to-menu", "death-menu", "result-menu"], () => app2.menu());
    elementById("result-retry").onclick = () => {
      app2.resetRun();
      app2.load(app2.chapter.rooms[0]);
    };
    elementById("next").onclick = () => {
      if (app2.chapter.index === CHAPTERS.length - 1) {
        app2.menu();
      } else {
        app2.briefing(app2.chapter.index + 1);
      }
    };
    onClick(["settings-button", "pause-settings"], () => app2.showSettings());
    elementById("settings-back").onclick = () => {
      app2.mode = app2.settingsFrom;
      if (app2.mode === "paused") {
        app2.overlay("pause");
      } else {
        app2.menu();
      }
    };
    for (const [id, key] of [
      ["sound-volume", "sound"],
      ["music-volume", "music"]
    ]) {
      elementById(id).value = app2.settings[key];
      elementById(id).oninput = () => {
        app2.settings[key] = Number(elementById(id).value);
        app2.audio.start();
        app2.applySettings();
      };
    }
    for (const key of ["effects", "crt"]) {
      elementById(key).checked = app2.settings[key];
      elementById(key).onchange = () => {
        app2.settings[key] = elementById(key).checked;
        app2.applySettings();
      };
    }
    elementById("fullscreen").onclick = () => {
      var _a, _b, _c;
      if (!document.fullscreenElement) {
        (_b = (_a = document.documentElement).requestFullscreen) == null ? void 0 : _b.call(_a);
      } else {
        (_c = document.exitFullscreen) == null ? void 0 : _c.call(document);
      }
    };
    window.addEventListener("blur", () => {
      if (app2.mode === "playing") {
        app2.togglePause();
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && app2.mode === "playing") {
        app2.togglePause();
      }
    });
    touchInput(app2);
  }
  function touchInput(app2) {
    const pad = elementById("move-pad");
    const stick = pad.querySelector("i");
    let touch = null;
    pad.onpointerdown = (event) => {
      touch = event.pointerId;
      pad.setPointerCapture(touch);
      app2.audio.start();
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
      app2.view.controls.moveX = dx / length;
      app2.view.controls.moveY = dy / length;
      stick.style.transform = `translate(${dx / length * 35}px,${dy / length * 35}px)`;
    }
    const end = () => {
      touch = null;
      app2.view.controls.moveX = 0;
      app2.view.controls.moveY = 0;
      stick.style.transform = "";
    };
    pad.onpointerup = end;
    pad.onpointercancel = end;
    for (const button of document.querySelectorAll("[data-action]")) {
      button.onpointerdown = (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        const action = button.dataset.action;
        if (action === "attack") {
          app2.view.controls.attack = true;
        } else {
          app2.view.pending[action] = true;
        }
      };
      button.onpointerup = () => app2.view.controls.attack = false;
      button.onpointercancel = () => app2.view.controls.attack = false;
    }
  }
  var panels = ["menu", "pause", "briefing", "chapter-panel"];
  var MenuNavigation = class {
    constructor() {
      this.panel = null;
      this.index = 0;
      document.addEventListener("keydown", (event) => this.keydown(event), true);
      for (const panel of panels) {
        const track = (event) => {
          const button = event.target.closest("button");
          if (button && this.buttons.includes(button)) {
            this.select(this.buttons.indexOf(button), false);
          }
        };
        const element = document.getElementById(panel);
        element.addEventListener("pointerover", track);
        element.addEventListener("focusin", track);
      }
    }
    get buttons() {
      if (!this.panel) {
        return [];
      }
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
      buttons.forEach(
        (button, i) => button.classList.toggle("menu-selected", i === this.index)
      );
      if (focus) {
        buttons[this.index].focus({
          preventScroll: true
        });
      }
      if (focus && this.panel.id === "chapter-panel") {
        buttons[this.index].scrollIntoView({
          block: "nearest"
        });
      }
    }
    keydown(event) {
      var _a;
      if (!this.panel || this.panel.classList.contains("hidden")) {
        return;
      }
      if (event.target.matches("select, input")) {
        return;
      }
      const direction = {
        KeyW: -1,
        ArrowUp: -1,
        KeyS: 1,
        ArrowDown: 1
      }[event.code];
      if (!direction && event.code !== "Enter" && event.code !== "NumpadEnter") {
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
        (_a = this.buttons[this.index]) == null ? void 0 : _a.click();
      }
    }
  };
  var Phaser2 = globalThis.Phaser;
  var elementById2 = (id) => document.getElementById(id);
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
      for (const name of overlays) {
        elementById2(name).classList.toggle("hidden", name !== id);
      }
      (_a = this.menuNavigation) == null ? void 0 : _a.show(id);
      if ((_b = this.view) == null ? void 0 : _b.input.keyboard) {
        this.view.input.keyboard.enabled = ["playing", "paused", "dead"].includes(
          this.mode
        );
      }
      (_d = (_c = this.view) == null ? void 0 : _c.input.keyboard) == null ? void 0 : _d.resetKeys();
      const playing = ["playing", "paused", "dead", "result"].includes(this.mode);
      elementById2("hud").classList.toggle("hidden", !playing);
      if (id || this.mode !== "playing") {
        elementById2("tutorial").classList.add("hidden");
      }
      elementById2("weapon-hud").classList.toggle("hidden", !playing);
      elementById2("touch-controls").classList.toggle(
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
        elementById2("loading").classList.add("hidden");
        this.menu();
      } catch (error) {
        this.fail(error);
      }
    },
    fail(error) {
      elementById2("loading").classList.remove("hidden");
      elementById2("load-label").textContent = error.message;
      console.error(error);
    },
    async load(id, carry = null, reuse = false) {
      this.mode = "loading";
      this.overlay(null);
      elementById2("loading").classList.remove("hidden");
      elementById2("load-label").textContent = "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 " + id + "\u2026";
      elementById2("load-progress").style.width = "70%";
      try {
        const raw = await this.room(id);
        const sim = reuse && this.floorStates.has(id) ? this.floorStates.get(id) : new Simulation(this.manifest, raw, this.profile);
        if (this.cheats) {
          sim.cheats = this.cheats.flags;
        }
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
        if (id === "eeTraining") {
          sim.tutorial = new Tutorial(sim);
        }
        sim.status = "playing";
        sim.player.alive = true;
        sim.grace = 0.6;
        if (!reuse || !this.checkpoints.has(id)) {
          this.checkpoints.set(id, {
            weapon: sim.player.weapon,
            ammo: sim.player.ammo,
            armor: sim.player.armor
          });
        }
        this.floorStates.set(id, sim);
        this.configureExit(sim);
        await this.view.setWorld(sim);
        this.sim = sim;
        this.mode = "playing";
        this.overlay(null);
        elementById2("loading").classList.add("hidden");
        this.audio.start();
        this.updateHUD();
        if (!sim.tutorial) {
          this.toast(sim.total ? `\u041F\u0415\u0420\u0418\u041C\u0415\u0422\u0420: ${sim.total} \u041F\u0420\u041E\u0422\u0418\u0412\u041D\u0418\u041A\u041E\u0412` : "\u041D\u0410\u0419\u0414\u0418 \u0412\u042B\u0425\u041E\u0414");
        }
      } catch (error) {
        this.fail(error);
      }
    },
    briefing(index) {
      this.chapter = CHAPTERS[index];
      this.mode = "briefing";
      this.overlay("briefing");
      elementById2("brief-number").textContent = "\u0413\u041B\u0410\u0412\u0410 " + this.chapter.number + " / \u041F\u041E\u0411\u0415\u0413 \u0418\u0417 \u0413\u041E\u0420\u041E\u0414\u0410";
      elementById2("brief-title").textContent = this.chapter.title;
      elementById2("brief-text").textContent = this.chapter.brief;
      elementById2("profile").disabled = index === 0;
      if (index === 0) {
        elementById2("profile").value = PROFILES[0].id;
      }
      elementById2("deploy").textContent = index === 0 ? "\u041D\u0410\u0427\u0410\u0422\u042C \u041E\u0411\u0423\u0427\u0415\u041D\u0418\u0415" : "\u041D\u0410\u0427\u0410\u0422\u042C \u0413\u041B\u0410\u0412\u0423";
    },
    start() {
      this.profile = PROFILES.find((p) => p.id === elementById2("profile").value) ?? PROFILES[0];
      if (this.chapter.index === 0) {
        this.profile = PROFILES[0];
      }
      this.resetRun();
      this.deaths = 0;
      this.progress.last = this.chapter.index;
      save("emergency-exit-progress", this.progress);
      this.load(this.chapter.rooms[0]);
    },
    resetRun() {
      this.floorIndex = 0;
      this.runScore = 0;
      this.runTime = 0;
      this.floorStates.clear();
      this.checkpoints.clear();
    },
    restart() {
      if (!this.sim) {
        return;
      }
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
    showEnding() {
      if (!endingUnlocked(this.progress) || this.ending) {
        return false;
      }
      this.mode = "ending";
      this.overlay(null);
      elementById2("combo").classList.add("hidden");
      clearTimeout(this.toastTimer);
      elementById2("toast").style.opacity = "0";
      this.ending = new EndingPlayer(
        elementById2("ending"),
        endingSprites(this.view.images, this.skins, this.manifest),
        this.audio,
        this.settings,
        () => {
          this.ending = null;
          this.menu();
        }
      );
      return true;
    },
    menu() {
      this.mode = "menu";
      this.overlay("menu");
      elementById2("ending-button").hidden = !endingUnlocked(this.progress);
      elementById2("continue").textContent = this.progress.unlocked ? "\u041F\u0420\u041E\u0414\u041E\u041B\u0416\u0418\u0422\u042C \u041F\u041E\u0411\u0415\u0413" : "\u041D\u0410\u0427\u0410\u0422\u042C \u041F\u041E\u0411\u0415\u0413";
      elementById2("combo").classList.add("hidden");
      clearTimeout(this.toastTimer);
      elementById2("toast").style.opacity = "0";
      elementById2("toast").textContent = "";
      if (this.view) {
        this.view.preview = true;
      }
      this.audio.active = true;
      this.renderChapters();
    },
    onEvent(event) {
      if (event.type === "death") {
        this.mode = "dead";
        this.overlay("death");
        this.audio.active = false;
        elementById2("combo").classList.add("hidden");
      }
      if (event.type === "clear" && !this.sim.tutorial) {
        this.toast("\u041F\u0415\u0420\u0418\u041C\u0415\u0422\u0420 \u0427\u0418\u0421\u0422 \xB7 \u041A \u0412\u042B\u0425\u041E\u0414\u0423");
      }
      if (event.type === "complete") {
        this.complete();
      }
    },
    configureExit(sim) {
      const next = this.chapter.rooms[this.floorIndex + 1];
      sim.exit = sim.exits.find(
        (exit) => next ? connectsTo(exit, next) : exit.transition === "door"
      ) ?? sim.exit;
    },
    complete() {
      this.floorStates.set(this.sim.room.id, this.sim);
      if (this.floorIndex + 1 < this.chapter.rooms.length) {
        const carry = {
          weapon: this.sim.player.weapon,
          ammo: this.sim.player.ammo,
          armor: this.sim.player.armor,
          from: this.sim.room.id
        };
        this.floorIndex += 1;
        this.runScore = [...this.floorStates.entries()].filter(([id]) => id !== this.chapter.rooms[this.floorIndex]).reduce((n, [, s]) => n + s.score, 0);
        this.load(this.chapter.rooms[this.floorIndex], carry, true);
        return;
      }
      this.runScore = [...this.floorStates.values()].reduce((n, s) => n + s.score, 0);
      this.runTime = [...this.floorStates.values()].reduce((n, s) => n + s.elapsed, 0);
      this.mode = "result";
      this.overlay("result");
      elementById2("combo").classList.add("hidden");
      const base = [...this.floorStates.values()].reduce(
        (total, floor) => total + floor.total * 400,
        0
      );
      const grade = gradeFor(this.runScore, base);
      elementById2("result-score").textContent = this.runScore.toLocaleString("ru-RU");
      elementById2("result-time").textContent = this.runTime.toFixed(1) + "s";
      elementById2("result-grade").textContent = grade;
      elementById2("result-title").textContent = this.chapter.index === 15 ? "\u0413\u041E\u0420\u041E\u0414 \u041F\u041E\u0417\u0410\u0414\u0418." : "\u0427\u0418\u0421\u0422\u041E.";
      this.progress.unlocked = Math.max(
        this.progress.unlocked,
        Math.min(CHAPTERS.length - 1, this.chapter.index + 1)
      );
      const best = this.progress.best[this.chapter.index];
      if (!best || best.score < this.runScore) {
        this.progress.best[this.chapter.index] = {
          score: this.runScore,
          grade,
          time: this.runTime
        };
      }
      this.progress.last = Math.min(CHAPTERS.length - 1, this.chapter.index + 1);
      save("emergency-exit-progress", this.progress);
      elementById2("next").textContent = this.chapter.index === CHAPTERS.length - 1 ? "\u0417\u0410\u0412\u0415\u0420\u0428\u0418\u0422\u042C \u041F\u041E\u0411\u0415\u0413" : "\u0421\u041B\u0415\u0414\u0423\u042E\u0429\u0410\u042F \u0413\u041B\u0410\u0412\u0410";
      if (this.chapter.index === CHAPTERS.length - 1 && endingUnlocked(this.progress)) {
        this.showEnding();
      }
    },
    updateHUD() {
      updateHUD(this);
    },
    toast(text2) {
      elementById2("toast").textContent = text2;
      elementById2("toast").style.opacity = "1";
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => elementById2("toast").style.opacity = "0", 2800);
    },
    renderChapters() {
      renderChapters(this);
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
  function gradeFor(score, base) {
    if (score > base * 2.5) {
      return "A+";
    }
    if (score > base * 1.6) {
      return "A";
    }
    if (score > base) {
      return "B";
    }
    return "C";
  }
  async function boot() {
    try {
      [app.manifest, app.skins] = await Promise.all([
        readJson("/assets/manifest.json"),
        readJson("/assets/custom/skins.json")
      ]);
      app.audio = new AudioEngine(app.manifest, app.settings);
      app.applySettings();
      for (const profile of PROFILES) {
        const option = document.createElement("option");
        option.value = profile.id;
        option.textContent = profile.name + " \u2014 " + profile.tag;
        elementById2("profile").append(option);
      }
      app.renderChapters();
      elementById2("load-progress").style.width = "35%";
      const scene = new GameView();
      scene.app = app;
      app.game = new Phaser2.Game({
        type: Phaser2.CANVAS,
        parent: "game",
        backgroundColor: "#130d21",
        antialias: false,
        pixelArt: true,
        roundPixels: true,
        scale: {
          mode: Phaser2.Scale.RESIZE,
          width: window.innerWidth,
          height: window.innerHeight
        },
        scene: [scene],
        audio: {
          noAudio: true
        },
        input: {
          activePointers: 3
        },
        fps: {
          target: 60,
          forceSetTimeOut: false
        }
      });
      bindUI(app, () => save("emergency-exit-progress", app.progress));
      window.__GAME__ = {
        getState: () => {
          var _a;
          return ((_a = app.sim) == null ? void 0 : _a.snapshot()) ?? {
            status: app.mode
          };
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
  boot();
})();
