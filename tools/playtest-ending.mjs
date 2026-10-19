import { serveTestGame } from './serve-test-game.mjs';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const output =
  process.env.PLAYTEST_OUTPUT ?? root + '/../artifacts/ending-playtest';
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
  await evaluate('window.__QA_APP__.game.loop.stop();document.fonts.ready');
  assert.equal(
    await evaluate("document.getElementById('ending-button').hidden"),
    true,
  );
  assert.equal(await evaluate('window.__QA_APP__.showEnding()'), false);
  await evaluate(
    '(()=>{const a=window.__QA_APP__;a.progress={unlocked:21,best:{},last:21};a.briefing(21);a.start();return true})()',
  );
  await until("window.__GAME__.mode==='playing'");
  async function exitFloor() {
    await evaluate(
      "(()=>{const s=window.__QA_APP__.sim;s.grace=100;for(const enemy of s.enemies)s.kill(enemy,'shot');s.checkClear();s.player.x=s.exit.x;s.player.y=s.exit.y;return true})()",
    );
    await press('KeyE');
  }
  await exitFloor();
  assert.equal(await evaluate('window.__GAME__.mode'), 'result');
  assert.equal(
    await evaluate(
      "document.getElementById('ending').classList.contains('hidden')",
    ),
    true,
  );
  await evaluate(
    "(()=>{const a=window.__QA_APP__;for(let i=0;i<21;i++)a.progress.best[i]={score:1000,grade:'B',time:20};delete a.progress.best[21];a.briefing(21);a.start();return true})()",
  );
  await until("window.__GAME__.mode==='playing'");
  await exitFloor();
  assert.equal(await evaluate('window.__GAME__.mode'), 'ending');
  await evaluate(
    '(()=>{const a=window.__QA_APP__;a.__cues=[];const original=a.audio.cinematicSound.bind(a.audio);a.audio.cinematicSound=(kind)=>{a.__cues.push(kind);original(kind)};return true})()',
  );
  await until('window.__QA_APP__.ending.time>2.3');
  await evaluate('cancelAnimationFrame(window.__QA_APP__.ending.frame);true');
  assert.equal(
    await evaluate(
      "document.getElementById('hud').classList.contains('hidden')",
    ),
    true,
  );
  assert.equal(
    await evaluate("document.body.classList.contains('ending-active')"),
    true,
  );
  const frames = [
    [3.5, 'walk-out'],
    [7.8, 'detonator'],
    [9.65, 'explosion'],
    [14, 'ruins'],
    [19.8, 'boarding'],
    [23, 'departure'],
    [28.5, 'highway'],
    [45, 'authors'],
    [83, 'finished'],
  ];
  for (const [time, name] of frames) {
    await evaluate(
      `(()=>{const e=window.__QA_APP__.ending;e.advance(${time}-e.time);e.render();return true})()`,
    );
    await screenshot(name);
    assert.equal(await evaluate('window.__GAME__.mode'), 'ending');
  }
  assert.deepEqual(await evaluate('window.__QA_APP__.__cues'), [
    'door',
    'detonator',
    'explosion',
    'door',
    'engine',
  ]);
  assert.equal(await evaluate('window.__QA_APP__.audio.endingMusic'), true);
  assert.equal(await evaluate('window.__QA_APP__.audio.ctx.state'), 'running');
  await evaluate('window.__QA_APP__.audio.tick();true');
  assert.ok(await evaluate('window.__QA_APP__.audio.step>0'));
  await evaluate(
    '(()=>{const a=window.__QA_APP__;a.__music=a.settings.music;a.__sound=a.settings.sound;a.settings.music=0;a.settings.sound=0;a.audio.updateVolumes();return true})()',
  );
  assert.equal(await evaluate('window.__QA_APP__.audio.music.gain.value'), 0);
  assert.equal(await evaluate('window.__QA_APP__.audio.effects.gain.value'), 0);
  await evaluate(
    '(()=>{const a=window.__QA_APP__;a.settings.music=a.__music;a.settings.sound=a.__sound;a.audio.updateVolumes();return true})()',
  );
  const renderedMusic = await evaluate(`(async()=>{
    const a=window.__QA_APP__,engine=new a.audio.constructor(a.manifest,{sound:65,music:35});
    const context=new OfflineAudioContext(1,48000*7,48000);
    engine.ctx=context;engine.music=context.createGain();engine.music.connect(context.destination);
    engine.endingGain=context.createGain();engine.endingGain.connect(engine.music);
    engine.effects=context.createGain();engine.updateVolumes();
    for(let i=0;i<32;i++)engine.endingTick(i*0.125+0.01);
    const output=await context.startRendering(),samples=output.getChannelData(0);
    let sum=0,peak=0;for(const sample of samples){sum+=sample*sample;peak=Math.max(peak,Math.abs(sample))}
    return{rms:Math.sqrt(sum/samples.length),peak};
  })()`);
  assert.ok(
    renderedMusic.rms > 0.001 && renderedMusic.peak < 1,
    JSON.stringify(renderedMusic),
  );
  const progress = await evaluate(
    "JSON.parse(localStorage.getItem('emergency-exit-progress'))",
  );
  assert.equal(Object.keys(progress.best).length, 22);
  await press('Escape');
  assert.equal(await evaluate('window.__GAME__.mode'), 'menu');
  assert.equal(await evaluate('window.__QA_APP__.ending'), null);
  assert.equal(await evaluate('window.__QA_APP__.audio.endingMusic'), false);
  assert.equal(
    await evaluate("document.getElementById('ending-button').hidden"),
    false,
  );
  await screenshot('unlocked-menu');
  await send('Page.navigate', { url: server.url });
  await until("window.__GAME__?.mode==='menu'");
  await evaluate('window.__QA_APP__.game.loop.stop();document.fonts.ready');
  assert.equal(
    await evaluate("document.getElementById('ending-button').hidden"),
    false,
  );
  await press('KeyS');
  await press('KeyS');
  await press('Enter');
  await evaluate('cancelAnimationFrame(window.__QA_APP__.ending.frame);true');
  assert.ok(await evaluate('window.__QA_APP__.ending.time<3'));
  assert.equal(await evaluate('window.__GAME__.mode'), 'ending');
  await press('Space');
  assert.ok(await evaluate('window.__QA_APP__.ending.time>=30'));
  assert.equal(await evaluate('window.__QA_APP__.audio.endingMusic'), true);
  assert.equal(
    await evaluate("document.querySelector('[data-ending-skip]').hidden"),
    true,
  );
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate(
    'window.__QA_APP__.ending.time=45;window.__QA_APP__.ending.render();true',
  );
  await screenshot('mobile-authors');
  assert.ok(
    await evaluate(
      "(()=>{const r=document.querySelector('#ending canvas').getBoundingClientRect();return r.width<=innerWidth&&r.height<=innerHeight})()",
    ),
  );
  await press('Enter');
  assert.equal(await evaluate('window.__GAME__.mode'), 'menu');
  assert.equal(
    await evaluate("document.body.classList.contains('ending-active')"),
    false,
  );
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.equal(requests.length, 0, JSON.stringify(requests));
  const result = {
    allChaptersRequired: true,
    automaticallyStartsAfterChapter21: true,
    timelineFrames: frames.length,
    storyCuesOnce: true,
    authorsVisible: true,
    highwayMusic: true,
    musicRms: renderedMusic.rms,
    musicPeak: renderedMusic.peak,
    realAnimationFrames: true,
    volumeSettings: true,
    progressSurvivesReload: true,
    replayFromMenu: true,
    skipToCredits: true,
    keyboardExit: true,
    mobileCanvasFits: true,
    javaScriptErrors: 0,
    externalRequests: 0,
  };
  fs.writeFileSync(output + '/results.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  ws.close();
  server.close();
}
