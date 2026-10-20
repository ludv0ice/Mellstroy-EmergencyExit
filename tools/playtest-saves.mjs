import { serveTestGame } from './serve-test-game.mjs';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const output = process.env.PLAYTEST_OUTPUT ?? root + '/../artifacts/saves-playtest';
fs.mkdirSync(output, { recursive: true });
const server = await serveTestGame(root);
const page = await fetch('http://127.0.0.1:9222/json/new?about:blank', {
  method: 'PUT',
}).then((response) => response.json());
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
const errors = [];
const requests = [];
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.reject(m.error) : p.resolve(m.result);
  } else if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails);
  } else if (
    m.method === 'Network.requestWillBeSent' &&
    /^https?:/.test(m.params.request.url) &&
    !m.params.request.url.startsWith(server.url + '/')
  ) {
    requests.push(m.params.request.url);
  }
};
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) {
    throw Error(JSON.stringify(r.exceptionDetails));
  }
  return r.result.value;
};
const until = async (expression) => {
  for (let i = 0; i < 120; i++) {
    if (await evaluate(expression)) {
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error('Timeout ' + expression);
};
const render = () =>
  evaluate(
    '(()=>{const a=window.__QA_APP__;a.view.shake=0;a.view.render(1000,0);a.game.renderer.preRender();a.game.scene.render(a.game.renderer);a.game.renderer.postRender();})()',
  );
const screenshot = async (name) => {
  await render();
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(output + '/' + name + '.png', Buffer.from(r.data, 'base64'));
};
const tick = async (n = 1) =>
  evaluate(
    `(()=>{const a=window.__QA_APP__;for(let i=0;i<${n};i++){a.__time=(a.__time??performance.now())+1000/60;a.game.step(a.__time,1000/60);}return window.__GAME__.getState();})()`,
  );
const key = async (code, type) =>
  send('Input.dispatchKeyEvent', {
    type,
    code,
    key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code,
    windowsVirtualKeyCode:
      { Space: 32, Enter: 13, Escape: 27 }[code] ?? code.at(-1).charCodeAt(0),
  });
const press = async (code) => {
  await key(code, 'keyDown');
  await tick();
  await key(code, 'keyUp');
  await tick();
};
const command = async (value) => {
  await send('Input.insertText', { text: value });
  await press('Enter');
};
try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: server.url });
  await until('window.__QA_APP__?.mode === "menu"');
  await evaluate('document.getElementById("settings-button").click()');
  assert.ok(await evaluate('document.querySelector(".settings").getBoundingClientRect().width >= 650'));
  await screenshot('settings-large');
  await evaluate('document.getElementById("settings-back").click();document.getElementById("saves-button").click()');
  assert.equal(await evaluate('document.querySelectorAll(".save-card").length'), 3);
  await screenshot('save-slots');
  await evaluate('document.querySelectorAll(".save-card")[1].querySelector("button").click();document.getElementById("deploy").click()');
  await until('window.__QA_APP__?.mode === "playing"');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("emergency-exit-saves")).active'), 1);
  await evaluate('window.__QA_APP__.game.loop.stop();true');
  await screenshot('new-hero');
  await send('Page.reload');
  await until('window.__QA_APP__?.mode === "menu"');
  await evaluate('document.getElementById("continue").click()');
  await until('window.__QA_APP__?.mode === "playing"');
  assert.equal(await evaluate('window.__QA_APP__.sim.room.id'), 'eeTraining');
  await evaluate('window.__QA_APP__.game.loop.stop();window.__QA_APP__.briefing(1);window.__QA_APP__.start()');
  await until('window.__QA_APP__?.mode === "playing"');
  await evaluate('window.__QA_APP__.sim.score=123;window.__QA_APP__.complete()');
  await until('window.__QA_APP__?.mode === "playing" && window.__QA_APP__.floorIndex === 1');
  const room = await evaluate('window.__QA_APP__.sim.room.id');
  await send('Page.reload');
  await until('window.__QA_APP__?.mode === "menu"');
  await evaluate('document.getElementById("continue").click()');
  await until('window.__QA_APP__?.mode === "playing"');
  assert.equal(await evaluate('window.__QA_APP__.sim.room.id'), room);
  assert.equal(await evaluate('window.__QA_APP__.runScore'), 123);
  await evaluate('window.__QA_APP__.game.loop.stop();window.__QA_APP__.togglePause();document.getElementById("pause-saves").click();document.querySelectorAll(".save-card")[1].querySelectorAll("button")[1].click()');
  assert.ok(await evaluate('document.querySelectorAll(".save-card")[1].textContent.includes("Удалить")'));
  await evaluate('document.querySelectorAll(".save-card")[1].querySelectorAll("button")[1].click()');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("emergency-exit-saves")).slots[1].checkpoint.floor'), 1);
  await evaluate('document.querySelectorAll(".save-card")[1].querySelectorAll("button")[1].click();document.querySelectorAll(".save-card")[1].querySelector("button").click()');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("emergency-exit-saves")).slots[1].checkpoint'), null);
  await evaluate('window.__QA_APP__.menu();document.getElementById("settings-button").click()');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 650, deviceScaleFactor: 1, mobile: true });
  assert.ok(await evaluate('document.querySelector(".settings").getBoundingClientRect().right <= innerWidth'));
  await screenshot('settings-mobile');
  assert.deepEqual(errors, []);
  console.log('Saves, floor resume, reset confirmation, settings and sprites passed');
} finally {
  await send('Page.close').catch(() => {});
  ws.close(); server.close();
}
