import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,scryptSync } from 'node:crypto';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/database/index.js';

test('Dashboard sessions, security, idempotency, time filters (HTTP + SQLite, not Wokwi)',async t=>{
  const password=randomBytes(20).toString('hex'),salt=randomBytes(16).toString('hex');
  const config={deviceId:'esp32-01',port:3001,deviceToken:randomBytes(32).toString('hex'),adminToken:randomBytes(32).toString('hex'),corsOrigins:['http://localhost:5173'],dashboardPasswordHash:`scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`};
  let now=Date.now();const db=openDatabase(':memory:');
  const server=createApp(config,db,()=>now).listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(r=>server.close(r));db.close();});
  const base=`http://127.0.0.1:${server.address().port}/api/v1`;
  let cookie='',csrf='';
  async function call(route,{method='GET',body,headers={},includeCookie=true}={}){
    const res=await fetch(base+route,{method,headers:{Origin:'http://localhost:5173',...(includeCookie&&cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
    return {res,json:await res.json()};
  }
  const login=async()=>{const r=await call('/dashboard/session',{method:'POST',body:{password}});cookie=r.res.headers.get('set-cookie').split(';')[0];csrf=r.json.data.csrfToken;return r;};
  await t.test('anonymous session reveals no credentials, protected reads401',async()=>{const r=await call('/dashboard/session');assert.deepEqual(r.json.data,{authenticated:false});assert.equal((await call('/dashboard/state?deviceId=esp32-01')).res.status,401);});
  await t.test('same-origin production origin allowed, arbitrary origins rejected',async()=>{assert.equal((await call('/health',{headers:{Origin:'http://127.0.0.1:3001'}})).res.status,200);assert.equal((await call('/health',{headers:{Origin:'https://untrusted.example'}})).res.status,403);});
  await t.test('bad password rejected',async()=>{assert.equal((await call('/dashboard/session',{method:'POST',body:{password:'wrong'}})).res.status,401);});
  await t.test('login returns HttpOnly Strict cookie, no API tokens',async()=>{const r=await login();assert.equal(r.res.status,200);assert.match(r.res.headers.get('set-cookie'),/HttpOnly/);assert.match(r.res.headers.get('set-cookie'),/SameSite=Strict/);assert.match(r.res.headers.get('cache-control'),/no-store/);assert.equal(r.json.data.deviceId,config.deviceId);const text=JSON.stringify(r.json);assert.ok(!text.includes(config.adminToken)&&!text.includes(config.deviceToken));assert.notEqual(db.prepare('SELECT id_hash FROM dashboard_sessions').get().id_hash,cookie.split('=')[1]);});
  await t.test('session authenticated read but cannot call raw admin/device routes',async()=>{assert.equal((await call('/dashboard/state?deviceId=esp32-01')).res.status,200);for(const route of ['/state?deviceId=esp32-01','/device/commands?deviceId=esp32-01&bootId=x'])assert.equal((await call(route)).res.status,401);});
  await t.test('writes require csrf and trusted origin',async()=>{const body={deviceId:'esp32-01',type:'AUTO'};assert.equal((await call('/dashboard/commands',{method:'POST',body})).res.status,403);assert.equal((await call('/dashboard/commands',{method:'POST',body,headers:{Origin:'https://evil.example','X-CSRF-Token':csrf}})).res.status,403);});
  await t.test('idempotent command submission has one DB row and rejects changed body',async()=>{const headers={'X-CSRF-Token':csrf,'Idempotency-Key':randomBytes(16).toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5')};const body={deviceId:'esp32-01',type:'AUTO',ttlSeconds:15};const first=await call('/dashboard/commands',{method:'POST',body,headers});assert.equal(first.res.status,201);const second=await call('/dashboard/commands',{method:'POST',body,headers});assert.equal(second.res.status,200);assert.equal(second.json.data.id,first.json.data.id);assert.equal(db.prepare('SELECT COUNT(*) n FROM commands').get().n,1);assert.equal((await call('/dashboard/commands',{method:'POST',body:{...body,type:'MANUAL_ON'},headers})).res.status,409);});
  await t.test('time filter is server-side with correct count and invalid bounds rejected',async()=>{
    const payload={deviceId:'esp32-01',bootId:'unit-test',sequence:1,soilMoisturePercent:25,temperatureC:null,rainProbabilityPercent:null,precipitationMm:null,weatherSource:'REAL',weatherStatus:'UNKNOWN',pumpState:'TAT',decision:'TAM_HOAN',reason:'test fixture',deviceTimestamp:null,uptimeMs:0};
    const before=now;await call('/telemetry',{method:'POST',body:payload,headers:{Authorization:`Bearer ${config.deviceToken}`}});now+=60000;await call('/telemetry',{method:'POST',body:{...payload,sequence:2},headers:{Authorization:`Bearer ${config.deviceToken}`}});
    const url='/dashboard/history?deviceId=esp32-01&from='+encodeURIComponent(new Date(before+1).toISOString());const r=await call(url);assert.equal(r.json.meta.total,1);assert.equal(r.json.data[0].sequence,2);assert.equal((await call(url+'&to='+encodeURIComponent(new Date(before).toISOString()))).res.status,400);
  });
  await t.test('sessions survive app recreation using same SQLite',async()=>{const second=createApp(config,db,()=>now).listen(0,'127.0.0.1');await once(second,'listening');try{const r=await fetch(`http://127.0.0.1:${second.address().port}/api/v1/dashboard/session`,{headers:{Cookie:cookie}});assert.equal((await r.json()).data.authenticated,true);}finally{await new Promise(r=>second.close(r));}});
  await t.test('logout invalidates cookie server-side',async()=>{assert.equal((await call('/dashboard/logout',{method:'POST',headers:{'X-CSRF-Token':csrf}})).res.status,200);assert.equal((await call('/dashboard/state?deviceId=esp32-01')).res.status,401);});
  await t.test('expired session rejected',async()=>{await login();now+=8*60*60*1000;assert.equal((await call('/dashboard/state?deviceId=esp32-01')).res.status,401);});
  await t.test('login throttled after five bad attempts',async()=>{for(let i=0;i<5;i++)assert.equal((await call('/dashboard/session',{method:'POST',body:{password:'bad'}})).res.status,401);assert.equal((await call('/dashboard/session',{method:'POST',body:{password}})).res.status,429);});
});
