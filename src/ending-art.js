import { CREDITS, ENDING } from './ending-sequence.js';

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

function sedan(ctx, x, y, door = 0, occupied = false) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  rectangle(ctx, '#080e18', -59, 14, 119, 9);
  for (const wheel of [-36, 37]) {
    rectangle(ctx, '#060c14', wheel - 8, 4, 16, 18);
    rectangle(ctx, '#6e7c83', wheel - 4, 10, 8, 7);
  }
  polygon(ctx, '#101d2b', [
    [-61, 5],
    [-56, -8],
    [-30, -12],
    [-17, -31],
    [26, -31],
    [44, -12],
    [60, -8],
    [65, 10],
    [53, 17],
    [-53, 17],
  ]);
  polygon(ctx, '#264452', [
    [-27, -12],
    [-13, -27],
    [22, -27],
    [36, -12],
  ]);
  rectangle(ctx, '#121d2a', 3, -26, 4, 17);
  if (occupied) {
    rectangle(ctx, '#9e795e', 15, -23, 5, 5);
    rectangle(ctx, '#111b26', 14, -18, 8, 6);
  }
  rectangle(ctx, '#4d6572', -55, -6, 112, 2);
  rectangle(ctx, '#31404e', -54, 12, 112, 3);
  rectangle(ctx, '#abb8b1', 54, -4, 8, 6);
  rectangle(ctx, '#e64b61', -59, -3, 6, 7);
  rectangle(ctx, '#b4b8ac', 16, -4, 7, 2);
  if (door > 0) {
    polygon(ctx, '#2c4352', [
      [-20, -10],
      [16, -10],
      [16 - door * 18, 18 + door * 8],
      [-20 - door * 12, 12 + door * 6],
    ]);
    rectangle(ctx, '#718c92', -17 - door * 8, -6, 25, 3);
  }
  ctx.restore();
}

function hero(ctx, image, x, y, walking, direction, time, detonator) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  const frame = walking ? Math.floor(time * 8) % 8 : 0;
  const row = direction === 'left' ? 2 : 0;
  ctx.drawImage(image, frame * 60, row * 60, 60, 60, -39, -58, 78, 78);
  if (detonator) {
    rectangle(ctx, '#b58b70', 9, -18, 9, 4);
    rectangle(ctx, '#161e2b', 14, -28, 9, 13);
    rectangle(ctx, '#8b9da3', 16, -25, 5, 5);
    rectangle(ctx, time >= 7.7 ? '#ffdaa0' : '#ef5166', 17, -28, 4, 3);
    rectangle(ctx, '#778e98', 18, -35, 1, 7);
    if (time >= 7.5 && time < 8.2) rectangle(ctx, '#c49d7d', 12, -29, 7, 3);
  }
  ctx.restore();
}

function street(ctx, time, image, effects) {
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
      image,
      x,
      y,
      (time >= 2 && time < 6) || (time >= 15 && time < 19),
      time >= 15 ? 'left' : 'down',
      time,
      time >= 2 && time < 15,
    );
    ctx.globalAlpha = 1;
  }
  sedan(
    ctx,
    carX,
    308,
    time >= 19 && time < 20.9
      ? Math.sin(limit((time - 19) / 1.9) * Math.PI)
      : 0,
    time >= 20.2,
  );
  if (time < 2.8) {
    ctx.globalAlpha = Math.min(1, time) * (1 - limit((time - 2) / 0.8));
    text(ctx, 'ПОСЛЕДНИЙ ВЫХОД', 320, 315, 19, '#c9dce0');
    ctx.globalAlpha = 1;
  }
}

function rearCar(ctx, x, y, time) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y + Math.sin(time * 8) * 0.4));
  ctx.fillStyle = '#07101c88';
  ctx.beginPath();
  ctx.ellipse(0, 23, 42, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  polygon(ctx, '#152431', [
    [-31, 13],
    [-27, -23],
    [-18, -41],
    [18, -41],
    [27, -23],
    [31, 13],
  ]);
  polygon(ctx, '#7495a1', [
    [-23, -22],
    [-16, -35],
    [16, -35],
    [23, -22],
  ]);
  rectangle(ctx, '#263e4b', -25, -17, 50, 22);
  rectangle(ctx, '#4a626e', -29, 5, 58, 3);
  rectangle(ctx, '#f15c72', -29, 9, 17, 5);
  rectangle(ctx, '#f15c72', 12, 9, 17, 5);
  rectangle(ctx, '#d8d9c7', -8, 12, 16, 4);
  rectangle(ctx, '#060c15', -31, 16, 7, 8);
  rectangle(ctx, '#060c15', 24, 16, 7, 8);
  ctx.restore();
}

function highway(ctx, time) {
  const drive = time - ENDING.highway;
  nightSky(ctx, time);
  const horizon = 135;
  const vanishing = 239 + Math.sin(drive * 0.08) * 13;
  polygon(ctx, '#242d43', [
    [0, 135],
    [0, 115],
    [63, 84],
    [118, 121],
    [192, 91],
    [251, 136],
    [352, 105],
    [442, 130],
    [521, 93],
    [640, 126],
    [640, 195],
    [0, 195],
  ]);
  rectangle(ctx, '#131f31', 0, horizon, 640, 225);
  polygon(ctx, '#292f3f', [
    [vanishing - 4, horizon],
    [vanishing + 4, horizon],
    [500, 360],
    [-110, 360],
  ]);
  polygon(ctx, '#777c82', [
    [vanishing - 5, horizon],
    [vanishing - 4, horizon],
    [-106, 360],
    [-112, 360],
  ]);
  polygon(ctx, '#777c82', [
    [vanishing + 4, horizon],
    [vanishing + 5, horizon],
    [504, 360],
    [498, 360],
  ]);
  for (let i = 0; i < 17; i++) {
    const depth = ((i / 17 + drive * 0.22) % 1) ** 2;
    const y = horizon + depth * 238;
    const center = blend(vanishing, 198, depth);
    const width = 1 + depth * 4;
    rectangle(ctx, '#c3b48b', center - width / 2, y, width, 1 + depth * 20);
    const side = 8 + depth * 294;
    rectangle(ctx, '#9ca7aa', center - side, y, 1 + depth * 3, 2 + depth * 24);
    rectangle(ctx, '#9ca7aa', center + side, y, 1 + depth * 3, 2 + depth * 24);
  }
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 8; i++) {
      const depth = ((i / 8 + drive * 0.06) % 1) ** 2;
      const x = vanishing + side * (22 + depth * 330);
      const y = horizon + depth * 210;
      rectangle(ctx, '#536474', x, y - depth * 130, 1 + depth * 3, depth * 130);
      rectangle(
        ctx,
        '#dcb78b',
        x - (side > 0 ? depth * 14 : 0),
        y - depth * 130,
        4 + depth * 11,
        2,
      );
    }
  }
  const glow = ctx.createRadialGradient(237, 230, 0, 237, 230, 90);
  glow.addColorStop(0, '#bad8c22a');
  glow.addColorStop(1, '#bad8c200');
  ctx.fillStyle = glow;
  ctx.fillRect(140, 140, 190, 180);
  rearCar(ctx, 258 + Math.sin(drive * 0.15) * 5, 289, time);
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

export function drawEnding(ctx, time, image, effects = true) {
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
    street(ctx, time, image, effects);
    ctx.restore();
  } else highway(ctx, time);
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
