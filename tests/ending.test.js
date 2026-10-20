import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS } from '../src/campaign.js';
import {
  CREDITS,
  ENDING,
  endingUnlocked,
  endingPhase,
  endingCaption,
} from '../src/ending-data.js';

const completed = () => ({
  unlocked: 21,
  best: Object.fromEntries(
    CHAPTERS.map((chapter) => [chapter.index, { score: 0, grade: 'C' }]),
  ),
});

test('The finale requires actual completion of every chapter, including training and chapter 21', () => {
  assert.equal(endingUnlocked({ unlocked: 21, best: {} }), false);
  assert.equal(endingUnlocked({ best: { 21: { score: 1000 } } }), false);
  assert.equal(endingUnlocked(completed()), true);
  for (const chapter of CHAPTERS) {
    const progress = completed();
    delete progress.best[chapter.index];
    assert.equal(endingUnlocked(progress), false, chapter.number);
  }
  assert.equal(endingUnlocked({}), false);
});

test('An existing saved campaign unlocks the ending without a new progress format', () => {
  const progress = JSON.parse(JSON.stringify(completed()));
  assert.equal(endingUnlocked(progress), true);
  progress.best[8].score = null;
  assert.equal(endingUnlocked(progress), false);
});

test('The story proceeds from the station and detonator to the explosion, car and highway credits', () => {
  const phases = [
    [0, 'establish'],
    [3, 'walk'],
    [7.7, 'detonator'],
    [9.5, 'explosion'],
    [16, 'approach'],
    [20, 'boarding'],
    [23, 'departure'],
    [28, 'highway'],
    [45, 'credits'],
    [83, 'finished'],
  ];
  for (const [time, phase] of phases) {
    assert.equal(endingPhase(time), phase);
    assert.ok(endingCaption(time).length > 5);
  }
  assert.ok(ENDING.explosion < ENDING.boarding);
  assert.ok(ENDING.departure < ENDING.highway);
  assert.ok(ENDING.credits < ENDING.finished);
});

test('Final credits contain both requested author names and nicknames', () => {
  const authors = CREDITS.find((credit) => credit.title === 'СОЗДАТЕЛИ').lines;
  assert.deepEqual(authors, [
    'Ruslan Chentsov (ludv0ice)',
    'Maksim Barbolin (Macan PRIME67)',
  ]);
});

test('The overhead drive changes lanes, overtakes traffic and remains collision free through repeated loops', async () => {
  const { endingDriveFrame } = await import('../src/ending-data.js');
  const lanes = new Set();
  let passes = 0;
  let previous = endingDriveFrame(ENDING.highway);
  for (let elapsed = 0.05; elapsed <= 180; elapsed += 0.05) {
    const current = endingDriveFrame(ENDING.highway + elapsed);
    if ([88, 188, 288].includes(current.player.x)) {
      lanes.add(current.player.x);
    }
    assert.ok(current.player.x >= 88 && current.player.x <= 288);
    assert.ok(Math.abs(current.player.angle + Math.PI / 2) < 0.3);
    for (const car of current.traffic) {
      assert.ok(
        Math.abs(car.x - current.player.x) >= 56 ||
          Math.abs(car.y - current.player.y) >= 85,
        `Collision at ${elapsed}: ${JSON.stringify({ player: current.player, car })}`,
      );
      const old = previous.traffic.find((vehicle) => vehicle.id === car.id);
      if (old) {
        assert.ok(car.y > old.y);
        if (old.y < current.player.y && car.y >= current.player.y) {
          passes++;
        }
      }
    }
    for (let a = 0; a < current.traffic.length; a++) {
      for (let b = a + 1; b < current.traffic.length; b++) {
        const first = current.traffic[a];
        const second = current.traffic[b];
        assert.ok(first.lane !== second.lane || Math.abs(first.y - second.y) > 85);
      }
    }
    previous = current;
  }
  assert.equal(lanes.size, 3);
  assert.ok(passes >= 110, 'Expected continuous overtaking throughout the credits');
});

test('Separate detonator frames follow the hold, raise, press and release cues', async () => {
  const { detonatorFrame } = await import('../src/ending-data.js');
  assert.deepEqual([3, 6.5, 7.8, 9].map(detonatorFrame), [0, 1, 2, 3]);
});
