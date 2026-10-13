import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readJson,readBytes,assetUrl} from '../src/assets.js';

test('Portable resources load real room data and sound bytes without network access',async t=>{
  const room=JSON.parse(readFileSync(new URL('../public/assets/rooms/rmTutorial.json',import.meta.url)));
  const sound=readFileSync(new URL('../public/assets/audio/sndCarOpen.wav',import.meta.url));
  globalThis.__EMERGENCY_EXIT_ASSETS__={
    json:{'/assets/rooms/rmTutorial.json':room},
    files:{'/assets/audio/sndCarOpen.wav':'data:audio/wav;base64,'+sound.toString('base64')},
  };
  t.after(()=>delete globalThis.__EMERGENCY_EXIT_ASSETS__);
  t.mock.method(globalThis,'fetch',()=>{throw new Error('Network access is forbidden');});
  assert.equal((await readJson('/assets/rooms/rmTutorial.json')).id,'rmTutorial');
  assert.deepEqual(Buffer.from(await readBytes('/assets/audio/sndCarOpen.wav')),sound);
  assert.ok(assetUrl('/assets/audio/sndCarOpen.wav').startsWith('data:audio/wav;base64,'));
  await assert.rejects(readJson('/assets/missing.json'),/Missing embedded JSON/);
  assert.throws(()=>assetUrl('/assets/missing.png'),/Missing embedded asset/);
});

test('Development resource loading preserves HTTP errors and binary responses',async t=>{
  const requests=[];
  t.mock.method(globalThis,'fetch',async url=>{
    requests.push(url);
    if(url==='/missing')return new Response('',{status:404});
    if(url==='/room')return Response.json({id:'rmTutorial'});
    return new Response(new Uint8Array([82,73,70,70]));
  });
  assert.equal(assetUrl('/image.png'),'/image.png');
  assert.deepEqual(await readJson('/room'),{id:'rmTutorial'});
  assert.deepEqual([...new Uint8Array(await readBytes('/sound'))],[82,73,70,70]);
  await assert.rejects(readJson('/missing'),/Не удалось загрузить/);
  await assert.rejects(readBytes('/missing'),/Не удалось загрузить/);
  assert.deepEqual(requests,['/room','/sound','/missing','/missing']);
});
