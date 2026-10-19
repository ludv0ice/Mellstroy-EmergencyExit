import { ENDING } from './ending-sequence.js';

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
    if (phase > end) continue;
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
      if (y > -90 && y < 450)
        traffic.push({
          id: `${index}:${cycle + offset}`,
          lane,
          x: LANES[lane],
          y,
          type: index % 3,
        });
    }
  }
  const velocityX =
    (lanePosition(drive + 0.025) - lanePosition(drive - 0.025)) / 0.05;
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
