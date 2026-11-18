import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/database/index.js';
import { loadConfig } from '../src/config/env.js';

test('Phase3 REST API + SQLite integration (PC, not ESP32/Wokwi)',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'smart-irrigation-test-'));
  const config={deviceId:'esp32-01',deviceToken:randomBytes(32).toString('hex'),adminToken:randomBytes(32).toString('hex'),corsOrigins:['http://localhost:5173']};
  const filename=path.join(dir,'test.sqlite');
  let db=openDatabase(filename), now=Date.now();
  const app=createApp(config,db,()=>now), server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}/api/v1`;
  t.after(async()=>{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});});
  const call=async(route,{method='GET',body,token=config.adminToken,headers={}}={})=>{
    const response=await fetch(base+route,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
    return {status:response.status,body:await response.json(),headers:response.headers};
  };
  const telemetry={deviceId:config.deviceId,bootId:'pc-integration',sequence:1,soilMoisturePercent:22.5,temperatureC:25.3,rainProbabilityPercent:4,precipitationMm:0,weatherSource:'REAL',weatherStatus:'VALID',pumpState:'BAT',decision:'TUOI',reason:'PC integration fixture, not runtime ESP32',deviceTimestamp:null,uptimeMs:100};
  let command;
  await t.test('health succeeds without token and checks DB',async()=>{const r=await call('/health',{token:null});assert.equal(r.status,200);assert.equal(r.body.data.database,'ok');});
  await t.test('auth required and roles separated',async()=>{assert.equal((await call('/telemetry',{method:'POST',body:telemetry,token:null})).status,401);assert.equal((await call('/state?deviceId=esp32-01',{token:config.deviceToken})).status,401);assert.equal((await call('/device/commands?deviceId=esp32-01&bootId=b')).status,401);});
  await t.test('store telemetry with server receipt and nullable device timestamp',async()=>{const r=await call('/telemetry',{method:'POST',body:telemetry,token:config.deviceToken});assert.equal(r.status,201);assert.equal(r.body.data.soilMoisturePercent,22.5);assert.ok(r.body.data.receivedAt);assert.equal(r.body.data.deviceTimestamp,null);});
  await t.test('idempotent telemetry retry preserves original timestamp/body',async()=>{now+=100;const r=await call('/telemetry',{method:'POST',body:{...telemetry,soilMoisturePercent:80},token:config.deviceToken});assert.equal(r.status,200);assert.equal(r.body.meta.duplicate,true);assert.equal(r.body.data.soilMoisturePercent,22.5);assert.equal(db.prepare('SELECT COUNT(*) n FROM telemetry').get().n,1);});
  await t.test('SQLite file readable from independent reopened connection',()=>{const second=openDatabase(filename);try{assert.equal(second.prepare('SELECT soil_moisture_percent FROM telemetry').get().soil_moisture_percent,22.5);}finally{second.close();}});
  await t.test('latest state and bounded paginated history',async()=>{assert.equal((await call('/state?deviceId=esp32-01')).body.data.sequence,1);const r=await call('/history?deviceId=esp32-01&page=1&limit=1');assert.equal(r.body.meta.total,1);assert.equal(r.body.data.length,1);assert.equal((await call('/history?deviceId=esp32-01&limit=101')).status,400);assert.equal((await call('/history?deviceId=esp32-01&page=-1')).status,400);});
  await t.test('reject invalid values, unknown fields, wrong device, contradictory pump',async()=>{
    for(const p of [{soilMoisturePercent:101},{temperatureC:'25'},{rainProbabilityPercent:-1},{extra:1},{pumpState:'TAT'},{weatherStatus:'UNKNOWN'}]) assert.equal((await call('/telemetry',{method:'POST',body:{...telemetry,...p},token:config.deviceToken})).status,400);
    assert.equal((await call('/telemetry',{method:'POST',body:{...telemetry,deviceId:'other'},token:config.deviceToken})).status,403);
  });
  await t.test('UNKNOWN nulls and SIMULATED labels retained',async()=>{
    const p={...telemetry,sequence:2,weatherSource:'SIMULATED',weatherStatus:'UNKNOWN',temperatureC:null,rainProbabilityPercent:null,precipitationMm:null,pumpState:'TAT',decision:'TAM_HOAN'};
    const r=await call('/telemetry',{method:'POST',body:p,token:config.deviceToken});assert.equal(r.status,201);assert.equal(r.body.data.weatherSource,'SIMULATED');assert.equal(r.body.data.temperatureC,null);
  });
  await t.test('CORS allowlist, reject unsolicited origins',async()=>{assert.equal((await call('/health',{headers:{Origin:'http://localhost:5173'}})).headers.get('access-control-allow-origin'),'http://localhost:5173');assert.equal((await call('/health',{headers:{Origin:'https://evil.example'}})).status,403);});
  await t.test('malformed JSON and body size use JSON errors',async()=>{for(const [body,expected] of [['{bad',400],[JSON.stringify({padding:'x'.repeat(9000)}),413]]){const r=await fetch(base+'/telemetry',{method:'POST',headers:{'Content-Type':'application/json'},body});assert.equal(r.status,expected);assert.equal((await r.json()).success,false);}});
  await t.test('create/claim command with finite TTL',async()=>{const r=await call('/commands',{method:'POST',body:{deviceId:'esp32-01',type:'MANUAL_ON',ttlSeconds:10}});assert.equal(r.status,201);command=r.body.data;const p=await call('/device/commands?deviceId=esp32-01&bootId=boot1',{token:config.deviceToken});assert.equal(p.body.data.command.id,command.id);assert.equal(p.body.data.command.remainingTtlMs,10000);});
  await t.test('unacked retry same boot uses same id, not fresh command',async()=>{const p=await call('/device/commands?deviceId=esp32-01&bootId=boot1',{token:config.deviceToken});assert.equal(p.body.data.command.id,command.id);});
  await t.test('poll provides server lease and never extends expiresAt',async()=>{now+=1000;const p=await call('/device/commands?deviceId=esp32-01&bootId=boot1',{token:config.deviceToken});assert.equal(p.body.data.controlLease.id,command.id);assert.equal(p.body.data.controlLease.remainingTtlMs,9000);});
  await t.test('ACK wrong boot rejected, ACK idempotent and never redelivered',async()=>{
    const ack={deviceId:'esp32-01',bootId:'boot1',status:'EXECUTED',reason:'APPLIED'};
    assert.equal((await call(`/device/commands/${command.id}/ack`,{method:'POST',body:{...ack,bootId:'other'},token:config.deviceToken})).status,409);
    for(let i=0;i<2;i++) assert.equal((await call(`/device/commands/${command.id}/ack`,{method:'POST',body:ack,token:config.deviceToken})).status,200);
    assert.equal((await call('/device/commands?deviceId=esp32-01&bootId=boot1',{token:config.deviceToken})).body.data.command,null);
  });
  await t.test('new boot never executes previously delivered command',async()=>{await call('/commands',{method:'POST',body:{deviceId:'esp32-01',type:'MANUAL_ON'}});await call('/device/commands?deviceId=esp32-01&bootId=boot1',{token:config.deviceToken});assert.equal((await call('/device/commands?deviceId=esp32-01&bootId=boot2',{token:config.deviceToken})).body.data.command,null);});
  await t.test('MANUAL_OFF supersedes ON and wins over AUTO/ON until expiry',async()=>{const off=await call('/commands',{method:'POST',body:{deviceId:'esp32-01',type:'MANUAL_OFF',ttlSeconds:2}});assert.equal(off.status,201);for(const type of ['AUTO','MANUAL_ON']) assert.equal((await call('/commands',{method:'POST',body:{deviceId:'esp32-01',type}})).status,409);const p=await call('/device/commands?deviceId=esp32-01&bootId=boot2',{token:config.deviceToken});assert.equal(p.body.data.command.type,'MANUAL_OFF');now+=2000;assert.equal((await call('/device/commands?deviceId=esp32-01&bootId=boot2',{token:config.deviceToken})).body.data.command,null);});
  await t.test('expired/rejected command audited and never reissued',async()=>{const r=await call('/commands',{method:'POST',body:{deviceId:'esp32-01',type:'MANUAL_ON'}});await call('/device/commands?deviceId=esp32-01&bootId=boot2',{token:config.deviceToken});assert.equal((await call(`/device/commands/${r.body.data.id}/ack`,{method:'POST',body:{deviceId:'esp32-01',bootId:'boot2',status:'REJECTED',reason:'WEATHER_UNKNOWN'},token:config.deviceToken})).status,200);const list=(await call('/commands?deviceId=esp32-01')).body.data;assert.ok(list.some(c=>c.status==='EXPIRED'));assert.ok(list.some(c=>c.status==='REJECTED'));assert.equal((await call('/device/commands?deviceId=esp32-01&bootId=boot2',{token:config.deviceToken})).body.data.command,null);});
  await t.test('command validation, nonexistent route return JSON',async()=>{for(const p of [{type:'ON'},{type:'MANUAL_ON',ttlSeconds:0},{type:'AUTO',ttlSeconds:61}]) assert.equal((await call('/commands',{method:'POST',body:{deviceId:'esp32-01',...p}})).status,400);assert.equal((await call('/does-not-exist')).body.error.code,'NOT_FOUND');});
});

test('configuration fails closed and refuses public bind',()=>{
  const e={DEVICE_ID:'esp32-01',DEVICE_API_TOKEN:'d'.repeat(32),ADMIN_API_TOKEN:'a'.repeat(32)};
  assert.equal(loadConfig(e).host,'127.0.0.1');
  for(const invalid of [{HOST:'0.0.0.0'},{DEVICE_API_TOKEN:''},{ADMIN_API_TOKEN:'d'.repeat(32)}]) assert.throws(()=>loadConfig({...e,...invalid}));
});
