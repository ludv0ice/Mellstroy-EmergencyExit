import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS } from '../src/campaign.js';
import {
  CREDITS,
  ENDING,
  endingUnlocked,
  endingPhase,
  endingCaption,
} from '../src/ending-sequence.js';

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
