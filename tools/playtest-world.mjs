import { serveTestGame } from './serve-test-game.mjs';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const output =
  process.env.PLAYTEST_OUTPUT ?? root + '/../artifacts/world-playtest';
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
  await evaluate('window.__QA_APP__.game.loop.stop(); document.fonts.ready');

  await evaluate("document.fonts.load('100px Justice')");
  assert.match(
    await evaluate(
      "getComputedStyle(document.querySelector('#menu h1')).fontFamily",
    ),
    /Justice/,
  );
  assert.equal(
    await evaluate(
      "getComputedStyle(document.querySelector('#menu h1')).webkitTextStrokeColor",
    ),
    'rgb(122, 199, 255)',
  );
  await screenshot('menu-outline-font');
  const selected = () =>
    evaluate("document.querySelector('.menu-selected')?.id");
  async function click(selector) {
    const p = await evaluate(
      `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    );
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p });
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'left',
      buttons: 1,
      clickCount: 1,
      ...p,
    });
    await tick();
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'left',
      buttons: 0,
      clickCount: 1,
      ...p,
    });
    await tick();
  }
  assert.equal(await selected(), 'continue');
  await press('KeyS');
  assert.equal(await selected(), 'chapters-button');
  await press('Enter');
  assert.equal(await evaluate('window.__GAME__.mode'), 'chapters');
  await click('#chapter-panel .back');
  assert.equal(await evaluate('window.__GAME__.mode'), 'menu');
  await press('KeyW');
  assert.equal(await selected(), 'settings-button');
  await press('Enter');
  assert.equal(await evaluate('window.__GAME__.mode'), 'settings');
  await click('#settings-back');
  assert.equal(await evaluate('window.__GAME__.mode'), 'menu');
  await click('#chapters-button');
  assert.equal(await evaluate('window.__GAME__.mode'), 'chapters');
  await click('#chapter-panel .back');
  await press('Enter');
  assert.equal(await evaluate('window.__GAME__.mode'), 'briefing');
  await press('Enter');
  await until("window.__GAME__.mode==='playing'");
  await press('Escape');
  assert.equal(await selected(), 'resume');
  await press('KeyS');
  assert.equal(await selected(), 'restart');
  await press('KeyS');
  assert.equal(await selected(), 'pause-settings');
  await press('Enter');
  assert.equal(await evaluate('window.__GAME__.mode'), 'settings');
  await click('#settings-back');
  assert.equal(await evaluate('window.__GAME__.mode'), 'paused');
  await press('KeyW');
  assert.equal(await selected(), 'to-menu');
  await press('Enter');
  assert.equal(await evaluate('window.__GAME__.mode'), 'menu');
  await click('#continue');
  await click('#deploy');
  await until("window.__GAME__.mode==='playing'");
  await click('#pause-button');
  await screenshot('pause-keyboard-focus');
  await press('Enter');
  assert.equal(await evaluate('window.__GAME__.mode'), 'playing');
  await press('Escape');
  await press('KeyS');
  await press('Enter');
  await until("window.__GAME__.mode==='playing'");
  assert.equal(await evaluate('window.__QA_APP__.sim.tutorial.step'), 'move');
  let transitions = 0;
  for (let chapter = 1; chapter < 22; chapter++) {
    await evaluate(
      `(()=>{const a=window.__QA_APP__;a.briefing(${chapter});a.start();return true})()`,
    );
    await until("window.__GAME__.mode==='playing'");
    const floors = await evaluate('window.__QA_APP__.chapter.rooms');
    for (let index = 0; index < floors.length; index++) {
      assert.equal(
        await evaluate('window.__QA_APP__.sim.room.id'),
        floors[index],
      );
      assert.equal(
        await evaluate('window.__QA_APP__.sim.exit.transition'),
        index < floors.length - 1 ? 'stairs' : 'door',
      );
      if (index) {
        assert.equal(await evaluate('window.__QA_APP__.sim.player.ammo'), 17);
        assert.equal(await evaluate('window.__QA_APP__.sim.player.armor'), 1);
        await evaluate(
          '(()=>{const a=window.__QA_APP__;window.__previousSim=a.sim;a.restart();return true})()',
        );
        await until(
          "window.__GAME__.mode==='playing' && window.__QA_APP__.sim!==window.__previousSim",
        );
        assert.equal(await evaluate('window.__QA_APP__.sim.player.ammo'), 17);
        assert.equal(await evaluate('window.__QA_APP__.sim.player.armor'), 1);
      }
      await evaluate(`(()=>{const a=window.__QA_APP__,s=a.sim;s.grace=100;
        s.player.weapon=s.items.find(item=>item.weapon.gun).weapon;s.player.ammo=17;s.player.armor=1;
        for(const enemy of s.enemies)s.kill(enemy,'shot');s.checkClear();s.player.x=s.exit.x;s.player.y=s.exit.y;
        a.view.cameraPoint={x:s.player.x,y:s.player.y};return true})()`);
      if (chapter === 1 || chapter === 16 || chapter === 14)
        await screenshot(
          'chapter-' +
            chapter +
            '-floor-' +
            index +
            '-' +
            (index < floors.length - 1 ? 'stairs' : 'door'),
        );
      await press('KeyE');
      transitions++;
      await until(
        index < floors.length - 1
          ? `window.__GAME__.mode==='playing' && window.__QA_APP__.sim.room.id==='${floors[index + 1]}'`
          : "window.__GAME__.mode==='result'",
      );
    }
    assert.equal(
      await evaluate('window.__QA_APP__.floorStates.size'),
      floors.length,
    );
  }
  const rooms = await evaluate('window.__QA_APP__.manifest.rooms');
  for (const { id } of rooms) {
    await evaluate(
      `(async()=>{const a=window.__QA_APP__,raw=await a.room('${id}');a.chapter={...a.chapter,rooms:['${id}'],number:'QA',title:raw.design.title,index:0};a.floorIndex=0;a.floorStates.clear();await a.load('${id}');a.sim.grace=100;})()`,
    );
    await render();
    const png = await evaluate(
      "window.__QA_APP__.view.floor.toDataURL('image/png').split(',')[1]",
    );
    fs.writeFileSync(output + '/' + id + '.png', Buffer.from(png, 'base64'));
    assert.ok(await evaluate('window.__QA_APP__.sim.enemies.length<=10'));
  }
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate('window.__QA_APP__.menu();true');
  await tick();
  await screenshot('menu-mobile-outline');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.equal(requests.length, 0, JSON.stringify(requests));
  const result = {
    font: 'Justice with blue outline',
    menuKeyboard: true,
    pauseKeyboard: true,
    mousePreserved: true,
    roomsRendered: rooms.length,
    transitions,
    chaptersCompleted: 21,
    floorRestartPreservesInventory: true,
    externalRequests: 0,
    javaScriptErrors: 0,
  };
  fs.writeFileSync(output + '/results.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  ws.close();
  server.close();
}
