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
  if (time < ENDING.walk) return 'establish';
  if (time < ENDING.detonator) return 'walk';
  if (time < ENDING.explosion) return 'detonator';
  if (time < ENDING.approach) return 'explosion';
  if (time < ENDING.boarding) return 'approach';
  if (time < ENDING.departure) return 'boarding';
  if (time < ENDING.highway) return 'departure';
  if (time < ENDING.credits) return 'highway';
  return time < ENDING.finished ? 'credits' : 'finished';
}

export function detonatorFrame(time) {
  if (time < ENDING.detonator) return 0;
  if (time < 7.7) return 1;
  return time < 8.1 ? 2 : 3;
}

export function endingCaption(time) {
  const phase = endingPhase(time);
  if (phase === 'establish') return 'Полицейский участок. Последняя ночь.';
  if (phase === 'walk')
    return 'Меллстрой выходит из участка с детонатором в руке.';
  if (phase === 'detonator') return 'Он нажимает кнопку детонатора.';
  if (phase === 'explosion') return 'Позади взрывается многоэтажный участок.';
  if (phase === 'approach' || phase === 'boarding')
    return 'Меллстрой садится в машину.';
  if (phase === 'departure') return 'Машина уезжает от разрушенного участка.';
  return phase === 'finished'
    ? 'Конец. Спасибо за игру.'
    : 'Вид сверху: машина обгоняет трафик на ночной трассе. Музыка и финальные титры.';
}
