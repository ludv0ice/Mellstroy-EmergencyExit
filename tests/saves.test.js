import test from 'node:test';
import assert from 'node:assert/strict';
import { Saves } from '../src/saves.js';
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
test('Legacy progress migrates and each campaign preserves its own checkpoint', () => {
  const store = storage();
  store.setItem('emergency-exit-progress', JSON.stringify({ unlocked: 4, best: { 3: { score: 100 } }, last: 4 }));
  const saves = new Saves(store);
  assert.equal(saves.current.progress.unlocked, 4);
  saves.current.checkpoint = { chapter: 4, floor: 1 };
  saves.write();
  saves.select(1, true);
  assert.equal(saves.current.progress.unlocked, 0);
  saves.current.progress.best[0] = { score: 20 };
  saves.write();
  const restored = new Saves(store);
  assert.equal(restored.data.active, 1);
  restored.select(0);
  assert.deepEqual(restored.current.checkpoint, { chapter: 4, floor: 1 });
  restored.select(0, true);
  assert.deepEqual(restored.current.progress.best, {});
  restored.select(1);
  assert.equal(restored.current.progress.best[0].score, 20);
});
test('Unavailable or corrupt storage does not prevent playing', () => {
  assert.equal(new Saves(undefined).write(), false);
  const store = storage();
  store.setItem('emergency-exit-saves', '{');
  assert.equal(new Saves(store).current.progress.last, 0);
});
