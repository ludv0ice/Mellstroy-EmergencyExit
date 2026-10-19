import { serveTestGame } from './serve-test-game.mjs';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const output =
  process.env.PLAYTEST_OUTPUT ?? root + '/../artifacts/cheats-playtest';
fs.mkdirSync(output, { recursive: true });
const server = await serveTestGame(root);
const page = await fetch('http://127.0.0.1:9222/json/new?about:blank', {
  method: 'PUT',
}).then((response) => response.json());
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map(),
  errors = [],
  requests = [];
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
  } else if (m.method === 'Runtime.exceptionThrown')
    errors.push(m.params.exceptionDetails);
  else if (
    m.method === 'Network.requestWillBeSent' &&
    /^https?:/.test(m.params.request.url) &&
    !m.params.request.url.startsWith(server.url + '/')
  )
    requests.push(m.params.request.url);
};
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
};
const until = async (expression) => {
  for (let i = 0; i < 120; i++) {
    if (await evaluate(expression)) return;
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
  await send('Network.enable');
  await send('Page.enable');
  await send('Network.setBlockedURLs', { urls: ['https://*'] });
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1366,
    height: 768,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url: server.url });
  await send('Page.bringToFront');
  await until("window.__GAME__?.mode==='menu'");
  await evaluate('window.__QA_APP__.game.loop.stop();document.fonts.ready');
  assert.equal(
    await evaluate(
      "document.getElementById('cheat-console').classList.contains('hidden')",
    ),
    true,
  );
  await press('F2');
  assert.equal(await evaluate('window.__GAME__.mode'), 'console');
  assert.equal(await evaluate('document.activeElement.id'), 'cheat-input');
  for (let i = 0; i < 3; i++) {
    await press('Tab');
    assert.ok(
      await evaluate(
        "document.getElementById('cheat-console').contains(document.activeElement)",
      ),
    );
  }
  assert.equal(await evaluate('document.activeElement.id'), 'cheat-input');
  await command('help');
  assert.match(
    await evaluate("document.querySelector('[data-cheat-output]').textContent"),
    /winall/,
  );
  await command('alert(1)');
  assert.match(
    await evaluate("document.querySelector('[data-cheat-output]').textContent"),
    /Неизвестная/,
  );
  await command(' GOD ON ');
  assert.equal(await evaluate('window.__QA_APP__.cheats.flags.god'), true);
  await command('god maybe');
  assert.equal(await evaluate('window.__QA_APP__.cheats.flags.god'), true);
  await screenshot('console-help');
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    code: 'Backquote',
    key: 'ё',
    windowsVirtualKeyCode: 192,
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    code: 'Backquote',
    key: 'ё',
    windowsVirtualKeyCode: 192,
  });
  assert.equal(await evaluate('window.__GAME__.mode'), 'menu');
  await evaluate(
    'window.__QA_APP__.briefing(1);window.__QA_APP__.start();true',
  );
  await until("window.__GAME__.mode==='playing'");
  assert.equal(await evaluate('window.__QA_APP__.sim.cheats.god'), true);
  const immune = await evaluate(
    '(()=>{const s=window.__QA_APP__.sim;s.player.armor=1;s.takeBullet();s.die();return{alive:s.player.alive,armor:s.player.armor}})()',
  );
  assert.deepEqual(immune, { alive: true, armor: 1 });
  await press('F2');
  const before = await evaluate('window.__QA_APP__.sim.snapshot()');
  await key('KeyW', 'keyDown');
  await tick(120);
  await key('KeyW', 'keyUp');
  assert.deepEqual(
    (await evaluate('window.__QA_APP__.sim.snapshot()')).player,
    before.player,
  );
  await command('win');
  await until(
    "window.__GAME__.mode==='playing' && window.__QA_APP__.sim.room.id==='eeStationService'",
  );
  assert.equal(await evaluate('window.__QA_APP__.sim.cheats.god'), true);
  assert.equal(await evaluate('window.__QA_APP__.sim.player.armor'), 1);
  await evaluate('window.__oldSim=window.__QA_APP__.sim;true');
  await press('KeyR');
  await until(
    "window.__GAME__.mode==='playing' && window.__QA_APP__.sim!==window.__oldSim",
  );
  assert.equal(await evaluate('window.__QA_APP__.sim.cheats.god'), true);
  await press('Escape');
  assert.equal(await evaluate('window.__GAME__.mode'), 'paused');
  await press('F2');
  await command('god off');
  await press('Escape');
  assert.equal(await evaluate('window.__GAME__.mode'), 'paused');
  assert.equal(await evaluate('window.__QA_APP__.sim.cheats.god'), false);
  await press('Escape');
  assert.equal(await evaluate('window.__GAME__.mode'), 'playing');
  await press('F2');
  await command('clear');
  assert.equal(await evaluate('window.__QA_APP__.sim.cleared'), true);
  assert.equal(
    await evaluate('window.__QA_APP__.sim.enemies.some(e=>e.alive)'),
    false,
  );
  await screenshot('cleared-location');
  await press('Escape');
  await evaluate(
    'window.__QA_APP__.briefing(0);window.__QA_APP__.start();true',
  );
  await until(
    "window.__GAME__.mode==='playing' && window.__QA_APP__.sim.room.id==='eeTraining'",
  );
  await press('F2');
  await command('clear');
  await press('Escape');
  assert.equal(await evaluate('window.__QA_APP__.sim.tutorial'), null);
  await evaluate(
    '(()=>{const s=window.__QA_APP__.sim;s.player.x=s.exit.x;s.player.y=s.exit.y;return true})()',
  );
  await press('KeyE');
  assert.equal(await evaluate('window.__GAME__.mode'), 'result');
  const original = await evaluate('window.__QA_APP__.progress.best[0]');
  await press('F2');
  await command('winall');
  assert.equal(
    await evaluate('Object.keys(window.__QA_APP__.progress.best).length'),
    22,
  );
  assert.deepEqual(
    await evaluate('window.__QA_APP__.progress.best[0]'),
    original,
  );
  await command('finale');
  assert.equal(await evaluate('window.__GAME__.mode'), 'ending');
  assert.equal(
    await evaluate(
      "document.getElementById('cheat-console').classList.contains('hidden')",
    ),
    true,
  );
  await press('F2');
  assert.equal(await evaluate('window.__GAME__.mode'), 'ending');
  await press('Escape');
  assert.equal(await evaluate('window.__GAME__.mode'), 'menu');
  assert.equal(
    await evaluate("document.getElementById('ending-button').hidden"),
    false,
  );
  await send('Page.navigate', { url: server.url });
  await until("window.__GAME__?.mode==='menu'");
  await evaluate('window.__QA_APP__.game.loop.stop();document.fonts.ready');
  assert.equal(
    await evaluate("document.getElementById('ending-button').hidden"),
    false,
  );
  assert.equal(await evaluate('window.__QA_APP__.cheats.flags.god'), false);
  await press('F2');
  await command('help');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await screenshot('mobile-console');
  assert.ok(
    await evaluate(
      "(()=>{const r=document.querySelector('.cheat-window').getBoundingClientRect();return r.x>=0&&r.right<=innerWidth})()",
    ),
  );
  await press('Escape');
  assert.equal(await evaluate('window.__GAME__.mode'), 'menu');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.equal(requests.length, 0, JSON.stringify(requests));
  const result = {
    hiddenConsole: true,
    realKeyboardAndCommands: true,
    russianToggle: true,
    gamePausedWhileTyping: true,
    keyboardFocusContained: true,
    godBlocksDamage: true,
    godSurvivesFloorAndRestart: true,
    godOffWorks: true,
    pauseRestored: true,
    clearAndWin: true,
    tutorialCheatExit: true,
    winallPreservesRecords: true,
    finaleAccessible: true,
    progressPersisted: true,
    godResetsOnReload: true,
    mobileConsoleFits: true,
    javaScriptErrors: 0,
    externalRequests: 0,
  };
  fs.writeFileSync(output + '/results.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  ws.close();
  server.close();
}
