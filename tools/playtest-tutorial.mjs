import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const output =
  process.env.PLAYTEST_OUTPUT ?? root + '/../artifacts/tutorial-playtest';
fs.mkdirSync(output, { recursive: true });
const pages = await fetch('http://127.0.0.1:9222/json').then((r) => r.json());
const ws = new WebSocket(
  pages.find((p) => p.type === 'page').webSocketDebuggerUrl,
);
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
    /^https?:/.test(m.params.request.url)
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
    key: code.slice(3).toLowerCase(),
    windowsVirtualKeyCode: code === 'Space' ? 32 : code.at(-1).charCodeAt(0),
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
  await send('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] });
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1366,
    height: 768,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url: 'about:blank' });
  const html = fs.readFileSync(root + '/index.html', 'utf8'),
    marker = html.lastIndexOf('window.__GAME__');
  const variable = html
    .slice(marker)
    .match(/get mode\(\)\{return ([\w$]+)\.mode/)[1];
  const frame = (await send('Page.getFrameTree')).frameTree.frame.id;
  await send('Page.setDocumentContent', {
    frameId: frame,
    html: html.replace(
      'window.__GAME__=',
      `window.__QA_APP__=${variable};window.__GAME__=`,
    ),
  });
  await until("window.__GAME__?.mode==='menu'");
  await evaluate('window.__QA_APP__.game.loop.stop(); document.fonts.ready');
  await screenshot('menu-desktop');
  assert.equal(
    await evaluate(
      "document.getElementById('menu').textContent.includes('OFFLINE')",
    ),
    false,
  );
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await tick();
  await screenshot('menu-mobile');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1366,
    height: 768,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await tick();
  await evaluate(
    "document.getElementById('chapters-button').click();document.querySelector('#chapter-list button').click();document.getElementById('deploy').click();true",
  );
  await until("window.__GAME__.mode==='playing'");

  const stage = () => evaluate('window.__QA_APP__.sim.tutorial.step');
  const held = new Set();
  async function movement(codes) {
    for (const k of [...held])
      if (!codes.includes(k)) {
        await key(k, 'keyUp');
        held.delete(k);
      }
    for (const k of codes)
      if (!held.has(k)) {
        await key(k, 'keyDown');
        held.add(k);
      }
  }
  async function goTo(x, y, reach = 12) {
    for (let i = 0; i < 240; i++) {
      const move =
        await evaluate(`(()=>{const s=window.__QA_APP__.sim,p=s.player,t={x:${x},y:${y}};
        if(Math.hypot(p.x-t.x,p.y-t.y)<${reach})return null;
        const route=s.navigation.path(p,t),q=s.lineBlocked(p,t,true)?(route.find(q=>Math.hypot(p.x-q.x,p.y-q.y)>5)??t):t;
        return {x:q.x-p.x,y:q.y-p.y,px:p.x,py:p.y};})()`);
      if (!move) {
        await movement([]);
        await tick(10);
        return;
      }
      await movement([
        ...(Math.abs(move.x) > 2 ? [move.x > 0 ? 'KeyD' : 'KeyA'] : []),
        ...(Math.abs(move.y) > 2 ? [move.y > 0 ? 'KeyS' : 'KeyW'] : []),
      ]);
      await tick(3);
    }
    throw Error(
      'Cannot walk to ' +
        x +
        ',' +
        y +
        ' ' +
        JSON.stringify(await evaluate('window.__GAME__.getState()')),
    );
  }
  async function aim(x, y) {
    await render();
    const point = await evaluate(
      `(()=>{const v=window.__QA_APP__.view;return{x:v.scale.width/2+(${x}-v.cameraPoint.x)*v.zoom,y:v.scale.height/2+(${y}-v.cameraPoint.y)*v.zoom}})()`,
    );
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await tick();
    return point;
  }
  async function attack(x, y) {
    const point = await aim(x, y);
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'left',
      buttons: 1,
      clickCount: 1,
      ...point,
    });
    await tick();
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'left',
      buttons: 0,
      clickCount: 1,
      ...point,
    });
    await tick(20);
  }
  const visited = [];
  async function expectStage(expected) {
    assert.equal(await stage(), expected);
    visited.push(expected);
    await screenshot('lesson-' + expected);
  }
  await expectStage('move');
  await press('KeyE');
  await press('KeyF');
  assert.equal(await stage(), 'move');
  for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
    await movement([code]);
    await tick(10);
    await movement([]);
    await tick(8);
  }
  await expectStage('aim');
  const hero = await evaluate('window.__GAME__.getState().player');
  await aim(hero.x + 100, hero.y);
  if ((await stage()) === 'aim') await aim(hero.x - 100, hero.y);
  await expectStage('punch');
  await goTo(248, 116, 24);
  await attack(248, 116);
  await expectStage('finish');
  await press('Space');
  await tick(50);
  await expectStage('pickup');
  await goTo(378, 175);
  await press('KeyE');
  await expectStage('drop');
  await press('KeyQ');
  await expectStage('retrieve');
  await press('KeyE');
  await expectStage('throw');
  await goTo(300, 116, 38);
  await aim(300, 116);
  await press('KeyF');
  await tick(25);
  await expectStage('recover');
  const item = await evaluate(
    'window.__QA_APP__.sim.items.find(i=>!i.taken&&i.weapon.id===4)',
  );
  await goTo(item.x, item.y, 20);
  await press('KeyE');
  await expectStage('melee');
  await goTo(300, 116, 35);
  await attack(300, 116);
  await expectStage('gun');
  await goTo(186, 178);
  await press('KeyE');
  await expectStage('shoot');
  await goTo(273, 334, 42);
  await attack(273, 334);
  await expectStage('exit');
  const exit = await evaluate('window.__QA_APP__.sim.exit');
  await goTo(exit.x, exit.y, 25);
  await press('KeyE');
  await tick(20);
  assert.notEqual(await evaluate('window.__GAME__.mode'), 'playing');
  await screenshot('lesson-complete');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.equal(requests.length, 0);
  const result = {
    steps: visited,
    tutorialFinished: true,
    realKeyboardAndMouse: true,
    networkRequests: requests.length,
    javaScriptErrors: errors.length,
  };
  fs.writeFileSync(output + '/results.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  ws.close();
}
