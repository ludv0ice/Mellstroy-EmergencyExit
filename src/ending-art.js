import { CREDITS, ENDING, detonatorFrame } from './ending-sequence.js';
import { endingDriveFrame } from './ending-drive.js';

const limit = (value) => Math.max(0, Math.min(1, value));
const blend = (a, b, fraction) => a + (b - a) * limit(fraction);
const smooth = (value) => {
  const t = limit(value);
  return t * t * (3 - 2 * t);
};
const random = (seed) => {
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
  points.forEach(([x, y], index) =>
    index ? ctx.lineTo(x, y) : ctx.moveTo(x, y),
  );
  ctx.closePath();
  ctx.fill();
}

function text(ctx, value, x, y, size = 16, color = '#d9e6df', width = 600) {
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px Exo2, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(value, x, y, width);
}

function nightSky(ctx, time) {
  const gradient = ctx.createLinearGradient(0, 0, 0, 270);
  gradient.addColorStop(0, '#0b1025');
  gradient.addColorStop(0.6, '#29213c');
  gradient.addColorStop(1, '#624254');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 640, 360);
  for (let i = 0; i < 68; i++) {
    const x = random(i + 1) * 640;
    const y = random(i + 101) * 164;
    rectangle(ctx, i % 3 ? '#7294b5' : '#d4cbbd', x, y, 1, 1);
  }
  ctx.fillStyle = '#bdc8c6';
  ctx.beginPath();
  ctx.arc(548, 67, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#182039';
  ctx.beginPath();
  ctx.arc(556, 62, 18, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 20; i++) {
    const height = 30 + random(i + 320) * 65;
    const x = i * 35 - 10;
    rectangle(ctx, '#142233', x, 223 - height, 29, height);
    for (let yy = 223 - height + 7; yy < 218; yy += 11)
      if (random(yy + i) > 0.5) rectangle(ctx, '#43616c', x + 7, yy, 3, 3);
  }
}

function station(ctx, time) {
  const collapse = smooth((time - ENDING.explosion - 0.7) / 4.4);
  rectangle(ctx, '#132735', 78, 237, 484, 20);
  rectangle(ctx, '#1e3240', 88, 58 + collapse * 176, 464, 182 * (1 - collapse));
  for (let floor = 0; floor < 6; floor++) {
    const y = 65 + floor * 28;
    const fall = collapse * (229 - y) * (0.87 + floor * 0.015);
    ctx.save();
    ctx.globalAlpha = 1 - collapse * 0.85;
    const shift = collapse * Math.sin(floor * 3.7) * 12;
    rectangle(
      ctx,
      floor % 2 ? '#334755' : '#3d4f5a',
      98 + shift,
      y + fall,
      444,
      27 * (1 - collapse * 0.65),
    );
    rectangle(ctx, '#61717a', 94 + shift, y + fall + 24, 452, 3);
    for (let window = 0; window < 13; window++) {
      const x = 111 + window * 33 + shift;
      const lit = random(floor * 23 + window) > 0.35;
      const destroyed =
        time > ENDING.explosion + random(floor * 13 + window) * 1.4;
      rectangle(ctx, '#172b38', x - 2, y + 4 + fall, 24, 18);
      rectangle(
        ctx,
        destroyed ? '#ae643a' : lit ? '#89afb3' : '#284654',
        x,
        y + 5 + fall,
        20,
        14,
      );
      rectangle(ctx, '#344d5a', x + 9, y + 5 + fall, 2, 14);
    }
    ctx.restore();
  }
  if (collapse < 0.8) {
    const drop = collapse * 160;
    rectangle(ctx, '#526570', 90, 44 + drop, 460, 15);
    rectangle(ctx, '#2d6682', 215, 45 + drop, 210, 14);
    text(ctx, 'ПОЛИЦИЯ', 320, 57 + drop, 12, '#d9f1ed');
    rectangle(ctx, '#66747b', 300, 27 + drop, 40, 17);
    text(ctx, '★', 320, 41 + drop, 15, '#9bc4d2');
    rectangle(ctx, '#0b1c29', 292, 207 + drop * 0.1, 56, 34);
    rectangle(ctx, '#5c8b9a', 298, 213 + drop * 0.1, 44, 26);
    rectangle(ctx, '#223d4c', 318, 213 + drop * 0.1, 3, 26);
  }
  rectangle(ctx, '#879297', 281, 240, 78, 4);
  rectangle(ctx, '#5b6b74', 274, 244, 92, 4);
  rectangle(ctx, '#3e505e', 267, 248, 106, 5);
  if (collapse > 0) {
    for (let i = 0; i < 75; i++) {
      const width = 3 + random(i + 62) * 15;
      const x = 90 + random(i + 10) * 460;
      const y = 235 - random(i + 50) * 24 * collapse;
      rectangle(
        ctx,
        ['#37404a', '#637078', '#232c39'][i % 3],
        x,
        y,
        width,
        4 + random(i) * 8,
      );
    }
  }
}

function blast(ctx, time, effects) {
  const age = time - ENDING.explosion;
  if (age < 0) return;
  const burst = limit(age / 0.9);
  for (let i = 0; i < 17; i++) {
    const delay = random(i + 25) * 0.7;
    if (age < delay) continue;
    const local = age - delay;
    const x = 113 + random(i + 12) * 413;
    const y = 109 + random(i + 19) * 115;
    const radius = (24 + random(i + 44) * 35) * Math.min(1, local * 3);
    ctx.globalAlpha = Math.min(1, Math.max(0, 1 - local / 3.2));
    for (let layer = 0; layer < 3; layer++) {
      const points = [];
      const size = radius * (1 - layer * 0.28);
      for (let point = 0; point < 18; point++) {
        const angle = (point / 18) * Math.PI * 2;
        const edge = size * (0.75 + random(i * 71 + point) * 0.3);
        points.push([x + Math.cos(angle) * edge, y + Math.sin(angle) * edge]);
      }
      polygon(ctx, ['#a7402b', '#e77c36', '#ffd282'][layer], points);
    }
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 100; i++) {
    const life = 1.2 + random(i + 80) * 2.4;
    const local = age - random(i + 70) * 1.2;
    if (local < 0 || local > life) continue;
    const direction = random(i + 31) * Math.PI * 2;
    const speed = 25 + random(i + 59) * 80;
    const x = 320 + Math.cos(direction) * speed * local;
    const y = 155 + Math.sin(direction) * speed * local + local * local * 24;
    rectangle(ctx, i % 3 ? '#f9ae58' : '#536474', x, y, i % 3 ? 2 : 4, 3);
  }
  for (let i = 0; i < 34; i++) {
    const x = 92 + random(i + 83) * 458;
    const cycle = (age + random(i + 90) * 2) % 2.3;
    const height = 8 + random(i + 91) * 34;
    polygon(ctx, i % 2 ? '#de7236' : '#edb65c', [
      [x, 240],
      [x + 4, 240 - height * (1 - cycle / 3)],
      [x + 10, 240],
    ]);
  }
  for (let i = 0; i < 24; i++) {
    const local = Math.max(0, age - random(i + 12) * 1.5);
    const x = 90 + random(i + 14) * 460 + Math.sin(local * 0.2 + i) * local * 2;
    const y = Math.max(20, 212 - local * (7 + random(i) * 7));
    ctx.globalAlpha = Math.min(0.78, local * 0.3);
    ctx.fillStyle = i % 2 ? '#242936' : '#3a3541';
    ctx.beginPath();
    ctx.arc(
      x,
      y,
      (20 + random(i + 33) * 26) * Math.min(1, local),
      0,
      Math.PI * 2,
    );
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
    asset.height,
  );
  ctx.restore();
}

function hero(ctx, assets, x, y, walking, direction, time, detonator) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  const frame = walking ? Math.floor(time * 8) % 8 : 0;
  const row = direction === 'left' ? 2 : 0;
  if (detonator) {
    const pose = detonatorFrame(time);
    if (walking) {
      ctx.drawImage(
        assets.detonator.image,
        pose * 60,
        0,
        60,
        35,
        -39,
        -58,
        78,
        45.5,
      );
      ctx.drawImage(
        assets.hero.image,
        frame * 60,
        row * 60 + 35,
        60,
        25,
        -39,
        -12.5,
        78,
        32.5,
      );
    } else
      ctx.drawImage(
        assets.detonator.image,
        pose * 60,
        0,
        60,
        60,
        -39,
        -58,
        78,
        78,
      );
  } else
    ctx.drawImage(
      assets.hero.image,
      frame * 60,
      row * 60,
      60,
      60,
      -39,
      -58,
      78,
      78,
    );
  ctx.restore();
}

function street(ctx, time, assets, effects) {
  nightSky(ctx, time);
  rectangle(ctx, '#293747', 0, 251, 640, 23);
  rectangle(ctx, '#43505b', 0, 270, 640, 5);
  rectangle(ctx, '#172231', 0, 275, 640, 85);
  for (let i = 0; i < 13; i++)
    rectangle(ctx, '#69716d', i * 60 - 8, 340, 28, 2);
  for (let i = 0; i < 50; i++)
    rectangle(
      ctx,
      '#293645',
      random(i + 500) * 640,
      280 + random(i + 600) * 80,
      4,
      1,
    );
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
    const y =
      time < 6 ? blend(229, 276, (time - 2) / 4) : blend(276, 296, approach);
    ctx.globalAlpha = time < 19.6 ? 1 : 1 - limit((time - 19.6) / 0.6);
    hero(
      ctx,
      assets,
      x,
      y,
      (time >= 2 && time < 6) || (time >= 15 && time < 19),
      time >= 15 ? 'left' : 'down',
      time,
      time >= 2 && time < 15,
    );
    ctx.globalAlpha = 1;
  }
  const carFrame =
    time >= 19 && time < 20.9 ? Math.min(12, Math.floor((time - 19) * 7)) : 0;
  sprite(ctx, assets.car, carFrame, carX, 308, 0, 1.08);
  if (time < 2.8) {
    ctx.globalAlpha = Math.min(1, time) * (1 - limit((time - 2) / 0.8));
    text(ctx, 'ПОСЛЕДНИЙ ВЫХОД', 320, 315, 19, '#c9dce0');
    ctx.globalAlpha = 1;
  }
}

function highwayCar(ctx, asset, x, y, angle, scale) {
  ctx.fillStyle = '#0007';
  ctx.beginPath();
  ctx.ellipse(x + 3, y + 5, 21, 42, 0, 0, Math.PI * 2);
  ctx.fill();
  const beam = ctx.createLinearGradient(x, y - 100, x, y - 20);
  beam.addColorStop(0, '#aec8b900');
  beam.addColorStop(1, '#aec8b92c');
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
  rectangle(ctx, '#14262c', 0, 0, 640, 360);
  for (let i = 0; i < 40; i++) {
    const x = i % 2 ? 360 + random(i + 700) * 280 : random(i + 700) * 28 - 12;
    const y = ((random(i + 730) * 500 + drive * 260) % 500) - 70;
    rectangle(ctx, '#1c3639', x, y, 18 + random(i) * 22, 42);
    rectangle(ctx, '#10242c', x + 3, y + 5, 14 + random(i) * 16, 24);
  }
  rectangle(ctx, '#2b343f', 38, 0, 300, 360);
  rectangle(ctx, '#727b7b', 31, 0, 5, 360);
  rectangle(ctx, '#727b7b', 340, 0, 5, 360);
  rectangle(ctx, '#e2d4a2', 41, 0, 2, 360);
  rectangle(ctx, '#e2d4a2', 333, 0, 2, 360);
  for (let y = frame.roadOffset - 64; y < 360; y += 64) {
    rectangle(ctx, '#c2c9c6', 137, y, 2, 29);
    rectangle(ctx, '#c2c9c6', 237, y, 2, 29);
    rectangle(ctx, '#a6b2b0', 22, y, 4, 15);
    rectangle(ctx, '#a6b2b0', 350, y, 4, 15);
    rectangle(ctx, '#f4c78b', 22, y, 3, 3);
    rectangle(ctx, '#f4c78b', 351, y, 3, 3);
  }
  for (let i = 0; i < 28; i++) {
    const x = 48 + random(i + 900) * 278;
    const y = ((random(i + 901) * 440 + drive * 480) % 440) - 40;
    rectangle(ctx, '#34414d', x, y, 1, 5 + random(i) * 17);
  }
  for (const car of frame.traffic)
    highwayCar(ctx, assets.traffic[car.type], car.x, car.y, -Math.PI / 2, 0.7);
  highwayCar(
    ctx,
    assets.car,
    frame.player.x,
    frame.player.y,
    frame.player.angle,
    1.08,
  );
  if (time >= ENDING.credits) {
    const shade = ctx.createLinearGradient(306, 0, 640, 0);
    shade.addColorStop(0, '#0a122000');
    shade.addColorStop(0.35, '#0a1220b8');
    shade.addColorStop(1, '#0a1220ed');
    ctx.fillStyle = shade;
    ctx.fillRect(306, 0, 334, 360);
    if (time < ENDING.finished) {
      let y = 398 - (time - ENDING.credits) * 17;
      text(ctx, 'MELLSTROY', 458, y, 29, '#b2dded', 290);
      y += 28;
      text(ctx, 'EMERGENCY EXIT', 458, y, 14, '#a6b8c7');
      y += 72;
      for (const credit of CREDITS) {
        text(ctx, credit.title, 458, y, 12, '#7ec5e3', 286);
        y += 29;
        for (const line of credit.lines) {
          text(ctx, line, 458, y, 17, '#e5e6df', 294);
          y += 25;
        }
        y += 42;
      }
    } else {
      text(ctx, 'ТЫ ВЫБРАЛСЯ.', 452, 157, 26, '#b2dded', 292);
      text(ctx, 'Спасибо за игру', 452, 190, 17, '#e5e6df');
    }
  }
}

export function drawEnding(ctx, time, assets, effects = true) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#080d18';
  ctx.fillRect(0, 0, 640, 360);
  if (time < ENDING.highway) {
    const closeup =
      1 + 1.6 * smooth((time - 6) / 0.65) * (1 - smooth((time - 8.15) / 0.75));
    ctx.save();
    ctx.translate(320, 180);
    ctx.scale(closeup, closeup);
    ctx.translate(-320, -(180 + (closeup - 1) * 40));
    street(ctx, time, assets, effects);
    ctx.restore();
  } else highway(ctx, time, assets);
  const fadeIn = 1 - limit(time / 1.2);
  const fadeOut =
    time < ENDING.highway
      ? limit((time - 24.8) / 1.2)
      : 1 - limit((time - ENDING.highway) / 1.2);
  ctx.fillStyle = `rgba(4,8,16,${Math.max(fadeIn, fadeOut)})`;
  ctx.fillRect(0, 0, 640, 360);
  rectangle(ctx, '#050a12', 0, 0, 640, 19);
  rectangle(ctx, '#050a12', 0, 341, 640, 19);
  ctx.restore();
}
