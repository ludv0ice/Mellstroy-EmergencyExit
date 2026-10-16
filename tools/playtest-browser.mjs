import { serveTestGame } from './serve-test-game.mjs';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const output =
  process.env.PLAYTEST_OUTPUT ?? root + '/../artifacts/weapons-playtest';
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
    key: code.slice(3).toLowerCase(),
    windowsVirtualKeyCode: code.at(-1).charCodeAt(0),
  });
const press = async (code) => {
  await key(code, 'keyDown');
  await tick();
  await key(code, 'keyUp');
  await tick();
};
async function arena(weapon, enemyX = 185) {
  await evaluate(
    `(async()=>{const a=window.__QA_APP__,S=a.sim.constructor;const s=new S(a.manifest,{id:'fixture',width:400,height:300,entities:[{kind:'player',name:'objPlayerMouse',sprite:'sprPWalkUnarmed',x:140,y:140},{kind:'weapon',name:'objSpecificWeapon',sprite:'sprWeapons',x:140,y:140,init:{image_index:${weapon}}},{kind:'enemy',name:'objEnemyStationary',sprite:'sprEWalkUnarmed',x:${enemyX},y:140}],tiles:[]},a.profile);a.sim=s;await a.view.setWorld(s);a.mode='playing';a.overlay(null);a.updateHUD();})()`,
  );
  await press('KeyE');
  await tick(20);
  await render();
  const aim = await evaluate(
    '(()=>{const a=window.__QA_APP__,v=a.view,e=a.sim.enemies[0];return{x:v.scale.width/2+(e.x-v.cameraPoint.x)*v.zoom,y:v.scale.height/2+(e.y-v.cameraPoint.y)*v.zoom};})()',
  );
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...aim });
  await tick();
  return aim;
}
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
  await until("window.__GAME__?.mode==='menu'");
  await evaluate('window.__QA_APP__.game.loop.stop(); document.fonts.ready');
  await evaluate(
    "document.getElementById('chapters-button').click();document.querySelector('#chapter-list button').click();document.getElementById('deploy').click();true",
  );
  await until("window.__GAME__.mode==='playing'");
  const mouse = async (button, point) => {
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button,
      buttons: button === 'right' ? 2 : 4,
      clickCount: 1,
      ...point,
    });
    await tick();
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button,
      buttons: 0,
      clickCount: 1,
      ...point,
    });
    await tick();
  };
  let point = await arena(5, 163);
  await evaluate('window.__QA_APP__.sim.player.fireTimer=10;true');
  await mouse('right', point);
  await tick(3);
  assert.equal(
    (await evaluate('window.__GAME__.getState()')).player.weapon,
    -1,
  );
  assert.ok(
    (await evaluate('window.__GAME__.getState()')).actors[0].stun > 2.5,
  );
  await mouse('right', point);
  assert.equal((await evaluate('window.__GAME__.getState()')).player.weapon, 5);
  await press('KeyQ');
  await mouse('right', point);
  assert.equal((await evaluate('window.__GAME__.getState()')).player.weapon, 5);
  await arena(2, 185);
  await evaluate('window.__QA_APP__.sim.enemies[0].stun=3.1;true');
  await key('KeyD', 'keyDown');
  await tick(60);
  await key('KeyD', 'keyUp');
  await tick();
  const contact = await evaluate('window.__GAME__.getState()');
  assert.ok(contact.player.x <= contact.actors[0].x - 14);
  await screenshot('solid-enemy-contact');
  await until(
    "window.__QA_APP__.audio.voices.get('sndPickupWeapon')?.some(v => v.readyState >= 2 && !v.error)",
  );
  const meleeIds = [
    2, 3, 4, 5, 8, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 26,
  ];
  for (const id of meleeIds) {
    point = await arena(id, 320);
    await evaluate("window.__QA_APP__.sim.player.facing='right';true");
    await render();
    await screenshot('hold-' + id);
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
    await tick(3);
    await screenshot('attack-' + id);
  }
  await arena(2);
  assert.equal((await evaluate('window.__GAME__.getState()')).player.weapon, 2);
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    code: 'KeyQ',
    key: 'й',
    windowsVirtualKeyCode: 81,
  });
  await tick();
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    code: 'KeyQ',
    key: 'й',
    windowsVirtualKeyCode: 81,
  });
  await tick();
  assert.equal(
    (await evaluate('window.__GAME__.getState()')).player.weapon,
    -1,
  );
  await press('KeyE');
  assert.equal((await evaluate('window.__GAME__.getState()')).player.weapon, 2);
  await evaluate(
    'window.__QA_ARCS__=[];const ctx=window.__QA_APP__.view.ctx;window.__QA_ARC__=ctx.arc;ctx.arc=function(...args){window.__QA_ARCS__.push(this.strokeStyle);return window.__QA_ARC__.apply(this,args)};true',
  );
  const aim = await arena(2);
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    button: 'left',
    buttons: 1,
    clickCount: 1,
    ...aim,
  });
  await tick();
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    button: 'left',
    buttons: 0,
    clickCount: 1,
    ...aim,
  });
  await tick();
  assert.equal((await evaluate('window.__GAME__.getState()')).kills, 1);
  await screenshot('melee-without-range-arc');
  assert.equal(
    await evaluate("window.__QA_ARCS__.some(c=>c==='#ffe9c7'||c==='#70f5df')"),
    false,
  );
  await evaluate('window.__QA_APP__.view.ctx.arc=window.__QA_ARC__;true');
  await arena(5, 180);
  await press('KeyF');
  await tick(10);
  const thrown = await evaluate('window.__GAME__.getState()');
  assert.equal(thrown.kills, 0);
  assert.equal(thrown.actors[0].alive, true);
  assert.ok(thrown.actors[0].stun > 2.5);
  await screenshot('knife-throw-stuns');
  await key('KeyD', 'keyDown');
  await tick(6);
  await key('KeyD', 'keyUp');
  await tick(6);
  await press('KeyE');
  assert.equal((await evaluate('window.__GAME__.getState()')).player.weapon, 5);
  await evaluate(
    "(async()=>{const a=window.__QA_APP__;a.briefing(3);a.floorIndex=1;a.floorStates.clear();await a.load('rmApartment2Upstairs');a.sim.grace=10;a.sim.player.x=116;a.sim.player.y=400;a.view.cameraPoint={x:240,y:360};})()",
  );
  await screenshot('chapter03-yellow-wall');
  await key('KeyD', 'keyDown');
  await tick(60);
  await key('KeyD', 'keyUp');
  await tick(5);
  assert.ok((await evaluate('window.__GAME__.getState()')).player.x <= 121);
  const enemyWall = await evaluate(
    '(()=>{const a=window.__QA_APP__,e=a.sim.enemies[0];e.x=116;e.y=400;a.sim.move(e,40,0,1/60);return e.x;})()',
  );
  assert.ok(enemyWall <= 121);
  const ids = await evaluate('window.__QA_APP__.manifest.rooms.map(r=>r.id)');
  for (const id of ids) {
    await evaluate(
      `(async()=>{const a=window.__QA_APP__;await a.load('${id}');if(a.mode!=='playing')throw Error(document.getElementById('load-label').textContent);})()`,
    );
  }
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await new Promise((r) => setTimeout(r, 300));
  await evaluate('window.__QA_APP__.game.scale.step(1000,1000);true');
  await arena(4, 220);
  await evaluate(
    "document.getElementById('touch-controls').classList.remove('hidden');true",
  );
  await screenshot('mobile-drop-control');
  const button = await evaluate(
    "(()=>{const r=document.querySelector('[data-action=drop]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()",
  );
  await send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [button],
  });
  await tick();
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await tick();
  assert.equal(
    (await evaluate('window.__GAME__.getState()')).player.weapon,
    -1,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  const report = {
    roomsLoaded: ids.length,
    keyboardDropPickup: true,
    mouseMeleeReach: true,
    noWhiteRangeArc: true,
    knifeThrowStun: true,
    throwRecovery: true,
    yellowWallPlayerAndEnemy: true,
    touchDrop: true,
    externalRequests: 0,
    solidEnemyContact: true,
    localWavDecoded: true,
    javaScriptErrors: 0,
  };
  fs.writeFileSync(output + '/results.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  console.log(JSON.stringify({ errors, requests }));
  throw error;
} finally {
  ws.close();
  server.close();
}
