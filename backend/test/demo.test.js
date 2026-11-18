import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomBytes,scryptSync} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openDatabase} from '../src/database/index.js';
import {createApp} from '../src/app.js';

test('SQLite v1 -> v2 preserves telemetry, command IDs, ACK, sessions and AUTOINCREMENT (isolated file)',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'irrigation-demo-migration-'));
  const file=path.join(dir,'legacy.sqlite');let db;
  try {
    db=new DatabaseSync(file);
    db.exec(`CREATE TABLE telemetry(id INTEGER PRIMARY KEY AUTOINCREMENT,device_id TEXT NOT NULL,boot_id TEXT NOT NULL,sequence INTEGER NOT NULL,received_at TEXT NOT NULL,device_timestamp TEXT,soil_moisture_percent REAL NOT NULL,temperature_c REAL,rain_probability_percent REAL,precipitation_mm REAL,weather_source TEXT NOT NULL,weather_status TEXT NOT NULL,pump_state TEXT NOT NULL,decision TEXT NOT NULL,reason TEXT NOT NULL,mode TEXT NOT NULL,uptime_ms INTEGER NOT NULL,weather_updated_at TEXT,UNIQUE(device_id,boot_id,sequence)) STRICT;
      CREATE TABLE commands(id INTEGER PRIMARY KEY AUTOINCREMENT,device_id TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN('AUTO','MANUAL_ON','MANUAL_OFF')),created_at TEXT NOT NULL,expires_at TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('PENDING','DELIVERED','EXECUTED','REJECTED','EXPIRED','SUPERSEDED')),delivered_boot_id TEXT,delivered_at TEXT,ack_at TEXT,ack_reason TEXT) STRICT;
      CREATE TABLE dashboard_sessions(id_hash TEXT PRIMARY KEY,csrf TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL) STRICT;
      INSERT INTO dashboard_sessions VALUES('session-hash','csrf',1,2);
      INSERT INTO telemetry VALUES(12,'esp32-01','old-boot',1,'2026-11-19T00:00:00Z',NULL,30,NULL,NULL,NULL,'REAL','UNKNOWN','TAT','TAM_HOAN','legacy','AUTO',100,NULL);
      INSERT INTO commands VALUES(41,'esp32-01','AUTO','2026-11-19T00:00:00Z','2026-11-19T00:00:15Z','EXECUTED','old-boot',NULL,'2026-11-19T00:00:01Z','old ACK');
      UPDATE sqlite_sequence SET seq=90 WHERE name='commands'; PRAGMA user_version=1;`);
    db.close();db=openDatabase(file);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM telemetry').get().n,1);
    assert.equal(db.prepare('SELECT soil_source FROM telemetry WHERE id=12').get().soil_source,'REAL');
    assert.equal(db.prepare('SELECT ack_reason FROM commands WHERE id=41').get().ack_reason,'old ACK');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM dashboard_sessions').get().n,1);
    const row=db.prepare("INSERT INTO commands(device_id,type,created_at,expires_at,status,demo_soil_percent,demo_rain_percent) VALUES('esp32-01','DEMO_SET','now','later','PENDING',22,20)").run();
    assert.equal(Number(row.lastInsertRowid),91);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    db.close();db=openDatabase(file);assert.equal(db.prepare('SELECT COUNT(*) n FROM commands').get().n,2);
  } finally {db?.close();rmSync(dir,{recursive:true,force:true});}
});

test('Web demo API safety, lease, telemetry labels and ACK (HTTP + memory DB, NOT Wokwi)',async t=>{
  const password=randomBytes(18).toString('hex'),salt=randomBytes(16).toString('hex');
  const config={deviceId:'esp32-01',port:3001,deviceToken:randomBytes(32).toString('hex'),adminToken:randomBytes(32).toString('hex'),corsOrigins:['http://localhost:5173'],dashboardPasswordHash:`scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`,remoteDemoEnabled:true};
  let now=Date.now(),seq=0;const db=openDatabase(':memory:');
  const server=createApp(config,db,()=>now).listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(r=>server.close(r));db.close();});
  const base=`http://127.0.0.1:${server.address().port}/api/v1`;let cookie='',csrf='';
  async function call(route,{method='GET',body,device=false,auth=true,key=randomBytes(18).toString('hex')}={}){
    const r=await fetch(base+route,{method,headers:{Origin:'http://localhost:5173',...(body?{'Content-Type':'application/json'}:{}),...(device?{Authorization:'Bearer '+config.deviceToken}:auth?{Cookie:cookie,'X-CSRF-Token':csrf,'Idempotency-Key':key}:{} )},body:body?JSON.stringify(body):undefined});return{status:r.status,json:await r.json(),headers:r.headers};
  }
  const seed=async(supported=true,overrides={})=>call('/telemetry',{method:'POST',device:true,body:{deviceId:config.deviceId,bootId:'demo-boot',sequence:++seq,soilMoisturePercent:50,temperatureC:26,rainProbabilityPercent:20,precipitationMm:0,weatherSource:'REAL',weatherStatus:'VALID',pumpState:'TAT',decision:'KHONG_TUOI',reason:'isolated test fixture, not ESP32',mode:'AUTO',deviceTimestamp:null,uptimeMs:seq*5000,demoSupported:supported,rawSoilMoisturePercent:50,...overrides}});
  const body={deviceId:config.deviceId,type:'DEMO_SET',ttlSeconds:60,soilMoisturePercent:22,rainProbabilityPercent:20};
  const login=await call('/dashboard/session',{method:'POST',body:{password},auth:false});assert.equal(login.status,200);assert.equal(login.json.data.demoEnabled,true);cookie=login.headers.get('set-cookie').split(';')[0];csrf=login.json.data.csrfToken;
  let command;
  await t.test('anonymous demo command rejected; schema validation strict',async()=>{
    assert.equal((await call('/dashboard/commands',{method:'POST',body,auth:false})).status,401);
    await seed();
    for(const patch of [{soilMoisturePercent:101},{rainProbabilityPercent:-1},{rainProbabilityPercent:'20'},{ttlSeconds:61},{extra:'field'}])assert.equal((await call('/dashboard/commands',{method:'POST',body:{...body,...patch}})).status,400);
  });
  await t.test('offline or old firmware cannot start a demo',async()=>{
    await seed(false);assert.equal((await call('/dashboard/commands',{method:'POST',body})).json.error.code,'DEMO_NOT_SUPPORTED');
    await seed(true);now+=30001;assert.equal((await call('/dashboard/commands',{method:'POST',body})).json.error.code,'DEVICE_OFFLINE');await seed();
  });
  await t.test('demo ID/payload retained, retry idempotent, TTL finite',async()=>{
    const key=randomBytes(18).toString('hex');const a=await call('/dashboard/commands',{method:'POST',body,key});assert.equal(a.status,201);command=a.json.data;assert.equal(command.soilMoisturePercent,22);
    const b=await call('/dashboard/commands',{method:'POST',body,key});assert.equal(b.status,200);assert.equal(b.json.data.id,command.id);assert.equal(Date.parse(command.expiresAt)-now,60000);
  });
  await t.test('device poll and real ACK protocol carry demo values and server lease',async()=>{
    const p=await call('/device/commands?deviceId=esp32-01&bootId=demo-boot',{device:true});assert.equal(p.json.data.command.type,'DEMO_SET');assert.equal(p.json.data.command.rainProbabilityPercent,20);assert.equal(p.json.data.controlLease.id,command.id);
    const ack=await call(`/device/commands/${command.id}/ack`,{method:'POST',device:true,body:{deviceId:config.deviceId,bootId:'demo-boot',status:'EXECUTED',reason:'DEMO_APPLIED'}});assert.equal(ack.status,200);
  });
  await t.test('SIMULATED and raw sensor stay separate in SQLite/state/history',async()=>{
    const p={soilMoisturePercent:22,temperatureC:null,precipitationMm:null,weatherSource:'SIMULATED',soilSource:'SIMULATED',demoActive:true,demoCommandId:command.id,demoRemainingMs:59000,pumpState:'BAT',decision:'TUOI'};
    assert.equal((await seed(true,p)).status,201);
    const s=(await call('/dashboard/state?deviceId=esp32-01')).json.data;assert.equal(s.soilMoisturePercent,22);assert.equal(s.rawSoilMoisturePercent,50);assert.equal(s.demoExpiresAt,command.expiresAt);assert.equal(s.weatherSource,'SIMULATED');
    assert.equal((await seed(true,{...p,weatherSource:'REAL'})).status,400);
    assert.equal((await seed(true,{...p,demoCommandId:999999})).status,400);
  });
  await t.test('normal AUTO/ON cannot silently override active demo',async()=>{
    for(const type of ['AUTO','MANUAL_ON'])assert.equal((await call('/dashboard/commands',{method:'POST',body:{deviceId:config.deviceId,type}})).json.error.code,'DEMO_ACTIVE');
  });
  await t.test('OFF wins; DEMO_STOP must not supersede pending OFF',async()=>{
    const off=await call('/dashboard/commands',{method:'POST',body:{deviceId:config.deviceId,type:'MANUAL_OFF'}});assert.equal(off.status,201);
    assert.equal((await call('/dashboard/commands',{method:'POST',body})).json.error.code,'MANUAL_OFF_PRIORITY');
    const stop=await call('/dashboard/commands',{method:'POST',body:{deviceId:config.deviceId,type:'DEMO_STOP'}});assert.equal(stop.status,201);
    const poll=await call('/device/commands?deviceId=esp32-01&bootId=demo-boot',{device:true});assert.equal(poll.json.data.command.type,'MANUAL_OFF');
    const ack=await call(`/device/commands/${off.json.data.id}/ack`,{method:'POST',device:true,body:{deviceId:config.deviceId,bootId:'demo-boot',status:'EXECUTED',reason:'MANUAL_OFF'}});assert.equal(ack.status,200);
    const next=await call('/device/commands?deviceId=esp32-01&bootId=demo-boot',{device:true});assert.equal(next.json.data.command.type,'DEMO_STOP');now+=16000;
  });
  await t.test('pending demo expires and is never delivered late',async()=>{
    await seed();const c=await call('/dashboard/commands',{method:'POST',body});assert.equal(c.status,201);now+=60001;
    const p=await call('/device/commands?deviceId=esp32-01&bootId=demo-boot',{device:true});assert.equal(p.json.data.command,null);
    assert.equal(db.prepare('SELECT status FROM commands WHERE id=?').get(c.json.data.id).status,'EXPIRED');
  });
  await t.test('demo delivered to prior boot is rejected, never replayed',async()=>{
    await seed();const c=await call('/dashboard/commands',{method:'POST',body});assert.equal(c.status,201);await call('/device/commands?deviceId=esp32-01&bootId=demo-boot',{device:true});
    const p=await call('/device/commands?deviceId=esp32-01&bootId=new-boot',{device:true});assert.equal(p.json.data.command,null);assert.equal(db.prepare('SELECT ack_reason FROM commands WHERE id=?').get(c.json.data.id).ack_reason,'DEVICE_REBOOTED');
  });
  await t.test('Backend opt-in required even with a valid session',async()=>{
    const second=createApp({...config,remoteDemoEnabled:false},db,()=>now).listen(0,'127.0.0.1');await once(second,'listening');
    try{const r=await fetch(`http://127.0.0.1:${second.address().port}/api/v1/dashboard/commands`,{method:'POST',headers:{Origin:'http://localhost:5173',Cookie:cookie,'X-CSRF-Token':csrf,'Idempotency-Key':randomBytes(18).toString('hex'),'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,403);assert.equal((await r.json()).error.code,'DEMO_DISABLED');}finally{await new Promise(r=>second.close(r));}
  });
});
