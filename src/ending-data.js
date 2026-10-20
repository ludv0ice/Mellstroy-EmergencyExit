import { CHAPTERS } from './campaign.js';

export const ENDING = {
  walk: 2,
  detonator: 6,
  explosion: 9,
  approach: 15,
  boarding: 19,
  departure: 21,
  highway: 26,
  credits: 30,
  finished: 82,
};

export const CREDITS = [
  {
    title: 'СОЗДАТЕЛИ',
    lines: ['Ruslan Chentsov (ludv0ice)', 'Maksim Barbolin (Macan PRIME67)'],
  },
  { title: 'В ГЛАВНОЙ РОЛИ', lines: ['Меллстрой'] },
  {
    title: 'МУЗЫКА ФИНАЛА',
    lines: ['NIGHT DRIVE', 'Оригинальная синтвейв-композиция'],
  },
  { title: 'ДВИЖОК', lines: ['Phaser 3', 'JavaScript'] },
  { title: 'ИСХОДНЫЕ МАТЕРИАЛЫ', lines: ['Hotline Miami', 'Dennaton Games'] },
  { title: 'СПАСИБО ЗА ИГРУ', lines: ['Ты выбрался.'] },
];

export function endingUnlocked(progress) {
  return CHAPTERS.every((chapter) =>
    Number.isFinite(progress.best?.[chapter.index]?.score),
  );
}

export function endingPhase(time) {
  if (time < ENDING.walk) {
    return 'establish';
  }
  if (time < ENDING.detonator) {
    return 'walk';
  }
  if (time < ENDING.explosion) {
    return 'detonator';
  }
  if (time < ENDING.approach) {
    return 'explosion';
  }
  if (time < ENDING.boarding) {
    return 'approach';
  }
  if (time < ENDING.departure) {
    return 'boarding';
  }
  if (time < ENDING.highway) {
    return 'departure';
  }
  if (time < ENDING.credits) {
    return 'highway';
  }
  if (time < ENDING.finished) {
    return 'credits';
  } else {
    return 'finished';
  }
}

export function detonatorFrame(time) {
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

export function endingCaption(time) {
  const phase = endingPhase(time);
  if (phase === 'establish') {
    return 'Полицейский участок. Последняя ночь.';
  }
  if (phase === 'walk') {
    return 'Меллстрой выходит из участка с детонатором в руке.';
  }
  if (phase === 'detonator') {
    return 'Он нажимает кнопку детонатора.';
  }
  if (phase === 'explosion') {
    return 'Позади взрывается многоэтажный участок.';
  }
  if (phase === 'approach' || phase === 'boarding') {
    return 'Меллстрой садится в машину.';
  }
  if (phase === 'departure') {
    return 'Машина уезжает от разрушенного участка.';
  }
  if (phase === 'finished') {
    return 'Конец. Спасибо за игру.';
  } else {
    return 'Вид сверху: машина обгоняет трафик на ночной трассе. Музыка и финальные титры.';
  }
}

const LANES = [88, 188, 288];
const CYCLE = 18;
const TRAFFIC = [
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
  [2, 17.5],
];
const ROUTE = [
  [0, 1],
  [2, 1],
  [3, 0],
  [6, 0],
  [7, 1],
  [9, 1],
  [10, 2],
  [13, 2],
  [14, 1],
  [18, 1],
];

function lanePosition(time) {
  const phase = ((time % CYCLE) + CYCLE) % CYCLE;
  for (let i = 1; i < ROUTE.length; i++) {
    const [end, lane] = ROUTE[i];
    if (phase > end) {
      continue;
    }
    const [start, previous] = ROUTE[i - 1];
    const fraction = (phase - start) / (end - start);
    const smooth = fraction * fraction * (3 - 2 * fraction);
    return LANES[previous] + (LANES[lane] - LANES[previous]) * smooth;
  }
  return LANES[1];
}

export function endingDriveFrame(time) {
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
          type: index % 3,
        });
      }
    }
  }
  const velocityX = (lanePosition(drive + 0.025) - lanePosition(drive - 0.025)) / 0.05;
  return {
    player: {
      x: lanePosition(drive),
      y: 252,
      angle: -Math.PI / 2 + Math.atan2(velocityX, 580),
    },
    traffic,
    roadOffset: (drive * 480) % 64,
  };
}
